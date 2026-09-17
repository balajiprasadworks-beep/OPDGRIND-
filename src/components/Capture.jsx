import React, { useCallback, useEffect, useRef, useState } from 'react'

import { st } from '../lib/css.js'
import { dateLong, istDate, istTime } from '../lib/time.js'
import {
  SETUP_SQL, clockDriftFlag, currentSession, endEncounter, fetchOwnEvents,
  findOpenEncounter, isConfigured, startEncounter, syncOfflineQueue
} from '../lib/events.js'
import { pendingCount } from '../lib/offlineQueue.js'

const CLOCK_TICK_MS = 20000

const bigButton = (bg) =>
  'width:100%;padding:var(--space-6) var(--space-4);font:600 22px/1.2 var(--font-heading);color:#fff;' +
  'background:' + bg + ';border:none;border-radius:var(--radius-lg);cursor:pointer'

// The v2 one-scan capture screen (build spec §5.1) — the tablet-fallback
// shape (two full-screen buttons) rather than the QR/barcode path, which
// needs a scanner or a camera to actually try against. Additive: this reads
// and writes encounter_events only, never opd_days, so DaySheet is
// unaffected whether or not anyone opens this screen.
export default function Capture({ user, onBack }) {
  const [clock, setClock] = useState(istTime)
  const [session, setSession] = useState(null)
  const [open, setOpen] = useState(null)
  const [caseType, setCaseType] = useState('review')
  const [opdNumber, setOpdNumber] = useState('')
  const [status, setStatus] = useState({ state: 'loading', msg: '' })
  const [drift, setDrift] = useState(null)
  const [queued, setQueued] = useState(0)
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  const opdRef = useRef(null)

  useEffect(() => {
    const timer = setInterval(() => setClock(istTime()), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [])

  const refreshQueueCount = useCallback(() => {
    pendingCount().then(setQueued).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!isConfigured()) {
      setStatus({ state: 'error', msg: 'No cloud configured — set VITE_SUPABASE_URL/KEY first.' })
      return
    }
    setStatus({ state: 'loading', msg: '' })
    try {
      const sess = await currentSession()
      setSession(sess)
      const events = await fetchOwnEvents(sess.id, user.id)
      setOpen(findOpenEncounter(events))
      setStatus({ state: 'ready', msg: '' })
    } catch (err) {
      setStatus({ state: err.setup ? 'setup' : 'error', msg: String(err.message || err) })
    }
    refreshQueueCount()
  }, [user.id, refreshQueueCount])

  useEffect(() => { load() }, [load])

  // Sync the offline queue on load and whenever the browser tells us we're
  // back — never on a timer, so a dead network is not a stream of retries.
  useEffect(() => {
    const trySync = () => {
      setOnline(true)
      syncOfflineQueue().then(refreshQueueCount).catch(() => {})
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', trySync)
    window.addEventListener('offline', goOffline)
    if (navigator.onLine) trySync()
    return () => {
      window.removeEventListener('online', trySync)
      window.removeEventListener('offline', goOffline)
    }
  }, [refreshQueueCount])

  const doStart = useCallback(async () => {
    const num = opdNumber.trim()
    if (!num) { opdRef.current && opdRef.current.focus(); return }
    setStatus({ state: 'busy', msg: '' })
    try {
      const { encounter, driftMs } = await startEncounter({
        session, actorId: user.id, opdNumber: num, caseType
      })
      setOpen({ encounter_id: encounter.id, opened_at: new Date().toISOString() })
      setOpdNumber('')
      setCaseType('review')
      setDrift(clockDriftFlag(driftMs) ? driftMs : null)
      setStatus({ state: 'ready', msg: 'Started ' + istTime() })
    } catch (err) {
      setStatus({ state: err.setup ? 'setup' : 'error', msg: String(err.message || err) })
    }
  }, [opdNumber, caseType, session, user.id])

  const doEnd = useCallback(async () => {
    setStatus({ state: 'busy', msg: '' })
    try {
      const result = await endEncounter({ session, actorId: user.id, encounterId: open.encounter_id })
      setOpen(null)
      setStatus({ state: 'ready', msg: result.queued ? 'Saved offline — will sync' : 'Ended ' + istTime() })
      refreshQueueCount()
    } catch (err) {
      setStatus({ state: err.setup ? 'setup' : 'error', msg: String(err.message || err) })
    }
  }, [session, user.id, open, refreshQueueCount])

  const wrap = 'max-width:520px;margin:0 auto'

  return (
    <div style={st(wrap)}>
      <div style={st('display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3)')}>
        <div>
          <h1 style={st('margin:0')}>New patient</h1>
          <div style={st('font:400 14px/1.4 var(--font-body);color:var(--color-neutral-600)')}>
            {dateLong(istDate())} · {clock} IST
          </div>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onBack}>Today&apos;s sheet</button>
      </div>

      {!online && (
        <div style={st('margin-top:var(--space-4);padding:10px var(--space-3);background:var(--color-accent-2-100);border-radius:var(--radius-md);font:600 13.5px/1.4 var(--font-body);color:var(--color-accent-2-800)')}>
          Offline — ending a patient still works and will sync when back online. Starting a new patient needs a connection.
        </div>
      )}

      {online && queued > 0 && (
        <div style={st('margin-top:var(--space-4);padding:10px var(--space-3);background:var(--color-accent-100);border-radius:var(--radius-md);font:600 13.5px/1.4 var(--font-body);color:var(--color-accent-800)')}>
          Syncing {queued} event{queued === 1 ? '' : 's'} logged while offline…
        </div>
      )}

      {drift != null && (
        <div style={st('margin-top:var(--space-4);padding:10px var(--space-3);background:var(--color-process-yellow);border-radius:var(--radius-md);font:600 13.5px/1.4 var(--font-body);color:var(--color-text)')}>
          This device&apos;s clock looks {Math.round(Math.abs(drift) / 1000)}s {drift > 0 ? 'behind' : 'ahead of'} the server — worth checking.
        </div>
      )}

      {status.state === 'setup' && (
        <div style={st('margin-top:var(--space-4);padding:var(--space-3) var(--space-4);background:var(--color-accent-100);border-left:3px solid var(--color-accent);border-radius:var(--radius-md)')}>
          <div style={st('font:600 16px/1.4 var(--font-heading);color:var(--color-accent-800)')}>One-time v2 setup</div>
          <div style={st('margin-top:5px;font:400 15px/1.5 var(--font-body);color:var(--color-neutral-800)')}>
            This screen reads and writes the new append-only event log, which needs its own one-time migration. Open your project → <strong>SQL Editor</strong> → New query, paste the block below, press Run, then retry.
          </div>
          <pre style={st('margin:var(--space-3) 0 0;padding:var(--space-3);background:var(--color-neutral-100);border-radius:var(--radius-md);font:400 12.5px/1.55 ui-monospace,Menlo,monospace;color:var(--color-text);overflow-x:auto;white-space:pre;max-height:220px;overflow-y:auto')}>{SETUP_SQL}</pre>
          <div style={st('display:flex;gap:var(--space-2);margin-top:var(--space-3)')}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { try { navigator.clipboard.writeText(SETUP_SQL) } catch (e) { /* clipboard blocked */ } }}
            >Copy SQL</button>
            <button type="button" className="btn btn-ghost" onClick={load}>I&apos;ve run it — retry</button>
          </div>
        </div>
      )}

      {status.state === 'error' && (
        <div style={st('margin-top:var(--space-4);padding:10px var(--space-3);background:var(--color-accent-2-100);border-radius:var(--radius-md);font:400 14px/1.4 var(--font-body);color:var(--color-accent-2-800)')}>
          {status.msg}
        </div>
      )}

      {(status.state === 'ready' || status.state === 'busy') && !open && (
        <div style={st('margin-top:var(--space-6)')}>
          <label style={st('display:block;font:600 13px/1.3 var(--font-body);color:var(--color-neutral-700);margin-bottom:6px')}>
            OP number
          </label>
          <input
            ref={opdRef}
            className="input"
            style={st('width:100%;font:400 22px/1.3 var(--font-body);padding:14px;text-align:center')}
            inputMode="numeric"
            autoFocus
            value={opdNumber}
            onChange={(e) => setOpdNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doStart() }}
            placeholder="Scan or type"
          />

          <div style={st('display:flex;gap:var(--space-2);margin-top:var(--space-3)')}>
            {['review', 'new'].map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => setCaseType(ct)}
                style={st(
                  'flex:1;padding:10px;font:600 14px/1.2 var(--font-body);border-radius:var(--radius-md);cursor:pointer;border:1px solid ' +
                  (caseType === ct ? 'var(--color-accent)' : 'var(--color-neutral-300)') +
                  ';background:' + (caseType === ct ? 'var(--color-accent)' : 'transparent') +
                  ';color:' + (caseType === ct ? '#fff' : 'var(--color-neutral-700)')
                )}
              >
                {ct === 'review' ? 'Review' : 'New case'}
              </button>
            ))}
          </div>

          <button
            type="button"
            style={st(bigButton('var(--color-accent)') + ';margin-top:var(--space-4)')}
            disabled={status.state === 'busy'}
            onClick={doStart}
          >
            Start next patient
          </button>
        </div>
      )}

      {(status.state === 'ready' || status.state === 'busy') && open && (
        <div style={st('margin-top:var(--space-6)')}>
          <div style={st('text-align:center;font:400 15px/1.4 var(--font-body);color:var(--color-neutral-600);margin-bottom:var(--space-3)')}>
            Patient in progress
          </div>
          <button
            type="button"
            style={st(bigButton('var(--color-accent-2)'))}
            disabled={status.state === 'busy'}
            onClick={doEnd}
          >
            End encounter
          </button>
        </div>
      )}

      {status.msg && (status.state === 'ready' || status.state === 'busy') && (
        <div style={st('margin-top:var(--space-3);text-align:center;font:400 13.5px/1.4 var(--font-body);color:var(--color-neutral-600)')}>
          {status.msg}
        </div>
      )}

      <div style={st('margin-top:var(--space-6);font:400 12.5px/1.5 var(--font-body);color:var(--color-neutral-500)')}>
        This is the new v2 log, kept separate from the sheet — nothing here
        changes what Today&apos;s sheet shows or prints.
      </div>
    </div>
  )
}
