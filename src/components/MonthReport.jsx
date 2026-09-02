import React, { useState } from 'react'

import { st } from '../lib/css.js'
import { COMPLEXITY } from '../lib/store.js'
import { monthStats } from '../lib/stats.js'
import { addMonths, dateShort, dayShort, hm, hours, istDate, monthLong, monthOf, one } from '../lib/time.js'
import ReportShell, { Figure, KICKER } from './ReportShell.jsx'
import { ComplexityBar, ComplexityMeans } from './WeekReport.jsx'

// The month, built out of the weeks the doctor already reads one at a time.
// One row per week, then the two pictures a month can draw that a week cannot:
// how the load sat across the calendar, and which weekday actually costs most.

const num = 'text-align:right;font-variant-numeric:tabular-nums'

// The month as the calendar it actually is: seven columns, Monday first, each
// day inked by how many patients it held. Aligning to weekdays is what makes a
// pattern visible — a run of heavy Tuesdays reads as a column, not as noise.
function LoadStrip({ strip, max }) {
  if (!strip.length) return null
  const column = (dow) => (dow === 0 ? 7 : dow)   // Mon 1 … Sun 7

  return (
    <div style={st('display:grid;grid-template-columns:repeat(7,26px);gap:3px')}>
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
        <span
          key={i}
          style={st('text-align:center;font:400 10px/1 var(--font-body);color:var(--color-neutral-600);letter-spacing:.04em;padding-bottom:2px')}
        >{d}</span>
      ))}
      {strip.map((d, i) => {
        // Never fully transparent on a worked day: an 8-patient Tuesday in a
        // 40-patient month still has to be visible.
        const share = max > 0 && d.patients > 0 ? 0.22 + 0.78 * (d.patients / max) : 0
        return (
          <span
            key={d.key}
            title={dayShort(d.key) + ' ' + dateShort(d.key) + ' · ' + d.patients + ' patients'}
            style={st('display:flex;align-items:center;justify-content:center;height:26px;border-radius:1px;font:400 10px/1 var(--font-body);border:1px solid var(--color-neutral-300);background:' +
              (share ? 'color-mix(in srgb, var(--color-accent-600) ' + Math.round(share * 100) + '%, transparent)' : 'transparent') +
              ';color:' + (share > 0.55 ? '#fff' : 'var(--color-neutral-600)') +
              (d.dow === 0 ? ';opacity:.45' : '') +
              // Only the first cell needs placing; the rest follow it round.
              (i === 0 ? ';grid-column-start:' + column(d.dow) : ''))}
          >{d.day}</span>
        )
      })}
    </div>
  )
}

// Average patients by weekday — the one question a stack of daily sheets can
// never answer on its own.
function WeekdayPattern({ weekday, max }) {
  return (
    <div style={st('display:flex;flex-direction:column;gap:6px;max-width:340px')}>
      {weekday.map((w) => (
        <div key={w.name} style={st('display:flex;align-items:center;gap:10px;font:400 14px/1.2 var(--font-body)')}>
          <span style={st('width:34px;color:var(--color-neutral-700)')}>{w.name}</span>
          <span style={st('flex:1;height:11px;background:var(--color-neutral-200);border-radius:1px')}>
            <span style={st('display:block;height:11px;border-radius:1px;background:var(--color-accent-600);width:' +
              (max > 0 && w.avg ? Math.round((w.avg / max) * 100) : 0) + '%')}></span>
          </span>
          <span style={st('width:56px;text-align:right;font-variant-numeric:tabular-nums')}>
            {w.avg == null ? '—' : one(w.avg)}
          </span>
        </div>
      ))}
      <div style={st('font:400 12.5px/1.4 var(--font-body);color:var(--color-neutral-600);margin-top:2px')}>
        Average patients per clinic, by weekday
      </div>
    </div>
  )
}

