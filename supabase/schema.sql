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
-- This script is safe to re-run, and safe to run over the earlier
-- single-doctor version of the table: it adds the owner column and swaps the
-- open policies for per-clinician ones without touching the rows.

create table if not exists public.opd_days (
  date text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Who the day belongs to. New rows default to whoever is inserting them, so
-- the app never has to be trusted to set it honestly.
alter table public.opd_days
  add column if not exists clinician_id uuid not null default auth.uid();

-- One row per clinician per day.
alter table public.opd_days drop constraint if exists opd_days_pkey;
alter table public.opd_days add primary key (clinician_id, date);

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
create policy "opd read"   on public.opd_days for select to authenticated using (auth.uid() = clinician_id);
create policy "opd insert" on public.opd_days for insert to authenticated with check (auth.uid() = clinician_id);
create policy "opd update" on public.opd_days for update to authenticated using (auth.uid() = clinician_id) with check (auth.uid() = clinician_id);
create policy "opd delete" on public.opd_days for delete to authenticated using (auth.uid() = clinician_id);

-- Days written before profiles existed have no owner, so no signed-in
-- clinician can see them. To adopt them into your own account, copy your
-- clinician id from the app (drawer → My profile) and run:
--
--   update public.opd_days set clinician_id = 'YOUR-CLINICIAN-ID' where clinician_id is null;
--
-- Nothing is lost in the meantime: every day this browser has ever logged is
-- still in localStorage, and pushes itself back up on the next sync.
