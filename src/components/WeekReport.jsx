import React, { useState } from 'react'

import { st } from '../lib/css.js'
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

export default function WeekReport({ store, user, onBack }) {
  const [anchor, setAnchor] = useState(istDate)

  const week = weekStats(store, anchor)
  const t = week.totals
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
        <div style={st('flex:1')}>
          <div style={st(KICKER)}>Where the time went</div>
          <div style={st('margin-top:var(--space-2);display:flex;gap:var(--space-8);flex-wrap:wrap;font:400 16px/1.7 var(--font-body);font-variant-numeric:tabular-nums')}>
            <div><span style={st('color:var(--color-neutral-600)')}>Total OPD hours </span><strong>{hours(t.opdMins)}</strong></div>
            <div><span style={st('color:var(--color-neutral-600)')}>Total break time </span><strong>{hm(t.breakMins)}</strong></div>
            <div><span style={st('color:var(--color-neutral-600)')}>Total interruptions </span><strong>{hm(t.interruptMins)}</strong></div>
          </div>
        </div>
      </div>
    </ReportShell>
  )
}