export default function MonthReport({ store, user, onBack }) {
  const [ym, setYm] = useState(() => monthOf(istDate()))

  const m = monthStats(store, ym.year, ym.month)
  const t = m.totals
  const graded = COMPLEXITY.reduce((sum, c) => sum + t.complexity[c.code], 0)
  const now = monthOf(istDate())
  const atCurrent = ym.year === now.year && ym.month === now.month

  return (
    <ReportShell
      user={user}
      kicker="Monthly report · week by week"
      title={monthLong(ym.year, ym.month)}
      onPrev={() => setYm(addMonths(ym.year, ym.month, -1))}
      onNext={() => setYm(addMonths(ym.year, ym.month, 1))}
      onCurrent={() => setYm(monthOf(istDate()))}
      currentLabel="This month"
      atCurrent={atCurrent}
      onBack={onBack}
    >
      <table className="table report-table" style={st('margin-top:var(--space-4)')}>
        <thead>
          <tr>
            <th>Week</th>
            <th>Dates</th>
            <th style={st('text-align:right')}>Days worked</th>
            <th style={st('text-align:right')}>Patients</th>
            <th style={st('text-align:right')}>Avg / day</th>
            <th style={st('text-align:right')}>Mean min / patient</th>
            <th style={st('text-align:right')}>OPD hours</th>
            <th style={st('text-align:right')}>Break time</th>
          </tr>
        </thead>
        <tbody>
          {m.weeks.map((w) => (
            <tr key={w.monday} className={w.totals.patients ? '' : 'is-quiet'}>
              <td style={st('font-weight:600')}>Week {w.no}</td>
              <td style={st('color:var(--color-neutral-700)')}>{w.label}</td>
              <td style={st(num)}>{w.totals.daysWorked || '—'}</td>
              <td style={st(num + ';font-weight:600')}>{w.totals.patients || '—'}</td>
              <td style={st(num)}>{one(w.totals.avgPerDay)}</td>
              <td style={st(num)}>{one(w.totals.meanMin)}</td>
              <td style={st(num)}>{hours(w.totals.opdMins)}</td>
              <td style={st(num)}>{hm(w.totals.breakMins)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={st('font-weight:600')}>{monthLong(ym.year, ym.month)}</td>
            <td style={st(num + ';font-weight:600')}>{t.daysWorked || '—'}</td>
            <td style={st(num + ';font-weight:600')}>{t.patients}</td>
            <td style={st(num + ';font-weight:600')}>{one(t.avgPerDay)}</td>
            <td style={st(num + ';font-weight:600')}>{one(t.meanMin)}</td>
            <td style={st(num + ';font-weight:600')}>{hours(t.opdMins)}</td>
            <td style={st(num + ';font-weight:600')}>{hm(t.breakMins)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="report-figures">
        <Figure
          value={t.patients}
          label="Patients this month"
          note={t.daysWorked ? 'across ' + t.daysWorked + ' days of clinic' : 'no clinic logged'}
        />
        <Figure
          value={one(t.avgPerDay)}
          label="Average load / day"
          note="over the days worked"
        />
        <Figure
          value={m.busiestWeek ? 'Week ' + m.busiestWeek.no : '—'}
          label="Busiest week"
          note={m.busiestWeek ? m.busiestWeek.patients + ' patients · ' + m.busiestWeek.label : '—'}
          wide
        />
        <Figure
          value={one(t.meanMin)}
          label="Average min / patient"
          note="weighted across the month"
        />
      </div>

      <div className="report-rule"></div>

      <div className="report-panels report-strip">
        <div>
          <div style={st(KICKER)}>The month, day by day</div>
          <div style={st('margin-top:var(--space-2)')}>
            <LoadStrip strip={m.strip} max={m.maxDayPatients} />
          </div>
          <div style={st('margin-top:8px;font:400 12.5px/1.4 var(--font-body);color:var(--color-neutral-600)')}>
            Darker is busier{m.busiestDay ? ' · heaviest was ' + m.busiestDay.label + ', ' + m.busiestDay.patients + ' patients' : ''}
          </div>
        </div>

        <div>
          <div style={st(KICKER)}>Which day of the week costs most</div>
          <div style={st('margin-top:var(--space-2)')}>
            <WeekdayPattern weekday={m.weekday} max={m.maxWeekdayAvg} />
          </div>
        </div>
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
          <ComplexityMeans mins={t.complexityMins} withCounts />
        </div>
      </div>
    </ReportShell>
  )
}
