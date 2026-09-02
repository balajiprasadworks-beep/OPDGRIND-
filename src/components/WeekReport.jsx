import React, { useState } from 'react'

import { st } from '../lib/css.js'
import { COMPLEXITY } from '../lib/store.js'
import { weekStats } from '../lib/stats.js'
import { addDays, dayLong, hm, hours, istDate, mondayOf, one } from '../lib/time.js'
import ReportShell, { Figure, KICKER } from './ReportShell.jsx'

// The week at a glance: Monday to Saturday, one line each, then the four
// numbers the doctor actually asked to see. Nothing here is a reprint of the
// daily sheet — no patient names, no investigations — because the question a
// week answers is about the shape of the load, not about any one patient.

const num = 'text-align:right;font-variant-numeric:tabular-nums'

// A count and, beside it, how that count compares with the busiest day of the
// week. The bar is what turns six numbers into a shape you read in one look.
function LoadCell({ value, max }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={st('display:flex;align-items:center;gap:9px;justify-content:flex-end')}>
      <span style={st('font-variant-numeric:tabular-nums;font-weight:600')}>{value || '—'}</span>
      <span style={st('display:block;width:104px;height:9px;background:var(--color-neutral-200);border-radius:1px;flex:none')}>
        <span style={st('display:block;height:9px;border-radius:1px;background:var(--color-accent-500);width:' + width + '%')}></span>
      </span>
    </div>
  )
}

// The week's case mix as one bar. Complexity is only worth logging if it can be
// read back this way — three counts in a row tell you far less than their
// proportions do.
export function ComplexityBar({ mix, total }) {
  if (!total) {
    return <span style={st('font:italic 400 14px/1.4 var(--font-body);color:var(--color-neutral-600)')}>no cases graded yet</span>
  }
  return (
    <div>
      <div style={st('display:flex;height:14px;width:100%;max-width:420px;border-radius:1px;overflow:hidden;background:var(--color-neutral-200)')}>
        {COMPLEXITY.map((c) => (
          mix[c.code] > 0 && (
            <span
              key={c.code}
              title={c.label + ' — ' + mix[c.code]}
              style={st('display:block;height:14px;background:' + c.color + ';width:' + ((mix[c.code] / total) * 100) + '%')}
            ></span>
          )
        ))}
      </div>
      <div style={st('display:flex;gap:var(--space-3);flex-wrap:wrap;margin-top:8px;font:400 14px/1.3 var(--font-body)')}>
        {COMPLEXITY.map((c) => (
          <span key={c.code} style={st('display:inline-flex;align-items:center;gap:6px')}>
            <span style={st('width:10px;height:10px;border-radius:1px;background:' + c.color + ';flex:none')}></span>
            {c.label} <strong style={st('font-variant-numeric:tabular-nums')}>{mix[c.code]}</strong>
          </span>
        ))}
      </div>
    </div>
  )
}

// "MID averaged 9.0 min · HIGH averaged 14.0 min" — the line that turns three
// counts into the reason a heavy week felt heavy. Grades nobody used are left
// out, and the separator only ever sits between two of them.
export function ComplexityMeans({ mins, withCounts }) {
  const graded = COMPLEXITY.filter((c) => mins[c.code].n > 0)
  if (!graded.length) return null
  return (
    <div style={st('margin-top:var(--space-3);font:400 14.5px/1.6 var(--font-body);color:var(--color-neutral-700)')}>
      {graded.map((c, i) => (
        <span key={c.code}>
          {c.label} averaged <strong>{one(mins[c.code].mins / mins[c.code].n)} min</strong>
          {withCounts ? ' over ' + mins[c.code].n : ''}
          {i < graded.length - 1 ? '  ·  ' : ''}
        </span>
      ))}
    </div>
  )
}

