/**
 * Wi-Fi sync between your devices: projects, daily words, streak, sprints, name, goal and accent follow
 * you between this computer and your phones, directly over your own network. No server, no account,
 * no keys. The phone app's `collab/Sync.kt` speaks the same protocol.
 *
 * Pairing: one device shows an 8-letter code (and its address), the other types both. They then share a
 * secret and talk whenever both apps are open on the same network (a phone's hotspot works too).
 *
 * Every 15 seconds, and a moment after you save, each device that knows a partner trades "manifests"
 * (what projects it has and when each changed, its words per day, sprints, goal) and then moves the
 * projects that differ, newest copy winning. A copy that would be overwritten while it has changes
 * the other side never saw is first kept under Versions as "Before Wi-Fi sync". Deleting a project
 * leaves a note that tells the other devices to delete theirs. Structure examples never sync.
 */
import { create } from 'zustand'
import { encodeScript, scriptFromJson } from '../core/codec'
import { lanAvailable, myAddresses, newCode, newSecret, cleanCode, findDevice, prettyCode, request, serve, PORT, type Incoming } from '../collab/lan'
import { paginate, useDoc } from './doc'
import { deleteScript, libraryHooks, listLibrary, loadScript, saveScript, saveVersion, type ScriptMeta } from './library'
import { ACCENTS, settingsHooks, useSettings, type Sprint } from './settings'

const KEY = 'pageone-wifi'

export interface Peer { id: string; name: string; secret: string; ip: string; lastAt: number }
interface Saved {
  device: string
  peers: Peer[]
  /** Projects deleted here (or learned deleted from a partner): id → when. */
  tomb: Record<string, number>
  /** Words per day written on other devices: deviceId → day → words. */
  days: Record<string, Record<string, number>>
  /** The version of each project both sides last agreed on. */
  syncedAt: Record<string, number>
  prefsAt: number
}

function read(): Saved {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>
    return { device: o.device ?? crypto.randomUUID().replace(/-/g, '').slice(0, 12), peers: o.peers ?? [], tomb: o.tomb ?? {}, days: o.days ?? {}, syncedAt: o.syncedAt ?? {}, prefsAt: o.prefsAt ?? 0 }
  } catch { return { device: crypto.randomUUID().replace(/-/g, '').slice(0, 12), peers: [], tomb: {}, days: {}, syncedAt: {}, prefsAt: 0 } }
}
const saved = read()
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* storage blocked */ } }
persist()

const myName = () => useSettings.getState().s.name.trim() || 'Computer'

interface Entry {
  id: string; title: string; author: string; modifiedAt: number; createdAt: number
  pages: number; scenes: number; words: number; coverColor: number; logline: string; deleted: boolean
}
interface Prefs { name: string; goal: number; accent: string; at: number }
interface Manifest { id: string; name: string; lib: Entry[]; days: Record<string, Record<string, number>>; sprints: Sprint[]; prefs: Prefs }

export type SyncStatus = 'off' | 'waiting' | 'working' | 'synced' | 'error'
export interface Pairing { code: string; addresses: string[]; until: number }

interface SyncState {
  peers: Peer[]
  status: SyncStatus
  message: string
  lastAt: number
  pairing: Pairing | null
  /** Show a code (and this computer's address) for another device to type. */
  startPairing: () => Promise<Pairing>
  cancelPairing: () => void
  /** Pair with a device that is showing a code. */
  pairWith: (address: string, code: string) => Promise<void>
  unpair: (id: string) => void
  syncNow: () => void
}

