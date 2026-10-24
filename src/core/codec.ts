/**
 * The `.pageone` / library JSON format, key-for-key the same as the Android app's
 * `ScriptStore.encode/decode` and `ExtrasCodec`, so files move freely between phone and desktop.
 */
import {
  BREAKDOWN_CATEGORIES, el, emptyExtras, simpleTitlePage, titlePage, typeFromName, unlocked,
  type Attachment, type BreakdownCategory, type Comment, type Element, type Script, type ScriptExtras, type TitlePage,
} from './model'

type J = Record<string, unknown>
const str = (o: J, k: string, d = '') => (typeof o[k] === 'string' ? (o[k] as string) : o[k] == null ? d : String(o[k]))
const num = (o: J, k: string, d = 0) => (typeof o[k] === 'number' ? (o[k] as number) : typeof o[k] === 'string' && o[k] !== '' && !isNaN(+o[k]!) ? +(o[k] as string) : d)
const bool = (o: J, k: string, d = false) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d)
const arr = (o: J, k: string): J[] => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is J => !!x && typeof x === 'object') : [])
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x)) : [])
const obj = (o: J, k: string): J | null => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? (o[k] as J) : null)

// ---------------------------------------------------------------- title page

export const encodeTitlePage = (tp: TitlePage): J => ({
  v: 2, title: tp.title, credits: tp.credits.map(c => ({ role: c.role, names: c.names })),
  isAdaptation: tp.isAdaptation, sourceType: tp.sourceType, sourceTitle: tp.sourceTitle, sourceAuthor: tp.sourceAuthor,
  draft: tp.draft, draftDate: tp.draftDate, contactName: tp.contactName, email: tp.email, phone: tp.phone,
  address: tp.address, representation: tp.representation, copyright: tp.copyright, registration: tp.registration, notes: tp.notes,
})

export function decodeTitlePage(t: J, fallbackTitle: string): TitlePage {
  if (num(t, 'v', 1) < 2) {
    return simpleTitlePage({
      title: str(t, 'title', fallbackTitle), credit: str(t, 'credit', 'Written by'), author: str(t, 'author'),
      source: str(t, 'source'), draftDate: str(t, 'draftDate'), contact: str(t, 'contact'), notes: str(t, 'notes'),
    })
  }
  const credits = arr(t, 'credits').map(c => ({ role: str(c, 'role', 'Written by'), names: str(c, 'names') }))
  return titlePage({
    title: str(t, 'title', fallbackTitle), credits: credits.length ? credits : [{ role: 'Written by', names: '' }],
    isAdaptation: bool(t, 'isAdaptation'), sourceType: str(t, 'sourceType', 'novel'), sourceTitle: str(t, 'sourceTitle'),
    sourceAuthor: str(t, 'sourceAuthor'), draft: str(t, 'draft'), draftDate: str(t, 'draftDate'), contactName: str(t, 'contactName'),
    email: str(t, 'email'), phone: str(t, 'phone'), address: str(t, 'address'), representation: str(t, 'representation'),
    copyright: str(t, 'copyright'), registration: str(t, 'registration'), notes: str(t, 'notes'),
  })
}

// ---------------------------------------------------------------- extras

export const encodeComment = (c: Comment): J => ({
  id: c.id, e: c.elementId, s: c.start, x: c.end, q: c.quote, a: c.author, c: c.color, t: c.text, at: c.at, r: c.resolved,
  rp: c.replies.map(r => ({ a: r.author, c: r.color, t: r.text, at: r.at })),
  att: c.attachments.map(m => ({ f: m.file, k: m.kind, n: m.name, d: m.durationMs })),
})

