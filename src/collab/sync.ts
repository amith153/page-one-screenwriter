/**
 * Keeping one writer's phone and computer the same (the desktop side of the phone's `collab/Sync.kt`).
 * Both devices join one private "sync space" on the live-sync server, found with an 8-letter pairing
 * code, and keep these in it:
 *
 *   scripts/sync-{space}                      pf: your name, daily goal and accent (json)
 *   scripts/sync-{space}/lib/{scriptId}       one line per project: title, pages, words, when it last changed
 *   scripts/sync-{space}/days/{yyyy-MM-dd}    words written that day, per device: d.{deviceId}
 *   scripts/sync-{space}/sprints/{startAt}    finished writing sprints
 *
 * The projects' own lines live where live co-writing keeps them (scripts/{scriptId}/elements…), so an
 * open project is live between your devices like a shared one, and the library entry says which
 * projects exist and which copy is newer. Nothing here needs a Firestore rule beyond `scripts/**`.
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, serverTimestamp, setDoc, writeBatch, type Unsubscribe, type WriteBatch,
} from 'firebase/firestore'
import { decodeComment, decodeExtras, decodeTitlePage, encodeComment, encodeTitlePage } from '../core/codec'
import { assignOrder } from '../core/ordering'
import type { Comment, Element, Script, ScriptExtras, TitlePage } from '../core/model'
import type { ScriptMeta } from '../state/library'
import { firestore, uid, type ServerConfig } from './hub'
import { parseElement } from './live'
import { sharedExtras } from './extras'

export const SPACE_PREFIX = 'sync-'

export const newSpaceId = (): string => {
  const r = new Uint8Array(12)
  crypto.getRandomValues(r)
  return SPACE_PREFIX + [...r].map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface RemoteEntry {
  id: string; title: string; author: string; modifiedAt: number; createdAt: number
  pages: number; scenes: number; words: number; coverColor: number; logline: string; deleted: boolean
}

export interface RemotePrefs { name: string; goal: number; accent: string; at: number }
export interface RemoteSprint { at: number; minutes: number; words: number; goal: number; script: string }

const space = (c: ServerConfig, id: string) => doc(firestore(c), 'scripts', id)

/** Make the space (first device) — safe to call again. */
export async function createSpace(c: ServerConfig, id: string) {
  await uid(c)
  await setDoc(space(c, id), { sync: true, updatedAt: serverTimestamp() }, { merge: true })
}

/** Check the space is there before adopting it from a pairing code. */
export async function spaceExists(c: ServerConfig, id: string): Promise<boolean> {
  await uid(c)
  try { return (await getDoc(space(c, id))).exists() } catch { return true }
}

// ---------------------------------------------------------------- library

export const toEntry = (m: ScriptMeta): RemoteEntry => ({
  id: m.id, title: m.title, author: m.author, modifiedAt: m.modifiedAt, createdAt: m.createdAt, pages: m.pages,
  scenes: m.scenes, words: m.words, coverColor: m.coverColor, logline: m.logline, deleted: false,
})

export async function putEntry(c: ServerConfig, sp: string, e: RemoteEntry) {
  await uid(c)
  await setDoc(doc(space(c, sp), 'lib', e.id), {
    t: e.title, a: e.author, m: e.modifiedAt, cr: e.createdAt, p: e.pages, sc: e.scenes, w: e.words, c: e.coverColor, l: e.logline, d: e.deleted,
  })
}

export async function putGone(c: ServerConfig, sp: string, id: string) {
  await uid(c)
  await setDoc(doc(space(c, sp), 'lib', id), { t: '', a: '', m: Date.now(), cr: 0, p: 0, sc: 0, w: 0, c: 0, l: '', d: true })
}

function readEntry(d: { id: string; get: (f: string) => unknown }): RemoteEntry {
  return {
    id: d.id, title: String(d.get('t') ?? ''), author: String(d.get('a') ?? ''), modifiedAt: Number(d.get('m') ?? 0), createdAt: Number(d.get('cr') ?? 0),
    pages: Number(d.get('p') ?? 0), scenes: Number(d.get('sc') ?? 0), words: Number(d.get('w') ?? 0), coverColor: Number(d.get('c') ?? 0),
    logline: String(d.get('l') ?? ''), deleted: Boolean(d.get('d')),
  }
}

export function watchLibrary(c: ServerConfig, sp: string, on: (list: RemoteEntry[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(collection(space(c, sp), 'lib'), snap => on(snap.docs.map(readEntry)), onError)
}

// ---------------------------------------------------------------- the writing log

export async function putDay(c: ServerConfig, sp: string, device: string, day: string, words: number) {
  await uid(c)
  await setDoc(doc(space(c, sp), 'days', day), { d: { [device]: words } }, { merge: true })
}

/** What every device writes per day, as {day: {deviceId: words}}. */
export function watchDays(c: ServerConfig, sp: string, on: (days: Record<string, Record<string, number>>) => void): Unsubscribe {
  return onSnapshot(collection(space(c, sp), 'days'), snap => {
    const out: Record<string, Record<string, number>> = {}
    for (const d of snap.docs) {
      const m = d.get('d') as Record<string, unknown> | undefined
      if (m) out[d.id] = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number(v) || 0]))
    }
    on(out)
  }, () => {})
}

