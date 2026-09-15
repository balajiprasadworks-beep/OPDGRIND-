-- OPDGrind v2, Phase 1 — the integrity layer (build spec §4).
--
-- This is additive: it creates the new append-only event-log schema
-- (profiles, sessions, encounters, encounter_events) alongside the existing
-- opd_days table, which keeps working untouched. Nothing here is wired into
-- the app yet — that starts at Phase 2 (capture UI on the new model). The
-- reason to ship this first, on its own, is the one the spec makes: nothing
-- built on top of encounter_events means anything until the log itself is
-- immutable and server-timed.
--
-- Run once in the Supabase SQL editor, after supabase/schema.sql. Safe to
-- run again — every statement is guarded (create if not exists, or a
-- duplicate_object catch for the enum types, which don't support
-- IF NOT EXISTS in Postgres).

create extension if not exists pgcrypto;

-- ── Roles ────────────────────────────────────────────────────────────────
--
-- A role is bound to a role, not a person: promoting someone to supervisor
-- is one UPDATE on their profiles row, not a rebuild. See the bottom of
-- this file for the (manual, HOD-run) promotion statement.

do $$ begin
  create type public.app_role as enum ('clinician', 'coordinator', 'supervisor');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete restrict,
  full_name   text not null,
  role        public.app_role not null default 'clinician',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function public.current_role()
returns public.app_role language sql stable security definer
set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_supervisor()
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce((select role in ('supervisor','coordinator')
                   from public.profiles where id = auth.uid()), false);
$$;

-- Every signed-up clinician needs a profiles row before they can own an
-- encounter or an event (both carry a foreign key into this table), so
-- provisioning happens automatically at signup rather than as a manual step
-- someone could get stuck in front of. Everyone starts as 'clinician' —
-- including the HOD, until the promotion statement at the bottom is run.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'clinician')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill for clinicians who signed up before this script ever ran.
insert into public.profiles (id, full_name, role)
select u.id, coalesce(u.raw_user_meta_data->>'full_name', u.email), 'clinician'
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;

-- ── Sessions ─────────────────────────────────────────────────────────────
--
-- Sealing is per session, not per day — an evening or extended clinic must
-- not be forced into a 5 PM close (§6).

do $$ begin
  create type public.session_kind as enum ('morning', 'afternoon', 'evening');
exception when duplicate_object then null;
end $$;

create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  session_date      date not null,
  kind              public.session_kind not null,
  opened_at         timestamptz not null default now(),
  soft_closed_at    timestamptz,
  sealed_at         timestamptz,
  seal_hash         text,
  extended_by       uuid references public.profiles(id),
  extension_reason  text,
  unique (session_date, kind)
);

-- ── Encounters ───────────────────────────────────────────────────────────
--
-- No patient names anywhere in this database. opd_no_hash is computed
-- upstream (an Edge Function, §4.3) as sha256(opd_number || pepper) — the
-- pepper is a server-side secret and never reaches this table or the
-- browser. This script only shapes the column; hashing arrives with the
-- Phase 5 ingestion Edge Function.

do $$ begin
  create type public.case_type as enum ('new', 'review', 'post_procedure');
exception when duplicate_object then null;
end $$;

create table if not exists public.encounters (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id),
  opd_no_hash  text not null,
  case_type    public.case_type not null,
  assigned_to  uuid not null references public.profiles(id),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create index if not exists idx_encounters_session_assigned on public.encounters (session_id, assigned_to);
create index if not exists idx_encounters_opd_no_hash on public.encounters (opd_no_hash);

-- ── The event log ────────────────────────────────────────────────────────

