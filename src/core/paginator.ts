/**
 * Industry-standard screenplay pagination (port of `core/Paginator.kt`).
 *
 * Horizontal positions are in "columns" (characters of 12pt Courier = 1/10 inch), measured from
 * the 1.5" left margin. A full-width line is 60 columns (6.0"). A page holds a fixed number of
 * 12pt lines (6 per inch).
 */
import { TYPE_INFO, type Element, type ElementType } from './model'
import { contd as autoContd } from './analysis'
import { pageLabels } from './production'

export type PaperSize = 'LETTER' | 'A4'
export const PAPER: Record<PaperSize, { label: string; widthPt: number; heightPt: number }> = {
  LETTER: { label: 'US Letter', widthPt: 612, heightPt: 792 },
  A4: { label: 'A4', widthPt: 595, heightPt: 842 },
}
/** Body lines per page with a 1" top margin and 0.75" bottom margin. */
export const linesPerPage = (p: PaperSize) => Math.floor((PAPER[p].heightPt - 72 - 54) / 12)

export type Align = 'LEFT' | 'RIGHT' | 'CENTER'
export interface TypeSpec { indent: number; width: number; spaceBefore: number; align: Align }

export interface LayoutOptions {
  paper: PaperSize
  sceneSpacing: number // blank lines before scene headings
  autoContd: boolean
  moreContd: boolean // split dialogue across pages with (MORE)/(CONT'D)
}
export const defaultLayout = (): LayoutOptions => ({ paper: 'LETTER', sceneSpacing: 1, autoContd: true, moreContd: true })

export const FULL_WIDTH = 60

const spec = (indent: number, width: number, spaceBefore: number, align: Align = 'LEFT'): TypeSpec => ({ indent, width, spaceBefore, align })

export function specOf(type: ElementType, opts: LayoutOptions): TypeSpec {
  switch (type) {
    case 'SCENE_HEADING': return spec(0, 60, opts.sceneSpacing)
    case 'ACTION': return spec(0, 60, 1)
    case 'CHARACTER': return spec(22, 38, 1)
    case 'PARENTHETICAL': return spec(16, 25, 0)
    case 'DIALOGUE': return spec(10, 35, 0)
    case 'LYRICS': return spec(10, 35, 0)
    case 'TRANSITION': return spec(0, 60, 1, 'RIGHT')
    case 'SHOT': return spec(0, 60, 1)
    case 'CENTERED': return spec(0, 60, 1, 'CENTER')
    case 'NOTE': return spec(0, 60, 1)
  }
}

/** Dual dialogue column specs. right = second speaker. */
export function dualSpec(type: ElementType, right: boolean): TypeSpec {
  const base = right ? 31 : 0
  if (type === 'CHARACTER') return spec(base + 8, 20, 0)
  if (type === 'PARENTHETICAL') return spec(base + 4, 22, 0)
  return spec(base, 28, 0)
}

export interface Seg { text: string; col: number; type: ElementType; element: number; revision: number }
/** h: the line's height in printed lines (1 = 1/6"). Scripts that stack marks above and below the letters need more. */
export interface PLine { segs: Seg[]; h?: number }
export const lineH = (l: PLine) => l.h ?? 1
const heightOf = (lines: readonly PLine[]) => lines.reduce((n, l) => n + lineH(l), 0)
/** How many of lines fit, from the top, in room printed lines. */
const fitting = (lines: readonly PLine[], room: number) => {
  let used = 0, k = 0
  while (k < lines.length && used + lineH(lines[k]) <= room + 1e-6) used += lineH(lines[k++])
  return k
}
export interface PageLayout { lines: PLine[] }
export interface Pagination {
  pages: PageLayout[]
  elementPage: number[]
  /** Locked scripts: per page, the locked page number it begins (0 = an A-page continuation). Empty when unlocked. */
  lockNumbers: number[]
  /** Printed page labels ("12", "12A", "4-5"). */
  labels: string[]
}
export const pageCount = (p: Pagination) => Math.max(1, p.pages.length)
export const pageLabel = (p: Pagination, page: number) => p.labels[page] ?? `${page + 1}`