export function decodeComment(o: J): Comment | null {
  const id = str(o, 'id')
  if (!id) return null
  return {
    id, elementId: num(o, 'e'), start: num(o, 's'), end: num(o, 'x'), quote: str(o, 'q'), author: str(o, 'a'),
    color: num(o, 'c', 0xFF4D9DFF), text: str(o, 't'), at: num(o, 'at'), resolved: bool(o, 'r'),
    replies: arr(o, 'rp').map(r => ({ author: str(r, 'a'), color: num(r, 'c', 0xFF4D9DFF), text: str(r, 't'), at: num(r, 'at') })),
    attachments: arr(o, 'att').flatMap((m): Attachment[] => {
      const k = str(m, 'k')
      return k === 'IMAGE' || k === 'AUDIO' || k === 'VIDEO' || k === 'LINK' ? [{ file: str(m, 'f'), kind: k, name: str(m, 'n'), durationMs: num(m, 'd') }] : []
    }),
  }
}

export function encodeExtras(x: ScriptExtras): J {
  const o: J = {}
  if (x.characters.length) o.chars = x.characters.map(c => ({
    n: c.name, role: c.role, age: c.age, want: c.want, need: c.need, arc: c.arc, voice: c.voice, bio: c.bio,
    photo: c.photo, tts: c.ttsVoice, pitch: c.pitch, rate: c.rate, cloud: c.cloudVoice,
  }))
  if (x.locations.length) o.locs = x.locations.map(l => ({ n: l.name, d: l.description, notes: l.notes, photo: l.photo }))
  if (x.threads.length) o.threads = x.threads.map(t => ({ id: t.id, n: t.name, c: t.color }))
  if (x.structure) o.structure = {
    t: x.structure.template, pages: x.structure.targetPages,
    beats: x.structure.beats.map(b => ({ id: b.id, n: b.name, d: b.description, f: b.target, act: b.act, s: b.sceneIds })),
  }
  const scenes: J = {}
  for (const [id, m] of Object.entries(x.scenes)) {
    const mo: J = {}
    if (m.threads.length) mo.th = m.threads
    const bd: J = {}
    for (const [k, v] of Object.entries(m.breakdown)) if (v && v.length) bd[k] = v
    if (Object.keys(bd).length) mo.bd = bd
    if (m.moods.length) mo.mood = m.moods
    if (Object.keys(mo).length) scenes[id] = mo
  }
  if (Object.keys(scenes).length) o.scenes = scenes
  if (x.board.length) o.board = x.board.map(m => ({ f: m.file, c: m.caption }))
  if (x.comments.length) o.comments = x.comments.map(encodeComment)
  if (x.lock.locked) o.lock = { at: x.lock.lockedAt, scenes: { ...x.lock.sceneNumbers }, pages: x.lock.pageStarts }
  if (x.deadline) {
    const d = x.deadline
    o.deadline = { date: d.date, pages: d.targetPages, start: d.startDate, startPages: d.startPages, label: d.label }
  }
  return o
}

const categories = new Set<string>(BREAKDOWN_CATEGORIES.map(c => c[0]))