do $$ begin
  create type public.event_source as enum (
    'live_app',        -- entered in-app, online, at the moment
    'live_offline',    -- captured in-app offline, synced later
    'paper',           -- transcribed from a paper fallback sheet
    'register',        -- transcribed from the OPD registration register
    'correction',      -- inserted via approved correction workflow
    'system'           -- auto-close, seal, and other machine events
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.encounter_events (
  id                  bigserial primary key,
  session_id          uuid not null references public.sessions(id),
  encounter_id        uuid references public.encounters(id),
  actor_id            uuid not null references public.profiles(id),
  attested_by         uuid references public.profiles(id),
  event_type          text not null,
  event_at            timestamptz not null,
  recorded_at         timestamptz not null default now(),
  client_reported_at  timestamptz,
  source              public.event_source not null,
  reason_code         text,
  note                text,
  supersedes_event_id bigint references public.encounter_events(id),
  auto_closed         boolean not null default false,
  prev_hash           text not null,
  hash                text not null
);

create index if not exists idx_encounter_events_session_id on public.encounter_events (session_id, id);
create index if not exists idx_encounter_events_actor_time on public.encounter_events (actor_id, event_at);
create index if not exists idx_encounter_events_encounter_id on public.encounter_events (encounter_id);

-- ── Server time and the hash chain ──────────────────────────────────────
--
-- The server owns event_at for anything claiming to be live and online, so
-- backdating a device clock cannot move it. Every row also chains to the
-- one before it in its session (prev_hash / hash), so altering any row
-- breaks every hash after it in that session — detectable by
-- verify_session_chain() below without trusting anything the row itself
-- claims.

create or replace function public.chain_event()
returns trigger language plpgsql security definer
set search_path = public as $$
declare
  last_hash text;
  sealed    timestamptz;
begin
  select sealed_at into sealed from public.sessions where id = new.session_id;
  if sealed is not null and new.source <> 'correction' then
    raise exception 'session is sealed; use the correction workflow';
  end if;

  -- Server owns the clock for anything claiming to be live and online.
  if new.source = 'live_app' then
    new.event_at := now();
  end if;
  new.recorded_at := now();

  -- Serialise the chain for this session.
  perform pg_advisory_xact_lock(hashtext(new.session_id::text));
  select hash into last_hash
    from public.encounter_events
   where session_id = new.session_id
   order by id desc limit 1;

  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.hash := encode(digest(
      new.prev_hash                         || '|' ||
      new.session_id::text                  || '|' ||
      coalesce(new.encounter_id::text, '')  || '|' ||
      new.actor_id::text                    || '|' ||
      new.event_type                        || '|' ||
      new.event_at::text                    || '|' ||
      new.recorded_at::text                 || '|' ||
      new.source::text                      || '|' ||
      coalesce(new.supersedes_event_id::text, ''),
      'sha256'), 'hex');

  return new;
end $$;

drop trigger if exists trg_chain_event on public.encounter_events;
create trigger trg_chain_event
  before insert on public.encounter_events
  for each row execute function public.chain_event();

-- Walks a session's chain in id order and recomputes every hash from
-- scratch, rather than trusting the stored prev_hash/hash on the rows
-- themselves. Callable by a supervisor for any session, or by a clinician
-- for a session they have events in (the same self-view transparency as
-- §8.3) — it returns hashes and validity only, never patient data, so
-- there is nothing in the result worth restricting further than that.
--
--   select * from public.verify_session_chain('<session-uuid>') where not valid;
--
-- Zero rows back means the chain is intact.
create or replace function public.verify_session_chain(sess uuid)
returns table (event_id bigint, valid boolean, stored_hash text, expected_hash text)
language plpgsql stable security definer
set search_path = public as $$
declare
  rec      record;
  prev     text := repeat('0', 64);
  computed text;
begin
  if not public.is_supervisor() and not exists (
    select 1 from public.encounter_events where session_id = sess and actor_id = auth.uid()
  ) then
    raise exception 'not authorized to verify this session';
  end if;

  for rec in
    select * from public.encounter_events where session_id = sess order by id asc
  loop
    computed := encode(digest(
        prev                                  || '|' ||
        rec.session_id::text                  || '|' ||
        coalesce(rec.encounter_id::text, '')  || '|' ||
        rec.actor_id::text                    || '|' ||
        rec.event_type                        || '|' ||
        rec.event_at::text                    || '|' ||
        rec.recorded_at::text                 || '|' ||
        rec.source::text                      || '|' ||
        coalesce(rec.supersedes_event_id::text, ''),
        'sha256'), 'hex');

    event_id := rec.id;
    stored_hash := rec.hash;
    expected_hash := computed;
    valid := (rec.prev_hash = prev) and (rec.hash = computed);
    return next;

    prev := rec.hash;
  end loop;
end $$;

-- ── RLS — the lockdown ───────────────────────────────────────────────────
--
-- No UPDATE or DELETE policy exists on encounters or encounter_events, for
-- any role, including supervisor — that absence is enforced here and
-- nowhere else, because the anon key is inlined into the published bundle
-- by Vite and readable by any visitor. The spec gives the exact policies
-- for encounter_events (below, verbatim); profiles, sessions and encounters
-- extend the same self-scoped-or-supervisor shape, since leaving them open
-- would defeat the point of locking down the table the spec does spell out.

alter table public.profiles enable row level security;
drop policy if exists "profiles select own or supervisor" on public.profiles;
create policy "profiles select own or supervisor"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_supervisor());

