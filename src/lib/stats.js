// The numbers behind the weekly and monthly reports.
//
// Every figure is derived here rather than in the report components, so the two
// reports can never quietly disagree with each other — or with the day close on
// the sheet, which counts a patient with the same test (lib/store.js#isPatient).

import { COMPLEXITY, isPatient } from './store.js'
import { dur, span, toMin, mondayOf, weekKeys, monthWeeks, dayShort, dateShort, rangeLabel, parseKey } from './time.js'

const CODES = COMPLEXITY.map((c) => c.code)

const emptyMix = () => {
  const mix = {}
  CODES.forEach((c) => { mix[c] = 0 })
  return mix
}

const emptyMixMins = () => {
  const mix = {}
  CODES.forEach((c) => { mix[c] = { n: 0, mins: 0 } })
  return mix
}

// Total minutes across a list of { out, in } spans, ignoring any still running.
export function spanMinutes(list) {
  return (list || []).reduce((sum, s) => {
    const m = span(s.out, s.in)
    return sum + (m == null ? 0 : m)
  }, 0)
}

/* ── one day ────────────────────────────────────────────────────────────── */

export function dayStats(day, key) {
  const rows = (day && day.rows) || []
  const sess = (day && day.session) || {}
  const patients = rows.filter(isPatient)

  let consultMins = 0
  let timed = 0
  const mix = emptyMix()
  const mixMins = emptyMixMins()
  let newCount = 0
  let reviewCount = 0

  patients.forEach((r) => {
    const d = dur(r)
    if (d != null) {
      consultMins += d
      timed += 1
    }
    if (r.type === 'New') newCount += 1
    if (r.type === 'Review') reviewCount += 1
    if (mix[r.complexity] != null) {
      mix[r.complexity] += 1
      if (d != null) {
        mixMins[r.complexity].n += 1
        mixMins[r.complexity].mins += d
      }
    }
  })

  // OPD hours are the clinician's own walk in → walk out. Before those are
  // stamped, fall back to the width of the patient list, which is what the
  // sheet's header stat has always shown.
  let opdMins = span(sess.inT, sess.outT)
  if (opdMins == null) {
    const ins = patients.map((r) => toMin(r.inT)).filter((n) => n != null)
    const outs = patients.map((r) => toMin(r.outT)).filter((n) => n != null)
    if (ins.length && outs.length) {
      const width = Math.max(...outs) - Math.min(...ins)
      opdMins = width > 0 ? width : null
    }
  }

  const breakMins = spanMinutes(sess.breaks)
  const interruptMins = spanMinutes(sess.interruptions)

  return {
    key: key || '',
    patients: patients.length,
    worked: patients.length > 0,
    consultMins,
    timed,
    meanMin: timed ? consultMins / timed : null,
    opdMins,
    breakMins,
    interruptMins,
    netMins: opdMins == null ? null : Math.max(0, opdMins - breakMins - interruptMins),
    complexity: mix,
    complexityMins: mixMins,
    newCount,
    reviewCount
  }
}

/* ── rolling up a set of days ───────────────────────────────────────────── */

// Totals across day stats. The mean is deliberately weighted — total minutes
// over total patients — so a four-patient morning cannot drag a forty-patient
// day around, which a mean of the daily means would let it do.
function rollUp(stats) {
  const total = {
    patients: 0, daysWorked: 0, consultMins: 0, timed: 0,
    opdMins: 0, breakMins: 0, interruptMins: 0,
    complexity: emptyMix(), complexityMins: emptyMixMins()
  }

  stats.forEach((s) => {
    total.patients += s.patients
    if (s.worked) total.daysWorked += 1
    total.consultMins += s.consultMins
    total.timed += s.timed
    total.opdMins += s.opdMins || 0
    total.breakMins += s.breakMins
    total.interruptMins += s.interruptMins
    CODES.forEach((c) => {
      total.complexity[c] += s.complexity[c]
      total.complexityMins[c].n += s.complexityMins[c].n
      total.complexityMins[c].mins += s.complexityMins[c].mins
    })
  })

  total.meanMin = total.timed ? total.consultMins / total.timed : null
  total.avgPerDay = total.daysWorked ? total.patients / total.daysWorked : null
  return total
}