// ---------------------------------------------------------------- text measuring

const INDIC = (cp: number) => (cp >= 0x0900 && cp <= 0x0DFF) || (cp >= 0x0E00 && cp <= 0x0EFF) || (cp >= 0x0F00 && cp <= 0x109F)
const isIndic = (cp: number) => INDIC(cp) || cp === 0x200C || cp === 0x200D
/** The virama (halant) of each Indic script sits at offset 0x4D in its block. */
const isVirama = (cp: number) => cp >= 0x0900 && cp <= 0x0DFF && (cp & 0x7F) === 0x4D
const zeroWidth = /^[\p{Mn}\p{Me}\p{Cf}]$/u
const spacingMark = /^\p{Mc}$/u

/**
 * Real measurements of printed text, installed by the app once its fonts are on hand (see
 * io/measure.ts). Without one — in tests, or before a script's font has loaded — the estimates
 * below stand in.
 */
export interface Measurer {
  /** Columns s fills when printed: Courier runs one a character, other scripts their drawn width. */
  cells(s: string): number | null
  /** Printed lines s needs so its marks don't reach into the lines above and below. */
  height(s: string): number | null
}
let measurer: Measurer | null = null
export const setMeasurer = (m: Measurer | null) => { measurer = m }

/** How many Courier columns s fills when printed. */
export function cells(s: string): number {
  return measurer?.cells(s) ?? estimateCells(s)
}

/** Printed lines a line of text needs: 1 for Latin, more where marks stack above and below. */
export function lineHeight(s: string): number {
  return measurer?.height(s) ?? (tall(s) ? 1.5 : 1)
}

/**
 * The estimate, where nothing can measure: Latin text is one column per character. Indic text
 * is narrower than its character count: vowel signs and other marks sit on the letter, and a
 * consonant after a virama mostly tucks under the one before it.
 */
export function estimateCells(s: string): number {
  let n = 0
  let afterVirama = false
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    if (!isIndic(cp)) { n += 1; afterVirama = false; continue }
    if (zeroWidth.test(ch)) { /* no width */ }
    else if (spacingMark.test(ch)) n += 0.5
    else n += afterVirama ? 0.4 : 1
    afterVirama = isVirama(cp)
  }
  return n
}

/** Scripts whose letters stack marks above and below the line need a taller printed line. */
export function tall(s: string): boolean {
  for (const ch of s) if (INDIC(ch.codePointAt(0)!)) return true
  return false
}

/** Splits a line into runs: [text, isIndic]. Spaces stay with the run before them. */
export function runs(s: string): [string, boolean][] {
  const out: [string, boolean][] = []
  let cur = ''
  let curIndic = false
  for (const ch of s) {
    const indic = isIndic(ch.codePointAt(0)!)
    const joins = ch === ' ' || indic === curIndic
    if (cur && !joins) { out.push([cur, curIndic]); cur = '' }
    if (!cur) curIndic = indic
    cur += ch
  }
  if (cur) out.push([cur, curIndic])
  return out
}