export const useSync = create<SyncState>(set => ({
  peers: saved.peers, status: saved.peers.length ? 'waiting' : 'off', message: '', lastAt: 0, pairing: null,

  startPairing: async () => {
    if (!lanAvailable) throw new Error('Wi-Fi sync works in the desktop app.')
    await ensureServing()
    const addresses = await myAddresses()
    if (!addresses.length) throw new Error("This computer doesn't seem to be on a Wi-Fi or wired network.")
    const p: Pairing = { code: prettyCode(newCode()), addresses, until: Date.now() + 10 * 60_000 }
    pairingTries = 0
    set({ pairing: p })
    return p
  },
  cancelPairing: () => set({ pairing: null }),

  pairWith: async (address, codeText) => {
    if (!lanAvailable) throw new Error('Wi-Fi sync works in the desktop app.')
    const code = cleanCode(codeText)
    const ip = address.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(ip)) throw new Error('Type the other device\'s address as numbers, like 192.168.1.5.')
    if (code.length !== 8) throw new Error('The code has 8 letters and numbers, like K7QP-X2MA.')
    await ensureServing()
    let r
    try { r = await request<{ id: string; name: string; secret: string; error?: string }>(ip, 'POST', '/pair', '', { code, id: saved.device, name: myName() }, 6000) }
    catch { throw new Error("Couldn't reach that address. Both devices must be on the same Wi-Fi, with Page One open on the other one showing its code.") }
    if (r.status !== 200 || !r.json?.secret) throw new Error(r.json?.error ?? 'That code was not accepted. Check it, or make a new one on the other device.')
    addPeer({ id: r.json.id, name: r.json.name, secret: r.json.secret, ip: ip.split(':')[0], lastAt: Date.now() })
    syncSoon(500)
  },

  unpair: id => {
    saved.peers = saved.peers.filter(p => p.id !== id)
    // That device's words stop counting towards your totals; its projects stay where they are.
    delete saved.days[id]
    recomputeOthers()
    persist()
    set({ peers: saved.peers, status: saved.peers.length ? 'waiting' : 'off', message: '' })
  },

  syncNow: () => { syncSoon(0) },
}))

const set = (p: Partial<SyncState>) => useSync.setState(p)

function addPeer(p: Peer) {
  saved.peers = [...saved.peers.filter(x => x.id !== p.id), p]; persist()
  set({ peers: saved.peers, status: 'waiting', message: '', pairing: null })
}

export const syncActive = () => saved.peers.length > 0

// ---------------------------------------------------------------- serving

let serving = false
async function ensureServing() {
  if (serving) return
  await serve(handle)
  serving = true
}

let pairingTries = 0
const applying = new Set<string>()

const ok = (o: unknown): [number, unknown] => [200, o]
const peerOf = (auth: string) => saved.peers.find(p => auth === 'Bearer ' + p.secret)

async function handle(r: Incoming): Promise<[number, unknown]> {
  const path = r.path.split('?')[0]
  if (r.method === 'GET' && path === '/hello') return ok({ app: 'pageone', id: saved.device, name: myName() })

  if (r.method === 'POST' && path === '/pair') {
    const p = useSync.getState().pairing
    const b = JSON.parse(r.body || '{}') as { code?: string; id?: string; name?: string }
    if (!p || Date.now() > p.until) return [400, { error: 'No code is being shown on that device (or it ran out). Make a new one.' }]
    if (++pairingTries > 5) { set({ pairing: null }); return [400, { error: 'Too many wrong tries. Make a new code.' }] }
    if (cleanCode(p.code) !== cleanCode(b.code ?? '') || !b.id) return [400, { error: 'That code is not right.' }]
    const secret = newSecret()
    addPeer({ id: b.id, name: b.name || 'Phone', secret, ip: r.remote, lastAt: Date.now() })
    syncSoon(1500)
    return ok({ id: saved.device, name: myName(), secret })
  }

  const peer = peerOf(r.auth)
  if (!peer) return [401, { error: 'not paired' }]
  peer.ip = r.remote; peer.lastAt = Date.now()

  if (r.method === 'POST' && path === '/exchange') {
    const theirs = JSON.parse(r.body) as Manifest
    const mine = await manifest()
    await applyManifest(theirs, peer)
    return ok(mine)
  }
  const m = /^\/script\/([\w-]+)$/.exec(path)
  if (m && r.method === 'GET') {
    try { return ok(JSON.parse(JSON.stringify(encodeScript(await loadScript(m[1]))))) } catch { return [404, { error: 'no such script' }] }
  }
  if (m && r.method === 'PUT') return ok(await takeScript(m[1], r.body))
  return [404, { error: 'unknown' }]
}

// ---------------------------------------------------------------- manifests

async function manifest(): Promise<Manifest> {
  const s = useSettings.getState()
  const lib = (await listLibrary(useDoc.getState().script?.id)).map((m): Entry => ({
    id: m.id, title: m.title, author: m.author, modifiedAt: m.modifiedAt, createdAt: m.createdAt, pages: m.pages, scenes: m.scenes, words: m.words,
    coverColor: m.coverColor, logline: m.logline, deleted: false,
  }))
  for (const [id, at] of Object.entries(saved.tomb)) {
    if (!lib.some(e => e.id === id)) lib.push({ id, title: '', author: '', modifiedAt: at, createdAt: 0, pages: 0, scenes: 0, words: 0, coverColor: 0, logline: '', deleted: true })
  }
  return {
    id: saved.device, name: myName(), lib,
    days: { ...saved.days, [saved.device]: s.log.days },
    sprints: s.log.sprints,
    prefs: { name: s.s.name, goal: s.s.dailyGoal, accent: s.s.accent, at: saved.prefsAt },
  }
}

