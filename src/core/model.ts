/**
 * Core screenplay data model. A one-to-one port of the Android app's `core/Model.kt` and
 * `core/Story.kt`, so both apps read and write the same files and lay out the same pages.
 */

export const ELEMENT_TYPES = [
  'SCENE_HEADING', 'ACTION', 'CHARACTER', 'PARENTHETICAL', 'DIALOGUE',
  'TRANSITION', 'SHOT', 'LYRICS', 'CENTERED', 'NOTE',
] as const
export type ElementType = (typeof ELEMENT_TYPES)[number]

export interface TypeInfo { label: string; shortLabel: string; allCaps: boolean; printed: boolean }

export const TYPE_INFO: Record<ElementType, TypeInfo> = {
  SCENE_HEADING: { label: 'Scene Heading', shortLabel: 'Scene', allCaps: true, printed: true },
  ACTION: { label: 'Action', shortLabel: 'Action', allCaps: false, printed: true },
  CHARACTER: { label: 'Character', shortLabel: 'Character', allCaps: true, printed: true },
  PARENTHETICAL: { label: 'Parenthetical', shortLabel: 'Paren', allCaps: false, printed: true },
  DIALOGUE: { label: 'Dialogue', shortLabel: 'Dialogue', allCaps: false, printed: true },
  TRANSITION: { label: 'Transition', shortLabel: 'Trans', allCaps: true, printed: true },
  SHOT: { label: 'Shot', shortLabel: 'Shot', allCaps: true, printed: true },
  LYRICS: { label: 'Lyrics', shortLabel: 'Lyrics', allCaps: false, printed: true },
  CENTERED: { label: 'Centered', shortLabel: 'Center', allCaps: false, printed: true },
  NOTE: { label: 'Note', shortLabel: 'Note', allCaps: false, printed: false },
}

/** Whether a line of this type prints in bold, given the writer's bold settings. */
export const boldType = (t: ElementType, o: { boldHeadings?: boolean; boldCharacters?: boolean }) =>
  (t === 'SCENE_HEADING' && !!o.boldHeadings) || (t === 'CHARACTER' && !!o.boldCharacters)

export const isDialogueBlockPart = (t: ElementType) =>
  t === 'CHARACTER' || t === 'PARENTHETICAL' || t === 'DIALOGUE' || t === 'LYRICS'

export const typeFromName = (name: string | null | undefined): ElementType =>
  (ELEMENT_TYPES as readonly string[]).includes(name ?? '') ? (name as ElementType) : 'ACTION'

/** Industry-standard revision colours, in order. Level 0 means "original / unrevised". */
export const REVISION_COLORS: { label: string; hex: string }[] = [
  { label: 'White', hex: '#FFFFFF' },
  { label: 'Blue', hex: '#6EA8FE' },
  { label: 'Pink', hex: '#F48FB1' },
  { label: 'Yellow', hex: '#FFE066' },
  { label: 'Green', hex: '#81C784' },
  { label: 'Goldenrod', hex: '#E0B040' },
  { label: 'Buff', hex: '#E8D3A9' },
  { label: 'Salmon', hex: '#FF9E80' },
  { label: 'Cherry', hex: '#E57373' },
]

/** Colours a writer can tag a scene / index card with. 0 = none. */
export const SCENE_COLORS: string[] = [
  'transparent', '#E57373', '#FFB74D', '#FFE066', '#81C784',
  '#4DD0E1', '#6EA8FE', '#B39DDB', '#F48FB1', '#A1887F',
]

export interface Element {
  readonly id: number
  readonly type: ElementType
  readonly text: string
  /** On a CHARACTER element: this dialogue block is the right half of a dual-dialogue pair. */
  readonly dual: boolean
  /** Revision level (index into REVISION_COLORS); 0 = unrevised. */
  readonly revision: number
  /** Scene headings only: index into SCENE_COLORS. */
  readonly color: number
  /** Scene headings only: one-line synopsis shown on index cards / navigator. */
  readonly synopsis: string
  /** The writer's own casing, kept while the text is shown in capitals. */
  readonly orig: string | null
  /** Who last changed this line: an install's random author id, the name it wrote under, and when. */
  readonly by: string | null
  readonly byName: string | null
  readonly at: number
}

export function el(id: number, type: ElementType, text: string, extra: Partial<Element> = {}): Element {
  return { id, type, text, dual: false, revision: 0, color: 0, synopsis: '', orig: null, by: null, byName: null, at: 0, ...extra }
}

/** The text as the writer typed it (before any all-caps conversion). */
export const plainText = (e: Element) => (e.orig != null && e.orig.toUpperCase() === e.text ? e.orig : e.text)

/** This element as [type]: capitals for all-caps types (remembering the casing), the original casing otherwise. */
export function retyped(e: Element, type: ElementType): Element {
  const base = plainText(e)
  if (TYPE_INFO[type].allCaps) {
    const up = base.toUpperCase()
    return { ...e, type, text: up, orig: base !== up ? base : null }
  }
  return { ...e, type, text: base, orig: null }
}

