// The day store: { 'YYYY-MM-DD': { rows, session, updatedAt } }, kept in
// localStorage under one key so the log survives a reload, a flat battery or
// a dead hospital network. The cloud is a copy of this, never the source.

export const STORAGE_KEY = 'opd-flow-log-v1'

// The tab order across a row — Enter walks these in sequence.
export const FIELDS = ['name', 'opd', 'type', 'asked', 'done', 'dx', 'delay']

const rid = () => Math.random().toString(36).slice(2)

export function blankRow() {
  return { id: rid(), name: '', opd: '', type: '', inT: '', outT: '', asked: '', done: '', dx: '', delay: '' }
}

export function blankDay() {
  return { rows: [blankRow()], session: { inT: '', outT: '', breaks: [] } }
}

export const blankSession = () => ({ inT: '', outT: '', breaks: [] })

// Accepts both shapes the log has ever been written in: an early bare array of
// rows, and the current { rows, session } day. Every row comes back with an id,
// so React can keep a half-typed cell attached to its patient, and with every
// field present, so each cell stays a controlled input.
export function normalizeDay(value) {
  const withIds = (rows) => (rows || []).map((r) => ({ ...blankRow(), ...r }))
  if (Array.isArray(value)) return { rows: withIds(value), session: blankSession(), updatedAt: '' }
  if (value && value.rows) {
    return {
      rows: withIds(value.rows),
      session: { ...blankSession(), ...value.session },
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

export function readStore() {
  let raw = {}
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}
  } catch (e) {
    raw = {}
  }
  return normalizeStore(raw)
}

export function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
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
    !!s.inT || !!s.outT
}
