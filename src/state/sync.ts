/**
 * Phone and computer, one writer: projects, daily words, streak, sprints, name and goal follow you
 * between devices. This is the desktop side of the phone's `collab/Sync.kt`; the data layout and the
 * wire format are described in `collab/sync.ts`.
 *
 * Projects open live between your devices (a synced project is simply live, as if shared with yourself);
 * the ones you aren't looking at are brought up to date here, newest copy winning. Structure examples
 * are study aids and are never synced.
 */
import type { Unsubscribe } from 'firebase/firestore'
import { create } from 'zustand'
import { emptyExtras, newScript, titlePage, type Script } from '../core/model'
import { codeFor, currentServer, isValid, pretty, uid } from '../collab/hub'
import { keepCasing, mergeRemote } from '../collab/extras'
import {
  createSpace, fetchScript, newSpaceId, putDay, putEntry, putGone, putPrefs, putSprint, spaceExists, toEntry, uploadScript,
  watchDays, watchLibrary, watchPrefs, watchSprints, type RemoteEntry, type RemoteSprint,
} from '../collab/sync'
import { paginate, useDoc } from './doc'
import { deleteScript, libraryHooks, listLibrary, loadScript, saveScript, type ScriptMeta } from './library'
import { ACCENTS, settingsHooks, useSettings } from './settings'

const KEY = 'pageone-sync'

interface Saved { space: string | null; device: string; prefsAt: number }
function readSaved(): Saved {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Saved>
    return { space: o.space ?? null, device: o.device ?? crypto.randomUUID().slice(0, 8), prefsAt: o.prefsAt ?? 0 }
  } catch { return { space: null, device: crypto.randomUUID().slice(0, 8), prefsAt: 0 } }
}
const saved = readSaved()
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* storage blocked */ } }
persist()

export type SyncStatus = 'off' | 'connecting' | 'synced' | 'working' | 'error'

interface SyncState {
  space: string | null
  status: SyncStatus
  message: string
  lastAt: number
  /** A pairing code for another device (from this one). */
  link: () => Promise<string>
  /** Join the sync space a pairing code points at. */
  adopt: (spaceId: string) => Promise<void>
  unlink: () => void
  syncNow: () => void
}

export const useSync = create<SyncState>(set => ({
  space: saved.space, status: saved.space ? 'connecting' : 'off', message: '', lastAt: 0,

  link: async () => {
    const c = currentServer()
    if (!isValid(c)) throw new Error('Sync needs the live-sync server, which this copy of Page One was built without.')
    if (!saved.space) {
      const sp = newSpaceId()
      await createSpace(c, sp)
      saved.space = sp; persist()
      set({ space: sp, status: 'connecting', message: '' })
      start()
    }
    return pretty(await codeFor(c, saved.space!, 'Page One sync', useSettings.getState().s.name.trim() || 'Writer'))
  },

  adopt: async sp => {
    const c = currentServer()
    if (!isValid(c)) throw new Error('Sync needs the live-sync server, which this copy of Page One was built without.')
    if (!(await spaceExists(c, sp))) throw new Error("That sync code doesn't point anywhere any more. Make a new one on your other device.")
    if (saved.space && saved.space !== sp) stop()
    saved.space = sp; persist()
    set({ space: sp, status: 'connecting', message: '' })
    start()
  },

  unlink: () => {
    stop()
    saved.space = null; persist()
    useSettings.getState().setOthers({})
    set({ space: null, status: 'off', message: '', lastAt: 0 })
  },

  syncNow: () => { if (saved.space) { remote = new Map(); stop(); start() } },
}))

export const syncActive = () => saved.space != null

// ---------------------------------------------------------------- state

let unsubs: Unsubscribe[] = []
let remote = new Map<string, RemoteEntry>()
let queue: Promise<void> = Promise.resolve()
let prefsSeen = false
let prefsTimer: number | undefined
const applying = new Set<string>()
const timers = new Map<string, number>()
const dayTimers = new Map<string, number>()

const set = (p: Partial<SyncState>) => useSync.setState(p)
const fail = (e: unknown) => set({ status: 'error', message: (e as Error)?.message ?? String(e) })

function stop() {
  generation++
  unsubs.forEach(u => u()); unsubs = []
  prefsSeen = false
  window.clearTimeout(prefsTimer)
}

function enqueue(f: () => Promise<void>) {
  queue = queue.then(f).catch(fail)
}