export interface Credit { role: string; names: string }

export interface TitlePage {
  title: string
  credits: Credit[]
  isAdaptation: boolean
  sourceType: string
  sourceTitle: string
  sourceAuthor: string
  draft: string
  draftDate: string
  contactName: string
  email: string
  phone: string
  address: string
  representation: string
  copyright: string
  registration: string
  notes: string
}

export const CREDIT_ROLES = ['Written by', 'Screenplay by', 'Story by', 'Teleplay by', 'Created by', 'Adapted by']
export const SOURCE_TYPES = ['novel', 'short story', 'play', 'article', 'comic', 'film', 'book', 'true events', 'other']

export function titlePage(p: Partial<TitlePage> = {}): TitlePage {
  return {
    title: '', credits: [{ role: 'Written by', names: '' }], isAdaptation: false, sourceType: 'novel',
    sourceTitle: '', sourceAuthor: '', draft: '', draftDate: '', contactName: '', email: '', phone: '',
    address: '', representation: '', copyright: '', registration: '', notes: '', ...p,
  }
}

/** All writer names, for lists and search. */
export const authorOf = (tp: TitlePage) =>
  [...new Set(tp.credits.map(c => c.names.trim()).filter(Boolean))].join(' / ')

/** "Based on the novel “Dune” by Frank Herbert" — or empty. */
export function basedOnLine(tp: TitlePage): string {
  if (!tp.isAdaptation) return ''
  const t = tp.sourceTitle.trim(), a = tp.sourceAuthor.trim()
  if (!t && !a) return ''
  const kind = tp.sourceType.trim()
  let s = 'Based on'
  if (kind && kind !== 'other') s += (kind.startsWith('true') ? ' ' : ' the ') + kind
  if (t) s += kind === 'other' ? ` ${t}` : ` “${t}”`
  if (a) s += ` by ${a}`
  return s
}

const nonEmptyLines = (s: string) => s.split('\n').map(l => l.trim()).filter(Boolean)

/** Lines for the bottom-left contact block. */
export function contactLines(tp: TitlePage): string[] {
  const out: string[] = []
  if (tp.contactName.trim()) out.push(tp.contactName.trim())
  out.push(...nonEmptyLines(tp.address))
  if (tp.phone.trim()) out.push(tp.phone.trim())
  if (tp.email.trim()) out.push(tp.email.trim())
  if (tp.representation.trim()) { out.push(''); out.push(...nonEmptyLines(tp.representation)) }
  return out
}

/** Build from the simple fields older files and Fountain/FDX use. */
export function simpleTitlePage(o: {
  title: string; credit: string; author: string; source?: string; draftDate?: string
  contact?: string; notes?: string; copyright?: string
}): TitlePage {
  const src = (o.source ?? '').trim()
  return titlePage({
    title: o.title,
    credits: [{ role: o.credit.trim() || 'Written by', names: o.author }],
    isAdaptation: src.length > 0,
    sourceType: 'other',
    sourceTitle: src.replace(/^Based on/, '').trim(),
    draftDate: o.draftDate ?? '',
    address: o.contact ?? '',
    notes: o.notes ?? '',
    copyright: o.copyright ?? '',
  })
}

// ---------------------------------------------------------------- story data (Story.kt)

export interface CharacterProfile {
  name: string; role: string; age: string; want: string; need: string; arc: string; voice: string; bio: string
  photo: string; ttsVoice: string; pitch: number; rate: number; cloudVoice: string
}
export const characterProfile = (name: string, p: Partial<CharacterProfile> = {}): CharacterProfile => ({
  name, role: '', age: '', want: '', need: '', arc: '', voice: '', bio: '', photo: '', ttsVoice: '', pitch: 1, rate: 1, cloudVoice: '', ...p,
})

export interface LocationProfile { name: string; description: string; notes: string; photo: string }

/** An A/B/C storyline. color indexes SCENE_COLORS. */
export interface PlotThread { id: string; name: string; color: number }

export interface Beat { id: string; name: string; description: string; target: number; act: number; sceneIds: number[] }
export interface Structure { template: string; beats: Beat[]; targetPages: number }

export const BREAKDOWN_CATEGORIES = [
  ['CAST', 'Cast'], ['EXTRAS', 'Extras'], ['PROPS', 'Props'], ['WARDROBE', 'Wardrobe'], ['MAKEUP', 'Hair & make-up'],
  ['VEHICLES', 'Vehicles'], ['SFX', 'Special effects'], ['SOUND', 'Sound & music'], ['SET', 'Set dressing'], ['ANIMALS', 'Animals'],
] as const
export type BreakdownCategory = (typeof BREAKDOWN_CATEGORIES)[number][0]

