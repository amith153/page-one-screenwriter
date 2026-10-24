/**
 * Industry-format PDF, drawn line by line from the paginator's output — so the PDF, the page
 * view and the phone's export all break pages in the same places. Courier Prime 12 pt, with a
 * Noto face embedded for each other script the screenplay uses.
 */
// fontkit's Indic and Arabic shapers are transpiled generators that expect this global.
import 'regenerator-runtime/runtime'
import { PDFDocument, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import regularUrl from '../assets/fonts/courier_prime.ttf?url'
import boldUrl from '../assets/fonts/courier_prime_bold.ttf?url'
import { basedOnLine, boldType, contactLines, REVISION_COLORS, type Script } from '../core/model'
import { PAPER, specOf, defaultLayout, lineH, type Pagination, type PaperSize, type Seg } from '../core/paginator'
import { fontRuns, isRtl, scriptOf, SCRIPT_FONTS, type ScriptFont } from './scriptFonts'

export interface PdfOptions {
  sceneNumbers: boolean
  titlePage: boolean
  watermark: string
  /** 0–1; how strongly the watermark shows. */
  watermarkOpacity?: number
  boldHeadings: boolean
  boldCharacters?: boolean
  /** Only the pages that carry revisions (for issuing coloured revision pages). */
  revisedOnly?: boolean
  /** Scene-heading id → printed number (locked numbers included). */
  sceneLabels: Map<number, string>
  paper: PaperSize
}

const IN = 72
const LINE = 12
const COL = 7.2
const LEFT = 1.5 * IN

/** A bundled font file. A failed load is forgotten, so the next export tries again. */
async function fontFile(url: string): Promise<ArrayBuffer> {
  let r: Response
  try { r = await fetch(url) } catch { throw new Error("couldn't load the screenplay font. Restart Page One and try again.") }
  if (!r.ok) throw new Error(`couldn't load the screenplay font (${r.status}).`)
  return r.arrayBuffer()
}

let fontBytes: Promise<[ArrayBuffer, ArrayBuffer]> | null = null
const loadFonts = () => (fontBytes ??= Promise.all([fontFile(regularUrl), fontFile(boldUrl)])
  .then(b => { padSubsetGlyphs(b[0]); return b }, e => { fontBytes = null; throw e }))

/**
 * fontkit's TrueType subsetter writes the short loca format (offsets halved) without padding
 * glyphs to an even length, so every glyph after an odd-length composite comes out garbled —
 * most of Arabic, Telugu and Sinhala. Pad each glyph to four bytes, as the format expects.
 */
let padded = false
function padSubsetGlyphs(anyTtf: ArrayBuffer) {
  if (padded) return
  padded = true
  const proto = Object.getPrototypeOf(fontkit.create(new Uint8Array(anyTtf)).createSubset())
  const addGlyph = proto._addGlyph
  proto._addGlyph = function (this: { glyf: Uint8Array[]; offset: number }, gid: number) {
    const i: number = addGlyph.call(this, gid)
    const g = this.glyf[i]
    const extra = (4 - (g.length % 4)) % 4
    if (extra) {
      const out = new (g.constructor as new (n: number) => Uint8Array)(g.length + extra)
      out.fill(0)
      out.set(g)
      this.glyf[i] = out
      this.offset += extra
    }
    return i
  }
}

/** Characters neither Courier Prime nor a bundled script font can draw (Chinese, Japanese…): the system print path handles those. */
export function unsupportedText(script: Script): boolean {
  const printable = (cp: number) =>
    cp <= 0x024F || (cp >= 0x2000 && cp <= 0x206F) || (cp >= 0x20A0 && cp <= 0x20CF) || (cp >= 0x2100 && cp <= 0x214F) ||
    cp === 0x25CC || (cp >= 0x1CD0 && cp <= 0x1CFF) || scriptOf(cp) !== null || /\p{M}/u.test(String.fromCodePoint(cp))
  return script.elements.some(e => [...e.text].some(ch => !printable(ch.codePointAt(0)!)))
}

/** The bundled scripts that appear anywhere in [all] (a screenplay's text and title page, a report…). */
function scriptsUsed(all: string): ScriptFont[] {
  return SCRIPT_FONTS.filter(sf => sf.blocks.some(([a, b]) => { for (const ch of all) { const cp = ch.codePointAt(0)!; if (cp >= a && cp <= b) return true } return false }))
}

const scriptBytes = new Map<string, Promise<ArrayBuffer>>()
const loadScriptFont = (url: string) => {
  let p = scriptBytes.get(url)
  if (!p) { p = fontFile(url).catch(e => { scriptBytes.delete(url); throw e }); scriptBytes.set(url, p) }
  return p
}

const hexRgb = (hex: string) => rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)

