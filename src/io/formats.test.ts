/** The new export formats and author colours. */
import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { el, newScript, titlePage } from '../core/model'
import { defaultLayout, Paginator } from '../core/paginator'
import { writeFdx } from '../core/fdx'
import { AUTHOR_COLORS, colorFor } from '../core/authors'
import { writeDocx, writeHtml, writePlainText, writeRtf, type FormatOptions } from './formats'

const s = newScript({
  id: 'x', title: 'Night Shift',
  elements: [
    el(1, 'SCENE_HEADING', 'INT. DINER - NIGHT'), el(2, 'ACTION', 'Rain on the glass & neon <humming>.'),
    el(3, 'CHARACTER', 'MAYA'), el(4, 'PARENTHETICAL', '(quietly)'), el(5, 'DIALOGUE', 'Café’s closed.'),
    el(6, 'NOTE', 'never prints'), el(7, 'TRANSITION', 'CUT TO:'),
  ],
  titlePage: titlePage({ title: 'Night Shift', credits: [{ role: 'Written by', names: 'Amit' }], copyright: '© 2026 Amit. All rights reserved.', contactName: 'Amit', email: 'a@b.c' }),
})
const o: FormatOptions = { titlePage: true, boldHeadings: true, paper: 'LETTER', sceneLabels: new Map([[1, '1']]), sceneNumbers: true }

describe('export formats', () => {
  it('writes a valid Word document with screenplay styles', () => {
    const files = unzipSync(writeDocx(s, o))
    for (const f of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/header1.xml', 'word/_rels/document.xml.rels'])
      expect(files[f], f).toBeTruthy()
    const doc = strFromU8(files['word/document.xml'])
    for (const f of Object.keys(files).filter(k => k.endsWith('.xml') || k.endsWith('.rels'))) {
      const x = new DOMParser().parseFromString(strFromU8(files[f]), 'application/xml')
      expect(x.getElementsByTagName('parsererror').length, f).toBe(0)
    }
    expect(doc).toContain('w:val="SceneHeading"')
    expect(doc).toContain('&lt;humming&gt;')
    expect(doc).not.toContain('never prints')
    expect(doc).toMatch(/<w:b\/><\/w:rPr><w:t xml:space="preserve">NIGHT SHIFT/) // bold title
    expect(doc).toMatch(/<w:b\/><\/w:rPr><w:t xml:space="preserve">1 {2}INT\. DINER/) // bold, numbered heading
    expect(doc).toContain('© 2026 Amit. All rights reserved.')
    const styles = strFromU8(files['word/styles.xml'])
    expect(styles).toMatch(/w:styleId="Character".*?w:left="3168"/) // 22 columns × 144 twips
  })

  it('writes balanced Rich Text with escaped braces and Unicode', () => {
    const rtf = writeRtf({ ...s, elements: [...s.elements, el(8, 'ACTION', 'A {brace} and \\ slash')] }, o)
    let depth = 0
    for (let i = 0; i < rtf.length; i++) {
      if (rtf[i] === '\\') { i++; continue }
      if (rtf[i] === '{') depth++
      if (rtf[i] === '}') depth--
      expect(depth).toBeGreaterThanOrEqual(0)
    }
    expect(depth).toBe(0)
    expect(rtf).toContain('\\{brace\\}')
    expect(rtf).toContain('Caf\\u233?')
    expect(rtf).toContain('{\\b NIGHT SHIFT}')
  })

  it('writes plain text exactly as the pages print', () => {
    const p = new Paginator(defaultLayout()).paginate(s.elements)
    const txt = writePlainText(s, p, o)
    expect(txt).toContain('\n               INT. DINER - NIGHT')
    expect(txt).toContain('\n                                     MAYA')
    expect(txt).not.toContain('never prints')
  })

  it('writes a web page', () => {
    const html = writeHtml(s, o)
    expect(html).toContain('<p class="scene_heading"><span class="no">1</span>INT. DINER - NIGHT</p>')
    expect(html).toContain('font-weight:700')
  })

  it('marks bold headings and a bold title in Final Draft files', () => {
    const fdx = writeFdx(s, { boldHeadings: true })
    expect(fdx).toContain('<Text Style="Bold">INT. DINER - NIGHT</Text>')
    expect(fdx).toContain('<Text Style="Bold">NIGHT SHIFT</Text>')
    expect(writeFdx(s)).not.toContain('Style="Bold">INT.')
  })
})

describe('author colours (same as the phone)', () => {
  it('gives a person the same colour as on the phone (Java hashCode)', () => {
    // "Amit".hashCode() == 2044535 in Java → index 2044535 % 7 == 3
    expect(colorFor('Amit')).toBe(AUTHOR_COLORS[3])
  })
})
