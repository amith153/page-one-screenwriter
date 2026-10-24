/**
 * More export formats, all laid out to the same industry geometry as the PDF (Courier 12 pt,
 * 1.5" left / 1" right margins, the paginator's indents): Word (.docx), Rich Text (.rtf, which
 * Movie Magic and Word read), a paginated plain-text script, and a web page.
 */
import { zipSync, strToU8 } from 'fflate'
import { basedOnLine, boldType, contactLines, TYPE_INFO, type Element, type Script } from '../core/model'
import { PAPER, defaultLayout, specOf, type PaperSize, type Pagination } from '../core/paginator'

export interface FormatOptions { titlePage: boolean; boldHeadings: boolean; boldCharacters?: boolean; paper: PaperSize; sceneLabels: Map<number, string>; sceneNumbers: boolean }

const TW_COL = 144 // 0.1" in twips
const printed = (s: Script) => s.elements.filter(e => TYPE_INFO[e.type].printed)
const shown = (e: Element) => (TYPE_INFO[e.type].allCaps ? e.text.toUpperCase() : e.text)
const right = (tp: Script['titlePage']) => [tp.draft, tp.draftDate, tp.copyright, tp.registration].filter(x => x.trim())
const titleOf = (s: Script) => (s.titlePage.title || s.title).toUpperCase()

