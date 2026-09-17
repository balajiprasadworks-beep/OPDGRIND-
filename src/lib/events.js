// The v2 capture path — encounter_events over Supabase's PostgREST endpoint,
// same plain-fetch approach as lib/supabase.js. This is additive: opd_days
// and lib/supabase.js are untouched, and nothing here is read by DaySheet.
//
// Starting a new encounter needs the hash-opd-number Edge Function (the
// pepper that turns an OP number into opd_no_hash cannot live in the
// browser — see supabase/functions/hash-opd-number). That call needs a
// network round trip, so unlike ending an encounter or logging a break,
// starting a brand-new patient cannot be queued offline: there is nothing
// safe to hash with on this side of the wire. See lib/offlineQueue.js for
// what *can* queue.

import phase1Sql from '../../supabase/phase1_integrity.sql?raw'

import { cloudConfig } from '../config.js'
import { accessToken } from './auth.js'
import { istDate } from './time.js'
import { drainQueue, enqueue } from './offlineQueue.js'

const DRIFT_LIMIT_MS = 120000

// Shown with a copy button when the setup check below fails, same pattern as
// lib/supabase.js's SETUP_SQL — imported rather than pasted so there is only
// ever one copy of the migration to keep in sync.
export const SETUP_SQL = phase1Sql

async function authHeaders() {
  const token = await accessToken()
  if (!token) {
    const err = new Error('Signed out — sign in to capture')
    err.auth = true
    throw err
  }
  return { apikey: cloudConfig().key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
}

// 404/401/403 all mean the same thing to whoever is looking at this screen:
// the v2 tables or policies from phase1_integrity.sql are not in place yet.
function restError(status, what) {
  const setup = status === 404 || status === 401 || status === 403
  const err = new Error(setup
    ? 'v2 capture is not set up yet — run supabase/phase1_integrity.sql'
    : what + ' (HTTP ' + status + ')')
  err.setup = setup
  return err
}

export function isConfigured() {
  const cfg = cloudConfig()
  return !!(cfg.url && cfg.key)
}

// Morning / afternoon / evening by IST wall clock — matches session_kind in
// phase1_integrity.sql. A session spans however long the clinic actually
// runs; this only decides which bucket "now" falls into.
function sessionKindNow() {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date())
  )
  if (hour < 12) return 'morning'
  if (hour < 16) return 'afternoon'
  return 'evening'
}

/* ── sessions ───────────────────────────────────────────────────────────── */

// Finds today's session for the current kind, or opens one. Concurrency is
// resolved by the unique (session_date, kind) index in the database, not by
// anything client-side — a 409 on insert means someone else's tab won the
// race, so this just re-reads and takes what is there.
export async function currentSession() {
  const cfg = cloudConfig()
  const headers = await authHeaders()
  const date = istDate()
  const kind = sessionKindNow()
  const query = '?select=id,session_date,kind,sealed_at,soft_closed_at&session_date=eq.' + date + '&kind=eq.' + kind

  const existing = await fetch(cfg.url + '/rest/v1/sessions' + query, { headers })
  if (!existing.ok) throw restError(existing.status, 'Could not read today’s session')
  const found = await existing.json()
  if (found[0]) return found[0]

  const created = await fetch(cfg.url + '/rest/v1/sessions', {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ session_date: date, kind })
  })
  if (created.ok) return (await created.json())[0]
  if (created.status === 409) {
    const retry = await fetch(cfg.url + '/rest/v1/sessions' + query, { headers })
    const rows = retry.ok ? await retry.json() : []
    if (rows[0]) return rows[0]
  }
  throw restError(created.status, 'Could not open today’s session')
}

/* ── this clinician's own events, today ────────────────────────────────── */

export async function fetchOwnEvents(sessionId, actorId) {
  const cfg = cloudConfig()
  const headers = await authHeaders()
  const query = '?select=*&session_id=eq.' + sessionId + '&actor_id=eq.' + actorId + '&order=id.asc'
  const res = await fetch(cfg.url + '/rest/v1/encounter_events' + query, { headers })
  if (!res.ok) throw restError(res.status, 'Could not read today’s events')
  return res.json()
}

// The last ENCOUNTER_START in the list with no matching ENCOUNTER_END after
// it — exactly the encounter the next START would auto-close (build spec
// §5.2). Auto-closed encounters stay in this scan too: closed is closed,
// however it happened.
export function findOpenEncounter(events) {
  let open = null
  for (const e of events) {
    if (e.event_type === 'ENCOUNTER_START') open = { encounter_id: e.encounter_id, opened_at: e.event_at }
    else if (e.event_type === 'ENCOUNTER_END' && open && e.encounter_id === open.encounter_id) open = null
  }
  return open
}