export async function putSprint(c: ServerConfig, sp: string, s: RemoteSprint) {
  await uid(c)
  await setDoc(doc(space(c, sp), 'sprints', String(s.at)), { at: s.at, m: s.minutes, w: s.words, g: s.goal, s: s.script })
}

export function watchSprints(c: ServerConfig, sp: string, on: (list: RemoteSprint[]) => void): Unsubscribe {
  return onSnapshot(collection(space(c, sp), 'sprints'), snap => on(snap.docs.map(d => ({
    at: Number(d.get('at') ?? d.id), minutes: Number(d.get('m') ?? 0), words: Number(d.get('w') ?? 0), goal: Number(d.get('g') ?? 0), script: String(d.get('s') ?? ''),
  }))), () => {})
}

// ---------------------------------------------------------------- preferences

export async function putPrefs(c: ServerConfig, sp: string, p: RemotePrefs) {
  await uid(c)
  await setDoc(space(c, sp), { pf: JSON.stringify(p) }, { merge: true })
}

export function watchPrefs(c: ServerConfig, sp: string, on: (p: RemotePrefs) => void): Unsubscribe {
  return onSnapshot(space(c, sp), snap => {
    const j = snap.get('pf') as string | undefined
    if (!j) return
    try {
      const o = JSON.parse(j) as Partial<RemotePrefs>
      on({ name: String(o.name ?? ''), goal: Number(o.goal ?? 0), accent: String(o.accent ?? ''), at: Number(o.at ?? 0) })
    } catch { /* unreadable */ }
  }, () => {})
}

// ---------------------------------------------------------------- whole scripts

export interface RemoteScript { elements: Element[]; title: string; tp: TitlePage | null; extras: ScriptExtras | null; comments: Comment[] }

/** Read a script's shared copy once (a project that isn't open, so no live session is running for it). */
export async function fetchScript(c: ServerConfig, id: string): Promise<RemoteScript | null> {
  await uid(c)
  const ref = doc(firestore(c), 'scripts', id)
  const [els, head, notes] = await Promise.all([getDocs(collection(ref, 'elements')), getDoc(ref), getDocs(collection(ref, 'comments'))])
  const order = new Map<number, number>()
  const elements: Element[] = []
  for (const d of els.docs) {
    const e = parseElement(d)
    if (!e) continue
    elements.push(e); order.set(e.id, Number(d.get('o') ?? 0))
  }
  if (!elements.length) return null
  elements.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) || a.id - b.id)
  const title = (head.get('title') as string | undefined) ?? ''
  let tp: TitlePage | null = null
  try { const j = head.get('tp') as string | undefined; if (j) tp = decodeTitlePage(JSON.parse(j), title) } catch { /* unreadable */ }
  let extras: ScriptExtras | null = null
  try { const j = head.get('ex') as string | undefined; if (j) extras = decodeExtras(JSON.parse(j)) } catch { /* unreadable */ }
  const comments = notes.docs.flatMap(d => {
    try { const x = decodeComment(JSON.parse(d.get('j') as string)); return x ? [x] : [] } catch { return [] }
  }).sort((a, b) => a.at - b.at)
  return { elements, title, tp, extras, comments }
}

/** Write a whole script as the shared copy: its lines, title page, story data and notes. Resolves once the server has it. */
export async function uploadScript(c: ServerConfig, s: Script, name: string) {
  const me = await uid(c)
  const db = firestore(c)
  const ref = doc(db, 'scripts', s.id)
  const [els, notes] = await Promise.all([getDocs(collection(ref, 'elements')), getDocs(collection(ref, 'comments'))])
  const known = new Map<number, number>()
  for (const d of els.docs) known.set(Number(d.id), Number(d.get('o') ?? 0))
  const orders = assignOrder(s.elements.map(e => e.id), known)
  const ops: ((b: WriteBatch) => void)[] = []
  for (const e of s.elements) {
    ops.push(b => b.set(doc(ref, 'elements', String(e.id)), {
      t: e.type, x: e.text, d: e.dual, r: e.revision, c: e.color, s: e.synopsis, o: orders.get(e.id)!, by: me, at: serverTimestamp(),
    }))
  }
  const ids = new Set(s.elements.map(e => String(e.id)))
  for (const d of els.docs) if (!ids.has(d.id)) ops.push(b => b.delete(d.ref))
  ops.push(b => b.set(ref, {
    members: { [me]: name }, title: s.title, tp: JSON.stringify(encodeTitlePage(s.titlePage)), ex: sharedExtras(s.extras), updatedAt: serverTimestamp(),
  }, { merge: true }))
  const have = new Set(s.extras.comments.map(x => x.id))
  for (const x of s.extras.comments) ops.push(b => b.set(doc(ref, 'comments', x.id), { j: JSON.stringify(encodeComment(x)), at: x.at }))
  for (const d of notes.docs) if (!have.has(d.id)) ops.push(b => b.delete(d.ref))
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db)
    ops.slice(i, i + 450).forEach(op => op(batch))
    await batch.commit()
  }
}