// ---------------------------------------------------------------- Word

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function writeDocx(script: Script, o: FormatOptions): Uint8Array {
  const L = defaultLayout()
  const { widthPt, heightPt } = PAPER[o.paper]
  const run = (text: string, bold = false, caps = false) => {
    const rpr = (bold ? '<w:b/>' : '') + (caps ? '<w:caps/>' : '')
    return text.split('\n').map((ln, i) => (i ? '<w:r><w:br/></w:r>' : '') + `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(ln)}</w:t></w:r>`).join('')
  }
  const para = (style: string, body: string, extra = '') => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${body}</w:p>`

  let body = ''
  if (o.titlePage) {
    const tp = script.titlePage
    body += para('Title', run(titleOf(script), true), '<w:spacing w:before="4320"/>')
    for (const c of tp.credits.filter(c => c.names.trim())) body += para('TitleLine', run(c.role), '<w:spacing w:before="480"/>') + para('TitleLine', run(c.names), '<w:spacing w:before="240"/>')
    if (basedOnLine(tp)) body += para('TitleLine', run(basedOnLine(tp)), '<w:spacing w:before="480"/>')
    const contact = contactLines(tp), rt = right(tp)
    if (contact.length || rt.length) {
      // Contact bottom-left and draft details bottom-right, side by side in a borderless table.
      const cell = (lines: string[], jc: string) => `<w:tc><w:tcPr><w:tcW w:w="4320" w:type="dxa"/></w:tcPr>${(lines.length ? lines : ['']).map(l => `<w:p><w:pPr><w:pStyle w:val="Plain"/><w:jc w:val="${jc}"/></w:pPr>${run(l)}</w:p>`).join('')}</w:tc>`
      body += `<w:p><w:pPr><w:pStyle w:val="Plain"/><w:spacing w:before="${Math.max(480, 4800 - 240 * Math.max(contact.length, rt.length))}"/></w:pPr></w:p>`
      body += `<w:tbl><w:tblPr><w:tblW w:w="8640" w:type="dxa"/><w:tblInd w:w="-720" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4320"/><w:gridCol w:w="4320"/></w:tblGrid><w:tr>${cell(contact, 'left')}${cell(rt, 'right')}</w:tr></w:tbl>`
    }
    body += `<w:p><w:pPr><w:sectPr><w:pgSz w:w="${widthPt * 20}" w:h="${heightPt * 20}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:pPr></w:p>`
  }
  for (const e of printed(script)) {
    const style = e.type.toLowerCase().replace(/_(.)/g, (_, c: string) => c.toUpperCase())
    let text = shown(e)
    if (e.type === 'SCENE_HEADING' && o.sceneNumbers) {
      const n = o.sceneLabels.get(e.id)
      if (n) text = `${n}  ${text}  ${n}`
    }
    body += para(style[0].toUpperCase() + style.slice(1), run(text, boldType(e.type, o)))
  }
  body += `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgSz w:w="${widthPt * 20}" w:h="${heightPt * 20}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1080" w:left="2160" w:header="720" w:footer="720" w:gutter="0"/><w:pgNumType w:start="1"/><w:titlePg/></w:sectPr>`

  const styleFor = (id: string, type: Element['type']) => {
    const sp = specOf(type, L)
    const jc = sp.align === 'RIGHT' ? 'right' : sp.align === 'CENTER' ? 'center' : 'left'
    const keep = type === 'SCENE_HEADING' || type === 'CHARACTER' || type === 'PARENTHETICAL' ? '<w:keepNext/>' : ''
    const caps = TYPE_INFO[type].allCaps ? '<w:caps/>' : ''
    const italic = type === 'LYRICS' ? '<w:i/>' : ''
    return `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${TYPE_INFO[type].label}"/><w:basedOn w:val="Plain"/><w:next w:val="Action"/><w:pPr>${keep}<w:spacing w:before="${sp.spaceBefore * 240}" w:after="0" w:line="240" w:lineRule="exact"/><w:ind w:left="${sp.indent * TW_COL}" w:right="${(60 - sp.indent - sp.width) * TW_COL}"/><w:jc w:val="${jc}"/></w:pPr><w:rPr>${caps}${italic}</w:rPr></w:style>`
  }
  const types: Element['type'][] = ['SCENE_HEADING', 'ACTION', 'CHARACTER', 'PARENTHETICAL', 'DIALOGUE', 'TRANSITION', 'SHOT', 'LYRICS', 'CENTERED']
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Courier Prime" w:hAnsi="Courier Prime" w:cs="Courier New" w:eastAsia="Courier New"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="exact"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Plain"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="Title"><w:name w:val="Script Title"/><w:basedOn w:val="Plain"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:caps/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="TitleLine"><w:name w:val="Title Page Line"/><w:basedOn w:val="Plain"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Plain"/><w:pPr><w:jc w:val="right"/><w:ind w:right="-720"/></w:pPr></w:style>
${types.map(t => { const id = t.toLowerCase().replace(/_(.)/g, (_, c: string) => c.toUpperCase()); return styleFor(id[0].toUpperCase() + id.slice(1), t) }).join('\n')}
</w:styles>`
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${ns}><w:body>${body}</w:body></w:document>`
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr ${ns}><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>.</w:t></w:r></w:p></w:hdr>`
  const tp = script.titlePage
  const authors = tp.credits.map(c => c.names).filter(Boolean).join(', ')
  return zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>`),
    'word/document.xml': strToU8(docXml),
    'word/styles.xml': strToU8(styles),
    'word/header1.xml': strToU8(header),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(tp.title || script.title)}</dc:title><dc:creator>${xml(authors)}</dc:creator></cp:coreProperties>`),
  })
}

// ---------------------------------------------------------------- Rich Text

const rtfText = (s: string) => [...s].map(ch => {
  const c = ch.codePointAt(0)!
  if (ch === '\\' || ch === '{' || ch === '}') return '\\' + ch
  if (ch === '\n') return '\\line '
  if (c < 128) return ch
  // RTF \u takes a signed 16-bit value; characters beyond the BMP go as a surrogate pair.
  const units = c > 0xFFFF ? [0xD800 + ((c - 0x10000) >> 10), 0xDC00 + ((c - 0x10000) & 0x3FF)] : [c]
  return units.map(u => `\\u${u > 32767 ? u - 65536 : u}?`).join('')
}).join('')

export function writeRtf(script: Script, o: FormatOptions): string {
  const L = defaultLayout()
  const { widthPt, heightPt } = PAPER[o.paper]
  let out = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fmodern Courier Prime;}{\\f1\\fmodern Courier New;}}\\paperw${widthPt * 20}\\paperh${heightPt * 20}\\margl2160\\margr1440\\margt1440\\margb1080\\f0\\fs24\n`
  out += `{\\info{\\title ${rtfText(script.titlePage.title || script.title)}}{\\author ${rtfText(script.titlePage.credits.map(c => c.names).filter(Boolean).join(', '))}}}\n`
  const p = (txt: string, fmt: string) => { out += `\\pard\\plain\\f0\\fs24\\sl240\\slmult0${fmt} ${txt}\\par\n` }
  if (o.titlePage) {
    const tp = script.titlePage
    out += '\\titlepg\n'
    p(`{\\b ${rtfText(titleOf(script))}}`, '\\qc\\sb4320')
    for (const c of tp.credits.filter(c => c.names.trim())) { p(rtfText(c.role), '\\qc\\sb480'); p(rtfText(c.names), '\\qc\\sb240') }
    if (basedOnLine(tp)) p(rtfText(basedOnLine(tp)), '\\qc\\sb480')
    const contact = contactLines(tp)
    contact.forEach((l, i) => p(rtfText(l), `\\li-720${i === 0 ? '\\sb3600' : ''}`))
    right(tp).forEach((l, i) => p(rtfText(l), `\\qr${i === 0 ? '\\sb480' : ''}`))
    out += '\\sect\\sectd\\pgnrestart\\pgnstarts1\\titlepg\n'
  }
  out += '{\\header\\pard\\qr\\ri-720\\f0\\fs24\\chpgn.\\par}\n'
  for (const e of printed(script)) {
    const sp = specOf(e.type, L)
    const fmt = `\\li${sp.indent * TW_COL}\\ri${(60 - sp.indent - sp.width) * TW_COL}\\sb${sp.spaceBefore * 240}${sp.align === 'RIGHT' ? '\\qr' : sp.align === 'CENTER' ? '\\qc' : ''}${e.type === 'SCENE_HEADING' || e.type === 'CHARACTER' ? '\\keepn' : ''}`
    let t = rtfText(shown(e))
    if (e.type === 'SCENE_HEADING' && o.sceneNumbers && o.sceneLabels.get(e.id)) { const n = o.sceneLabels.get(e.id)!; t = `${n}  ${t}  ${n}` }
    if (boldType(e.type, o)) t =`{\\b ${t}}`
    if (e.type === 'LYRICS') t = `{\\i ${t}}`
    p(t, fmt)
  }
  return out + '}'
}

