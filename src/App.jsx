import React, { useCallback, useEffect, useRef, useState } from 'react'

import { st } from './lib/css.js'
import { istDate, istTime } from './lib/time.js'
import { blankDay, normalizeStore, readStore, writeStore } from './lib/store.js'
import { readSession, restore, signOut } from './lib/auth.js'
import { fetchDays, isConfigured, mergeRemote, pushDays } from './lib/supabase.js'
import DaySheet from './components/DaySheet.jsx'
import Drawer from './components/Drawer.jsx'
import Login from './components/Login.jsx'
import ProfilePanel from './components/ProfilePanel.jsx'
import WeekReport from './components/WeekReport.jsx'
import MonthReport from './components/MonthReport.jsx'

const PUSH_DEBOUNCE_MS = 1600

// The shell: who is signed in, which of the four screens is showing, and the
// one copy of the day store they all read. Each screen owns its own working
// state; nothing but the store and the clinician is shared.

export default function App() {
  const [user, setUser] = useState(() => {
    const session = readSession()
    return session ? session.user : null
  })
  const [booting, setBooting] = useState(true)
  const [store, setStore] = useState({})
  const [dateKey, setDateKey] = useState(istDate)
  const [view, setView] = useState('sheet')
  const [drawer, setDrawer] = useState(false)
  const [sync, setSync] = useState({ state: 'idle', msg: 'Not synced yet' })

  // The async paths (debounced push, full sync) must see the newest store and
  // the current clinician, not the ones captured when they were scheduled.
  const storeRef = useRef({})
  const userRef = useRef(user)
  const pushTimer = useRef(null)

  userRef.current = user
  const clinicianId = user ? user.id : ''

  const applyStore = useCallback((next, persist = true) => {
    storeRef.current = next
    if (persist && userRef.current) writeStore(next, userRef.current.id)
    setStore(next)
  }, [])

  /* ── boot ───────────────────────────────────────────────────────────── */

  // A cached session is proved against Supabase once at startup — but a failed
  // refresh here means "no network", not "not you": lib/auth.js only drops a
  // session the server actually rejects, so a dead hospital line never locks
  // the clinic out of its own sheet.
  useEffect(() => {
    let alive = true
    restore()
      .then((session) => { if (alive) setUser(session ? session.user : null) })
      .catch(() => {})
      .then(() => { if (alive) setBooting(false) })
    return () => { alive = false }
  }, [])

  /* ── cloud ──────────────────────────────────────────────────────────── */

  const queuePush = useCallback((key) => {
    clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => {
      const who = userRef.current
      if (!who) return
      setSync({ state: 'busy', msg: 'Saving to cloud…' })
      pushDays([key], storeRef.current, who.id)
        .then(() => setSync({ state: 'ok', msg: 'Cloud saved ' + istTime() }))
        .catch((e) => setSync({ state: e.setup ? 'setup' : 'error', msg: String(e.message || e) }))
    }, PUSH_DEBOUNCE_MS)
  }, [])

  const syncAll = useCallback(async () => {
    const who = userRef.current
    if (!who) return
    if (!isConfigured()) {
      setSync({ state: 'error', msg: 'No cloud configured' })
      return
    }
    setSync({ state: 'busy', msg: 'Syncing…' })
    try {
      const remote = await fetchDays(who.id)
      const { store: merged, toPush } = mergeRemote(storeRef.current, remote)
      applyStore(merged)
      if (toPush.length) await pushDays(toPush, merged, who.id)
      setSync({
        state: 'ok',
        msg: 'Synced ' + istTime() + ' · ' + Object.keys(merged).length + ' days in cloud'
      })
    } catch (err) {
      setSync({ state: err.setup ? 'setup' : 'error', msg: String(err.message || err) })
    }
  }, [applyStore])

  // Signing in — or switching clinician on a shared computer — swaps the whole
  // log over. The store is read per clinician, so two juniors on one machine
  // never see each other's days.
  useEffect(() => {
    if (!clinicianId) {
      storeRef.current = {}
      setStore({})
      return undefined
    }
    const loaded = readStore(clinicianId)
    const today = istDate()
    if (!loaded[today]) loaded[today] = blankDay()
    storeRef.current = loaded
    setStore(loaded)
    setDateKey(today)
    setView('sheet')
    syncAll()
    return () => clearTimeout(pushTimer.current)
  }, [clinicianId, syncAll])

  // The printed page box. @page is a global rule with no way to vary by screen,
  // and a named page makes Chromium break to a fresh sheet on entering it — so
  // the one rule is rewritten as the view changes: landscape for the wide daily
  // sheet, portrait for a report.
  useEffect(() => {
    const id = 'opd-page-box'
    let tag = document.getElementById(id)
    if (!tag) {
      tag = document.createElement('style')
      tag.id = id
      document.head.appendChild(tag)
    }
    tag.textContent = (view === 'week' || view === 'month')
      ? '@page { size: A4 portrait; margin: 14mm }'
      : '@page { size: A4 landscape; margin: 11mm }'
  }, [view])

  /* ── day editing ────────────────────────────────────────────────────── */

  const writeDay = useCallback((nextDay) => {
    const key = dateKey
    const next = { ...storeRef.current, [key]: { ...nextDay, updatedAt: new Date().toISOString() } }
    applyStore(next)
    queuePush(key)
  }, [applyStore, dateKey, queuePush])

  const openDay = useCallback((key) => {
    if (!key) return
    if (!storeRef.current[key]) applyStore({ ...storeRef.current, [key]: blankDay() }, false)
    setDateKey(key)
  }, [applyStore])

  const doExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(storeRef.current, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'opd-log-backup-' + istDate() + '.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }, [])

  const doImport = useCallback((e) => {
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
  }, [applyStore])

  /* ── navigation ─────────────────────────────────────────────────────── */

  const navigate = useCallback((next) => {
    setView(next)
    setDrawer(false)
  }, [])

  const doSignOut = useCallback(async () => {
    setDrawer(false)
    await signOut()
    setUser(null)
    setView('sheet')
  }, [])

  /* ── what to show ───────────────────────────────────────────────────── */

  if (booting && !user) {
    return (
      <div style={st('min-height:100vh;display:grid;place-items:center;font:400 15px/1.5 var(--font-body);color:var(--color-neutral-600)')}>
        Opening your log…
      </div>
    )
  }

  if (!user) return <Login onSignedIn={setUser} />

  const shell = 'min-height:100vh;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);padding:var(--space-6) var(--space-8) ' +
    (view === 'sheet' ? '140px' : 'var(--space-8)')

  return (
    <>
      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        user={user}
        view={view}
        onNavigate={navigate}
        onSignOut={doSignOut}
      />

      <div
        className={'log-shell' + (drawer ? ' is-shifted' : '')}
        style={st(shell)}
      >
        {view === 'sheet' && (
          <DaySheet
            store={store}
            dateKey={dateKey}
            user={user}
            onOpenDay={openDay}
            onWriteDay={writeDay}
            onExport={doExport}
            onImport={doImport}
            sync={sync}
            onSync={syncAll}
            onOpenDrawer={() => setDrawer((v) => !v)}
            drawerOpen={drawer}
          />
        )}

        {view === 'week' && <WeekReport store={store} user={user} onBack={() => navigate('sheet')} />}
        {view === 'month' && <MonthReport store={store} user={user} onBack={() => navigate('sheet')} />}
        {view === 'profile' && (
          <ProfilePanel user={user} onUpdated={setUser} onBack={() => navigate('sheet')} />
        )}
      </div>
    </>
  )
}
