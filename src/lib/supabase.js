// Cloud sync over Supabase's PostgREST endpoint — plain fetch, no SDK, so the
// page stays small and the wire format is obvious. One row per day:
// opd_days(date text primary key, data jsonb, updated_at timestamptz).

import { cloudConfig } from '../config.js'
import { normalizeDay, hasContent } from './store.js'

export const TABLE = 'opd_days'

export const SETUP_SQL = `create table if not exists public.opd_days (
  date text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.opd_days enable row level security;
create policy "opd read"   on public.opd_days for select to anon using (true);
create policy "opd insert" on public.opd_days for insert to anon with check (true);
create policy "opd update" on public.opd_days for update to anon using (true) with check (true);`

function headers(key) {
  return { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
}

// 404 means the table isn't there yet; 401/403 means the policies aren't.
// Both are the same story for the doctor: run the setup SQL once.
function restError(status, what) {
  const err = new Error(status === 404 ? 'Cloud not set up yet' : what + ' (HTTP ' + status + ')')
  err.setup = status === 404 || status === 401 || status === 403
  return err
}

export function isConfigured() {
  const cfg = cloudConfig()
  return !!(cfg.url && cfg.key)
}

// Upsert the named days. `on_conflict=date` + merge-duplicates makes this an
// insert-or-update in one round trip.
export async function pushDays(keys, store) {
  const cfg = cloudConfig()
  if (!cfg.url || !keys.length) return

  const body = keys
    .filter((k) => store[k])
    .map((k) => ({
      date: k,
      data: store[k],
      updated_at: store[k].updatedAt || new Date().toISOString()
    }))
  if (!body.length) return

  const res = await fetch(cfg.url + '/rest/v1/' + TABLE + '?on_conflict=date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal', ...headers(cfg.key) },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw restError(res.status, 'Cloud save failed')
}

export async function fetchDays() {
  const cfg = cloudConfig()
  const res = await fetch(cfg.url + '/rest/v1/' + TABLE + '?select=date,data,updated_at', {
    headers: headers(cfg.key)
  })
  if (!res.ok) throw restError(res.status, 'Cloud read failed')
  return (await res.json()) || []
}

// Last-write-wins per day, compared on updatedAt. Returns the merged store and
// the days this device still owes the cloud.
export function mergeRemote(local, remote) {
  const store = { ...local }
  const seen = {}
  const toPush = []

  remote.forEach((r) => {
    const day = normalizeDay(r.data)
    if (!day) return
    day.updatedAt = day.updatedAt || r.updated_at || ''
    seen[r.date] = true

    const mine = store[r.date]
    if (!mine || (mine.updatedAt || '') < day.updatedAt) store[r.date] = day
    else if ((mine.updatedAt || '') > day.updatedAt) toPush.push(r.date)
  })

  Object.keys(store).forEach((k) => {
    if (!seen[k] && hasContent(store[k])) toPush.push(k)
  })

  return { store, toPush }
}