let generation = 0

function start() {
  stop()
  const sp = saved.space
  const c = currentServer()
  if (!sp) return
  if (!isValid(c)) return set({ status: 'error', message: 'The live-sync server is not set up in this build.' })
  set({ status: 'connecting', message: '' })
  // Listen only once this computer is signed in: a listener opened earlier is refused and never recovers.
  const mine = ++generation
  uid(c).then(() => { if (mine === generation) listen(sp, c) }, fail)
}

function listen(sp: string, c: ReturnType<typeof currentServer>) {

  unsubs.push(watchLibrary(c, sp, list => {
    remote = new Map(list.map(e => [e.id, e]))
    enqueue(reconcile)
  }, fail))

  unsubs.push(watchDays(c, sp, days => {
    const others: Record<string, number> = {}
    const mine = useSettings.getState().log.days
    for (const [day, per] of Object.entries(days)) {
      const sum = Object.entries(per).reduce((n, [dev, w]) => (dev === saved.device ? n : n + w), 0)
      if (sum > 0) others[day] = sum
    }
    useSettings.getState().setOthers(others)
    // What this computer wrote that the server doesn't have yet (older days, or a first sync).
    for (const [day, w] of Object.entries(mine)) if (w > 0 && days[day]?.[saved.device] !== w) void putDay(c, sp, saved.device, day, w).catch(() => {})
  }))

  unsubs.push(watchSprints(c, sp, list => {
    useSettings.getState().mergeSprints(list.map(x => ({ at: x.at, minutes: x.minutes, words: x.words, goal: x.goal, script: x.script })))
    const have = new Set(list.map(x => x.at))
    for (const x of useSettings.getState().log.sprints) if (!have.has(x.at)) void putSprint(c, sp, x as RemoteSprint).catch(() => {})
  }))

  unsubs.push(watchPrefs(c, sp, p => {
    prefsSeen = true
    if (p.at <= saved.prefsAt) return
    saved.prefsAt = p.at; persist()
    const cur = useSettings.getState().s
    const patch: Partial<typeof cur> = {}
    if (p.name.trim() && p.name !== cur.name) patch.name = p.name
    if (p.goal > 0 && p.goal !== cur.dailyGoal) patch.dailyGoal = p.goal
    if (ACCENTS.some(a => a.id === p.accent) && p.accent !== cur.accent) patch.accent = p.accent
    if (Object.keys(patch).length) { applying.add('prefs'); useSettings.getState().set(patch); applying.delete('prefs') }
  }))
  // Nothing on the server yet (the first device to sync): it gets this computer's name, goal and accent.
  prefsTimer = window.setTimeout(() => { if (!prefsSeen) pushPrefs() }, 4000)
}

function pushPrefs() {
  const sp = saved.space
  const c = currentServer()
  if (!sp || !isValid(c)) return
  const s = useSettings.getState().s
  saved.prefsAt = Date.now(); persist()
  void putPrefs(c, sp, { name: s.name, goal: s.dailyGoal, accent: s.accent, at: saved.prefsAt }).catch(() => {})
}

// ---------------------------------------------------------------- projects

/** Bring this computer and the shared library level, newest copy winning. */
async function reconcile() {
  const sp = saved.space
  const c = currentServer()
  if (!sp || !isValid(c)) return
  const openId = useDoc.getState().script?.id ?? null
  const local = await listLibrary(openId)
  const lm = new Map(local.map(m => [m.id, m]))
  let changed = false
  const todo: { r?: RemoteEntry; l?: ScriptMeta; kind: 'pull' | 'push' | 'gone' | 'entry' }[] = []

  for (const r of remote.values()) {
    const l = lm.get(r.id)
    if (r.deleted) {
      if (l && r.id !== openId && r.modifiedAt >= l.modifiedAt) todo.push({ r, l, kind: 'gone' })
      else if (l && l.modifiedAt > r.modifiedAt) todo.push({ l, kind: 'push' })
      continue
    }
    if (!l) todo.push({ r, kind: 'pull' })
    else if (r.id === openId) { if (l.modifiedAt > r.modifiedAt + 1500) todo.push({ l, kind: 'entry' }) }
    else if (r.modifiedAt > l.modifiedAt + 1500) todo.push({ r, l, kind: 'pull' })
    else if (l.modifiedAt > r.modifiedAt + 1500) todo.push({ l, kind: 'push' })
  }
  for (const l of local) if (!remote.has(l.id)) todo.push({ l, kind: 'push' })

  if (todo.length) set({ status: 'working', message: `Syncing ${todo.length} project${todo.length === 1 ? '' : 's'}…` })
  for (const [i, t] of todo.entries()) {
    if (todo.length > 1) set({ message: `Syncing project ${i + 1} of ${todo.length}…` })
    try {
      if (t.kind === 'pull') { if (await pull(t.r!)) changed = true }
      else if (t.kind === 'gone') { applying.add(t.l!.id); try { await deleteScript(t.l!.id) } finally { applying.delete(t.l!.id) } changed = true }
      else if (t.kind === 'push') { await pushWhole(t.l!); }
      else await putEntry(c, sp, toEntry(t.l!))
    } catch (e) { console.warn('sync:', t.kind, e) }
  }
  set({ status: 'synced', message: '', lastAt: Date.now() })
  if (changed) { const { useApp } = await import('../ui/appState'); await useApp.getState().refresh() }
}