/** Take in a partner's words per day, sprints, name/goal/accent and deletions. */
function recomputeOthers() {
  const others: Record<string, number> = {}
  for (const per of Object.values(saved.days)) for (const [day, n] of Object.entries(per)) others[day] = (others[day] ?? 0) + n
  useSettings.getState().setOthers(others)
}

async function applyManifest(m: Manifest, peer: Peer) {
  peer.name = m.name || peer.name
  // Words per day written on other devices (including ones only the partner knows).
  for (const [dev, per] of Object.entries(m.days)) {
    if (dev === saved.device) continue
    const mine = (saved.days[dev] ??= {})
    for (const [day, n] of Object.entries(per)) if (n > (mine[day] ?? 0)) mine[day] = n
  }
  recomputeOthers()
  useSettings.getState().mergeSprints(m.sprints)

  if (m.prefs.at > saved.prefsAt) {
    saved.prefsAt = m.prefs.at
    const cur = useSettings.getState().s
    const patch: Partial<typeof cur> = {}
    if (m.prefs.name.trim() && m.prefs.name !== cur.name) patch.name = m.prefs.name
    if (m.prefs.goal > 0 && m.prefs.goal !== cur.dailyGoal) patch.dailyGoal = m.prefs.goal
    if (ACCENTS.some(a => a.id === m.prefs.accent) && m.prefs.accent !== cur.accent) patch.accent = m.prefs.accent
    if (Object.keys(patch).length) { applying.add('prefs'); useSettings.getState().set(patch); applying.delete('prefs') }
  }

  const openId = useDoc.getState().script?.id
  let removed = false
  for (const e of m.lib) {
    if (!e.deleted) {
      // A project that came back after being deleted (it was changed later than the deletion).
      if (saved.tomb[e.id] != null && e.modifiedAt > saved.tomb[e.id]) delete saved.tomb[e.id]
      continue
    }
    if ((saved.tomb[e.id] ?? 0) < e.modifiedAt) saved.tomb[e.id] = e.modifiedAt
    let local: ScriptMeta | undefined
    try { local = (await listLibrary(openId)).find(x => x.id === e.id) } catch { /* none */ }
    if (local && e.id !== openId && e.modifiedAt >= local.modifiedAt) {
      applying.add(e.id)
      try { await deleteScript(e.id); removed = true } finally { applying.delete(e.id) }
    }
  }
  persist()
  if (removed) { const { useApp } = await import('../ui/appState'); await useApp.getState().refresh() }
}

// ---------------------------------------------------------------- moving projects

/** Receive a project from a partner. Answers whether it was taken. */
async function takeScript(id: string, body: string): Promise<{ taken: boolean; why?: string }> {
  const incoming = scriptFromJson(body)
  if (incoming.id !== id) return { taken: false, why: 'mismatch' }
  const openId = useDoc.getState().script?.id
  if (openId === id) return { taken: false, why: 'open here' }
  if ((saved.tomb[id] ?? 0) >= incoming.modifiedAt) return { taken: false, why: 'deleted here' }
  let local = null
  try { local = await loadScript(id) } catch { /* new here */ }
  if (local && local.modifiedAt > incoming.modifiedAt + 1500) return { taken: false, why: 'newer here' }
  applying.add(id)
  try {
    // Changes made here that the other side never saw are kept in Versions before they are replaced.
    if (local && local.modifiedAt > (saved.syncedAt[id] ?? 0) + 1500) {
      try { await saveVersion(local, 'Before Wi-Fi sync', paginate(local).pages.length) } catch { /* best effort */ }
    }
    await saveScript(incoming, paginate(incoming).pages.length)
    saved.syncedAt[id] = incoming.modifiedAt; persist()
  } finally { applying.delete(id) }
  return { taken: true }
}

// ---------------------------------------------------------------- the sync loop

let running = false
let timer: number | undefined
let nextScan = 0

export function syncSoon(ms = 3000) {
  if (!saved.peers.length || !lanAvailable) return
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void runAll(), ms)
}

