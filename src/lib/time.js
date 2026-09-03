// Everything on this sheet is clocked in India Standard Time, whatever the
// machine's own timezone is — the log has to match the clock on the OPD wall.

export function istTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date())
}

export function istDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date())
}

// "09:35" → minutes past midnight; anything else → null. A time off the clock
// face — "99:99" from a slipped keystroke — is not a time: taking it at face
// value would put 87 hours of break into a day and carry that into the reports.
export function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim())
  if (!m) return null
  const h = +m[1]
  const min = +m[2]
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

// Minutes between two clock times, wrapping past midnight.
export function span(from, to) {
  const a = toMin(from), b = toMin(to)
  if (a == null || b == null) return null
  let d = b - a
  if (d < 0) d += 1440
  return d
}

export const dur = (row) => span(row.inT, row.outT)

/* ── calendar ─────────────────────────────────────────────────────────────
   Day keys are 'YYYY-MM-DD' IST calendar days. All arithmetic goes through
   the numeric Date constructor rather than string parsing, so a browser in a
   DST timezone cannot slide a day sideways.                                */

const pad = (n) => String(n).padStart(2, '0')

export const parseKey = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date()
}

export const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())

export function addDays(key, n) {
  const d = parseKey(key)
  return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

// The Monday of the week this day falls in. Sunday belongs to the week that
// has just ended, not the one about to start — a Sunday clinic is overtime on
// the week gone by, which is how the doctor reads it.
export function mondayOf(key) {
  const d = parseKey(key)
  const dow = d.getDay()                    // 0 Sun … 6 Sat
  const back = dow === 0 ? 6 : dow - 1
  return addDays(key, -back)
}

// The working week: Monday to Saturday, six days. `sunday` is carried
// alongside rather than inside, because it is only ever shown when someone
// actually ran a clinic on it.
export function weekKeys(mondayKey) {
  const monday = mondayOf(mondayKey)
  const days = []
  for (let i = 0; i < 6; i += 1) days.push(addDays(monday, i))
  return { monday, days, sunday: addDays(monday, 6) }
}

export const monthOf = (key) => {
  const d = parseKey(key)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export const monthKey = (year, month) => keyOf(new Date(year, month, 1))

export const addMonths = (year, month, n) => {
  const d = new Date(year, month + n, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()

// Every day of a calendar month, grouped into the weeks it spans. A week that
// straddles the turn of the month is clipped to the days inside it, so the
// week rows of a month always add up to exactly the month.
export function monthWeeks(year, month) {
  const last = daysInMonth(year, month)
  const buckets = []
  const index = {}

  for (let day = 1; day <= last; day += 1) {
    const key = keyOf(new Date(year, month, day))
    const monday = mondayOf(key)
    if (index[monday] == null) {
      index[monday] = buckets.length
      buckets.push({ monday, days: [], sundays: [] })
    }
    const bucket = buckets[index[monday]]
    if (parseKey(key).getDay() === 0) bucket.sundays.push(key)
    else bucket.days.push(key)
  }

  return buckets.map((b, i) => ({ ...b, no: i + 1 }))
}

/* ── labels ─────────────────────────────────────────────────────────────── */

const fmt = (key, opts) => parseKey(key).toLocaleDateString('en-GB', opts)

export const dayLong = (key) => fmt(key, { weekday: 'long' })
export const dayShort = (key) => fmt(key, { weekday: 'short' })
export const dateLong = (key) => fmt(key, { day: '2-digit', month: 'long', year: 'numeric' })
export const dateShort = (key) => fmt(key, { day: '2-digit', month: 'short' })
export const dateNum = (key) => fmt(key, { day: '2-digit' })

export const monthLong = (year, month) =>
  new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

// "01 – 06 Sep 2026", collapsing the month and year when both ends share them.
export function rangeLabel(fromKey, toKey) {
  const a = parseKey(fromKey)
  const b = parseKey(toKey)
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  const left = sameMonth ? dateNum(fromKey) : dateShort(fromKey)
  return left + ' – ' + dateShort(toKey) + ' ' + b.getFullYear()
}

/* ── durations ──────────────────────────────────────────────────────────── */

// "2h 15m" for a total, the way the day close already reads.
export function hm(mins) {
  if (mins == null || !isFinite(mins) || mins <= 0) return '—'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h ? h + 'h ' + pad(m) + 'm' : m + 'm'
}

// Hours to one decimal — the unit the OPD-hours column is read in.
export const hours = (mins) => (mins == null || !isFinite(mins) || mins <= 0 ? '—' : (mins / 60).toFixed(1))

export const one = (n) => (n == null || !isFinite(n) ? '—' : n.toFixed(1))