export function decodeExtras(o: J | null): ScriptExtras {
  if (!o) return emptyExtras()
  const st = obj(o, 'structure')
  const so = obj(o, 'scenes')
  const lk = obj(o, 'lock')
  const dl = obj(o, 'deadline')
  return {
    characters: arr(o, 'chars').map(c => ({
      name: str(c, 'n'), role: str(c, 'role'), age: str(c, 'age'), want: str(c, 'want'), need: str(c, 'need'), arc: str(c, 'arc'),
      voice: str(c, 'voice'), bio: str(c, 'bio'), photo: str(c, 'photo'), ttsVoice: str(c, 'tts'),
      pitch: num(c, 'pitch', 1), rate: num(c, 'rate', 1), cloudVoice: str(c, 'cloud'),
    })),
    locations: arr(o, 'locs').map(l => ({ name: str(l, 'n'), description: str(l, 'd'), notes: str(l, 'notes'), photo: str(l, 'photo') })),
    threads: arr(o, 'threads').map(t => ({ id: str(t, 'id'), name: str(t, 'n'), color: num(t, 'c') })),
    structure: st && {
      template: str(st, 't'), targetPages: num(st, 'pages', 110),
      beats: arr(st, 'beats').map(b => ({
        id: str(b, 'id'), name: str(b, 'n'), description: str(b, 'd'), target: num(b, 'f'), act: num(b, 'act', 1),
        sceneIds: Array.isArray(b.s) ? (b.s as unknown[]).map(Number).filter(n => !isNaN(n)) : [],
      })),
    },
    scenes: so ? Object.fromEntries(Object.entries(so).flatMap(([k, v]) => {
      if (isNaN(Number(k)) || !v || typeof v !== 'object') return []
      const m = v as J
      const bdo = obj(m, 'bd')
      const breakdown: Partial<Record<BreakdownCategory, string[]>> = {}
      if (bdo) for (const [c, vals] of Object.entries(bdo)) if (categories.has(c)) breakdown[c as BreakdownCategory] = strings(vals)
      return [[k, { threads: strings(m.th), breakdown, moods: strings(m.mood) }]]
    })) : {},
    board: arr(o, 'board').map(m => ({ file: str(m, 'f'), caption: str(m, 'c') })),
    comments: arr(o, 'comments').map(decodeComment).filter((c): c is Comment => !!c),
    lock: lk ? {
      locked: true, lockedAt: num(lk, 'at'),
      sceneNumbers: Object.fromEntries(Object.entries(obj(lk, 'scenes') ?? {}).filter(([k]) => !isNaN(Number(k))).map(([k, v]) => [k, String(v)])),
      pageStarts: Array.isArray(lk.pages) ? (lk.pages as unknown[]).map(Number) : [],
    } : unlocked(),
    deadline: dl && { date: str(dl, 'date'), targetPages: num(dl, 'pages', 110), startDate: str(dl, 'start'), startPages: num(dl, 'startPages'), label: str(dl, 'label', 'First draft') },
  }
}

// ---------------------------------------------------------------- script

export function encodeScript(s: Script): J {
  return {
    format: 2, id: s.id, title: s.title, createdAt: s.createdAt, modifiedAt: s.modifiedAt,
    revisionMode: s.revisionMode, revisionLevel: s.revisionLevel, coverColor: s.coverColor, wordGoal: s.wordGoal,
    revDates: { ...s.revisionDates }, titlePage: encodeTitlePage(s.titlePage), extras: encodeExtras(s.extras),
    elements: s.elements.map(e => {
      const o: J = { i: e.id, t: e.type, x: e.text }
      if (e.dual) o.d = true
      if (e.revision !== 0) o.r = e.revision
      if (e.color !== 0) o.c = e.color
      if (e.synopsis) o.s = e.synopsis
      if (e.orig != null) o.o = e.orig
      if (e.by) { o.a = e.by; o.an = e.byName ?? ''; o.at = e.at }
      return o
    }),
  }
}

export function decodeScript(o: J): Script {
  const els: Element[] = arr(o, 'elements').map((e, i) => el(num(e, 'i', i + 1), typeFromName(str(e, 't')), str(e, 'x'), {
    dual: bool(e, 'd'), revision: num(e, 'r'), color: num(e, 'c'), synopsis: str(e, 's'), orig: 'o' in e ? str(e, 'o') : null,
    by: 'a' in e ? str(e, 'a') : null, byName: 'an' in e ? str(e, 'an') : null, at: num(e, 'at'),
  }))
  const title = str(o, 'title', 'Untitled')
  const id = str(o, 'id')
  if (!id) throw new Error('This file has no script id.')
  return {
    id, title,
    elements: els.length ? els : [el(1, 'SCENE_HEADING', '')],
    titlePage: decodeTitlePage(obj(o, 'titlePage') ?? {}, title),
    createdAt: num(o, 'createdAt', Date.now()), modifiedAt: num(o, 'modifiedAt', Date.now()),
    revisionMode: bool(o, 'revisionMode'), revisionLevel: num(o, 'revisionLevel', 1), coverColor: num(o, 'coverColor'),
    wordGoal: num(o, 'wordGoal'),
    revisionDates: Object.fromEntries(Object.entries(obj(o, 'revDates') ?? {}).filter(([k]) => !isNaN(Number(k))).map(([k, v]) => [k, String(v)])),
    extras: decodeExtras(obj(o, 'extras')),
  }
}

export const scriptToJson = (s: Script) => JSON.stringify(encodeScript(s))
export const scriptFromJson = (text: string) => decodeScript(JSON.parse(text) as J)