alter table public.sessions enable row level security;
drop policy if exists "sessions read all" on public.sessions;
drop policy if exists "sessions insert" on public.sessions;
create policy "sessions read all"
  on public.sessions for select to authenticated using (true);
create policy "sessions insert"
  on public.sessions for insert to authenticated with check (true);
revoke update, delete on public.sessions from authenticated, anon;

alter table public.encounters enable row level security;
drop policy if exists "encounters read own or supervisor" on public.encounters;
drop policy if exists "encounters insert own" on public.encounters;
create policy "encounters read own or supervisor"
  on public.encounters for select to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid() or public.is_supervisor());
create policy "encounters insert own"
  on public.encounters for insert to authenticated
  with check (created_by = auth.uid());
revoke update, delete on public.encounters from authenticated, anon;

alter table public.encounter_events enable row level security;
drop policy if exists "events insert own live" on public.encounter_events;
drop policy if exists "events read own" on public.encounter_events;

-- Insert: only for yourself, live sources only. Paper/register/correction
-- inserts go through SECURITY DEFINER functions, never direct — those
-- functions are later phases (§5.4, §7.2), so for now there is simply no
-- path at all for those sources, which is a safe default rather than a gap.
create policy "events insert own live"
  on public.encounter_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and source in ('live_app', 'live_offline')
  );

-- Select: your own record, or anything if supervisor.
create policy "events read own"
  on public.encounter_events for select to authenticated
  using (actor_id = auth.uid() or public.is_supervisor());

-- NO update policy. NO delete policy. Deliberately absent.
revoke update, delete on public.encounter_events from authenticated, anon;

-- ── Not in this file ─────────────────────────────────────────────────────
--
-- attestation_requests, corrections, gap_notes, register_photos,
-- register_entries, discrepancies and access_log belong to later phases
-- (§5, §7, §8) and aren't created here — each needs its own workflow, not
-- just a table.
--
-- opd_days is untouched on purpose: it is still the only working capture
-- path until Phase 2 ships a UI on encounter_events, and the spec's own
-- archival step (§4.7 — rename to legacy_opd_days, read-only, labelled
-- "pre-v2, unverified" in the UI) is a go-live cutover, not a Phase-1
-- migration. Run it only once Phase 2 replaces opd_days as the write path:
--
--   alter table public.opd_days rename to legacy_opd_days;
--   revoke insert, update, delete on public.legacy_opd_days from authenticated, anon;

-- ── Manual, HOD-run: promoting a supervisor ─────────────────────────────
--
-- Every new signup starts as 'clinician' (including the HOD, until this is
-- run). Promote the HOD and the named deputy by email, once each account
-- has signed in at least once:
--
--   update public.profiles set role = 'supervisor'
--    where id = (select id from auth.users where email = 'hod@hospital.org');
