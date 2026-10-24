/**
 * Live co-writing for the open script (the desktop side of the phone's EditorViewModel live
 * session): which scripts are live on this computer, the session, co-writers' presence and the
 * change history. Local edits are pushed a moment after you stop typing; the shared copy's edits
 * arrive here and go into the script like any other change.
 */
import { create } from 'zustand'
import { decodeExtras, encodeExtras } from '../core/codec'
import { el, newId, newScript, titlePage, type Element, type Script, type ScriptExtras } from '../core/model'
import { codeFor, colorFor, currentServer, findCode, isValid, resolve, type ServerConfig } from '../collab/hub'
import { LiveSession, type Change, type LiveStatus, type Peer } from '../collab/live'
import { useDoc } from './doc'
import { loadScript, saveScript } from './library'
import { useSettings } from './settings'

const LIVE_KEY = 'pageone-live'
const readLive = (): string[] => { try { return JSON.parse(localStorage.getItem(LIVE_KEY) ?? '[]') } catch { return [] } }

export const displayName = () => useSettings.getState().s.name.trim() || 'Writer'

/** Story data everyone shares — not notes (they sync one by one) or pictures (they stay on each device), as on the phone. */
function sharedExtras(x: ScriptExtras): string {
  const o = encodeExtras({
    ...x, comments: [], board: [],
    characters: x.characters.map(c => ({ ...c, photo: '' })), locations: x.locations.map(l => ({ ...l, photo: '' })),
    scenes: Object.fromEntries(Object.entries(x.scenes).map(([k, m]) => [k, { ...m, moods: [] }])),
  })
  return JSON.stringify(o)
}

/** Take the shared story data, keeping this device's own pictures and notes. */
function mergeRemote(local: ScriptExtras, remote: ScriptExtras): ScriptExtras {
  const scenes: ScriptExtras['scenes'] = {}
  for (const id of new Set([...Object.keys(remote.scenes), ...Object.keys(local.scenes)])) {
    const m = { ...(remote.scenes[id] ?? { threads: [], breakdown: {}, moods: [] }), moods: local.scenes[id]?.moods ?? [] }
    if (m.threads.length || m.moods.length || Object.values(m.breakdown).some(v => v?.length)) scenes[id] = m
  }
  return {
    ...remote, scenes, board: local.board, comments: local.comments,
    characters: remote.characters.map(r => ({ ...r, photo: local.characters.find(c => c.name === r.name)?.photo ?? '' })),
    locations: remote.locations.map(r => ({ ...r, photo: local.locations.find(l => l.name === r.name)?.photo ?? '' })),
  }
}

/** Remote elements don't carry the writer's own casing; keep ours where the text still matches. */
function keepCasing(local: readonly Element[], remote: Element[]): Element[] {
  const byId = new Map(local.map(e => [e.id, e]))
  return remote.map(r => {
    const l = byId.get(r.id)
    return l && l.orig != null && l.text === r.text ? { ...r, orig: l.orig } : r
  })
}

const sameEls = (a: readonly Element[], b: readonly Element[]) =>
  a.length === b.length && a.every((x, i) => {
    const y = b[i]
    return x.id === y.id && x.type === y.type && x.text === y.text && x.dual === y.dual && x.revision === y.revision && x.color === y.color && x.synopsis === y.synopsis
  })

interface CollabState {
  live: string[]
  status: LiveStatus | null
  peers: Peer[]
  changes: Change[]
  uid: string | null
  scriptId: string | null
  configured: () => boolean
  isLive: (id: string) => boolean
  /** Share the open script live (uploads it if it isn't shared yet). */
  goLive: () => void
  stopLive: () => void
  /** A new join code for the open script. */
  newCode: () => Promise<string>
  /** Join a script from a code or a pageone://join link; returns its id. */
  join: (text: string) => Promise<string>
  /** Called when a script opens or closes. */
  attach: (s: Script | null) => void
}

let session: LiveSession | null = null
let pushTimer: number | undefined
let pushing = false
let lastPushed: Script | null = null

function schedulePush() {
  if (!session) return
  pushing = true
  window.clearTimeout(pushTimer)
  pushTimer = window.setTimeout(() => {
    pushing = false
    const s = useDoc.getState().script
    if (!s || !session || s.id !== useCollab.getState().scriptId) return
    session.push(s.elements, s.title, s.titlePage)
    session.pushExtras(sharedExtras(s.extras), s.extras.comments)
    lastPushed = s
  }, 350)
}