/* ── hashing + clock drift ─────────────────────────────────────────────── */

// Round trip to the one place the OP-number pepper is allowed to live. Also
// carries the server's clock back, so a live capture doubles as a drift
// check with no extra request.
async function hashOpdNumber(opdNumber) {
  const cfg = cloudConfig()
  const headers = await authHeaders()
  const sentAt = Date.now()
  const res = await fetch(cfg.url + '/functions/v1/hash-opd-number', {
    method: 'POST',
    headers,
    body: JSON.stringify({ opdNumber })
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error((body && body.error) || 'Could not hash the OP number (HTTP ' + res.status + ')')
    err.setup = res.status === 404
    throw err
  }
  const driftMs = body.serverTime ? new Date(body.serverTime).getTime() - sentAt : null
  return { opdNoHash: body.opdNoHash, driftMs }
}

export const clockDriftFlag = (driftMs) => driftMs != null && Math.abs(driftMs) > DRIFT_LIMIT_MS

/* ── starting and ending an encounter ──────────────────────────────────── */

// Auto-close (build spec §5.2): a new START while one is already open closes
// the previous one first, flagged auto_closed so it drops out of duration
// medians rather than silently inflating someone's time-per-patient.
async function autoCloseIfOpen(session, actorId, events) {
  const open = findOpenEncounter(events)
  if (!open) return
  await postEvent(session, {
    encounter_id: open.encounter_id,
    actor_id: actorId,
    event_type: 'ENCOUNTER_END',
    auto_closed: true
  })
}

async function postEvent(session, fields) {
  const cfg = cloudConfig()
  const headers = await authHeaders()
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  const now = new Date().toISOString()

  const body = {
    session_id: session.id,
    event_at: now,
    source: online ? 'live_app' : 'live_offline',
    ...(online ? {} : { client_reported_at: now }),
    ...fields
  }

  if (!online) {
    await enqueue(body)
    return { queued: true }
  }

  try {
    const res = await fetch(cfg.url + '/rest/v1/encounter_events', {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw restError(res.status, 'Could not save the event')
    return (await res.json())[0]
  } catch (err) {
    // A network failure here (not an HTTP error — fetch itself rejected)
    // means "online" was stale. Same event, same shape, queued instead.
    if (err instanceof TypeError) {
      await enqueue({ ...body, source: 'live_offline', client_reported_at: now })
      return { queued: true }
    }
    throw err
  }
}

// Starting a new patient always needs the network (see file header) — no
// offline fallback here, unlike everything else in this file.
export async function startEncounter({ session, actorId, opdNumber, caseType }) {
  if (session.sealed_at) throw new Error('This session is sealed — use the correction workflow.')

  const events = await fetchOwnEvents(session.id, actorId)
  await autoCloseIfOpen(session, actorId, events)

  const { opdNoHash, driftMs } = await hashOpdNumber(opdNumber)

  const cfg = cloudConfig()
  const headers = await authHeaders()
  const encRes = await fetch(cfg.url + '/rest/v1/encounters', {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      session_id: session.id,
      opd_no_hash: opdNoHash,
      case_type: caseType || 'review',
      assigned_to: actorId,
      created_by: actorId
    })
  })
  if (!encRes.ok) throw restError(encRes.status, 'Could not open the encounter')
  const encounter = (await encRes.json())[0]

  const event = await postEvent(session, {
    encounter_id: encounter.id,
    actor_id: actorId,
    event_type: 'ENCOUNTER_START'
  })

  return { encounter, event, driftMs }
}

export async function endEncounter({ session, actorId, encounterId }) {
  if (session.sealed_at) throw new Error('This session is sealed — use the correction workflow.')
  return postEvent(session, { encounter_id: encounterId, actor_id: actorId, event_type: 'ENCOUNTER_END' })
}

// Call when the app comes back online (a 'online' listener, or on load) to
// flush anything logged while offline. Each queued row already carries its
// own source/client_reported_at from when it was captured.
export async function syncOfflineQueue() {
  const cfg = cloudConfig()
  const headers = await authHeaders()
  await drainQueue(async (event) => {
    const res = await fetch(cfg.url + '/rest/v1/encounter_events', {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(event)
    })
    if (!res.ok) throw restError(res.status, 'Could not sync a queued event')
  })
}
