// Cloud sync over Supabase's PostgREST endpoint — plain fetch, no SDK, so the
// page stays small and the wire format is obvious. One row per clinician per
// day: opd_days(clinician_id uuid, date text, data jsonb, updated_at).
//
// Every request rides the signed-in clinician's own access token, so row-level
// security — not the app — is what keeps one junior's patients out of another's
// log.

import schemaSql from '../../supabase/schema.sql?raw'

import { cloudConfig } from '../config.js'
import { accessToken, isConfigured as authConfigured } from './auth.js'
import { normalizeDay, hasContent } from './store.js'

export const TABLE = 'opd_days'

// The one-time setup block, shown in the app with a Copy button. Imported from
// the file itself rather than copied here: two hand-maintained copies of a
// hundred-line migration drift, and the one the doctor pastes has to be the one
// that was actually tested.
export const SETUP_SQL = schemaSql

// 404 means the table isn't there yet; 401/403 means the policies aren't (or
// the column isn't). Both are the same story for the doctor: run the setup SQL
// once. 400 usually means the table predates clinician_id — same fix.
function restError(status, what) {
  const err = new Error(status === 404 ? 'Cloud not set up yet' : what + ' (HTTP ' + status + ')')
  err.setup = status === 404 || status === 401 || status === 403 || status === 400
  return err
}

export function isConfigured() {
  const cfg = cloudConfig()
  return !!(cfg.url && cfg.key) && authConfigured()
}

async function authHeaders() {
  const token = await accessToken()
  if (!token) {
    const err = new Error('Signed out — sign in to sync')
    err.auth = true
    throw err
  }
  return {
    apikey: cloudConfig().key,
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  }
}

// Upsert the named days for this clinician. `on_conflict=clinician_id,date`
// plus merge-duplicates makes this an insert-or-update in one round trip.
export async function pushDays(keys, store, clinicianId) {
  const cfg = cloudConfig()
  if (!cfg.url || !keys.length || !clinicianId) return

  const body = keys
    .filter((k) => store[k])
    .map((k) => ({
      clinician_id: clinicianId,
      date: k,
      data: store[k],
      updated_at: store[k].updatedAt || new Date().toISOString()
    }))
  if (!body.length) return

  const res = await fetch(cfg.url + '/rest/v1/' + TABLE + '?on_conflict=clinician_id,date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal', ...(await authHeaders()) },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw restError(res.status, 'Cloud save failed')
}

// The policies already restrict this to the caller's own rows; the explicit
// filter keeps it true even if someone loosens them later.
export async function fetchDays(clinicianId) {
  const cfg = cloudConfig()
  const query = '?select=date,data,updated_at&clinician_id=eq.' + encodeURIComponent(clinicianId)
  const res = await fetch(cfg.url + '/rest/v1/' + TABLE + query, { headers: await authHeaders() })
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