async function runAll() {
  if (running || !saved.peers.length) return
  running = true
  try {
    await ensureServing()
    set({ status: 'working', message: '' })
    let reached = 0
    for (const peer of [...saved.peers]) { if (await syncWith(peer)) reached++ }
    persist()
    if (reached) set({ status: 'synced', message: '', lastAt: Date.now(), peers: [...saved.peers] })
    else set({ status: 'waiting', message: "Looking for your other device. Open Page One on it, on the same Wi-Fi." })
  } catch (e) { set({ status: 'error', message: (e as Error).message }) } finally { running = false }
}

async function syncWith(peer: Peer): Promise<boolean> {
  const auth = 'Bearer ' + peer.secret
  let ip = peer.ip
  const reach = async () => {
    try { return await request<Manifest>(ip, 'POST', '/exchange', auth, await manifest(), 8000) } catch { return null }
  }
  let r = ip ? await reach() : null
  if (!r && Date.now() > nextScan) {
    nextScan = Date.now() + 60_000
    const mine = (await myAddresses())[0]
    const found = mine ? await findDevice(mine, peer.id) : null
    if (found) { ip = found; peer.ip = found; r = await reach() }
  }
  if (!r || r.status !== 200 || !r.json) { if (r?.status === 401) set({ message: 'That device no longer knows this one. Unpair and pair again.' }); return false }
  peer.lastAt = Date.now()
  const theirs = r.json
  await applyManifest(theirs, peer)

  const openId = useDoc.getState().script?.id
  const local = new Map((await listLibrary(openId)).map(m => [m.id, m]))
  const remote = new Map(theirs.lib.map(e => [e.id, e]))
  let changed = false
  for (const e of theirs.lib) {
    if (e.deleted) continue
    const l = local.get(e.id)
    try {
      if (!l) {
        if ((saved.tomb[e.id] ?? 0) >= e.modifiedAt) continue
        changed = (await pull(ip, auth, e.id)) || changed
      } else if (e.modifiedAt > l.modifiedAt + 1500) {
        if (e.id !== openId) changed = (await pull(ip, auth, e.id)) || changed
      } else if (l.modifiedAt > e.modifiedAt + 1500) await push(ip, auth, e.id)
    } catch (err) { console.warn('sync:', e.id, err) }
  }
  for (const l of local.values()) {
    if (remote.has(l.id)) continue
    try { await push(ip, auth, l.id) } catch (err) { console.warn('sync:', l.id, err) }
  }
  if (changed) { const { useApp } = await import('../ui/appState'); await useApp.getState().refresh() }
  return true
}

async function pull(ip: string, auth: string, id: string): Promise<boolean> {
  const r = await request(ip, 'GET', `/script/${id}`, auth, undefined, 60_000)
  if (r.status !== 200 || !r.json) return false
  return (await takeScript(id, JSON.stringify(r.json))).taken
}

async function push(ip: string, auth: string, id: string) {
  const s = await loadScript(id)
  const r = await request(ip, 'PUT', `/script/${id}`, auth, JSON.parse(JSON.stringify(encodeScript(s))), 60_000)
  if (r.status === 200) { saved.syncedAt[id] = s.modifiedAt; persist() }
}

// ---------------------------------------------------------------- hooks

libraryHooks.saved = m => { if (!applying.has(m.id)) syncSoon(3000) }

/** The writer deleted a project from the library: tell the other devices. (Nothing else ever does.) */
export const syncUserDeleted = (id: string) => {
  if (!saved.peers.length) return
  saved.tomb[id] = Date.now(); persist()
  syncSoon(1000)
}

settingsHooks.prefs = () => {
  if (applying.has('prefs')) return
  saved.prefsAt = Date.now(); persist()
  syncSoon(2000)
}
settingsHooks.day = () => syncSoon(5000)
settingsHooks.sprint = () => syncSoon(1000)

useDoc.subscribe((d, prev) => { if (prev.script && !d.script) syncSoon(1500) })

if (lanAvailable) {
  if (saved.peers.length) window.setTimeout(() => { void ensureServing().catch(e => set({ status: 'error', message: (e as Error).message })); syncSoon(1500) }, 1500)
  window.setInterval(() => syncSoon(0), 15_000)
}
window.addEventListener('focus', () => syncSoon(500))
window.addEventListener('online', () => syncSoon(1000))

export { PORT }
