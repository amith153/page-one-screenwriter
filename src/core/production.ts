/** Script X-ray data, production reports, sides, the production lock and the deadline planner (port of `core/Production.kt`). */
import { el, sceneOf, BREAKDOWN_CATEGORIES, type Deadline, type Element, type LockState, type Script } from './model'
import { characterNames, location as locationOf, scenes as scenesOf, stats } from './analysis'
import { characterName } from './formatting'
import { lineH, type Pagination } from './paginator'

// ---------------------------------------------------------------- scene geometry

export interface SceneX {
  index: number
  headingId: number
  label: string
  heading: string
  intExt: string
  location: string
  time: string
  lines: number
  eighths: number
  page: number
  speaking: string[]
  mentioned: string[]
  synopsis: string
  words: number
}

export function intExt(heading: string): string {
  const u = heading.trim().toUpperCase()
  if (u.startsWith('INT./EXT') || u.startsWith('INT/EXT') || u.startsWith('I/E') || u.startsWith('EXT./INT')) return 'INT/EXT'
  if (u.startsWith('INT')) return 'INT'
  if (u.startsWith('EXT')) return 'EXT'
  return ''
}

export function timeOfDay(heading: string): string {
  const u = heading.trim().toUpperCase()
  const all = [...u.matchAll(/\s[-–—]\s*/g)]
  const dash = all[all.length - 1]
  if (!dash) return ''
  return u.substring(dash.index! + dash[0].length).trim()
}

/** Lines each scene occupies on the printed page (blank spacing lines count towards the scene they sit in). */
export function sceneLines(elements: readonly Element[], p: Pagination): number[] {
  const sceneIdx: number[] = []
  let s = -1
  for (const e of elements) { if (e.type === 'SCENE_HEADING') s++; sceneIdx.push(s) }
  const n = s + 1
  const out = new Array<number>(Math.max(0, n)).fill(0)
  let cur = -1
  for (const pg of p.pages) for (const ln of pg.lines) {
    const seg = ln.segs.find(x => x.element >= 0)
    if (seg) cur = sceneIdx[seg.element]
    if (cur >= 0 && cur < n) out[cur] += lineH(ln)
  }
  return out
}

/** Page length in eighths, the way production measures it (a scene is never less than 1/8). */
export const eighths = (lines: number, lpp: number) => (lines <= 0 ? 0 : Math.max(1, Math.round(lines * 8 / lpp)))

