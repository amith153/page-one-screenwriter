/**
 * Real-time co-editing over Cloud Firestore — a port of the phone's `collab/LiveSession.kt`,
 * with the same layout, so phone and desktop edit the same shared script together:
 *
 *   scripts/{scriptId}                      title, title page (json), story data (json), members
 *   scripts/{scriptId}/elements/{elementId} one document per screenplay element, ordered by "o"
 *   scripts/{scriptId}/comments/{id}        one document per note
 *   scripts/{scriptId}/changes/{id}         the change history
 *   scripts/{scriptId}/presence/{uid}       who is online and which element they're on
 *
 * Edits merge per element (last writer wins on the same element), so two people writing different
 * scenes — or different lines of one scene — never clash.
 */
import {
  collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch,
  type DocumentReference, type DocumentSnapshot, type Unsubscribe, type WriteBatch,
} from 'firebase/firestore'
import { el, TYPE_INFO, typeFromName, type Comment, type Element, type TitlePage } from '../core/model'
import { decodeComment, decodeTitlePage, encodeComment, encodeTitlePage } from '../core/codec'
import { assignOrder } from '../core/ordering'
import { firestore, uid as signIn, type ServerConfig } from './hub'

export interface Change { id: string; elementId: number; uid: string; name: string; color: number; kind: 'edit' | 'add' | 'delete' | 'format'; before: string; after: string; at: number }
export interface Peer { uid: string; name: string; color: number; elementId: number | null; lastSeen: number }
export type LiveStatus = { kind: 'connecting' } | { kind: 'live' } | { kind: 'error'; message: string }

export interface LiveCallbacks {
  hasLocalPending: () => boolean
  onStatus: (s: LiveStatus) => void
  onPeers: (p: Peer[]) => void
  onChanges: (c: Change[]) => void
  onRemoteElements: (els: Element[]) => void
  onRemoteMeta: (title: string, tp: TitlePage) => void
  onRemoteExtras: (json: string) => void
  onRemoteComments: (list: Comment[]) => void
}

const permissionHint = (e: unknown) => {
  const m = (e as Error)?.message ?? String(e)
  return /permission/i.test(m) ? "The live-sync server refused this script — check you're on the same server as your co-writer." : m
}

export class LiveSession {
  uid: string | null = null
  private regs: Unsubscribe[] = []
  private heartbeat: number | undefined
  private stopped = false
  private known = new Map<number, Element>()
  private knownOrder = new Map<number, number>()
  private knownMeta: string | null = null
  private knownExtras: string | null = null
  private knownComments = new Map<string, string>()
  private ready = false
  private cursor: number | null = null
  private lastPresenceAt = 0
  private bursts = new Map<number, { docId: string; before: string; kind: Change['kind']; lastAt: number }>()
  private readonly db

  private readonly config: ServerConfig
  private readonly scriptId: string
  private readonly myName: string
  private readonly myColor: number
  private readonly cb: LiveCallbacks

  constructor(config: ServerConfig, scriptId: string, myName: string, myColor: number, cb: LiveCallbacks) {
    this.config = config; this.scriptId = scriptId; this.myName = myName; this.myColor = myColor; this.cb = cb
    this.db = firestore(config)
  }

  private ref = () => doc(this.db, 'scripts', this.scriptId)
  private fail = (e: unknown) => this.cb.onStatus({ kind: 'error', message: permissionHint(e) })