function startSession(s: Script, server: ServerConfig) {
  session?.stop()
  const name = displayName()
  const set = useCollab.setState
  const sess = new LiveSession(server, s.id, name, colorFor(name + s.id), {
    hasLocalPending: () => pushing,
    onStatus: st => { if (session === sess) set({ status: st, uid: sess.uid }) },
    onPeers: peers => { if (session === sess) set({ peers }) },
    onChanges: changes => { if (session === sess) set({ changes }) },
    onRemoteElements: list => {
      const cur = useDoc.getState().script
      if (session !== sess || !cur || sameEls(cur.elements, list)) return
      const elements = keepCasing(cur.elements, list)
      lastPushed = { ...cur, elements }
      useDoc.getState().update(x => ({ ...x, elements }), { remote: true })
    },
    onRemoteMeta: (title, tp) => {
      const cur = useDoc.getState().script
      if (session !== sess || !cur || (JSON.stringify(cur.titlePage) === JSON.stringify(tp) && cur.title === title)) return
      useDoc.getState().update(x => ({ ...x, title: title || x.title, titlePage: tp }), { elementsChanged: false, remote: true })
    },
    onRemoteExtras: json => {
      const cur = useDoc.getState().script
      if (session !== sess || !cur) return
      let remote: ScriptExtras
      try { remote = decodeExtras(JSON.parse(json)) } catch { return }
      const merged = mergeRemote(cur.extras, remote)
      if (sharedExtras(merged) === sharedExtras(cur.extras)) return
      useDoc.getState().update(x => ({ ...x, extras: merged }), { elementsChanged: false, remote: true })
    },
    onRemoteComments: comments => {
      const cur = useDoc.getState().script
      if (session !== sess || !cur || JSON.stringify(cur.extras.comments) === JSON.stringify(comments)) return
      useDoc.getState().update(x => ({ ...x, extras: { ...x.extras, comments } }), { elementsChanged: false, remote: true })
    },
  })
  session = sess
  lastPushed = s
  set({ scriptId: s.id, status: { kind: 'connecting' }, peers: [], changes: [] })
  void sess.start(remoteHad => {
    if (remoteHad) return
    // First upload of a script nobody has shared yet: not "a change" in the history.
    const cur = useDoc.getState().script ?? s
    sess.push(cur.elements, cur.title, cur.titlePage, false)
    sess.pushExtras(sharedExtras(cur.extras), cur.extras.comments)
  })
}

export const useCollab = create<CollabState>((set, get) => ({
  live: readLive(), status: null, peers: [], changes: [], uid: null, scriptId: null,

  configured: () => isValid(currentServer()),
  isLive: id => get().live.includes(id),

  goLive: () => {
    const s = useDoc.getState().script
    if (!s) return
    const server = currentServer()
    if (!isValid(server)) { set({ status: { kind: 'error', message: 'Set up the live-sync server first (Settings › Co-writing).' } }); return }
    const live = [...new Set([...get().live, s.id])]
    localStorage.setItem(LIVE_KEY, JSON.stringify(live))
    set({ live })
    startSession(s, server)
  },

  stopLive: () => {
    const id = get().scriptId ?? useDoc.getState().script?.id
    session?.stop(); session = null
    const live = get().live.filter(x => x !== id)
    localStorage.setItem(LIVE_KEY, JSON.stringify(live))
    set({ live, status: null, peers: [], changes: [], scriptId: null })
  },

  newCode: async () => {
    const s = useDoc.getState().script
    if (!s) throw new Error('No script open')
    if (!get().isLive(s.id) || !session) get().goLive()
    return codeFor(currentServer(), s.id, s.title, displayName())
  },

  join: async text => {
    const code = findCode(text)
    if (!code) throw new Error("That doesn't look like a join code (it's 8 letters and numbers, like K7QP-X2MA).")
    const server = currentServer()
    if (!isValid(server)) throw new Error('Set up the live-sync server first (Settings › Co-writing).')
    const inv = await resolve(server, code)
    if (!inv) throw new Error('That code has expired or was never made. Ask for a new one.')
    let exists = true
    try { await loadScript(inv.scriptId) } catch { exists = false }
    if (!exists) {
      // A local shell with the shared id; the live session fills it in.
      const shell = newScript({ id: inv.scriptId, title: inv.title, elements: [el(newId(), 'SCENE_HEADING', '')], titlePage: titlePage({ title: inv.title }) })
      await saveScript(shell, 1)
    }
    const live = [...new Set([...get().live, inv.scriptId])]
    localStorage.setItem(LIVE_KEY, JSON.stringify(live))
    set({ live })
    return inv.scriptId
  },

  attach: s => {
    if (s && s.id === get().scriptId && session) return
    session?.stop(); session = null
    set({ status: null, peers: [], changes: [], scriptId: null })
    if (s && get().isLive(s.id) && isValid(currentServer())) startSession(s, currentServer())
  },
}))

// Follow the open script: connect when a live script opens, push local edits, share the cursor.
useDoc.subscribe((d, prev) => {
  if (d.script?.id !== prev.script?.id) useCollab.getState().attach(d.script)
  if (!session || !d.script || d.script.id !== useCollab.getState().scriptId) return
  if (d.currentId !== prev.currentId) session.setCursor(d.currentId)
  const s = d.script
  if (s === prev.script || d.lastChangeRemote) return
  const p = lastPushed
  if (!p || s.elements !== p.elements || s.title !== p.title || s.titlePage !== p.titlePage || s.extras !== p.extras) schedulePush()
})