export interface SceneMeta {
  threads: string[]
  breakdown: Partial<Record<BreakdownCategory, string[]>>
  moods: string[]
}
export const emptySceneMeta = (): SceneMeta => ({ threads: [], breakdown: {}, moods: [] })
export const sceneMetaEmpty = (m: SceneMeta) =>
  m.threads.length === 0 && Object.values(m.breakdown).every(v => !v || v.length === 0) && m.moods.length === 0

export interface MoodImage { file: string; caption: string }
export interface Reply { author: string; color: number; text: string; at: number }
export type AttachmentKind = 'IMAGE' | 'AUDIO' | 'VIDEO' | 'LINK'
export interface Attachment { file: string; kind: AttachmentKind; name: string; durationMs: number }

/** A note pinned to a range of text, with a thread of replies. */
export interface Comment {
  id: string; elementId: number; start: number; end: number; quote: string; author: string; color: number
  text: string; at: number; resolved: boolean; replies: Reply[]; attachments: Attachment[]
}

export interface LockState { locked: boolean; lockedAt: number; sceneNumbers: Record<string, string>; pageStarts: number[] }
export const unlocked = (): LockState => ({ locked: false, lockedAt: 0, sceneNumbers: {}, pageStarts: [] })

/** "Finish by" plan for this script. Dates are yyyy-MM-dd. */
export interface Deadline { date: string; targetPages: number; startDate: string; startPages: number; label: string }

export interface ScriptExtras {
  characters: CharacterProfile[]
  locations: LocationProfile[]
  threads: PlotThread[]
  structure: Structure | null
  /** Keyed by scene-heading id. */
  scenes: Record<string, SceneMeta>
  board: MoodImage[]
  comments: Comment[]
  lock: LockState
  deadline: Deadline | null
}
export const emptyExtras = (): ScriptExtras => ({
  characters: [], locations: [], threads: [], structure: null, scenes: {}, board: [], comments: [], lock: unlocked(), deadline: null,
})

export const sceneOf = (x: ScriptExtras, id: number): SceneMeta => x.scenes[String(id)] ?? emptySceneMeta()

export function withScene(x: ScriptExtras, id: number, m: SceneMeta): ScriptExtras {
  const scenes = { ...x.scenes }
  if (sceneMetaEmpty(m)) delete scenes[String(id)]; else scenes[String(id)] = m
  return { ...x, scenes }
}

/** Drop per-scene data for scenes that no longer exist. */
export function pruneExtras(x: ScriptExtras, elements: readonly Element[]): ScriptExtras {
  const heads = new Set(elements.filter(e => e.type === 'SCENE_HEADING').map(e => String(e.id)))
  const keys = Object.keys(x.scenes)
  const kept = keys.filter(k => heads.has(k))
  const beatsChanged = x.structure?.beats.some(b => b.sceneIds.some(id => !heads.has(String(id)))) ?? false
  if (kept.length === keys.length && !beatsChanged) return x
  return {
    ...x,
    scenes: Object.fromEntries(kept.map(k => [k, x.scenes[k]])),
    structure: x.structure && {
      ...x.structure,
      beats: x.structure.beats.map(b => ({ ...b, sceneIds: b.sceneIds.filter(id => heads.has(String(id))) })),
    },
  }
}

/** Find a comment's current range in text: its stored range if the quote is still there, else the quote's new position. */
export function commentRange(c: Comment, text: string): [number, number] | null {
  if (!c.quote) return null
  if (c.start >= 0 && c.end <= text.length && c.start < c.end && text.startsWith(c.quote, c.start)) return [c.start, c.end]
  const i = text.indexOf(c.quote)
  return i >= 0 ? [i, i + c.quote.length] : null
}

export interface Script {
  id: string
  title: string
  elements: Element[]
  titlePage: TitlePage
  createdAt: number
  modifiedAt: number
  revisionMode: boolean
  /** The revision level new edits are marked with when revisionMode is on. */
  revisionLevel: number
  coverColor: number
  wordGoal: number
  /** Revision sets: level → the date it was issued ("2026-10-18"). */
  revisionDates: Record<string, string>
  extras: ScriptExtras
}

export function newScript(p: Partial<Script> & { id: string; title: string; elements: Element[] }): Script {
  const now = Date.now()
  return {
    titlePage: titlePage({ title: p.title }), createdAt: now, modifiedAt: now, revisionMode: false, revisionLevel: 1,
    coverColor: 0, wordGoal: 0, revisionDates: {}, extras: emptyExtras(), ...p,
  }
}

/**
 * Element ids. Random 52-bit values (as on the phone) so two co-writers creating elements at
 * the same time can never collide. 52 bits fit exactly in a JavaScript number.
 */
export function newId(): number {
  const a = new Uint32Array(2)
  crypto.getRandomValues(a)
  const v = (a[0] & 0xFFFFF) * 0x100000000 + a[1]
  return Math.max(v, 1_000_000)
}

export function uuid(): string {
  return crypto.randomUUID()
}

const wordRe = /[\p{L}\p{N}'’]+/gu
export const countWords = (s: string) => (s.match(wordRe)?.length ?? 0)