  /** Connect. onReady gets whether the shared script already had content. */
  async start(onReady: (remoteHadContent: boolean) => void) {
    this.cb.onStatus({ kind: 'connecting' })
    try { this.uid = await signIn(this.config) } catch (e) {
      return this.cb.onStatus({ kind: 'error', message: "Couldn't start live co-writing. Check your connection and the server settings. (" + ((e as Error).message ?? e) + ')' })
    }
    if (this.stopped) return
    const me = this.uid
    const ref = this.ref()
    setDoc(ref, { members: { [me]: this.myName }, updatedAt: serverTimestamp() }, { merge: true }).catch(this.fail)

    // Wait (briefly) for the server's copy before deciding who is the source of truth.
    const readyTimer = window.setTimeout(() => { if (!this.ready) { this.ready = true; onReady(this.known.size > 0) } }, 8000)

    this.regs.push(onSnapshot(collection(ref, 'elements'), { includeMetadataChanges: true }, snap => {
      this.known.clear(); this.knownOrder.clear()
      for (const d of snap.docs) {
        const e = parseElement(d)
        if (!e) continue
        this.known.set(e.id, e)
        this.knownOrder.set(e.id, Number(d.get('o') ?? 0))
      }
      if (!this.ready) {
        if (snap.metadata.fromCache && this.known.size === 0) return
        this.ready = true
        window.clearTimeout(readyTimer)
        this.cb.onStatus({ kind: 'live' })
        onReady(this.known.size > 0)
      } else if (!snap.metadata.fromCache) this.cb.onStatus({ kind: 'live' })
      if (this.known.size && !this.cb.hasLocalPending()) this.cb.onRemoteElements(this.currentRemote())
    }, this.fail))

    this.regs.push(onSnapshot(ref, snap => {
      if (!snap.exists()) return
      const ex = snap.get('ex') as string | undefined
      if (ex != null && ex !== this.knownExtras) { this.knownExtras = ex; this.cb.onRemoteExtras(ex) }
      const tpJson = snap.get('tp') as string | undefined
      if (tpJson == null) return
      const title = (snap.get('title') as string) ?? ''
      const key = title + '\u0000' + tpJson
      if (key === this.knownMeta) return
      this.knownMeta = key
      try { this.cb.onRemoteMeta(title, decodeTitlePage(JSON.parse(tpJson), title)) } catch { /* unreadable */ }
    }, () => {}))

    this.regs.push(onSnapshot(query(collection(ref, 'changes'), orderBy('at', 'desc'), limit(250)), snap => {
      this.cb.onChanges(snap.docs.flatMap((d): Change[] => {
        const e = d.get('e')
        if (e == null) return []
        return [{
          id: d.id, elementId: Number(e), uid: d.get('u') ?? '', name: d.get('n') ?? 'Co-writer', color: Number(d.get('c') ?? 0xFF4D9DFF),
          kind: d.get('k') ?? 'edit', before: d.get('b') ?? '', after: d.get('a') ?? '', at: Number(d.get('at') ?? 0),
        }]
      }))
    }, () => {}))

    this.regs.push(onSnapshot(collection(ref, 'comments'), snap => {
      this.knownComments.clear()
      const list = snap.docs.flatMap(d => {
        const json = d.get('j') as string | undefined
        if (!json) return []
        this.knownComments.set(d.id, json)
        try { const c = decodeComment(JSON.parse(json)); return c ? [c] : [] } catch { return [] }
      })
      this.cb.onRemoteComments(list.sort((a, b) => a.at - b.at))
    }, () => {}))

    this.regs.push(onSnapshot(collection(ref, 'presence'), snap => {
      const now = Date.now()
      this.cb.onPeers(snap.docs.flatMap(d => {
        if (d.id === me) return []
        const at = Number(d.get('at') ?? 0)
        if (now - at > 90_000) return []
        const e = d.get('e')
        return [{ uid: d.id, name: d.get('n') ?? 'Co-writer', color: Number(d.get('c') ?? 0xFF4D9DFF), elementId: e == null ? null : Number(e), lastSeen: at }]
      }))
    }, () => {}))

    this.writePresence(true)
    this.heartbeat = window.setInterval(() => this.writePresence(true), 25_000)
  }

  private currentRemote(): Element[] {
    return [...this.known.values()].sort((a, b) => (this.knownOrder.get(a.id) ?? 0) - (this.knownOrder.get(b.id) ?? 0) || a.id - b.id)
  }

  /** Write story data and notes that differ from the shared copy. */
  pushExtras(extrasJson: string, comments: Comment[]) {
    if (!this.uid || this.stopped) return
    const ref = this.ref()
    const batch = writeBatch(this.db)
    let any = false
    if (extrasJson !== this.knownExtras) { this.knownExtras = extrasJson; batch.set(ref, { ex: extrasJson }, { merge: true }); any = true }
    const ids = new Set<string>()
    for (const c of comments) {
      ids.add(c.id)
      const json = JSON.stringify(encodeComment(c))
      if (this.knownComments.get(c.id) === json) continue
      this.knownComments.set(c.id, json)
      batch.set(doc(ref, 'comments', c.id), { j: json, at: c.at }); any = true
    }
    for (const gone of [...this.knownComments.keys()].filter(k => !ids.has(k))) {
      this.knownComments.delete(gone)
      batch.delete(doc(ref, 'comments', gone)); any = true
    }
    if (any) batch.commit().catch(this.fail)
  }

