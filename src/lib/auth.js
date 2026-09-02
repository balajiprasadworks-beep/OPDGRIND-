// Clinician accounts over Supabase Auth (GoTrue), spoken to with plain fetch —
// the same no-SDK approach as lib/supabase.js, so the whole wire format stays
// readable and the bundle stays small.
//
// The session (access token, refresh token, the user) is cached in
// localStorage. That cache is what lets the sheet open on a dead hospital
// network: a failed refresh is treated as "no network", not "not you".

import { cloudConfig } from '../config.js'

export const SESSION_KEY = 'opd-auth-session-v1'

// Refresh a little before the token actually dies, so a save in flight is not
// the thing that discovers it has expired.
const REFRESH_MARGIN_MS = 60 * 1000

const authUrl = (path) => cloudConfig().url + '/auth/v1' + path

const baseHeaders = () => ({ apikey: cloudConfig().key, 'Content-Type': 'application/json' })

export const isConfigured = () => {
  const cfg = cloudConfig()
  return !!(cfg.url && cfg.key)
}

/* ── the cached session ─────────────────────────────────────────────────── */

export function readSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    if (raw && raw.access_token && raw.user && raw.user.id) return raw
  } catch (e) {
    // Fall through — a corrupt cache is the same as no cache.
  }
  return null
}

function writeSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch (e) {
    // Private mode: the session lives in memory for this tab only.
  }
  cached = session
  return session
}

let cached = readSession()
let refreshing = null

// GoTrue has spelled its errors four ways over the years; the doctor only ever
// needs the sentence.
function messageOf(body, status) {
  if (body) {
    const text = body.error_description || body.msg || body.message || body.error
    if (text) return String(text)
  }
  return 'Sign-in failed (HTTP ' + status + ')'
}

async function post(path, body, token) {
  const headers = baseHeaders()
  if (token) headers.Authorization = 'Bearer ' + token
  const res = await fetch(authUrl(path), { method: 'POST', headers, body: JSON.stringify(body) })
  let json = null
  try {
    json = await res.json()
  } catch (e) {
    json = null
  }
  if (!res.ok) {
    const err = new Error(messageOf(json, res.status))
    err.status = res.status
    throw err
  }
  return json
}

// GoTrue returns the user inside the token response; keep only what the app
// shows, so a schema change upstream cannot break the cache.
function sessionFrom(payload) {
  if (!payload || !payload.access_token || !payload.user) return null
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || '',
    expires_at: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
    user: {
      id: payload.user.id,
      email: payload.user.email || '',
      full_name: (payload.user.user_metadata && payload.user.user_metadata.full_name) || ''
    }
  }
}

export const currentUser = () => (cached ? cached.user : null)

/* ── the flows ──────────────────────────────────────────────────────────── */

export async function signIn(email, password) {
  const payload = await post('/token?grant_type=password', {
    email: String(email || '').trim(),
    password: String(password || '')
  })
  const session = sessionFrom(payload)
  if (!session) throw new Error('Supabase returned no session for that sign-in.')
  return writeSession(session)
}

export async function signUp(email, password, fullName) {
  const payload = await post('/signup', {
    email: String(email || '').trim(),
    password: String(password || ''),
    data: { full_name: String(fullName || '').trim() }
  })
  const session = sessionFrom(payload)
  if (!session) {
    // A signup that returns a user but no session means email confirmation is
    // still switched on — the account exists but cannot be used yet. Say which
    // switch, rather than leaving the doctor at a dead form.
    const err = new Error(
      'Account created, but Supabase is holding it for email confirmation. ' +
      'Open your project → Authentication → Sign In / Providers → Email and turn ' +
      '"Confirm email" off, then sign in here. (Or click the link in the email.)'
    )
    err.confirmation = true
    throw err
  }
  return writeSession(session)
}

// One refresh at a time: a page that fires three saves at once should not send
// three refreshes and race itself out of a valid token.
function refresh() {
  if (refreshing) return refreshing
  const token = cached && cached.refresh_token
  if (!token) return Promise.resolve(null)

  refreshing = post('/token?grant_type=refresh_token', { refresh_token: token })
    .then((payload) => writeSession(sessionFrom(payload) || cached))
    .catch((err) => {
      // A refresh token the server rejects really is gone: sign out. Anything
      // else — offline, DNS, a proxy — must not evict a working clinic.
      if (err.status === 400 || err.status === 401 || err.status === 403) {
        writeSession(null)
        return null
      }
      return cached
    })
    .finally(() => { refreshing = null })

  return refreshing
}

// The token to put on a cloud request, refreshed if it is at or near expiry.
// Returns null only when there is no session at all.
export async function accessToken() {
  if (!cached) return null
  if (Date.now() < cached.expires_at - REFRESH_MARGIN_MS) return cached.access_token
  const next = await refresh()
  return next ? next.access_token : null
}

// Called once at startup: proves the cached session is still real, and picks up
// a name or email changed on another device.
export async function restore() {
  if (!cached) return null
  if (Date.now() >= cached.expires_at - REFRESH_MARGIN_MS) await refresh()
  return cached
}

export async function signOut() {
  const token = cached && cached.access_token
  writeSession(null)
  if (!token) return
  try {
    await post('/logout', {}, token)
  } catch (e) {
    // The local session is already gone, which is what signing out means here.
  }
}

// Name, email (the username) and password all live on the one GoTrue user, so
// one call updates whichever of them changed.
export async function updateProfile({ fullName, email, password }) {
  const token = await accessToken()
  if (!token) throw new Error('Session expired — sign in again to change your profile.')

  const body = {}
  if (fullName != null) body.data = { full_name: String(fullName).trim() }
  if (email) body.email = String(email).trim()
  if (password) body.password = String(password)

  const headers = { ...baseHeaders(), Authorization: 'Bearer ' + token }
  const res = await fetch(authUrl('/user'), { method: 'PUT', headers, body: JSON.stringify(body) })
  let json = null
  try {
    json = await res.json()
  } catch (e) {
    json = null
  }
  if (!res.ok) throw new Error(messageOf(json, res.status))

  const user = {
    id: (json && json.id) || cached.user.id,
    // Supabase can hold a new address as new_email until it is confirmed, so
    // report the address that is actually live rather than the one requested.
    email: (json && json.email) || cached.user.email,
    full_name: (json && json.user_metadata && json.user_metadata.full_name) || cached.user.full_name
  }
  writeSession({ ...cached, user })
  return { user, pendingEmail: (json && json.new_email) || '' }
}
