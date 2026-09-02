import React, { useState } from 'react'

import { st } from '../lib/css.js'
import { updateProfile } from '../lib/auth.js'

// My profile: the name that heads every report, the email that is also the
// username, and the password. All three are the one Supabase user, so one save
// covers whichever of them changed.

export default function ProfilePanel({ user, onUpdated, onBack }) {
  const [fullName, setName] = useState((user && user.full_name) || '')
  const [email, setEmail] = useState((user && user.email) || '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [copied, setCopied] = useState(false)

  const changed = fullName !== ((user && user.full_name) || '') ||
    email !== ((user && user.email) || '') ||
    password.length > 0

  const save = async (e) => {
    e.preventDefault()
    setNote(null)

    if (password && password.length < 6) {
      setNote({ bad: true, text: 'Supabase needs a password of at least 6 characters.' })
      return
    }

    setBusy(true)
    try {
      const changes = {}
      if (fullName !== (user.full_name || '')) changes.fullName = fullName
      if (email !== (user.email || '')) changes.email = email
      if (password) changes.password = password

      const { user: next, pendingEmail } = await updateProfile(changes)
      onUpdated(next)
      setPassword('')
      setNote({
        text: pendingEmail
          // Supabase holds a new address until it is confirmed, so say so
          // rather than letting the doctor think the change did not take.
          ? 'Saved. Your new address ' + pendingEmail + ' needs the confirmation link Supabase just emailed before you can sign in with it — until then keep using ' + next.email + '.'
          : 'Saved.'
      })
    } catch (err) {
      setNote({ bad: true, text: String(err.message || err) })
    } finally {
      setBusy(false)
    }
  }

  const copyId = () => {
    try {
      navigator.clipboard.writeText(user.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      // Clipboard blocked — the id is on screen to read anyway.
    }
  }

  return (
    <div style={st('max-width:520px')}>
      <button type="button" className="btn btn-ghost screen-only" onClick={onBack} style={st('padding-left:0')}>
        ← Back to the sheet
      </button>

      <h1 style={st('margin:var(--space-3) 0 0;font:600 40px/1.05 var(--font-heading);letter-spacing:-.015em')}>
        My profile
      </h1>
      <p style={st('margin:8px 0 0;font:400 16px/1.5 var(--font-body);color:var(--color-neutral-700)')}>
        Your name heads every report you print. Your email is your username.
      </p>

      <div style={st('height:1px;background:var(--color-text);margin-top:var(--space-4)')}></div>

      <form onSubmit={save} style={st('margin-top:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)')}>
        <div className="field">
          <label htmlFor="pf-name">Name</label>
          <input id="pf-name" className="input" value={fullName} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>

        <div className="field">
          <label htmlFor="pf-email">Email (username)</label>
          <input id="pf-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>

        <div className="field">
          <label htmlFor="pf-pass">New password</label>
          <input
            id="pf-pass"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="leave blank to keep the one you have"
            autoComplete="new-password"
          />
        </div>

        {note && (
          <div style={st('padding:var(--space-2) var(--space-3);border-left:3px solid ' +
            (note.bad ? 'var(--color-accent-2-600)' : 'var(--color-accent)') + ';background:' +
            (note.bad ? 'var(--color-accent-2-100)' : 'var(--color-accent-100)') +
            ';border-radius:var(--radius-md);font:400 14px/1.5 var(--font-body);color:' +
            (note.bad ? 'var(--color-accent-2-800)' : 'var(--color-accent-800)'))}>
            {note.text}
          </div>
        )}

        <div>
          <button type="submit" className="btn btn-primary" disabled={busy || !changed}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <div style={st('margin-top:var(--space-8);padding-top:var(--space-3);border-top:1px solid var(--color-divider)')}>
        <div style={st('font:400 13px/1.2 var(--font-body);color:var(--color-neutral-600);letter-spacing:.06em;text-transform:uppercase')}>
          Clinician id
        </div>
        <div style={st('margin-top:8px;font:400 13px/1.5 ui-monospace,Menlo,monospace;word-break:break-all;color:var(--color-neutral-800)')}>
          {user.id}
        </div>
        <div style={st('margin-top:8px;font:400 13.5px/1.5 var(--font-body);color:var(--color-neutral-600)')}>
          Only needed once: if this project holds days logged before profiles existed, they have no owner
          and no signed-in clinician can see them. Paste this id into the last line of the setup SQL to
          adopt them into your account.
        </div>
        <button type="button" className="btn btn-secondary screen-only" onClick={copyId} style={st('margin-top:var(--space-2)')}>
          {copied ? 'Copied' : 'Copy id'}
        </button>
      </div>
    </div>
  )
}