// ---------------------------------------------------------------- plain text, exactly as the pages print

export function writePlainText(script: Script, p: Pagination, o: FormatOptions): string {
  const pad = (n: number) => ' '.repeat(Math.max(0, n))
  const W = 60 + 15 // text area plus the 1.5" left margin, in columns
  const lines: string[] = []
  if (o.titlePage) {
    const tp = script.titlePage
    const center = (s: string) => pad(Math.floor((W - s.length) / 2)) + s
    lines.push(...Array(18).fill(''), center(titleOf(script)), '', '')
    for (const c of tp.credits.filter(c => c.names.trim())) lines.push(center(c.role), '', center(c.names), '', '')
    if (basedOnLine(tp)) lines.push(center(basedOnLine(tp)))
    lines.push(...Array(12).fill(''), ...contactLines(tp).map(l => pad(10) + l), '', ...right(tp).map(l => pad(W - l.length) + l), '\f')
  }
  p.pages.forEach((pg, pi) => {
    const label = p.labels[pi] ?? `${pi + 1}`
    lines.push(pi > 0 ? pad(W - label.length - 1) + label + '.' : '', '')
    for (const ln of pg.lines) {
      let s = ''
      for (const seg of ln.segs) s = s.padEnd(15 + seg.col) + seg.text
      lines.push(s.replace(/\s+$/, ''))
    }
    lines.push('\f')
  })
  return lines.join('\n')
}

// ---------------------------------------------------------------- web page

export function writeHtml(script: Script, o: FormatOptions): string {
  const L = defaultLayout()
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const tp = script.titlePage
  const css = (Object.keys(TYPE_INFO) as Element['type'][]).filter(t => t !== 'NOTE').map(t => {
    const sp = specOf(t, L)
    return `.${t.toLowerCase()}{margin:${sp.spaceBefore}em 0 0 ${sp.indent}ch;width:${sp.width}ch;text-align:${sp.align.toLowerCase()};${TYPE_INFO[t].allCaps ? 'text-transform:uppercase;' : ''}${boldType(t, o) ? 'font-weight:700;' : ''}${t === 'LYRICS' ? 'font-style:italic;' : ''}}`
  }).join('\n')
  let body = ''
  if (o.titlePage) {
    body += `<section class="title-page"><h1>${esc(titleOf(script))}</h1>`
    for (const c of tp.credits.filter(c => c.names.trim())) body += `<p>${esc(c.role)}</p><p>${esc(c.names)}</p>`
    if (basedOnLine(tp)) body += `<p>${esc(basedOnLine(tp))}</p>`
    body += `<div class="tp-foot"><div>${contactLines(tp).map(esc).join('<br>')}</div><div style="text-align:right">${right(tp).map(esc).join('<br>')}</div></div></section>`
  }
  body += '<section class="script">'
  for (const e of printed(script)) {
    const n = e.type === 'SCENE_HEADING' && o.sceneNumbers ? o.sceneLabels.get(e.id) : undefined
    body += `<p class="${e.type.toLowerCase()}">${n ? `<span class="no">${esc(n)}</span>` : ''}${esc(e.text).replace(/\n/g, '<br>')}</p>`
  }
  body += '</section>'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(tp.title || script.title)}</title>
<style>body{margin:0;background:#e9e6e0;font:12pt/1 'Courier Prime','Courier New',monospace;color:#151515}section{background:#fff;width:8.5in;max-width:100%;box-sizing:border-box;margin:24px auto;padding:1in 1in 1in 1.5in;box-shadow:0 10px 40px rgba(0,0,0,.15)}p{margin:0;white-space:pre-wrap;line-height:1}
.title-page{min-height:11in;position:relative;text-align:center;padding-top:3.4in}.title-page h1{font:700 12pt/1 inherit;margin:0 0 3em}.title-page p{margin:0 0 1em}.tp-foot{position:absolute;left:1in;right:1in;bottom:1in;display:flex;justify-content:space-between;text-align:left}
.no{position:absolute;margin-left:-.75in}.script p{position:relative}
${css}
@media print{body{background:#fff}section{box-shadow:none;margin:0;page-break-after:always}}</style></head><body>${body}</body></html>`
}