function sanitize(s: string, font: PDFFont): string {
  let out = ''
  for (const ch of s) {
    try { font.encodeText(ch); out += ch } catch { out += '?' }
  }
  return out
}

interface Run { t: string; f: PDFFont; w: number }

const ink = rgb(0.08, 0.08, 0.08)

/** Courier Prime (regular and bold) plus a Noto face for each other script in [all], set at [size] points. */
async function typeset(doc: PDFDocument, all: string, size = 12) {
  const [reg, bold] = await loadFonts()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(reg, { subset: true })
  const fontBold = await doc.embedFont(bold, { subset: true })
  const scriptFaces = new Map<string, PDFFont>()
  for (const sf of scriptsUsed(all)) {
    const [r, b] = await Promise.all([loadScriptFont(sf.regular), loadScriptFont(sf.bold)])
    scriptFaces.set(sf.id, await doc.embedFont(r, { subset: true, features: sf.features }))
    scriptFaces.set(sf.id + ':b', await doc.embedFont(b, { subset: true, features: sf.features }))
  }
  const col = COL * (size / 12)
  /** Courier runs advance one column a character; script runs by their own measured width. */
  const layout = (s: string, f: PDFFont): Run[] => {
    const isBold = f === fontBold
    const runs = fontRuns(s).map(([t, sc]): Run => {
      const face = sc ? scriptFaces.get(sc.id + (isBold ? ':b' : '')) : undefined
      if (!face) return { t, f, w: [...t].length * col }
      // A run fontkit can't shape is left blank rather than failing the whole export.
      try { return { t, f: face, w: face.widthOfTextAtSize(t, size) } } catch { return { t: '', f: face, w: [...t].length * col } }
    })
    return isRtl(s) ? runs.reverse() : runs
  }
  const measure = (s: string, f = font) => layout(s, f).reduce((n, r) => n + r.w, 0)
  const text = (page: PDFPage, s: string, x: number, y: number, f = font) => {
    for (const r of layout(s, f)) {
      const t = r.f === font || r.f === fontBold ? sanitize(r.t, r.f) : r.t
      if (t.trim()) page.drawText(t, { x, y, size, font: r.f, color: ink })
      x += r.w
    }
  }
  return { font, fontBold, measure, text }
}

