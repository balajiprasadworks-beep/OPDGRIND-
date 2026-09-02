import React, { useState } from 'react'

import { config } from '../config.js'
import { st } from '../lib/css.js'
import { signIn, signUp } from '../lib/auth.js'

// The gate. Each clinician in the team keeps their own log behind their own
// email and password; the cloud policies scope the rows to whoever is signed
// in, so this is what makes one junior's patients private from another's.

export default function Login({ onSignedIn }) {
  const [mode, setMode] = useState('in')
  const [fullName, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const creating = mode === 'up'

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Email and password are both needed.')
      return
    }
    if (creating && !fullName.trim()) {
      setError('Your name goes on every report — please add it.')
      return
    }
    if (creating && password.length < 6) {
      setError('Supabase needs a password of at least 6 characters.')
      return
    }

    setBusy(true)
    try {
      const session = creating
        ? await signUp(email, password, fullName)
        : await signIn(email, password)
      onSignedIn(session.user)
    } catch (err) {
      setError(String(err.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={st('min-height:100vh;display:flex;align-items:center;justify-content:center;padding:var(--space-6)')}>
      <div style={st('width:min(420px,100%)')}>

        <div style={st('display:flex;align-items:center;gap:8px;justify-content:center')}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" style={st('display:block;flex:none')}>
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="var(--color-accent)" strokeWidth="1.4" />
            <circle cx="10" cy="10" r="3" fill="var(--color-accent-2)" />
            <path d="M10 0v5M10 15v5M0 10h5M15 10h5" stroke="var(--color-text)" strokeWidth="1.2" />
          </svg>
          <span style={st('font:600 22px/1 var(--font-heading);letter-spacing:-.01em')}>OPDGrind</span>
        </div>

        <div style={st('margin-top:6px;text-align:center;font:400 14px/1.4 var(--font-body);color:var(--color-neutral-600);letter-spacing:.05em;text-transform:uppercase')}>
          {config.unitLine}
        </div>

        <div style={st('height:3px;background:var(--color-text);margin-top:var(--space-4)')}></div>
        <div style={st('height:1px;background:var(--color-text);margin-top:3px')}></div>

        <h1 style={st('margin:var(--space-4) 0 0;font:600 34px/1.05 var(--font-heading);letter-spacing:-.015em')}>
          {creating ? 'New clinician' : 'Sign in'}
        </h1>
        <p style={st('margin:8px 0 0;font:400 15px/1.5 var(--font-body);color:var(--color-neutral-700)')}>
          {creating
            ? 'Your own log, your own reports. Nobody else on the team can read your patient rows.'
            : 'Your log opens where you left it, on any computer in the department.'}
        </p>

        <form onSubmit={submit} style={st('margin-top:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)')}>
          {creating && (
            <div className="field">
              <label htmlFor="lg-name">Name (as it should read on reports)</label>
              <input
                id="lg-name"
                className="input"
                value={fullName}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr A. Kumar"
                autoComplete="name"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="lg-email">Email — this is your username</label>
            <input
              id="lg-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@hospital.org"
              autoComplete="username"
            />
          </div>

          <div className="field">
            <label htmlFor="lg-pass">Password</label>
            <input
              id="lg-pass"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={creating ? 'at least 6 characters' : ''}
              autoComplete={creating ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <div style={st('padding:var(--space-2) var(--space-3);background:var(--color-accent-2-100);border-left:3px solid var(--color-accent-2-600);border-radius:var(--radius-md);font:400 14px/1.5 var(--font-body);color:var(--color-accent-2-800)')}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Working…' : creating ? 'Create profile' : 'Sign in'}
          </button>
        </form>

        <div style={st('margin-top:var(--space-3);text-align:center;font:400 14.5px/1.5 var(--font-body);color:var(--color-neutral-700)')}>
          {creating ? 'Already have a profile? ' : 'First time on this team? '}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { setMode(creating ? 'in' : 'up'); setError('') }}
          >
            {creating ? 'Sign in instead' : 'Create one'}
          </button>
        </div>

        <div style={st('margin-top:var(--space-6);padding-top:var(--space-3);border-top:1px solid var(--color-divider);font:400 13px/1.5 var(--font-body);color:var(--color-neutral-600)')}>
          Days already logged on this computer stay on it, and are picked up by the first profile that signs in here.
        </div>
      </div>
    </div>
  )
}
