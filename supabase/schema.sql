-- OPDGrind cloud store — run once in the Supabase SQL editor
-- (project → SQL Editor → New query → paste → Run).
--
-- One row per clinician per OPD day. `data` holds the whole day exactly as the
-- browser keeps it:
--   { rows: [...], session: { inT, outT, breaks: [...], interruptions: [...] }, updatedAt }
-- `date` is the IST calendar day as 'YYYY-MM-DD'; together with `clinician_id`
-- it is the conflict target for the app's upsert, so a day is written once and
-- updated in place after that.
--
-- Safe to run on an empty project, safe to run over the earlier single-doctor
-- version of the table, and safe to run again afterwards.

create table if not exists public.opd_days (
  date text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Who the day belongs to.
--
-- Added nullable on purpose. In the SQL editor auth.uid() is NULL — the editor
-- runs as the table's owner and carries no end-user token — so adding this
-- column as `not null default auth.uid()` would try to stamp NULL onto every
-- day already in the table and fail with 23502. Existing days therefore keep a
-- NULL owner until they are claimed, which is the adoption step at the bottom.
alter table public.opd_days add column if not exists clinician_id uuid;

-- New rows, written by the app with a real signed-in token, get their owner
-- automatically — so the app is never trusted to set it honestly.
alter table public.opd_days alter column clinician_id set default auth.uid();

-- One row per clinician per day, replacing the old key on `date` alone (which
-- would have let one clinician's Tuesday overwrite another's).
alter table public.opd_days drop constraint if exists opd_days_pkey;
create unique index if not exists opd_days_clinician_date
  on public.opd_days (clinician_id, date);

alter table public.opd_days enable row level security;

-- Remove the earlier open-to-anyone policies if this database has them: with
-- those in place, the publishable key in the page would still be a master key
-- to every clinician's patients.
drop policy if exists "opd read"   on public.opd_days;
drop policy if exists "opd insert" on public.opd_days;
drop policy if exists "opd update" on public.opd_days;
drop policy if exists "opd delete" on public.opd_days;

-- A signed-in clinician sees and writes their own days, and nobody else's.
-- These, not the app, are what actually enforce that: the anon key sitting in
-- the published JavaScript now grants no access to this table at all.
--
-- A day with a NULL owner matches nobody — `auth.uid() = NULL` is NULL, never
-- true — so unclaimed days are invisible until the adoption step below.
create policy "opd read"   on public.opd_days for select to authenticated using (auth.uid() = clinician_id);
create policy "opd insert" on public.opd_days for insert to authenticated with check (auth.uid() = clinician_id);
create policy "opd update" on public.opd_days for update to authenticated using (auth.uid() = clinician_id) with check (auth.uid() = clinician_id);
create policy "opd delete" on public.opd_days for delete to authenticated using (auth.uid() = clinician_id);

-- Lock the column down once every day has an owner. On a fresh project that is
-- immediately; on a project with days from before profiles existed it waits,
-- and completes the next time this script is run after the adoption step.
do $$
declare orphans bigint;
begin
  select count(*) into orphans from public.opd_days where clinician_id is null;

  if orphans > 0 then
    raise notice 'OPDGrind: % day(s) still have no owner. They are safe, but no '
                 'signed-in clinician can see them yet — run the adoption step at '
                 'the bottom of this file, then run this script once more.', orphans;
  else
    alter table public.opd_days alter column clinician_id set not null;
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.opd_days'::regclass and contype = 'p'
    ) then
      -- Promotes the unique index above into the primary key rather than
      -- building a second identical index.
      alter table public.opd_days add primary key using index opd_days_clinician_date;
    end if;
    raise notice 'OPDGrind: every day has an owner — clinician_id is now NOT NULL and part of the primary key.';
  end if;
end $$;


-- ── Adopting days logged before profiles existed ────────────────────────────
--
-- Those days are still in this table, but they belong to nobody, so no
-- signed-in clinician can see them. To claim them:
--
--   1. Sign up in the app first, so the account exists (sign-up does not need
--      this table, so it works even while the banner is showing).
--   2. Uncomment ONE of the two statements below and run it.
--   3. Run this whole script once more, to finish locking the column down.
--
-- By email — easiest, and it looks the id up for you:
--
-- update public.opd_days
--    set clinician_id = (select id from auth.users where email = 'you@hospital.org')
--  where clinician_id is null;
--
-- Or by the clinician id shown on the app's My profile screen:
--
-- update public.opd_days set clinician_id = 'YOUR-CLINICIAN-ID' where clinician_id is null;
--
-- Nothing is lost in the meantime: every day this browser has ever logged is
-- still in localStorage, and pushes itself back up on the next sync.