export async function buildPdf(script: Script, p: Pagination, opts: PdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const { font, fontBold, measure, text } = await typeset(doc, [script.title, JSON.stringify(script.titlePage), ...script.elements.map(e => e.text)].join('\n'))
  const tp = script.titlePage
  doc.setTitle(tp.title || script.title)
  doc.setAuthor(tp.credits.map(c => c.names).filter(Boolean).join(', '))
  doc.setCreator('Page One')
  doc.setProducer('Page One')

  const { widthPt: W, heightPt: H } = PAPER[opts.paper]
  /** Right-to-left lines hang from the right edge of their element's column instead of the left. */
  const segX = (s: Seg, f: PDFFont) => {
    const sp = specOf(s.type, defaultLayout())
    if (!isRtl(s.text) || sp.align !== 'LEFT' || s.col !== sp.indent) return LEFT + s.col * COL
    return LEFT + (sp.indent + sp.width) * COL - measure(s.text, f)
  }
  const watermark = (page: PDFPage) => {
    if (!opts.watermark.trim()) return
    const w = sanitize(opts.watermark.trim().toUpperCase(), fontBold)
    const size = Math.min(80, 1100 / Math.max(6, w.length))
    // Centre the rotated line on the page: half its width back along the 40° baseline.
    const half = fontBold.widthOfTextAtSize(w, size) / 2, a = (40 * Math.PI) / 180
    page.drawText(w, {
      x: W / 2 - half * Math.cos(a) + (size / 3) * Math.sin(a), y: H / 2 - half * Math.sin(a) - (size / 3) * Math.cos(a),
      size, font: fontBold, color: rgb(0.5, 0.5, 0.5), opacity: opts.watermarkOpacity ?? 0.12, rotate: degrees(40),
    })
  }

  // ---- title page
  if (opts.titlePage) {
    const page = doc.addPage([W, H])
    const center = (s: string, y: number, f = font) => text(page, s, (W - measure(s, f)) / 2, y, f)
    let y = H - 3.6 * IN
    center((tp.title || script.title).toUpperCase(), y, fontBold)
    y -= LINE * 4
    for (const c of tp.credits.filter(c => c.names.trim())) {
      center(c.role, y); y -= LINE * 2
      center(c.names, y); y -= LINE * 3
    }
    const based = basedOnLine(tp)
    if (based) { for (const l of wrapPlain(based, 50)) { center(l, y); y -= LINE } }
    const contact = contactLines(tp)
    let cy = 1 * IN + contact.length * LINE
    for (const l of contact) { text(page, l, 1 * IN, cy); cy -= LINE }
    const right = [tp.draft, tp.draftDate, tp.copyright, tp.registration].filter(s => s.trim())
    let ry = 1 * IN + right.length * LINE
    for (const l of right) { text(page, l, W - 1 * IN - measure(l), ry); ry -= LINE }
    watermark(page)
  }

  // ---- body
  p.pages.forEach((pg, pi) => {
    if (opts.revisedOnly && !pg.lines.some(l => l.segs.some(s => s.revision > 0))) return
    const page = doc.addPage([W, H])
    const label = p.labels[pi] ?? `${pi + 1}`
    if (pi > 0 || p.lockNumbers.length) text(page, `${label}.`, W - 1 * IN - (label.length + 1) * COL, H - 0.5 * IN - 9)
    const pageRev = Math.max(0, ...pg.lines.flatMap(l => l.segs.map(s => s.revision)))
    if (pageRev > 0) {
      const rc = REVISION_COLORS[pageRev]
      const date = script.revisionDates[String(pageRev)] ?? ''
      const head = `${rc?.label ?? ''} Rev. ${date}`.trim()
      page.drawText(sanitize(head, font), { x: LEFT, y: H - 0.5 * IN - 9, size: 10, font, color: ink })
      page.drawRectangle({ x: 0, y: H - 5, width: W, height: 5, color: hexRgb(rc?.hex ?? '#888888') })
    }
    let top = 0
    pg.lines.forEach((ln, li) => {
      // A tall line sits in the middle of its taller slot.
      const h = lineH(ln)
      const y = H - IN - (top + (h + 1) / 2) * LINE + 2.5
      top += h
      for (const s of ln.segs) {
        const f = boldType(s.type, opts) ? fontBold : font
        text(page, s.text, segX(s, f), y, f)
        if (s.revision > 0) text(page, '*', LEFT + 61.5 * COL, y, fontBold)
        if (s.type === 'SCENE_HEADING' && opts.sceneNumbers && s.element >= 0) {
          const id = script.elements[s.element]?.id
          const n = id != null ? opts.sceneLabels.get(id) : undefined
          if (n && ln.segs[0] === s && isFirstLineOf(pg.lines, li, s.element)) {
            text(page, n, LEFT - 0.75 * IN, y)
            text(page, n, LEFT + 61.5 * COL + (s.revision > 0 ? 2 * COL : 0), y)
          }
        }
      }
    })
    watermark(page)
  })
  return doc.save()
}

// ---------------------------------------------------------------- production reports

