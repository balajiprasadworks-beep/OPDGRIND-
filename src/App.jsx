import React, { useCallback, useEffect, useRef, useState } from 'react'

import { config } from './config.js'
import { st } from './lib/css.js'
import { dur, istDate, istTime, toMin } from './lib/time.js'
import { FIELDS, blankDay, blankRow, normalizeStore, readStore, writeStore } from './lib/store.js'
import { SETUP_SQL, fetchDays, isConfigured, mergeRemote, pushDays } from './lib/supabase.js'

// The investigations rail — one tap instead of typing the same order out again.
const CHIPS = ('ECG,ECHO,BASIC NON FASTING,BASIC FASTING,CXR,VIT B12,VIT D,NT-PRO-BNP,LIPID,RFT,LFT,' +
  'CREAT,K+,CBC,TSH,HBA1C,TROP,PBS,OCCULT,FBS,PPBS,RBS,TFT,URINE-R,APOA APOB,LIPO-A,ELECTROLYTES,CTCA,ESR,CRP').split(',')

const PUSH_DEBOUNCE_MS = 1600
const CLOCK_TICK_MS = 20000

const pill = (on, color) =>
  'font:600 12.5px/1 var(--font-body);padding:6px 7px;border-radius:var(--radius-md);cursor:pointer;border:1px solid ' +
  (on ? color : 'var(--color-neutral-300)') + ';background:' + (on ? color : 'transparent') +
  ';color:' + (on ? '#fff' : 'var(--color-neutral-700)')

const focusCell = (row, field) => {
  const el = document.querySelector('[data-row="' + row + '"][data-field="' + field + '"]')
  if (el) {
    el.focus()
    if (el.select) el.select()
  }
}

