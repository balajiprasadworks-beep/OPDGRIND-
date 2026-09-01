// Sheet identity, performance targets and cloud credentials.
//
// In the design canvas these were editable props; here they come from the
// build environment (.env — see .env.example), with the artifact's own
// defaults as the fallback so a fresh clone behaves exactly like the
// published page. Cloud credentials can also be repointed at runtime — see
// cloudConfig() below — which is handy when one build serves several rooms.

const env = import.meta.env

const DEFAULTS = {
  doctorName: 'Dr Balaji Prasad Ramesh',
  unitLine: 'Department of Cardiology · Outpatient',
  targetMinutes: 12,
  showChipRail: true,
  supabaseUrl: 'https://zewqcnnhraensnsvxwsc.supabase.co',
  supabaseKey: 'sb_publishable_A3ApdkhDThVR3oiMfQ-JjA_jRAQobhD'
}

// CI hands through unset variables as empty strings, and Number('') is 0 —
// which would paint every patient over target. Treat blank as absent.
const num = (v, fallback) => {
  if (v == null || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  doctorName: env.VITE_DOCTOR_NAME || DEFAULTS.doctorName,
  unitLine: env.VITE_UNIT_LINE || DEFAULTS.unitLine,
  targetMinutes: num(env.VITE_TARGET_MINUTES, DEFAULTS.targetMinutes),
  showChipRail: env.VITE_SHOW_CHIP_RAIL !== 'false',
  supabaseUrl: env.VITE_SUPABASE_URL || DEFAULTS.supabaseUrl,
  supabaseKey: env.VITE_SUPABASE_KEY || DEFAULTS.supabaseKey
}

export const CLOUD_OVERRIDE_KEY = 'opd-cloud-config'

// A per-browser override, so a doctor can point this copy at a different
// Supabase project without a rebuild:
//   localStorage.setItem('opd-cloud-config', JSON.stringify({ url, key }))
export function cloudConfig() {
  let over = {}
  try {
    over = JSON.parse(localStorage.getItem(CLOUD_OVERRIDE_KEY) || '{}') || {}
  } catch (e) {
    over = {}
  }
  return {
    url: String(over.url || config.supabaseUrl || '').replace(/\/+$/, ''),
    key: String(over.key || config.supabaseKey || '')
  }
}