export interface ReportTable { title: string; headers: string[]; rows: string[][] }

/**
 * Production reports as a landscape PDF: a heading, then each table with its header row repeated on
 * every page, cells wrapped to their column. Courier Prime, so the columns line up like a call sheet.
 */
export async function buildReportPdf(heading: string, sub: string, tables: ReportTable[], paper: PaperSize): Promise<Uint8Array> {
  const SIZE = 8.5, LH = 11, M = 36
  const doc = await PDFDocument.create()
  const all = [heading, sub, ...tables.flatMap(t => [t.title, ...t.headers, ...t.rows.flat()])].join('\n')
  const { font, fontBold, text } = await typeset(doc, all, SIZE)
  doc.setTitle(heading)
  doc.setCreator('Page One')
  doc.setProducer('Page One')
  const { widthPt, heightPt } = PAPER[paper]
  const W = heightPt, H = widthPt // landscape
  const col = COL * (SIZE / 12)
  const chars = Math.floor((W - 2 * M) / col)
  const rule = rgb(0.75, 0.75, 0.75)

  let page = doc.addPage([W, H])
  let y = H - M
  const pageNo = () => text(page, `${doc.getPageCount()}.`, W - M - 4 * col, M / 2)
  pageNo()
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; pageNo() }

  text(page, heading.toUpperCase(), M, y - 4, fontBold)
  y -= LH + 4
  if (sub) { text(page, sub, M, y - 4); y -= LH }
  y -= LH

  for (const t of tables) {
    // Column widths from the content, then shared out to fill the page.
    const n = t.headers.length
    const want = t.headers.map((h, i) => Math.min(48, Math.max(h.length, ...t.rows.map(r => [...(r[i] ?? '')].length), 3)))
    const gap = 2
    const total = want.reduce((a, b) => a + b, 0) + gap * (n - 1)
    const widths = total <= chars ? want.map((w, i) => (i === n - 1 ? w + chars - total : w))
      : want.map(w => Math.max(4, Math.floor((w * (chars - gap * (n - 1))) / (total - gap * (n - 1)))))
    const xs = widths.map((_, i) => M + (widths.slice(0, i).reduce((a, b) => a + b, 0) + gap * i) * col)
    const wrap = (s: string, w: number) => { const out: string[] = []; for (const para of (s || '').split('\n')) out.push(...wrapPlain(para, w).flatMap(l => (l.length > w ? l.match(new RegExp(`.{1,${w}}`, 'g')) ?? [l] : [l]))); return out.length ? out : [''] }
    const header = () => {
      t.headers.forEach((h, i) => text(page, wrap(h, widths[i])[0], xs[i], y - 8, fontBold))
      y -= LH + 2
      page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.6, color: rule })
      y -= 3
    }
    if (y < M + LH * 4) newPage()
    text(page, t.title, M, y - 8, fontBold)
    y -= LH * 1.6
    header()
    if (!t.rows.length) { text(page, '—', xs[0], y - 8, font); y -= LH }
    for (const r of t.rows) {
      const cells = widths.map((w, i) => wrap(r[i] ?? '', w))
      const h = Math.max(...cells.map(c => c.length))
      if (y - h * LH < M) { newPage(); header() }
      cells.forEach((c, i) => c.forEach((l, k) => text(page, l, xs[i], y - 8 - k * LH)))
      y -= h * LH + 3
      page.drawLine({ start: { x: M, y: y + 1.5 }, end: { x: W - M, y: y + 1.5 }, thickness: 0.3, color: rgb(0.88, 0.88, 0.88) })
    }
    y -= LH * 1.5
  }
  return doc.save()
}

function isFirstLineOf(lines: Pagination['pages'][number]['lines'], li: number, element: number) {
  for (let k = 0; k < li; k++) if (lines[k].segs.some(s => s.element === element)) return false
  return true
}

function wrapPlain(s: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of s.split(' ')) {
    if (line && (line + ' ' + w).length > width) { out.push(line); line = w } else line = line ? line + ' ' + w : w
  }
  if (line) out.push(line)
  return out
}
