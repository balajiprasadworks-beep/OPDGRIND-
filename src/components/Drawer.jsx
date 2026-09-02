import React, { useEffect } from 'react'

import { st } from '../lib/css.js'

// The small dashboard behind the arrow beside the date. Deliberately spare:
// who is signed in, the two reports, and the way out. Anything more and it
// stops being a glance.

const ITEM = 'display:block;width:100%;text-align:left;font:400 16px/1.3 var(--font-body);color:var(--color-text);background:none;border:none;border-radius:var(--radius-md);padding:10px 12px;cursor:pointer'

export default function Drawer({ open, onClose, user, view, onNavigate, onSignOut }) {
  // Escape closes it — the drawer is a glance, never a place you get stuck.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const named = ((user && user.full_name) || '').trim()

  const items = [
    { id: 'profile', label: 'My profile', note: 'name · email · password' },
    { id: 'week', label: 'Weekly report', note: 'Monday to Saturday' },
    { id: 'month', label: 'Monthly report', note: 'week by week' }
  ]

  return (
    <div className={'drawer-root screen-only' + (open ? ' is-open' : '')}>
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true"></div>

      <aside className="drawer-panel" aria-label="Dashboard" aria-hidden={open ? 'false' : 'true'}>
        <div style={st('padding:var(--space-4) var(--space-3) var(--space-3)')}>
          <div style={st('font:400 12px/1.2 var(--font-body);color:var(--color-neutral-600);letter-spacing:.08em;text-transform:uppercase')}>
            Signed in
          </div>
          {named ? (
            <div style={st('margin-top:6px;font:600 19px/1.2 var(--font-heading);letter-spacing:-.01em;word-break:break-word')}>
              {named}
            </div>
          ) : (
            // No display name yet — say so where it will be noticed, because
            // this is the name that heads and signs every report printed.
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              style={st('display:block;margin-top:6px;padding:0;text-align:left;background:none;border:none;cursor:pointer;font:600 17px/1.25 var(--font-heading);color:var(--color-accent-700);text-decoration:underline;text-underline-offset:3px')}
            >
              Add your display name
            </button>
          )}
          <div style={st('margin-top:3px;font:400 13.5px/1.35 var(--font-body);color:var(--color-neutral-600);word-break:break-all')}>
            {(user && user.email) || ''}
          </div>
        </div>

        <div style={st('height:1px;background:var(--color-divider);margin:0 var(--space-3)')}></div>

        <nav style={st('padding:var(--space-2) var(--space-2)')}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={'drawer-item' + (view === item.id ? ' is-current' : '')}
              onClick={() => onNavigate(item.id)}
              style={st(ITEM)}
            >
              {item.label}
              <span style={st('display:block;font:400 12.5px/1.3 var(--font-body);color:var(--color-neutral-600);margin-top:2px')}>
                {item.note}
              </span>
            </button>
          ))}
        </nav>

        <div style={st('height:1px;background:var(--color-divider);margin:0 var(--space-3)')}></div>

        <div style={st('padding:var(--space-2)')}>
          <button type="button" className="drawer-item" onClick={() => onNavigate('sheet')} style={st(ITEM)}>
            Today&apos;s sheet
          </button>
          <button
            type="button"
            className="drawer-item"
            onClick={onSignOut}
            style={st(ITEM + ';color:var(--color-accent-2-700)')}
          >
            Sign out
          </button>
        </div>
      </aside>
    </div>
  )
}