export function endsSentence(s: string): boolean {
  const t = s.trimEnd().replace(/["”'’)]+$/, '')
  return t.endsWith('.') || t.endsWith('?') || t.endsWith('!') || t.endsWith('--') || t.endsWith('…')
}

const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
/** The longest start of a word that fits in width columns, never splitting a letter from its marks. */
function fitPrefix(w: string, width: number): string {
  const parts = graphemes ? [...graphemes.segment(w)].map(g => g.segment) : [...w]
  let head = parts[0] ?? ''
  for (let k = 1; k < parts.length; k++) {
    const next = head + parts[k]
    if (cells(next) > width + 0.001) break
    head = next
  }
  return head
}

export function wrap(text: string, width: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    if (!para) { out.push(''); continue }
    let line = ''
    let used = 0
    for (let w of para.split(' ')) {
      // hard-break words longer than the line
      while (cells(w) > width + 0.001) {
        if (line) { out.push(line); line = ''; used = 0 }
        const head = fitPrefix(w, width)
        out.push(head); w = w.substring(head.length)
      }
      const ww = cells(w)
      if (!line) { line = w; used = ww }
      else if (used + 1 + ww <= width + 0.001) { line += ' ' + w; used += 1 + ww }
      else { out.push(line); line = w; used = ww }
    }
    out.push(line)
  }
  return out
}

// ---------------------------------------------------------------- paginator

function withHeight(ln: PLine): PLine {
  const h = Math.max(1, ...ln.segs.map(x => lineHeight(x.text)))
  return h > 1 ? { ...ln, h } : ln
}

type Kind = 'HEADING' | 'ACTION' | 'DIALOGUE' | 'DUAL' | 'OTHER'

interface Block {
  kind: Kind
  lines: PLine[]
  spaceBefore: number
  firstElement: number
  /** For dialogue: index (into lines) where character cue lines end. */
  cueLines: number
  /** For dialogue: per line, can we split *after* this line? */
  splitAfter: boolean[]
  /** For dialogue: per line, does a sentence end here (the preferred place to break a speech)? */
  sentenceAfter: boolean[]
  cueText: string
  revision: number
}

const block = (kind: Kind, lines: PLine[], spaceBefore: number, firstElement: number, extra: Partial<Block> = {}): Block => ({
  kind, lines, spaceBefore, firstElement, cueLines: 0,
  splitAfter: new Array(lines.length).fill(false), sentenceAfter: new Array(lines.length).fill(false), cueText: '', revision: 0, ...extra,
})

export class Paginator {
  private readonly L: number
  private readonly opts: LayoutOptions
  constructor(opts: LayoutOptions) { this.opts = opts; this.L = linesPerPage(opts.paper) }

  /** forced: element index → locked page number that must begin at that element (see Locking). */
  paginate(elements: readonly Element[], forced: Map<number, number> = new Map()): Pagination {
    const L = this.L
    const contd = this.opts.autoContd ? autoContd(elements) : new Array(elements.length).fill(false)
    const blocks = this.buildBlocks(elements, contd)
    const pages: PageLayout[] = []
    const elementPage = new Array<number>(elements.length).fill(-1)
    let cur: PLine[] = []
    const lockNos: number[] = []
    let curLock = forced.size === 0 ? 0 : 1

    const flush = () => { pages.push({ lines: cur }); lockNos.push(curLock); cur = []; used = 0; curLock = 0 }
    let used = 0
    const remaining = () => L - used
    const place = (lines: PLine[]) => {
      for (const ln of lines) {
        for (const s of ln.segs) if (s.element >= 0 && elementPage[s.element] < 0) elementPage[s.element] = pages.length
        cur.push(ln)
        used += lineH(ln)
      }
    }
    const push = (ln: PLine) => { cur.push(ln); used += lineH(ln) }
    const placeSpace = (n: number) => { if (cur.length) for (let k = 0; k < n; k++) if (used + 1 <= L) push({ segs: [] }) }

    let bi = 0
    while (bi < blocks.length) {
      const b = blocks[bi]
      // Locked script: this block began a page when it was locked, so it still does.
      const n = forced.get(b.firstElement)
      if (n !== undefined) { if (cur.length) flush(); curLock = n }
      const sb = cur.length === 0 ? 0 : b.spaceBefore
      const need = sb + heightOf(b.lines)

      // Keep headings with at least two lines of what follows.
      let keepExtra = 0
      if (b.kind === 'HEADING' && bi + 1 < blocks.length) {
        const nx = blocks[bi + 1]
        keepExtra = nx.spaceBefore + heightOf(nx.lines.slice(0, 2))
      }

      if (need + keepExtra <= remaining()) { placeSpace(sb); place(b.lines); bi++; continue }

      // Doesn't fit: try to split.
      const room = remaining() - sb
      const split = b.kind === 'ACTION' ? this.actionSplit(b, room)
        : b.kind === 'DIALOGUE' ? (this.opts.moreContd ? this.dialogueSplit(b, room - 1) : -1) : -1
      if (split > 0) {
        placeSpace(sb)
        place(b.lines.slice(0, split))
        if (b.kind === 'DIALOGUE') push({ segs: [{ text: '(MORE)', col: 22, type: 'CHARACTER', element: -1, revision: 0 }] })
        flush()
        if (b.kind === 'DIALOGUE') {
          const cue = b.cueText.replace(/\s*\(CONT['’]D\)/gi, '') + " (CONT'D)"
          push({ segs: [{ text: cue, col: 22, type: 'CHARACTER', element: -1, revision: b.revision }] })
        }
        place(b.lines.slice(split))
        bi++
        continue
      }

      if (cur.length === 0) {
        // Bigger than a whole page: force-split at the page boundary.
        const fit = Math.max(1, fitting(b.lines, L))
        place(b.lines.slice(0, fit))
        if (fit < b.lines.length) { flush(); place(b.lines.slice(fit)) }
        bi++
        continue
      }
      flush()
    }
    if (cur.length || pages.length === 0) flush()
    // Elements that produced no lines (notes, empties) inherit the previous page.
    let last = 0
    for (let i = 0; i < elementPage.length; i++) { if (elementPage[i] < 0) elementPage[i] = last; else last = elementPage[i] }
    const lockNumbers = forced.size === 0 ? [] : lockNos
    const p: Pagination = { pages, elementPage, lockNumbers, labels: [] }
    p.labels = pageLabels(p)
    return p
  }

  private actionSplit(b: Block, room: number): number {
    if (b.lines.length < 4) return -1
    const hi = Math.min(fitting(b.lines, room), b.lines.length - 2)
    if (hi < 2) return -1
    // Fill the page: break as low as allowed, but prefer the end of a sentence within two lines.
    for (let k = hi; k >= Math.max(2, hi - 2); k--) {
      const seg = b.lines[k - 1].segs[0]
      if (seg && endsSentence(seg.text)) return k
    }
    return hi
  }

  private dialogueSplit(b: Block, room: number): number {
    // The cue stays with at least 2 lines of speech, at least 2 lines carry over, never break
    // right after a parenthetical; prefer a sentence end within two lines of the lowest break.
    const hi = Math.min(fitting(b.lines, room), b.lines.length - 2)
    const lo = b.cueLines + 2
    let best = -1
    for (let k = hi; k >= lo; k--) if (b.splitAfter[k - 1]) { best = k; break }
    if (best < 0) return -1
    for (let k = best; k >= Math.max(lo, best - 2); k--) if (b.splitAfter[k - 1] && b.sentenceAfter[k - 1]) return k
    return best
  }

  private linesFor(text: string, sp: TypeSpec, type: ElementType, index: number, revision: number): PLine[] {
    const raw = text === '' ? [''] : wrap(text, sp.width)
    return raw.map(s => {
      const w = Math.ceil(cells(s) - 0.001)
      const col = sp.align === 'LEFT' ? sp.indent
        : sp.align === 'RIGHT' ? Math.max(0, sp.indent + sp.width - w)
          : sp.indent + Math.max(0, Math.trunc((sp.width - w) / 2))
      return withHeight({ segs: [{ text: s, col, type, element: index, revision }] })
    })
  }

  private buildBlocks(elements: readonly Element[], contd: boolean[]): Block[] {
    const out: Block[] = []
    let i = 0
    while (i < elements.length) {
      const e = elements[i]
      if (!TYPE_INFO[e.type].printed) { i++; continue }
      if (e.type === 'CHARACTER') {
        const end = this.dialogueEnd(elements, i)
        // Is the next block a dual-dialogue partner?
        if (end < elements.length && elements[end].type === 'CHARACTER' && elements[end].dual) {
          const end2 = this.dialogueEnd(elements, end)
          out.push(this.dualBlock(elements, i, end, end2))
          i = end2
          continue
        }
        out.push(this.dialogueBlock(elements, i, end, contd))
        i = end
        continue
      }
      const sp = specOf(e.type, this.opts)
      const lines = this.linesFor(e.text, sp, e.type, i, e.revision)
      const kind: Kind = e.type === 'SCENE_HEADING' || e.type === 'SHOT' ? 'HEADING' : e.type === 'ACTION' ? 'ACTION' : 'OTHER'
      out.push(block(kind, lines, sp.spaceBefore, i))
      i++
    }
    return out
  }

  private dialogueEnd(elements: readonly Element[], start: number): number {
    let j = start + 1
    while (j < elements.length) {
      const t = elements[j].type
      if (t === 'DIALOGUE' || t === 'PARENTHETICAL' || t === 'LYRICS' || t === 'NOTE') j++
      else break
    }
    return j
  }

  private cueText(e: Element, contd: boolean): string {
    const t = e.text.replaceAll('^', '').trim()
    return contd ? `${t} (CONT'D)` : t
  }

  private dialogueBlock(elements: readonly Element[], start: number, end: number, contd: boolean[]): Block {
    const lines: PLine[] = []
    const splitAfter: boolean[] = []
    const sentenceAfter: boolean[] = []
    const cue = this.cueText(elements[start], contd[start])
    const cueLines = this.linesFor(cue, specOf('CHARACTER', this.opts), 'CHARACTER', start, elements[start].revision)
    lines.push(...cueLines)
    cueLines.forEach(() => { splitAfter.push(false); sentenceAfter.push(false) })
    for (let j = start + 1; j < end; j++) {
      const e = elements[j]
      if (!TYPE_INFO[e.type].printed) continue
      const ls = this.linesFor(e.text, specOf(e.type, this.opts), e.type, j, e.revision)
      ls.forEach((ln, k) => {
        lines.push(ln)
        const lastOfElement = k === ls.length - 1
        const sentence = ln.segs[0] ? endsSentence(ln.segs[0].text) : false
        // Any line of a speech is a legal break; the last line only if more follows. Never after a parenthetical.
        const ok = (e.type === 'DIALOGUE' || e.type === 'LYRICS') ? (!lastOfElement || j + 1 < end) : false
        splitAfter.push(ok)
        sentenceAfter.push(sentence)
      })
    }
    const sp = specOf('CHARACTER', this.opts).spaceBefore
    return block('DIALOGUE', lines, sp, start, { cueLines: cueLines.length, splitAfter, sentenceAfter, cueText: cue, revision: elements[start].revision })
  }

  private dualBlock(elements: readonly Element[], s1: number, e1: number, e2: number): Block {
    const column = (start: number, end: number, right: boolean): Seg[] => {
      const segs: Seg[] = []
      for (let j = start; j < end; j++) {
        const e = elements[j]
        if (!TYPE_INFO[e.type].printed) continue
        const sp = dualSpec(e.type, right)
        const text = e.type === 'CHARACTER' ? this.cueText(e, false) : e.text
        for (const s of wrap(text || ' ', sp.width)) segs.push({ text: s, col: sp.indent, type: e.type, element: j, revision: e.revision })
      }
      return segs
    }
    const left = column(s1, e1, false)
    const right = column(e1, e2, true)
    const n = Math.max(left.length, right.length)
    const lines: PLine[] = []
    for (let k = 0; k < n; k++) lines.push(withHeight({ segs: [left[k], right[k]].filter(Boolean) as Seg[] }))
    return block('DUAL', lines, 1, s1)
  }
}