async function pushWhole(l: ScriptMeta) {
  const sp = saved.space
  const c = currentServer()
  if (!sp) return
  const s = await loadScript(l.id)
  await uploadScript(c, s, useSettings.getState().s.name.trim() || 'Writer')
  await putEntry(c, sp, toEntry(l))
}

/** Take the shared copy of a project this computer doesn't have, or has an older copy of. */
async function pull(r: RemoteEntry): Promise<boolean> {
  const data = await fetchScript(currentServer(), r.id)
  if (!data) return false // the other device is still uploading it; the next change brings it
  applying.add(r.id)
  try {
    let local: Script | null = null
    try { local = await loadScript(r.id) } catch { /* new here */ }
    const title = data.title || r.title
    const tp = data.tp ?? local?.titlePage ?? titlePage({ title })
    let s: Script
    if (local) {
      const extras = data.extras ? mergeRemote(local.extras, data.extras) : local.extras
      s = { ...local, title, titlePage: tp, elements: keepCasing(local.elements, data.elements), extras: { ...extras, comments: data.comments }, coverColor: r.coverColor || local.coverColor, modifiedAt: r.modifiedAt }
    } else {
      s = newScript({
        id: r.id, title, elements: data.elements, titlePage: tp, coverColor: r.coverColor, createdAt: r.createdAt || Date.now(), modifiedAt: r.modifiedAt,
        extras: { ...(data.extras ?? emptyExtras()), comments: data.comments },
      })
    }
    await saveScript(s, paginate(s).pages.length)
    return true
  } finally { applying.delete(r.id) }
}

// ---------------------------------------------------------------- hooks

libraryHooks.saved = m => {
  const sp = saved.space
  if (!sp || applying.has(m.id)) return
  const r = remote.get(m.id)
  if (r && !r.deleted && r.modifiedAt === m.modifiedAt) return
  window.clearTimeout(timers.get(m.id))
  timers.set(m.id, window.setTimeout(() => {
    timers.delete(m.id)
    void putEntry(currentServer(), sp, toEntry(m)).catch(() => {})
  }, 1500))
}

/** The writer deleted a project from the library: tell the other device. (Nothing else ever does.) */
export const syncUserDeleted = (id: string) => {
  const sp = saved.space
  if (!sp) return
  window.clearTimeout(timers.get(id)); timers.delete(id)
  if (remote.has(id)) void putGone(currentServer(), sp, id).catch(() => {})
}

settingsHooks.prefs = () => {
  if (!saved.space || applying.has('prefs')) return
  window.clearTimeout(prefsTimer)
  prefsTimer = window.setTimeout(pushPrefs, 1200)
}

settingsHooks.day = (day, words) => {
  const sp = saved.space
  if (!sp) return
  window.clearTimeout(dayTimers.get(day))
  dayTimers.set(day, window.setTimeout(() => { dayTimers.delete(day); void putDay(currentServer(), sp, saved.device, day, words).catch(() => {}) }, 2500))
}

settingsHooks.sprint = s => {
  const sp = saved.space
  if (sp) void putSprint(currentServer(), sp, s as RemoteSprint).catch(() => {})
}

if (saved.space) window.setTimeout(start, 1200)
window.addEventListener('online', () => { if (saved.space) useSync.getState().syncNow() })
