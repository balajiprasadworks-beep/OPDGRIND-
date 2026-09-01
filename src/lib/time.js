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

// "09:35" → minutes past midnight; anything else → null.
export function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t || '').trim())
  if (!m) return null
  return (+m[1]) * 60 + (+m[2])
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
