// A small IndexedDB queue for encounter_events captured while offline.
// localStorage (what store.js uses for the day sheet) is synchronous and
// capped around 5MB shared with everything else on the origin; IndexedDB
// costs a bit of ceremony but does not block the UI thread and does not
// compete with the day sheet's own storage for space.

const DB_NAME = 'opd-offline-queue'
const DB_VERSION = 1
const STORE = 'events'

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'queueId', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result
    Promise.resolve(fn(store))
      .then((r) => { result = r })
      .catch(reject)
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export function enqueue(event) {
  return withStore('readwrite', (store) => { store.add(event) })
}

export function pendingCount() {
  return withStore('readonly', (store) => new Promise((resolve, reject) => {
    const req = store.count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

// Sends queued events in the order they were captured, stopping at the
// first failure so a run of connectivity that dies partway through does not
// reorder or drop anything — whatever is left stays queued for next time.
export async function drainQueue(send) {
  const db = await openDb()
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

  let sent = 0
  for (const row of all) {
    const { queueId, ...event } = row
    try {
      await send(event)
    } catch (err) {
      break
    }
    await withStore('readwrite', (store) => { store.delete(queueId) })
    sent += 1
  }
  return { sent, remaining: all.length - sent }
}