  /** Write whatever differs between elements and the shared copy. */
  push(elements: readonly Element[], title: string, tp: TitlePage, log = true) {
    const me = this.uid
    if (!me || this.stopped) return
    const ref = this.ref()
    const orders = assignOrder(elements.map(e => e.id), this.knownOrder)
    const ops: ((b: WriteBatch) => void)[] = []
    for (const e of elements) {
      const o = orders.get(e.id)!
      const k = this.known.get(e.id)
      if (k && sameElement(k, e) && this.knownOrder.get(e.id) === o) continue
      const data = { t: e.type, x: e.text, d: e.dual, r: e.revision, c: e.color, s: e.synopsis, o, by: me, at: serverTimestamp() }
      const d = doc(ref, 'elements', String(e.id))
      ops.push(b => b.set(d, data))
      if (log) this.logChange(ref, ops, e.id, k ?? null, e)
      this.known.set(e.id, e); this.knownOrder.set(e.id, o)
    }
    const ids = new Set(elements.map(e => e.id))
    for (const gone of [...this.known.keys()].filter(id => !ids.has(id))) {
      const d = doc(ref, 'elements', String(gone))
      ops.push(b => b.delete(d))
      if (log) this.logChange(ref, ops, gone, this.known.get(gone) ?? null, null)
      this.known.delete(gone); this.knownOrder.delete(gone)
    }
    const tpJson = JSON.stringify(encodeTitlePage(tp))
    const metaKey = title + '\u0000' + tpJson
    if (metaKey !== this.knownMeta) {
      this.knownMeta = metaKey
      ops.push(b => b.set(ref, { title, tp: tpJson, updatedAt: serverTimestamp() }, { merge: true }))
    }
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(this.db)
      ops.slice(i, i + 450).forEach(op => op(batch))
      batch.commit().catch(this.fail)
    }
  }

  /** Record (or extend) a history entry for one element. */
  private logChange(ref: DocumentReference, ops: ((b: WriteBatch) => void)[], id: number, prev: Element | null, now: Element | null) {
    const me = this.uid
    if (!me) return
    const kind: Change['kind'] | null = !prev && now ? 'add' : !now ? 'delete' : prev!.text !== now.text ? 'edit' : prev!.type !== now.type ? 'format' : null
    if (!kind) return // colour / revision / order only — not worth a history entry
    const t = Date.now()
    const burst = this.bursts.get(id)
    const continuing = burst && t - burst.lastAt < 120_000 && kind !== 'delete'
    let docId: string, before: string, effective: Change['kind']
    if (continuing) {
      burst.lastAt = t
      ;({ docId, before } = burst); effective = burst.kind
    } else {
      docId = crypto.randomUUID()
      before = kind === 'format' ? TYPE_INFO[prev!.type].label : kind === 'add' ? '' : prev?.text ?? ''
      effective = kind
      this.bursts.set(id, { docId, before, kind, lastAt: t })
    }
    const after = !now ? '' : effective === 'format' ? TYPE_INFO[now.type].label : now.text
    const data = { e: id, u: me, n: this.myName, c: this.myColor, k: effective, b: before, a: after, at: t }
    const d = doc(ref, 'changes', docId)
    ops.push(b => b.set(d, data))
  }

  /** Tell co-writers where you are. Throttled. */
  setCursor(elementId: number | null) {
    if (elementId === this.cursor) return
    this.cursor = elementId
    this.writePresence(false)
  }

  private writePresence(force: boolean) {
    const me = this.uid
    if (!me || this.stopped) return
    const now = Date.now()
    if (!force && now - this.lastPresenceAt < 1500) return
    this.lastPresenceAt = now
    const data: Record<string, unknown> = { n: this.myName, c: this.myColor, at: now }
    if (this.cursor != null) data.e = this.cursor
    setDoc(doc(this.ref(), 'presence', me), data).catch(() => {})
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    window.clearInterval(this.heartbeat)
    this.regs.forEach(r => r())
    this.regs = []
    if (this.uid) deleteDoc(doc(this.ref(), 'presence', this.uid)).catch(() => {})
  }
}

const sameElement = (a: Element, b: Element) =>
  a.type === b.type && a.text === b.text && a.dual === b.dual && a.revision === b.revision && a.color === b.color && a.synopsis === b.synopsis

export function parseElement(d: DocumentSnapshot): Element | null {
  const id = Number(d.id)
  if (!Number.isFinite(id)) return null
  return el(id, typeFromName(d.get('t')), d.get('x') ?? '', {
    dual: !!d.get('d'), revision: Number(d.get('r') ?? 0), color: Number(d.get('c') ?? 0), synopsis: d.get('s') ?? '',
  })
}
