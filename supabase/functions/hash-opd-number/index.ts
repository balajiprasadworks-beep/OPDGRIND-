// Turns a plain OP number into the peppered hash encounters and register
// rows are keyed on — the one place in Phase 2 the pepper (§4.3 of the build
// spec) actually has to live, since it must never reach the browser.
//
// Deploy once per project:
//   supabase functions deploy hash-opd-number
//   supabase secrets set OPD_NUMBER_PEPPER=<a long random string, keep it secret>
//
// SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically by the
// Supabase Edge Runtime — nothing to set for those two.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function fail(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS })
}

// Matches public.encounters.opd_no_hash in phase1_integrity.sql exactly:
// encode(digest(opd_number || pepper, 'sha256'), 'hex'). Same concatenation
// order and hex encoding, so a hash computed here and one computed later by
// the Phase 5 register-ingestion path land on the same value for the same
// OP number.
async function hashOpdNumber(opdNumber: string, pepper: string): Promise<string> {
  const bytes = new TextEncoder().encode(opdNumber + pepper)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Method not allowed')

  const pepper = Deno.env.get('OPD_NUMBER_PEPPER')
  if (!pepper) return fail(500, 'Server is not configured — OPD_NUMBER_PEPPER is not set')

  // Every caller has to be a signed-in clinician — this is what stops an
  // outsider from hash-probing OP numbers, since the anon key alone is
  // public. auth.getUser() re-checks the token against Supabase itself
  // rather than trusting it unread.
  const authHeader = req.headers.get('Authorization') || ''
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) return fail(401, 'Sign in required')

  let body: { opdNumber?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'Body must be JSON')
  }

  const opdNumber = String(body?.opdNumber ?? '').trim()
  if (!opdNumber) return fail(400, 'opdNumber is required')

  const opdNoHash = await hashOpdNumber(opdNumber, pepper)

  // serverTime lets the caller check its own clock without a second round
  // trip — every live capture already calls this function once, so clock-
  // drift detection (build spec §5.2) rides along for free.
  return new Response(JSON.stringify({ opdNoHash, serverTime: new Date().toISOString() }), {
    status: 200,
    headers: JSON_HEADERS
  })
})
