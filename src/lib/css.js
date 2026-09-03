// The design canvas wrote inline styles as CSS text, and the app still
// computes several of them (pill fills, the sync line's colour, a running
// break's tint). React wants an object, so parse once and cache: the same
// declaration string maps to the same frozen object on every render.

const cache = new Map()
const camel = (prop) => prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

export function st(css) {
  if (!css) return undefined
  const hit = cache.get(css)
  if (hit) return hit

  const out = {}
  for (const decl of css.split(';')) {
    const colon = decl.indexOf(':')
    if (colon < 0) continue
    const prop = decl.slice(0, colon).trim()
    const value = decl.slice(colon + 1).trim()
    if (!prop || !value) continue
    // Custom properties keep their literal name; everything else is camelCased
    // the way React's style prop expects.
    out[prop.startsWith('--') ? prop : camel(prop)] = value
  }

  Object.freeze(out)
  cache.set(css, out)
  return out
}