const busiestOf = (stats, labelFor) => {
  let best = null
  stats.forEach((s) => {
    if (s.patients > 0 && (!best || s.patients > best.patients)) {
      best = { key: s.key, patients: s.patients, label: labelFor(s) }
    }
  })
  return best
}

/* ── the working week: Monday to Saturday ───────────────────────────────── */

export function weekStats(store, anyKeyInWeek) {
  const { monday, days, sunday } = weekKeys(mondayOf(anyKeyInWeek))

  const rows = days.map((key) => ({
    ...dayStats(store[key], key),
    day: dayShort(key),
    date: dateShort(key),
    extra: false
  }))

  // A Sunday clinic is rare and is not part of the six-day week — but silently
  // dropping the patients seen on one would be a lie, so it shows as one muted
  // row after Saturday and counts in the totals.
  const sun = dayStats(store[sunday], sunday)
  if (sun.patients > 0) {
    rows.push({ ...sun, day: dayShort(sunday), date: dateShort(sunday), extra: true })
  }

  const totals = rollUp(rows)
  const maxPatients = rows.reduce((m, r) => Math.max(m, r.patients), 0)

  return {
    monday,
    from: days[0],
    to: days[days.length - 1],
    label: rangeLabel(days[0], days[days.length - 1]),
    rows,
    days: rows.filter((r) => !r.extra),
    totals,
    maxPatients,
    busiest: busiestOf(rows, (s) => dayShort(s.key))
  }
}

/* ── the calendar month, grouped into its weeks ─────────────────────────── */

export function monthStats(store, year, month) {
  const buckets = monthWeeks(year, month)

  const weeks = buckets.map((b) => {
    const keys = b.days.concat(b.sundays)
    const stats = keys.map((key) => dayStats(store[key], key))
    const totals = rollUp(stats)
    const first = keys[0]
    const last = keys[keys.length - 1]
    return {
      no: b.no,
      monday: b.monday,
      from: first,
      to: last,
      label: rangeLabel(first, last),
      totals,
      patients: totals.patients
    }
  })

  const allKeys = buckets.reduce((acc, b) => acc.concat(b.days, b.sundays), [])
  const dayList = allKeys.map((key) => dayStats(store[key], key))
  const totals = rollUp(dayList)

  // One block per calendar day, for the load strip: the shape of a month's
  // grind without a chart library.
  const strip = dayList.map((s) => ({
    key: s.key,
    dow: parseKey(s.key).getDay(),
    day: parseKey(s.key).getDate(),
    patients: s.patients
  }))

  // Which day of the week actually costs the most — the question a daily sheet
  // can never answer.
  const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekday = NAMES.map((name, i) => {
    const dow = i + 1                                   // 1 Mon … 6 Sat
    const on = dayList.filter((s) => parseKey(s.key).getDay() === dow && s.worked)
    const patients = on.reduce((sum, s) => sum + s.patients, 0)
    return { name, days: on.length, patients, avg: on.length ? patients / on.length : null }
  })

  let busiestWeek = null
  weeks.forEach((w) => {
    if (w.patients > 0 && (!busiestWeek || w.patients > busiestWeek.patients)) busiestWeek = w
  })

  return {
    year,
    month,
    weeks,
    totals,
    strip,
    weekday,
    busiestWeek,
    busiestDay: busiestOf(dayList, (s) => dayShort(s.key) + ' ' + dateShort(s.key)),
    maxWeekdayAvg: weekday.reduce((m, w) => Math.max(m, w.avg || 0), 0),
    maxDayPatients: strip.reduce((m, s) => Math.max(m, s.patients), 0)
  }
}
