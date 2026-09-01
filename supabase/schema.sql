-- OPDGrind cloud store — run once in the Supabase SQL editor
-- (project → SQL Editor → New query → paste → Run).
--
-- One row per OPD day. `data` holds the whole day exactly as the browser keeps
-- it: { rows: [...], session: { inT, outT, breaks: [...] }, updatedAt }.
-- `date` is the IST calendar day as 'YYYY-MM-DD' and is the conflict target for
-- the app's upsert, so a day is written once and updated in place after that.

create table if not exists public.opd_days (
  date text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.opd_days enable row level security;

-- The app talks to the REST endpoint with the publishable (anon) key straight
-- from the browser, so these policies are what stands between the table and the
-- open internet. They are deliberately open: anyone holding the key and the
-- project URL can read and write the log.
--
-- Fine for a single-doctor project whose URL and key are not published. If this
-- ever holds identifiable patient data on a shared or public deployment, put
-- Supabase Auth in front of it instead and scope these policies to
-- `to authenticated` (or to an owner column) rather than `to anon`.
create policy "opd read"   on public.opd_days for select to anon using (true);
create policy "opd insert" on public.opd_days for insert to anon with check (true);
create policy "opd update" on public.opd_days for update to anon using (true) with check (true);
