/** Final Draft (.fdx) import / export (port of `core/Fdx.kt`, using the browser's XML parser). */
import { basedOnLine, boldType, contactLines, el, newId, simpleTitlePage, titlePage, TYPE_INFO, type Credit, type Element, type ElementType, type Script } from './model'
import type { Parsed } from './fountain'

const typeMap: Record<string, ElementType> = {
  'Scene Heading': 'SCENE_HEADING', Action: 'ACTION', General: 'ACTION', Character: 'CHARACTER',
  Parenthetical: 'PARENTHETICAL', Dialogue: 'DIALOGUE', Transition: 'TRANSITION', Shot: 'SHOT', Lyrics: 'LYRICS',
  'Cast List': 'ACTION', 'New Act': 'CENTERED', 'End of Act': 'CENTERED',
}

const children = (n: Element_ | Document, name: string): Element_[] =>
  Array.from(n.childNodes).filter((c): c is Element_ => c.nodeType === 1 && (c as Element_).tagName === name)
type Element_ = globalThis.Element

const textOf = (p: Element_) => children(p, 'Text').map(t => t.textContent ?? '').join('').replaceAll('\r', '')

export function parseFdx(xml: string, ids: () => number = newId): Parsed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('This file isn’t a valid Final Draft document.')
  const root = doc.documentElement
  const out: Element[] = []

  const readParagraph = (p: Element_, dual: boolean) => {
    // A DualDialogue paragraph wraps the two speakers' paragraphs.
    const dd = children(p, 'DualDialogue')[0]
    if (dd) {
      let seen = 0
      for (const inner of children(dd, 'Paragraph')) {
        const isChar = inner.getAttribute('Type') === 'Character'
        if (isChar) seen++
        readParagraph(inner, isChar && seen === 2)
      }
      return
    }
    const type = typeMap[p.getAttribute('Type') ?? ''] ?? 'ACTION'
    let text = textOf(p)
    if (TYPE_INFO[type].allCaps) text = text.toUpperCase()
    let synopsis = ''
    if (type === 'SCENE_HEADING') {
      const summary = children(p, 'SceneProperties')[0] && children(children(p, 'SceneProperties')[0], 'Summary')[0]
      if (summary) synopsis = (summary.textContent ?? '').trim()
    }
    out.push(el(ids(), type, text, { dual, synopsis }))
  }

  const content = children(root, 'Content')[0]
  if (content) for (const p of children(content, 'Paragraph')) readParagraph(p, false)

  // Title page: collect paragraph texts and make a best guess at the fields.
  let tp = titlePage()
  const tpNode = children(root, 'TitlePage')[0]
  if (tpNode) {
    const all = Array.from(tpNode.getElementsByTagName('Paragraph'))
      .map(p => [p.getAttribute('Alignment') ?? '', textOf(p).trim()] as const)
      .filter(x => x[1])
    const centered = all.filter(x => x[0] === 'Center' || x[0] === '').map(x => x[1])
    const left = all.filter(x => x[0] === 'Left' || x[0] === 'Full').map(x => x[1])
    const right = all.filter(x => x[0] === 'Right').map(x => x[1])
    if (centered.length) {
      const credits: Credit[] = []
      let source = ''
      let k = 1
      while (k < centered.length) {
        const line = centered[k]
        const l = line.toLowerCase()
        if (l.startsWith('based on')) { source = centered.slice(k).join(' '); break }
        if (l === 'by' || l.endsWith(' by')) { credits.push({ role: line, names: centered[k + 1] ?? '' }); k += 2 }
        else {
          if (!credits.length) credits.push({ role: 'Written by', names: line }); else source = (source + ' ' + line).trim()
          k++
        }
      }
      tp = { ...simpleTitlePage({ title: centered[0], credit: 'Written by', author: '', source, contact: left.join('\n'), draftDate: right.join(' ') }),
        credits: credits.length ? credits : [{ role: 'Written by', names: '' }] }
    }
  }
  return { titlePage: tp, elements: out }
}

// ---------------------------------------------------------------- writer

const esc = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const fdxType: Record<ElementType, string> = {
  SCENE_HEADING: 'Scene Heading', ACTION: 'Action', CHARACTER: 'Character', PARENTHETICAL: 'Parenthetical',
  DIALOGUE: 'Dialogue', TRANSITION: 'Transition', SHOT: 'Shot', LYRICS: 'Lyrics', CENTERED: 'Action', NOTE: 'Action',
}

export function writeFdx(script: Script, opts: { boldHeadings?: boolean; boldCharacters?: boolean } = {}): string {
  let sb = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n'
  sb += '<FinalDraft DocumentType="Script" Template="No" Version="5">\n  <Content>\n'
  const els = script.elements.filter(e => e.type !== 'NOTE')
  const speech = new Set<ElementType>(['DIALOGUE', 'PARENTHETICAL', 'LYRICS'])
  const para = (e: Element, indent: string) => {
    sb += `${indent}<Paragraph Type="${fdxType[e.type]}"`
    if (e.type === 'CENTERED') sb += ' Alignment="Center"'
    sb += '>\n'
    if (e.type === 'SCENE_HEADING' && e.synopsis.trim())
      sb += `${indent}  <SceneProperties><Summary><Paragraph><Text>${esc(e.synopsis)}</Text></Paragraph></Summary></SceneProperties>\n`
    const style = boldType(e.type, opts) ? ' Style="Bold"' : ''
    sb += `${indent}  <Text${style}>${esc(e.text)}</Text>\n${indent}</Paragraph>\n`
  }
  let i = 0
  while (i < els.length) {
    const e = els[i]
    if (e.type === 'CHARACTER') {
      let end = i + 1
      while (end < els.length && speech.has(els[end].type)) end++
      if (end < els.length && els[end].type === 'CHARACTER' && els[end].dual) {
        let end2 = end + 1
        while (end2 < els.length && speech.has(els[end2].type)) end2++
        sb += '    <Paragraph>\n      <DualDialogue>\n'
        for (let k = i; k < end2; k++) para(els[k], '        ')
        sb += '      </DualDialogue>\n    </Paragraph>\n'
        i = end2
        continue
      }
    }
    para(e, '    ')
    i++
  }
  sb += '  </Content>\n'
  const tp = script.titlePage
  sb += '  <TitlePage>\n    <Content>\n'
  const tpPara = (text: string, align: string, bold = false) => {
    for (const line of text.split('\n'))
      sb += `      <Paragraph Alignment="${align}" Type="General"><Text${bold ? ' Style="Bold"' : ''}>${esc(line)}</Text></Paragraph>\n`
  }
  for (let k = 0; k < 14; k++) tpPara('', 'Center')
  tpPara((tp.title.trim() ? tp.title : script.title).toUpperCase(), 'Center', true)
  tpPara('', 'Center')
  for (const c of tp.credits.filter(c => c.names.trim())) { tpPara(c.role, 'Center'); tpPara('', 'Center'); tpPara(c.names, 'Center'); tpPara('', 'Center') }
  if (basedOnLine(tp)) tpPara(basedOnLine(tp), 'Center')
  for (let k = 0; k < 12; k++) tpPara('', 'Left')
  if (contactLines(tp).length) tpPara(contactLines(tp).join('\n'), 'Left')
  for (const s of [tp.draft, tp.draftDate, tp.copyright, tp.registration].filter(s => s.trim())) tpPara(s, 'Right')
  sb += '    </Content>\n  </TitlePage>\n</FinalDraft>\n'
  return sb
}