export default function WeekReport({ store, user, onBack }) {
  const [anchor, setAnchor] = useState(istDate)

  const week = weekStats(store, anchor)
  const t = week.totals
  const graded = COMPLEXITY.reduce((sum, c) => sum + t.complexity[c.code], 0)
  const atCurrent = mondayOf(anchor) === mondayOf(istDate())

  return (
    <ReportShell
      user={user}
      kicker="Weekly report · Monday to Saturday"
      title={week.label}
      onPrev={() => setAnchor(addDays(anchor, -7))}
      onNext={() => setAnchor(addDays(anchor, 7))}
      onCurrent={() => setAnchor(istDate())}
      currentLabel="This week"
      atCurrent={atCurrent}
      onBack={onBack}
    >
      <table className="table report-table" style={st('margin-top:var(--space-4)')}>
        <thead>
          <tr>
            <th>Day</th>
            <th>Date</th>
            <th style={st('text-align:right')}>Patients seen</th>
            <th style={st('text-align:right')}>Mean min / patient</th>
            <th style={st('text-align:right')}>OPD hours</th>
            <th style={st('text-align:right')}>Break time</th>
            <th style={st('text-align:right')}>Interrupted</th>
          </tr>
        </thead>
        <tbody>
          {week.rows.map((r) => (
            <tr key={r.key} className={r.worked ? '' : 'is-quiet'}>
              <td style={st('font-weight:600')}>
                {r.day}
                {r.extra && (
                  <span style={st('font:italic 400 12.5px/1 var(--font-body);color:var(--color-neutral-600)')}> · extra</span>
                )}
              </td>
              <td style={st('color:var(--color-neutral-700)')}>{r.date}</td>
              <td style={st(num)}><LoadCell value={r.patients} max={week.maxPatients} /></td>
              <td style={st(num)}>{one(r.meanMin)}</td>
              <td style={st(num)}>{hours(r.opdMins)}</td>
              <td style={st(num)}>{hm(r.breakMins)}</td>
              <td style={st(num)}>{hm(r.interruptMins)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={st('font-weight:600')}>Week</td>
            <td style={st(num + ';font-weight:600')}>{t.patients}</td>
            <td style={st(num + ';font-weight:600')}>{one(t.meanMin)}</td>
            <td style={st(num + ';font-weight:600')}>{hours(t.opdMins)}</td>
            <td style={st(num + ';font-weight:600')}>{hm(t.breakMins)}</td>
            <td style={st(num + ';font-weight:600')}>{hm(t.interruptMins)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="report-figures">
        <Figure
          value={t.patients}
          label="Patients this week"
          note={t.daysWorked ? 'across ' + t.daysWorked + (t.daysWorked === 1 ? ' day' : ' days') + ' of clinic' : 'no clinic logged'}
        />
        <Figure
          value={one(t.avgPerDay)}
          label="Average load / day"
          note={t.daysWorked ? 'over the days worked' : '—'}
        />
        <Figure
          value={week.busiest ? dayLong(week.busiest.key) : '—'}
          label="Day with most patients"
          note={week.busiest ? week.busiest.patients + ' patients' : '—'}
          wide
        />
        <Figure
          value={one(t.meanMin)}
          label="Average min / patient"
          note="weighted across the week"
        />
      </div>

      <div className="report-rule"></div>

      <div className="report-strip">
        <div style={st('min-width:240px')}>
          <div style={st(KICKER)}>Where the time went</div>
          <div style={st('margin-top:var(--space-2);font:400 16px/1.7 var(--font-body);font-variant-numeric:tabular-nums')}>
            <div><span style={st('color:var(--color-neutral-600)')}>Total OPD hours </span><strong>{hours(t.opdMins)}</strong></div>
            <div><span style={st('color:var(--color-neutral-600)')}>Total break time </span><strong>{hm(t.breakMins)}</strong></div>
            <div><span style={st('color:var(--color-neutral-600)')}>Total interruptions </span><strong>{hm(t.interruptMins)}</strong></div>
          </div>
        </div>

        <div style={st('flex:1;min-width:280px')}>
          <div style={st(KICKER)}>Case mix</div>
          <div style={st('margin-top:var(--space-2)')}>
            <ComplexityBar mix={t.complexity} total={graded} />
          </div>
          <ComplexityMeans mins={t.complexityMins} />
        </div>
      </div>
    </ReportShell>
  )
}
