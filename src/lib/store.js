// The day store: { 'YYYY-MM-DD': { rows, session, updatedAt } }, kept in
// localStorage under one key so the log survives a reload, a flat battery or
// a dead hospital network. The cloud is a copy of this, never the source.
//
// Since clinicians sign in, the key is namespaced per clinician — two juniors
// sharing a computer keep two separate logs in the one browser.

const BASE_KEY = 'opd-flow-log-v1'

// The single-doctor key this app wrote before profiles existed. The first
// clinician to sign in adopts it; the key itself is never deleted, so it stays
// a backup of everything logged before the change.
export const LEGACY_KEY = BASE_KEY
export const ADOPTED_FLAG = 'opd-flow-log-adopted'

export const storageKey = (clinicianId) => (clinicianId ? BASE_KEY + '::' + clinicianId : BASE_KEY)

// The tab order across a row — Enter walks these in sequence.
export const FIELDS = ['name', 'opd', 'type', 'complexity', 'asked', 'done', 'dx', 'delay']

// Case complexity, quiet to loud. The value stored is the code; the sheet and
// the reports both read their label and colour from here.
export const COMPLEXITY = [
  { code: 'MID', label: 'MID', key: '1', color: 'var(--color-accent-500)' },
  { code: 'HIGH', label: 'HIGH', key: '2', color: 'var(--color-accent-700)' },
  { code: 'VHIGH', label: 'V.HIGH', key: '3', color: 'var(--color-accent-2-600)' }
]

export const complexityLabel = (code) => {
  const hit = COMPLEXITY.filter((c) => c.code === code)[0]
  return hit ? hit.label : ''
}

const rid = () => Math.random().toString(36).slice(2)

export function blankRow() {
  return {
    id: rid(), name: '', opd: '', type: '', complexity: '',
    inT: '', outT: '', asked: '', done: '', dx: '', delay: ''
  }
}

export function blankDay() {
  return { rows: [blankRow()], session: blankSession() }
}

// Breaks are planned time out; interruptions are not. Same { out, in } shape,
// counted separately, so the day close can say which kind of time went where.
export const blankSession = () => ({ inT: '', outT: '', breaks: [], interruptions: [] })

// One span of time away from the desk. `why` is only ever filled on
// interruptions — a break needs no explanation.
const normalizeSpans = (list) => (Array.isArray(list) ? list : [])
  .filter((s) => s && typeof s === 'object')
  .map((s) => ({ out: s.out || '', in: s.in || '', why: s.why || '' }))

// Accepts both shapes the log has ever been written in: an early bare array of
// rows, and the current { rows, session } day. Every row comes back with an id,
// so React can keep a half-typed cell attached to its patient, and with every
// field present, so each cell stays a controlled input.
export function normalizeDay(value) {
  const withIds = (rows) => (rows || []).map((r) => ({ ...blankRow(), ...r }))
  const session = (s) => ({
    ...blankSession(),
    ...s,
    breaks: normalizeSpans(s && s.breaks),
    interruptions: normalizeSpans(s && s.interruptions)
  })
  if (Array.isArray(value)) return { rows: withIds(value), session: session(null), updatedAt: '' }
  if (value && value.rows) {
    return {
      rows: withIds(value.rows),
      session: session(value.session),
      updatedAt: value.updatedAt || ''
    }
  }
  return null
}

export function normalizeStore(raw) {
  const out = {}
  Object.keys(raw || {}).forEach((k) => {
    const day = normalizeDay(raw[k])
    if (day) out[k] = day
  })
  return out
}

function readKey(key) {
  let raw = {}
  try {
    raw = JSON.parse(localStorage.getItem(key) || '{}') || {}
  } catch (e) {
    raw = {}
  }
  return normalizeStore(raw)
}

// The first clinician to sign in on a browser that already holds a pre-profile
// log inherits it — those days were theirs, and losing them behind a login
// would be the worst possible welcome. Runs once; the old key is left in place.
function adoptLegacy(clinicianId, store) {
  if (!clinicianId) return store
  let adopted = {}
  try {
    adopted = JSON.parse(localStorage.getItem(ADOPTED_FLAG) || '{}') || {}
  } catch (e) {
    adopted = {}
  }
  if (adopted.done) return store

  const legacy = readKey(LEGACY_KEY)
  const merged = { ...legacy, ...store } // anything already under the profile wins
  try {
    localStorage.setItem(ADOPTED_FLAG, JSON.stringify({ done: true, by: clinicianId }))
  } catch (e) {
    // Nothing to do: without the flag the same merge just runs again, harmlessly.
  }
  return merged
}

export function readStore(clinicianId) {
  const own = readKey(storageKey(clinicianId))
  return adoptLegacy(clinicianId, own)
}

export function writeStore(store, clinicianId) {
  try {
    localStorage.setItem(storageKey(clinicianId), JSON.stringify(store))
  } catch (e) {
    // Private-mode or a full quota: the day stays in memory and in the cloud.
  }
}

// Is there anything on this day worth pushing? Blank days stay off the wire.
export function hasContent(day) {
  if (!day) return false
  const s = day.session || {}
  const rows = day.rows || []
  return rows.some((r) => (r.name || '').trim() || (r.opd || '').trim() || (r.asked || '').trim()) ||
    !!s.inT || !!s.outT ||
    // A break or an interruption typed in by hand is content of its own: a day
    // whose only entry is a corrected break still has to reach the cloud.
    (s.breaks || []).length > 0 || (s.interruptions || []).length > 0
}

// A row counts as a patient once it carries a name or an OPD number — the same
// test the sheet's own header uses, kept here so the reports cannot drift from it.
export const isPatient = (row) => !!((row.name || '').trim() || (row.opd || '').trim())
