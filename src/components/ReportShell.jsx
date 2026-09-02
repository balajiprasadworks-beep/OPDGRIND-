import React from 'react'

import { config } from '../config.js'
import { st } from '../lib/css.js'
import { dateLong, istDate } from '../lib/time.js'

// The frame both reports share: masthead, the period stepper, the double rule
// the sheet uses, and the signature block at the foot. Having one frame is what
// makes a week and a month print as two pages of the same document rather than
// two different documents.

export const KICKER = 'font:400 13px/1.2 var(--font-body);color:var(--color-neutral-600);letter-spacing:.09em;text-transform:uppercase'

// A large figure with its caption beneath — the same treatment as the stats on
// the daily sheet, so a number means the same thing wherever it appears. The
// sizing lives in report.css because print has to shrink it to fit one page.
export function Figure({ value, label, note, wide }) {
  return (
    <div className={'report-figure' + (wide ? ' is-wide' : '')}>
      <div className="report-figure-value">{value}</div>
      <div className="report-figure-label">{label}</div>
      {note && <div className="report-figure-note">{note}</div>}
    </div>
  )
}

export default function ReportShell({
  user, kicker, title, onPrev, onNext, onCurrent, currentLabel, atCurrent, onBack, children
}) {
  const name = (user && user.full_name) || config.doctorName

  return (
    <div className="report-shell">
      <div style={st('display:flex;align-items:center;justify-content:space-between;gap:var(--space-4)')}>
        <div style={st('font:400 14px/1.3 var(--font-body);color:var(--color-neutral-600);letter-spacing:.06em;text-transform:uppercase')}>
          {name} · {config.unitLine}
        </div>
        <div style={st('display:flex;align-items:center;gap:7px;flex:none')}>
          <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true" style={st('display:block;flex:none')}>
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="var(--color-accent)" strokeWidth="1.4" />
            <circle cx="10" cy="10" r="3" fill="var(--color-accent-2)" />
            <path d="M10 0v5M10 15v5M0 10h5M15 10h5" stroke="var(--color-text)" strokeWidth="1.2" />
          </svg>
          <span style={st('font:600 17px/1 var(--font-heading);letter-spacing:-.01em')}>OPDGrind</span>
        </div>
      </div>

      <div style={st('display:flex;align-items:flex-end;justify-content:space-between;gap:var(--space-6);flex-wrap:wrap;margin-top:var(--space-4)')}>
        <div>
          <div style={st(KICKER)}>{kicker}</div>
          <h1 style={st('margin:6px 0 0;font:600 40px/1.04 var(--font-heading);letter-spacing:-.015em')}>{title}</h1>
        </div>

        <div className="screen-only" style={st('display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap')}>
          <button type="button" className="btn btn-secondary" onClick={onPrev} title="Earlier">←</button>
          <button type="button" className="btn btn-secondary" onClick={onCurrent} disabled={atCurrent}>{currentLabel}</button>
          <button type="button" className="btn btn-secondary" onClick={onNext} disabled={atCurrent} title="Later">→</button>
          <span style={st('width:var(--space-2)')}></span>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print</button>
          <button type="button" className="btn btn-ghost" onClick={onBack}>Back to sheet</button>
        </div>
      </div>

      <div style={st('height:3px;background:var(--color-text);margin-top:var(--space-3)')}></div>
      <div style={st('height:1px;background:var(--color-text);margin-top:3px')}></div>

      {children}

      <div style={st('margin-top:var(--space-8);display:flex;justify-content:space-between;align-items:flex-end;gap:var(--space-4);flex-wrap:wrap')}>
        <div>
          <div style={st('height:1px;background:var(--color-neutral-400);width:220px')}></div>
          <div style={st('margin-top:5px;font:400 14px/1.4 var(--font-body);color:var(--color-neutral-700)')}>{name}</div>
        </div>
        <div style={st('font:400 12.5px/1.4 var(--font-body);color:var(--color-neutral-600)')}>
          OPDGrind · generated {dateLong(istDate())}
        </div>
      </div>
    </div>
  )
}