export default function App() {
  const [store, setStore] = useState(() => {
    const loaded = readStore()
    const today = istDate()
    if (!loaded[today]) loaded[today] = blankDay()
    return loaded
  })
  const [dateKey, setDateKey] = useState(istDate)
  const [clock, setClock] = useState(istTime)
  const [chip, setChip] = useState(null)
  const [sync, setSync] = useState({ state: 'idle', msg: 'Not synced yet' })

  // The async paths (debounced push, full sync) must see the newest store, not
  // the one captured when they were scheduled.
  const storeRef = useRef(store)
  const pushTimer = useRef(null)
  const fileRef = useRef(null)
  // Focus has to land after React has painted the new row.
  const pendingFocus = useRef(null)

  const applyStore = useCallback((next, persist = true) => {
    storeRef.current = next
    if (persist) writeStore(next)
    setStore(next)
  }, [])

  useEffect(() => {
    const cell = pendingFocus.current
    if (!cell) return
    pendingFocus.current = null
    focusCell(cell.row, cell.field)
  })

  /* ── cloud ──────────────────────────────────────────────────────────── */

  const queuePush = useCallback((key) => {
    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      setSync({ state: 'busy', msg: 'Saving to cloud…' })
      pushDays([key], storeRef.current)
        .then(() => setSync({ state: 'ok', msg: 'Cloud saved ' + istTime() }))
        .catch((e) => setSync({ state: e.setup ? 'setup' : 'error', msg: String(e.message || e) }))
    }, PUSH_DEBOUNCE_MS)
  }, [])

  const syncAll = useCallback(async () => {
    if (!isConfigured()) {
      setSync({ state: 'error', msg: 'No cloud configured' })
      return
    }
    setSync({ state: 'busy', msg: 'Syncing…' })
    try {
      const remote = await fetchDays()
      const { store: merged, toPush } = mergeRemote(storeRef.current, remote)
      applyStore(merged)
      if (toPush.length) await pushDays(toPush, merged)
      setSync({
        state: 'ok',
        msg: 'Synced ' + istTime() + ' · ' + Object.keys(merged).length + ' days in cloud'
      })
    } catch (err) {
      setSync({ state: err.setup ? 'setup' : 'error', msg: String(err.message || err) })
    }
  }, [applyStore])

  useEffect(() => {
    syncAll()
    const timer = setInterval(() => setClock(istTime()), CLOCK_TICK_MS)
    return () => {
      clearInterval(timer)
      clearTimeout(pushTimer.current)
    }
  }, [syncAll])

  /* ── the day being edited ───────────────────────────────────────────── */

  const day = store[dateKey] || { rows: [], session: { inT: '', outT: '', breaks: [] } }
  const rows = day.rows || []
  const sess = day.session || { inT: '', outT: '', breaks: [] }

  const write = useCallback((nextDay) => {
    const key = dateKey
    const next = { ...storeRef.current, [key]: { ...nextDay, updatedAt: new Date().toISOString() } }
    applyStore(next)
    queuePush(key)
  }, [applyStore, dateKey, queuePush])

  const commit = (nextRows) => write({ ...day, rows: nextRows })
  const setSess = (changes) => write({ ...day, session: { ...sess, ...changes } })
  const patch = (i, changes) => {
    if (!rows[i]) return
    const next = rows.slice()
    next[i] = { ...next[i], ...changes }
    commit(next)
  }
  const appendRow = () => {
    const next = rows.concat([blankRow()])
    pendingFocus.current = { row: next.length - 1, field: 'name' }
    commit(next)
  }
  const openDay = (key) => {
    if (!key) return
    if (!storeRef.current[key]) applyStore({ ...storeRef.current, [key]: blankDay() }, false)
    setDateKey(key)
    setChip(null)
  }

  /* ── derived numbers ────────────────────────────────────────────────── */

  const target = config.targetMinutes != null ? config.targetMinutes : 12

  const disp = rows.map((r, i) => {
    const d = dur(r)
    return {
      ...r,
      i,
      no: i + 1,
      mins: d == null ? '' : String(d),
      minStyle: d != null && d > target
        ? 'font-weight:600;color:var(--color-accent-2-700)'
        : 'color:var(--color-neutral-800)',
      newStyle: pill(r.type === 'New', 'var(--color-accent-700)'),
      revStyle: pill(r.type === 'Review', 'var(--color-accent-700)'),
      hasOut: !!r.outT,
      needsOut: !r.outT
    }
  })

  const durs = rows.map(dur).filter((n) => n != null)
  const ins = rows.map((r) => toMin(r.inT)).filter((n) => n != null)
  const outs = rows.map((r) => toMin(r.outT)).filter((n) => n != null)
  let statHours = '—'
  if (ins.length && outs.length) {
    const width = Math.max(...outs) - Math.min(...ins)
    if (width > 0) statHours = (width / 60).toFixed(1)
  }
  const logged = rows.filter((r) => (r.name || '').trim() || (r.opd || '').trim()).length
  const statPatients = String(logged)
  const statMean = durs.length ? (durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(1) : '—'

  const pastDays = Object.keys(store).sort().reverse().map((k) => {
    const rr = (store[k] && store[k].rows) || []
    const dd = rr.map(dur).filter((n) => n != null)
    const at = new Date(k + 'T00:00:00')
    return {
      key: k,
      count: rr.filter((r) => (r.name || '').trim() || (r.opd || '').trim()).length,
      label: at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' · ' +
        at.toLocaleDateString('en-GB', { weekday: 'short' }),
      mean: dd.length ? (dd.reduce((a, b) => a + b, 0) / dd.length).toFixed(0) : '—',
      style: 'font:400 14px/1.3 var(--font-body);padding:7px 10px;border-radius:var(--radius-md);cursor:pointer;border:1px solid ' +
        (k === dateKey ? 'var(--color-accent)' : 'var(--color-neutral-300)') + ';background:' +
        (k === dateKey ? 'var(--color-accent-100)' : 'transparent') + ';color:var(--color-text)'
    }
  }).filter((d) => d.count > 0 || d.key === dateKey)

  const bList = sess.breaks || []
  const onBreak = bList.length > 0 && !bList[bList.length - 1].in
  let breakMins = 0
  const breaks = bList.map((b, n) => {
    const from = toMin(b.out)
    const to = toMin(b.in)
    let m = null
    if (from != null && to != null) {
      m = to - from
      if (m < 0) m += 1440
      breakMins += m
    }
    return { key: n, label: (b.out || '--:--') + ' → ' + (b.in || 'out now') + (m != null ? ' · ' + m + 'm' : '') }
  })

  const jIn = toMin(sess.inT)
  const jOut = toMin(sess.outT)
  let netTime = '—'
  if (jIn != null && jOut != null) {
    let width = jOut - jIn
    if (width < 0) width += 1440
    const net = Math.max(0, width - breakMins)
    netTime = Math.floor(net / 60) + 'h ' + String(net % 60).padStart(2, '0') + 'm'
  }

  const dObj = dateKey ? new Date(dateKey + 'T00:00:00') : new Date()
  const showRail = config.showChipRail !== false && chip && (chip.field === 'asked' || chip.field === 'done')
  const delayClass = rows.some((r) => (r.delay || '').trim()) ? '' : 'no-delay'

  /* ── handlers ───────────────────────────────────────────────────────── */

  const edit = (e) => patch(+e.target.dataset.row, { [e.target.dataset.field]: e.target.value })

  const onFocus = (e) => {
    const i = +e.target.dataset.row
    const field = e.target.dataset.field
    setChip({ row: i, field })
    // Starting to write a name is the moment the patient walked in.
    const r = rows[i]
    if (field === 'name' && r && !r.inT) patch(i, { inT: istTime() })
  }

  const setType = (e) => {
    const i = +e.currentTarget.dataset.row
    const v = e.currentTarget.dataset.val
    const r = rows[i]
    patch(i, { type: r && r.type === v ? '' : v })
  }

  const removeRow = (e) => {
    const i = +e.currentTarget.dataset.row
    const next = rows.slice()
    const r = next[i]
    if ((r.name || r.opd || r.asked) && !window.confirm('Delete row ' + (i + 1) + '?')) return
    next.splice(i, 1)
    commit(next.length ? next : [blankRow()])
  }

  const toggleBreak = () => {
    const bs = (sess.breaks || []).slice()
    if (bs.length && !bs[bs.length - 1].in) bs[bs.length - 1] = { ...bs[bs.length - 1], in: istTime() }
    else bs.push({ out: istTime(), in: '' })
    setSess({ breaks: bs })
  }

  const addChip = (e) => {
    e.preventDefault() // keep the caret in the cell the chip is filling
    if (!chip) return
    const token = e.currentTarget.dataset.chip
    const r = rows[chip.row]
    if (!r) return
    const current = (r[chip.field] || '').trim()
    if (current.split(/,\s*/).indexOf(token) > -1) return
    patch(chip.row, { [chip.field]: current ? current + ', ' + token : token })
  }

  const doExport = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'opd-log-backup-' + istDate() + '.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const doImport = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const incoming = normalizeStore(JSON.parse(reader.result))
        applyStore({ ...storeRef.current, ...incoming })
      } catch (err) {
        window.alert('That file could not be read as a log backup.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // Enter walks the row, arrows walk the column, N/R set the case type — the
  // whole sheet is meant to be filled without reaching for the mouse.
  const onKey = (e) => {
    const ds = e.target.dataset || {}
    if (ds.row == null || !ds.field) return
    const i = +ds.row
    const field = ds.field
    const fi = FIELDS.indexOf(field)
    const last = rows.length - 1

    if (field === 'type' && (e.key === 'n' || e.key === 'N' || e.key === 'r' || e.key === 'R')) {
      e.preventDefault()
      patch(i, { type: (e.key === 'n' || e.key === 'N') ? 'New' : 'Review' })
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (fi > -1 && fi < FIELDS.length - 1) focusCell(i, FIELDS[fi + 1])
      else if (i < last) focusCell(i + 1, 'name')
      else appendRow()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const tgt = fi > -1 ? field : 'name'
      if (i < last) focusCell(i + 1, tgt)
      else appendRow()
      return
    }
    if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault()
      focusCell(i - 1, fi > -1 ? field : 'name')
    }
  }

  const syncStyle = 'font:400 13px/1.3 var(--font-body);white-space:nowrap;color:' +
    (sync.state === 'error' ? 'var(--color-accent-2-700)'
      : sync.state === 'ok' ? 'var(--color-accent-700)' : 'var(--color-neutral-600)')
  const breakStyle = 'font:600 13px/1 var(--font-body);padding:7px 10px;border-radius:var(--radius-md);cursor:pointer;border:1px solid ' +
    (onBreak ? 'var(--color-accent-2-600)' : 'var(--color-neutral-400)') + ';background:' +
    (onBreak ? 'var(--color-accent-2-600)' : 'transparent') + ';color:' +
    (onBreak ? '#fff' : 'var(--color-neutral-800)')
  const railStyle = 'position:fixed;left:0;right:0;bottom:0;padding:12px 20px;background:var(--color-neutral-100);border-top:1px solid var(--color-text);box-shadow:var(--shadow-md);transition:transform .16s ease;transform:translateY(' +
    (showRail ? '0' : '110%') + ')'

  /* ── the sheet ──────────────────────────────────────────────────────── */

  return (
    <div className="log-shell" style={st('min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);padding:var(--space-6) var(--space-8) 140px')}>

      <div style={st('display:flex;align-items:center;justify-content:space-between;gap:var(--space-4)')}>
        <div style={st('font:400 14px/1.3 var(--font-body);color:var(--color-neutral-600);letter-spacing:.06em;text-transform:uppercase')}>
          {config.doctorName} · {config.unitLine}
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

      <div style={st('display:flex;align-items:flex-end;justify-content:space-between;gap:var(--space-8);flex-wrap:wrap;margin-top:var(--space-2)')}>
        <div>
          <h1 style={st('margin:8px 0 0;font:600 46px/1.02 var(--font-heading);letter-spacing:-.015em')}>
            {dObj.toLocaleDateString('en-GB', { weekday: 'long' })}
          </h1>
          <div style={st('margin-top:6px;font:400 21px/1.2 var(--font-body);color:var(--color-neutral-700)')}>
            {dObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}{' '}
            <span style={st('color:var(--color-accent-700)')}>· IST {clock}</span>
          </div>

          <div style={st('margin-top:var(--space-4);display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap;font:400 16px/1.4 var(--font-body)')}>
            {['inT', 'outT'].map((slot) => (
              <div key={slot} style={st('display:flex;align-items:center;gap:7px')}>
                <span style={st('color:var(--color-neutral-600)')}>JR walk {slot === 'inT' ? 'in' : 'out'}</span>
                <input
                  data-jr={slot}
                  value={sess[slot] || ''}
                  onChange={(e) => setSess({ [e.target.dataset.jr]: e.target.value })}
                  placeholder="--:--"
                  style={st('width:58px;font:600 16px/1 var(--font-body);font-variant-numeric:tabular-nums;color:var(--color-text);background:transparent;border:none;border-bottom:1px solid var(--color-neutral-400);padding:3px 0;outline:none')}
                />
                <button
                  type="button"
                  className="screen-only"
                  data-jr={slot}
                  onClick={(e) => setSess({ [e.currentTarget.dataset.jr]: istTime() })}
                  style={st('font:400 12.5px/1 var(--font-body);color:var(--color-accent-700);background:none;border:none;cursor:pointer;text-decoration:underline')}
                >now</button>
              </div>
            ))}
            <div style={st('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
              <span style={st('color:var(--color-neutral-600)')}>Breaks</span>
              {breaks.map((b) => (
                <span key={b.key} style={st('font-variant-numeric:tabular-nums;font-size:15px')}>{b.label}</span>
              ))}
              {breaks.length === 0 && (
                <span style={st('color:var(--color-neutral-500);font-style:italic;font-size:15px')}>none</span>
              )}
              <button type="button" className="screen-only" onClick={toggleBreak} style={st(breakStyle)}>
                {onBreak ? 'Back from break' : 'Start break'}
              </button>
            </div>
          </div>
        </div>

        <div style={st('display:flex;gap:var(--space-6);align-items:flex-end')}>
          {[
            { value: statPatients, label: 'Patients' },
            { value: statMean, label: 'Mean min / patient' },
            { value: statHours, label: 'OPD hours' }
          ].map((stat) => (
            <div key={stat.label}>
              <div style={st('font:600 38px/1 var(--font-heading);color:var(--color-accent-700)')}>{stat.value}</div>
              <div style={st('font:400 13px/1.2 var(--font-body);color:var(--color-neutral-600);letter-spacing:.05em;text-transform:uppercase;margin-top:5px')}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="screen-only" style={st('display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;margin-top:var(--space-4)')}>
        <button type="button" className="btn btn-primary" onClick={appendRow}>+ Add patient</button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Print paper sheet</button>
        <span style={st('width:var(--space-4)')}></span>
        <label style={st('display:flex;align-items:center;gap:var(--space-2);font:400 15px/1 var(--font-body);color:var(--color-neutral-700)')}>
          Day
          <input
            className="input"
            type="date"
            value={dateKey}
            onChange={(e) => openDay(e.target.value)}
            style={st('width:170px')}
          />
        </label>
        <button type="button" className="btn btn-ghost" onClick={() => openDay(istDate())}>Today</button>
        <span style={st('flex:1')}></span>
        <span style={st(syncStyle)}>{sync.msg}</span>
        <button type="button" className="btn btn-ghost" onClick={syncAll}>Sync cloud</button>
        <button type="button" className="btn btn-ghost" onClick={doExport}>Export backup</button>
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current && fileRef.current.click()}>Import backup</button>
        <input type="file" accept="application/json" ref={fileRef} onChange={doImport} style={st('display:none')} />
      </div>

      {sync.state === 'setup' && (
        <div className="screen-only" style={st('margin-top:var(--space-3);padding:var(--space-3) var(--space-4);background:var(--color-accent-100);border-left:3px solid var(--color-accent);border-radius:var(--radius-md);max-width:820px')}>
          <div style={st('font:600 16px/1.4 var(--font-heading);color:var(--color-accent-800)')}>One-time cloud setup</div>
          <div style={st('margin-top:5px;font:400 15px/1.5 var(--font-body);color:var(--color-neutral-800)')}>
            Your log is saving safely on this computer. To also keep previous days in Supabase, open your project → <strong>SQL Editor</strong> → New query, paste the block below, press Run, then click <strong>Sync cloud</strong> here.
          </div>
          <pre style={st('margin:var(--space-3) 0 0;padding:var(--space-3);background:var(--color-neutral-100);border-radius:var(--radius-md);font:400 12.5px/1.55 ui-monospace,Menlo,monospace;color:var(--color-text);overflow-x:auto;white-space:pre')}>{SETUP_SQL}</pre>
          <div style={st('display:flex;gap:var(--space-2);margin-top:var(--space-3)')}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { try { navigator.clipboard.writeText(SETUP_SQL) } catch (e) { /* clipboard blocked */ } }}
            >Copy SQL</button>
            <button type="button" className="btn btn-ghost" onClick={syncAll}>I've run it — sync now</button>
          </div>
        </div>
      )}

      <div style={st('height:3px;background:var(--color-text);margin-top:var(--space-4)')}></div>
      <div style={st('height:1px;background:var(--color-text);margin-top:3px')}></div>

      <div style={st('overflow-x:auto;margin-top:var(--space-4)')} onKeyDown={onKey}>
        <table className={('table log-table ' + delayClass).trim()} style={st('min-width:1440px;font-size:15px')}>
          <thead>
            <tr>
              <th style={st('text-align:right')}>#</th>
              <th>Patient name</th>
              <th>OPD no.</th>
              <th>Case</th>
              <th>In</th>
              <th>Out</th>
              <th style={st('text-align:right')}>Min</th>
              <th>Investigations asked</th>
              <th>Done before walk-in</th>
              <th>Diagnosis / notes</th>
              <th className="col-delay">If delayed, why</th>
              <th className="col-kill screen-only"></th>
            </tr>
          </thead>
          <tbody>
            {disp.map((row) => (
              <tr key={row.id}>
                <td style={st('text-align:right;color:var(--color-neutral-600);padding-top:9px')}>{row.no}</td>
                <td>
                  <input data-row={row.i} data-field="name" value={row.name} onFocus={onFocus} onChange={edit} placeholder="Name" style={st('font-weight:600')} />
                </td>
                <td>
                  <input data-row={row.i} data-field="opd" value={row.opd} onFocus={onFocus} onChange={edit} placeholder="OPD no." />
                </td>
                <td>
                  <div className="type-cell" data-row={row.i} data-field="type" tabIndex={0} style={st('display:flex;gap:4px;padding:2px 0;border-radius:var(--radius-md)')}>
                    <button type="button" data-row={row.i} data-val="New" onClick={setType} style={st(row.newStyle)}>New</button>
                    <button type="button" data-row={row.i} data-val="Review" onClick={setType} style={st(row.revStyle)}>Rev</button>
                  </div>
                </td>
                <td>
                  <input data-row={row.i} data-field="inT" value={row.inT} onFocus={onFocus} onChange={edit} placeholder="--:--" style={st('font-variant-numeric:tabular-nums')} />
                </td>
                <td>
                  {row.hasOut && (
                    <input data-row={row.i} data-field="outT" value={row.outT} onFocus={onFocus} onChange={edit} style={st('font-variant-numeric:tabular-nums')} />
                  )}
                  {row.needsOut && (
                    <button
                      type="button"
                      className="screen-only outnow"
                      data-row={row.i}
                      onClick={(e) => patch(+e.currentTarget.dataset.row, { outT: istTime() })}
                      style={st('font:600 13px/1 var(--font-body);color:#fff;background:var(--color-accent);border:none;border-radius:var(--radius-md);padding:6px 9px;cursor:pointer')}
                    >Out now</button>
                  )}
                </td>
                <td style={st('text-align:right;padding-top:9px;font-variant-numeric:tabular-nums')}>
                  <span style={st(row.minStyle)}>{row.mins}</span>
                </td>
                <td>
                  <textarea data-row={row.i} data-field="asked" value={row.asked} onFocus={onFocus} onChange={edit} rows={1} placeholder="ECHO, TROP" />
                </td>
                <td>
                  <textarea data-row={row.i} data-field="done" value={row.done} onFocus={onFocus} onChange={edit} rows={1} placeholder="brought reports" />
                </td>
                <td>
                  <textarea data-row={row.i} data-field="dx" value={row.dx} onFocus={onFocus} onChange={edit} rows={1} placeholder="CAD, post-PTCA, HTN" />
                </td>
                <td className="col-delay">
                  <textarea data-row={row.i} data-field="delay" value={row.delay} onFocus={onFocus} onChange={edit} rows={1} placeholder="—" />
                </td>
                <td className="col-kill screen-only" style={st('padding-top:7px')}>
                  <button
                    type="button"
                    className="rowkill"
                    data-row={row.i}
                    onClick={removeRow}
                    title="Delete row"
                    style={st('opacity:0;transition:opacity .12s;background:none;border:none;cursor:pointer;color:var(--color-accent-2-700);font:600 15px/1 var(--font-body)')}
                  >×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="screen-only" style={st('margin-top:var(--space-3);display:flex;align-items:baseline;gap:var(--space-4);flex-wrap:wrap')}>
        <button type="button" className="btn btn-ghost" onClick={appendRow}>+ Add patient</button>
        <div style={st('font:italic 400 14px/1.5 var(--font-body);color:var(--color-neutral-600)')}>
          Enter moves to the next cell · ↓ next patient · ↑ previous · on the Case cell press N or R · Time In stamps itself when you start the name
        </div>
      </div>

      <div style={st('margin-top:var(--space-6);padding-top:var(--space-3);border-top:1px solid var(--color-text)')}>
        <div style={st('font:400 13px/1.2 var(--font-body);color:var(--color-neutral-600);letter-spacing:.06em;text-transform:uppercase')}>Day close</div>
        <div style={st('margin-top:var(--space-2);display:flex;gap:var(--space-6);flex-wrap:wrap;font:400 16px/1.5 var(--font-body);font-variant-numeric:tabular-nums')}>
          <div><span style={st('color:var(--color-neutral-600)')}>JR walk in </span><strong>{sess.inT}</strong></div>
          <div><span style={st('color:var(--color-neutral-600)')}>JR walk out </span><strong>{sess.outT}</strong></div>
          <div><span style={st('color:var(--color-neutral-600)')}>Break time </span><strong>{breakMins ? breakMins + ' min' : '—'}</strong></div>
          <div><span style={st('color:var(--color-neutral-600)')}>Net time in OPD </span><strong>{netTime}</strong></div>
          <div><span style={st('color:var(--color-neutral-600)')}>Patients </span><strong>{statPatients}</strong></div>
          <div><span style={st('color:var(--color-neutral-600)')}>Mean per patient </span><strong>{statMean} min</strong></div>
        </div>
        <div style={st('margin-top:var(--space-2);font:400 15px/1.5 var(--font-body);color:var(--color-neutral-700)')}>
          <span style={st('color:var(--color-neutral-600)')}>Breaks logged: </span>
          {breaks.map((b) => (
            <span key={b.key} style={st('font-variant-numeric:tabular-nums')}>{b.label}&nbsp;&nbsp;</span>
          ))}
          {breaks.length === 0 && <span style={st('font-style:italic')}>none</span>}
        </div>
        <div style={st('margin-top:var(--space-6);height:1px;background:var(--color-neutral-400);width:220px')}></div>
        <div style={st('margin-top:5px;font:400 14px/1.4 var(--font-body);color:var(--color-neutral-700)')}>{config.doctorName}</div>
      </div>

      <div className="screen-only" style={st('margin-top:var(--space-8)')}>
        <div style={st('font:400 13px/1.2 var(--font-body);color:var(--color-neutral-600);letter-spacing:.06em;text-transform:uppercase')}>Previous days</div>
        <div style={st('display:flex;flex-wrap:wrap;gap:var(--space-2);margin-top:var(--space-3)')}>
          {pastDays.map((d) => (
            <button key={d.key} type="button" data-key={d.key} onClick={(e) => openDay(e.currentTarget.dataset.key)} style={st(d.style)}>
              <span style={st('font-weight:600')}>{d.label}</span>
              <span style={st('opacity:.7')}> · {d.count} pt · {d.mean} min avg</span>
            </button>
          ))}
          {pastDays.length < 2 && (
            <span style={st('font:italic 400 15px/1.4 var(--font-body);color:var(--color-neutral-600)')}>No earlier days saved yet.</span>
          )}
        </div>
      </div>

      <div className="screen-only" style={st(railStyle)}>
        <div style={st('max-width:100%;display:flex;align-items:center;gap:var(--space-3)')}>
          <div style={st('font:400 12px/1.3 var(--font-body);color:var(--color-neutral-600);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap')}>
            {showRail ? (chip.field === 'asked' ? 'Asked · row ' + (chip.row + 1) : 'Done before · row ' + (chip.row + 1)) : ''}
          </div>
          <div style={st('display:flex;flex-wrap:wrap;gap:5px;flex:1')}>
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                data-chip={c}
                onMouseDown={addChip}
                style={st('font:600 12.5px/1 var(--font-body);letter-spacing:.02em;padding:6px 8px;border:1px solid var(--color-accent-300);background:var(--color-accent-100);color:var(--color-accent-800);border-radius:var(--radius-md);cursor:pointer')}
              >{c}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