export function formatEighths(e: number): string {
  const whole = Math.trunc(e / 8), rest = e % 8
  if (whole === 0) return `${rest}/8`
  if (rest === 0) return `${whole}`
  return `${whole} ${rest}/8`
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentions = (name: string, text: string) => new RegExp(`\\b${escapeRe(name)}\\b`).test(text)

export function xray(script: Script, p: Pagination, lpp: number): SceneX[] {
  const els = script.elements
  const scs = scenesOf(els)
  const lines = sceneLines(els, p)
  const labels = sceneLabels(els, script.extras.lock)
  const allNames = characterNames(els)
  return scs.map((sc, k) => {
    const speaking = new Set<string>()
    let action = ''
    for (let i = sc.elementIndex + 1; i < sc.endIndex; i++) {
      const e = els[i]
      if (e.type === 'CHARACTER') { const n = characterName(e.text); if (n) speaking.add(n) }
      if (e.type === 'ACTION') action += ' ' + e.text.toUpperCase()
    }
    const mentioned = allNames.filter(n => !speaking.has(n) && mentions(n, action))
    const ln = lines[k] ?? 0
    return {
      index: k, headingId: sc.elementId, label: labels.get(sc.elementId) ?? `${sc.number}`, heading: sc.heading,
      intExt: intExt(sc.heading), location: locationOf(sc.heading), time: timeOfDay(sc.heading), lines: ln,
      eighths: eighths(ln, lpp), page: (p.elementPage[sc.elementIndex] ?? 0) + 1,
      speaking: [...speaking], mentioned, synopsis: sc.synopsis, words: sc.words,
    }
  })
}

// ---------------------------------------------------------------- reports (CSV)

function csv(rows: string[][]): string {
  return rows.map(r => r.map(v => (/[,"\n]/.test(v) ? '"' + v.replaceAll('"', '""') + '"' : v)).join(',')).join('\r\n')
}

/** Each report as rows of cells, header first — for CSV and the PDF alike. */
export function scenesTable(script: Script, xs: SceneX[]): string[][] {
  const threads = new Map(script.extras.threads.map(t => [t.id, t]))
  return [['Scene', 'Page', 'INT/EXT', 'Location', 'Time', 'Length', 'Characters', 'Threads', 'Synopsis'],
    ...xs.map(x => [
      x.label, `${x.page}`, x.intExt, x.location, x.time, formatEighths(x.eighths),
      [...x.speaking, ...x.mentioned].join('; '),
      sceneOf(script.extras, x.headingId).threads.map(id => threads.get(id)?.name).filter(Boolean).join('; '),
      x.synopsis,
    ])]
}
export const scenesCsv = (script: Script, xs: SceneX[]) => csv(scenesTable(script, xs))

export interface CharacterRow { name: string; scenes: string[]; lines: number; words: number; first: number; last: number; eighths: number }

export function characterRows(script: Script, xs: SceneX[]): CharacterRow[] {
  const st = new Map(stats(script.elements).characters.map(c => [c.name, c]))
  return characterNames(script.elements).map(n => {
    const sc = xs.filter(x => x.speaking.includes(n) || x.mentioned.includes(n))
    const s = st.get(n)
    return {
      name: n, scenes: sc.map(x => x.label), lines: s?.cues ?? 0, words: s?.words ?? 0,
      first: sc.length ? Math.min(...sc.map(x => x.page)) : 0, last: sc.length ? Math.max(...sc.map(x => x.page)) : 0,
      eighths: sc.reduce((a, x) => a + x.eighths, 0),
    }
  }).sort((a, b) => b.lines - a.lines)
}

export const charactersTable = (rows: CharacterRow[]) => [
  ['Character', 'Speeches', 'Words', 'Scenes', 'Pages', 'First page', 'Last page', 'Scene list'],
  ...rows.map(r => [r.name, `${r.lines}`, `${r.words}`, `${r.scenes.length}`, formatEighths(r.eighths), `${r.first}`, `${r.last}`, r.scenes.join(' ')]),
]
export const charactersCsv = (rows: CharacterRow[]) => csv(charactersTable(rows))

export interface LocationRow { name: string; scenes: string[]; eighths: number; intExt: string[]; times: string[] }

export function locationRows(xs: SceneX[]): LocationRow[] {
  const groups = new Map<string, SceneX[]>()
  for (const x of xs) if (x.location) { const g = groups.get(x.location) ?? []; g.push(x); groups.set(x.location, g) }
  return [...groups.entries()].map(([loc, l]) => ({
    name: loc, scenes: l.map(x => x.label), eighths: l.reduce((a, x) => a + x.eighths, 0),
    intExt: [...new Set(l.map(x => x.intExt).filter(Boolean))], times: [...new Set(l.map(x => x.time).filter(Boolean))],
  })).sort((a, b) => b.eighths - a.eighths)
}

export const locationsTable = (rows: LocationRow[]) => [
  ['Location', 'Scenes', 'Pages', 'INT/EXT', 'Times', 'Scene list'],
  ...rows.map(r => [r.name, `${r.scenes.length}`, formatEighths(r.eighths), r.intExt.join('/'), r.times.join('; '), r.scenes.join(' ')]),
]
export const locationsCsv = (rows: LocationRow[]) => csv(locationsTable(rows))

export function breakdownTable(script: Script, xs: SceneX[]): string[][] {
  return [['Scene', 'Page', 'Length', 'Heading', ...BREAKDOWN_CATEGORIES.map(c => c[1])], ...xs.map(x => {
    const m = sceneOf(script.extras, x.headingId)
    const cast = [...new Set([...(m.breakdown.CAST ?? []), ...x.speaking])]
    return [x.label, `${x.page}`, formatEighths(x.eighths), x.heading,
      ...BREAKDOWN_CATEGORIES.map(([c]) => (c === 'CAST' ? cast : m.breakdown[c] ?? []).join('; '))]
  })]
}
export const breakdownCsv = (script: Script, xs: SceneX[]) => csv(breakdownTable(script, xs))

// ---------------------------------------------------------------- sides

/** Sides for an actor: only the scenes where any of names speaks, is mentioned or is cast in the breakdown. */
export function sides(script: Script, names: Set<string>): Script {
  const els = script.elements
  const keep: Element[] = []
  for (const sc of scenesOf(els)) {
    const slice = els.slice(sc.elementIndex, sc.endIndex)
    const speaks = slice.some(e => e.type === 'CHARACTER' && names.has(characterName(e.text)))
    const mentioned = slice.some(e => e.type === 'ACTION' && [...names].some(n => mentions(n, e.text.toUpperCase())))
    const cast = (sceneOf(script.extras, sc.elementId).breakdown.CAST ?? []).some(c => names.has(c.toUpperCase()))
    if (speaks || mentioned || cast) keep.push(...slice.filter(e => e.type !== 'NOTE'))
  }
  return { ...script, elements: keep.length ? keep : [el(1, 'ACTION', `No scenes for ${[...names].join(', ')}.`)] }
}

// ---------------------------------------------------------------- production lock

export function lock(elements: readonly Element[], p: Pagination): LockState {
  const numbers: Record<string, string> = {}
  let n = 0
  for (const e of elements) if (e.type === 'SCENE_HEADING') numbers[String(e.id)] = `${++n}`
  const starts: number[] = []
  for (const pg of p.pages.slice(1)) {
    for (const ln of pg.lines) {
      const seg = ln.segs.find(s => s.element >= 0)
      if (seg) { const e = elements[seg.element]; if (e) starts.push(e.id); break }
    }
  }
  return { locked: true, lockedAt: Date.now(), sceneNumbers: numbers, pageStarts: starts }
}

const letters = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letters(Math.trunc(i / 26) - 1) + String.fromCharCode(65 + (i % 26)))

function increment(s: string): string {
  const c = s.split('')
  for (let i = c.length - 1; i >= 0; i--) {
    if (c[i] < 'Z') { c[i] = String.fromCharCode(c[i].charCodeAt(0) + 1); return c.join('') }
    c[i] = 'A'
  }
  return 'A' + c.join('')
}

/** "12" → "12A", "12A" → "12B", "12Z" → "12AA". */
export function nextLabel(label: string): string {
  const digits = label.match(/^\d*/)![0]
  const tail = label.substring(digits.length)
  if (!tail || /[^\p{L}]/u.test(tail)) return label + 'A'
  return digits + increment(tail)
}

/** Scene labels: plain numbers when unlocked; locked numbers plus A/B/C for scenes added since. */
export function sceneLabels(elements: readonly Element[], lk: LockState): Map<number, string> {
  const out = new Map<number, string>()
  const heads = elements.filter(e => e.type === 'SCENE_HEADING')
  if (!lk.locked) { heads.forEach((h, i) => out.set(h.id, `${i + 1}`)); return out }
  const used = new Set(Object.values(lk.sceneNumbers))
  let last: string | null = null
  const firstLocked = heads.map(h => lk.sceneNumbers[String(h.id)]).find(Boolean) ?? '1'
  let prefix = 0
  for (const h of heads) {
    const locked = lk.sceneNumbers[String(h.id)]
    if (locked) { out.set(h.id, locked); last = locked; continue }
    let label: string
    if (last == null) {
      // Before the first locked scene: A1, B1…
      do { label = letters(prefix++) + firstLocked } while (used.has(label))
    } else {
      let cand = nextLabel(last)
      while (used.has(cand)) cand = nextLabel(cand)
      label = cand
    }
    used.add(label); out.set(h.id, label); last = label
  }
  return out
}

/** Element index → locked page number, for the paginator to start those pages on. */
export function forcedBreaks(elements: readonly Element[], lk: LockState): Map<number, number> {
  const out = new Map<number, number>()
  if (!lk.locked) return out
  const idx = new Map<number, number>()
  elements.forEach((e, i) => idx.set(e.id, i))
  lk.pageStarts.forEach((id, k) => { const i = idx.get(id); if (i !== undefined) out.set(i, k + 2) })
  return out
}

/** Printed page labels: 1, 2, 2A, 2B, 3, 4-5… */
export function pageLabels(p: Pagination): string[] {
  const n = Math.max(1, p.pages.length)
  const ln = p.lockNumbers
  if (ln.length === 0) return Array.from({ length: n }, (_, i) => `${i + 1}`)
  const out: string[] = []
  let base = 1, letter = -1
  for (let i = 0; i < n; i++) {
    const forced = ln[i] ?? 0
    if (i === 0 || forced > 0) { base = i === 0 && forced === 0 ? 1 : forced; letter = -1; out.push(`${base}`) }
    else { letter++; out.push(`${base}${letters(letter)}`) }
  }
  // A locked page whose content vanished is absorbed by the page before it: "4-5".
  for (let i = 0; i < n; i++) {
    let nextForced: number | null = null
    for (let k = i + 1; k < n; k++) if ((ln[k] ?? 0) > 0) { nextForced = ln[k]; break }
    const isSegmentEnd = i + 1 >= n || (ln[i + 1] ?? 0) > 0
    const m = out[i].match(/^\d+/)
    if (!m) continue
    const mine = parseInt(m[0], 10)
    if (isSegmentEnd && nextForced != null && nextForced > mine + 1 && /^\d+$/.test(out[i])) out[i] = `${mine}-${nextForced - 1}`
  }
  return out
}

/** Omit a scene in a locked script: keep its number, replace it with OMITTED. */
export function omitScene(elements: readonly Element[], headingId: number): Element[] {
  const start = elements.findIndex(e => e.id === headingId)
  if (start < 0) return [...elements]
  let end = start + 1
  while (end < elements.length && elements[end].type !== 'SCENE_HEADING') end++
  const head = { ...elements[start], text: 'OMITTED', synopsis: '', color: 0 }
  return [...elements.slice(0, start), head, ...elements.slice(end)]
}

// ---------------------------------------------------------------- deadline planner

export interface Plan {
  daysLeft: number; pagesLeft: number; pagesPerDay: number; expectedNow: number
  /** Positive = pages behind the straight-line plan; negative = ahead. */
  behind: number; status: string; overdue: boolean; done: boolean
}

const DAY = 86_400_000
const parseDay = (s: string): number | null => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null)
export const todayIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function plan(d: Deadline, currentPages: number, today = todayIso()): Plan {
  const t = parseDay(today)!
  const due = parseDay(d.date) ?? t
  const start = parseDay(d.startDate) ?? t
  const daysLeft = Math.round((due - t) / DAY)
  const total = Math.max(1, Math.round((due - start) / DAY))
  const elapsed = Math.min(total, Math.max(0, Math.round((t - start) / DAY)))
  const pagesLeft = Math.max(0, d.targetPages - currentPages)
  const expected = d.startPages + (d.targetPages - d.startPages) * (elapsed / total)
  const behind = expected - currentPages
  const perDay = daysLeft > 0 ? pagesLeft / daysLeft : pagesLeft
  const done = pagesLeft === 0
  const overdue = !done && daysLeft < 0
  const f = (x: number) => x.toFixed(1)
  const status = done ? `Target reached — ${d.label.toLowerCase()} is the length you planned`
    : overdue ? `${-daysLeft} day${daysLeft === -1 ? '' : 's'} past the deadline · ${pagesLeft} pages to go`
      : daysLeft === 0 ? `Due today · ${pagesLeft} page${pagesLeft === 1 ? '' : 's'} to go`
        : behind > 0.5 ? `${f(perDay)} pages/day to finish · ${f(behind)} pages behind plan`
          : behind < -0.5 ? `${f(perDay)} pages/day to finish · ${f(-behind)} pages ahead`
            : `${f(perDay)} pages/day to finish · right on plan`
  return { daysLeft, pagesLeft, pagesPerDay: perDay, expectedNow: expected, behind, status, overdue, done }
}
