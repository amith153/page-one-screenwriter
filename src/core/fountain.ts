/** Fountain (https://fountain.io) import / export (port of `core/Fountain.kt`). */
import { basedOnLine, contactLines, el, newId, simpleTitlePage, titlePage, type Credit, type Element, type ElementType, type Script, type TitlePage } from './model'
import { normalizeParenthetical } from './formatting'

export interface Parsed { titlePage: TitlePage; elements: Element[] }

const headingRe = /^(INT|EXT|EST|INT\.\/EXT|INT\/EXT|I\/E)[. ]/i
const sceneNumRe = /\s*#[^#]+#\s*$/
const titleKeyRe = /^([A-Za-z][A-Za-z ]*):(.*)$/
const TITLE_KEYS = new Set(['title', 'credit', 'author', 'authors', 'source', 'draft date', 'date', 'contact', 'notes', 'copyright', 'revision', 'draft'])

const isUpper = (s: string) => /\p{L}/u.test(s) && s === s.toUpperCase()

function isCharacterCue(t: string): boolean {
  const base = t.split('(')[0].replace(/\^$/, '').trim()
  return base.length > 0 && /\p{L}/u.test(base) && base === base.toUpperCase() && !base.endsWith(':') && base.length <= 40
}

const stripEmphasis = (s: string) =>
  s.replace(/\[\[.*?]]/g, '').replace(/(?<!\\)\*{1,3}/g, '').replaceAll('\\*', '*')

const cleanHeading = (s: string) => s.trim().replace(sceneNumRe, '').toUpperCase()

export function parseFountain(source: string, ids: () => number = newId): Parsed {
  let text = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ')
  text = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const lines = text.split('\n')

  // ---- Title page
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  let tp = titlePage()
  // Only Fountain's own keys start a title page — otherwise an opening "FADE IN:" would be swallowed.
  const firstKey = lines[i]?.trim().match(titleKeyRe)?.[1].trim().toLowerCase()
  if (i < lines.length && firstKey && TITLE_KEYS.has(firstKey) && !headingRe.test(lines[i].trim())) {
    const map = new Map<string, string>()
    let key: string | null = null
    while (i < lines.length && lines[i].trim()) {
      const raw = lines[i]
      const m = raw.trim().match(titleKeyRe)
      if (m && !raw.startsWith(' ') && !raw.startsWith('\t')) {
        key = m[1].trim().toLowerCase()
        map.set(key, m[2].trim())
      } else if (key != null) {
        const cur = map.get(key) ?? ''
        map.set(key, (cur ? cur + '\n' : '') + raw.trim())
      }
      i++
    }
    const g = (...k: string[]) => { for (const x of k) { const v = map.get(x); if (v != null) return stripEmphasis(v) } return '' }
    // Pair repeated Credit/Author keys in order.
    const credits: Credit[] = []
    let pendingRole: string | null = null
    const pairs = collectPairs(lines, i)
    for (const [k, v] of pairs) {
      if (k === 'credit') pendingRole = stripEmphasis(v)
      else if (k === 'author' || k === 'authors') { credits.push({ role: pendingRole?.trim() ? pendingRole : 'Written by', names: stripEmphasis(v) }); pendingRole = null }
    }
    const base = simpleTitlePage({
      title: g('title').replaceAll('\n', ' '), credit: g('credit'), author: g('author', 'authors'),
      source: g('source'), draftDate: g('draft date', 'date'), contact: g('contact'), notes: g('notes'), copyright: g('copyright'),
    })
    tp = { ...base, credits: credits.length ? credits : base.credits, draft: g('revision', 'draft') }
  }

  // ---- Body
  const out: Element[] = []
  let inDialogue = false
  let prevBlank = true
  const add = (type: ElementType, t: string, dual = false) => out.push(el(ids(), type, t, { dual }))

  while (i < lines.length) {
    const raw = lines[i]
    const t = raw.trim()
    const next = (lines[i + 1] ?? '').trim()
    const nextBlank = next.length === 0

    if (!t) {
      // "  " (two spaces) inside dialogue keeps the speech going
      if (inDialogue && raw.length >= 2) { i++; continue }
      inDialogue = false; prevBlank = true; i++; continue
    }

    if (inDialogue) {
      const last = out[out.length - 1]
      if (t.startsWith('(') && t.endsWith(')')) add('PARENTHETICAL', t)
      else if (last.type === 'DIALOGUE') out[out.length - 1] = { ...last, text: last.text + '\n' + stripEmphasis(t) }
      else add('DIALOGUE', stripEmphasis(t))
      prevBlank = false; i++; continue
    }

    if (t.startsWith('[[') && t.endsWith(']]')) add('NOTE', t.slice(2, -2).trim())
    else if (t.startsWith('===')) { /* page break */ }
    else if (t.startsWith('#')) { /* section */ }
    else if (t.startsWith('=')) {
      let idx = -1
      for (let k = out.length - 1; k >= 0; k--) if (out[k].type === 'SCENE_HEADING') { idx = k; break }
      if (idx >= 0) out[idx] = { ...out[idx], synopsis: (out[idx].synopsis + ' ' + t.substring(1).trim()).trim() }
    }
    else if (t.startsWith('.') && !t.startsWith('..')) add('SCENE_HEADING', cleanHeading(t.substring(1)))
    else if (prevBlank && headingRe.test(t)) add('SCENE_HEADING', cleanHeading(t))
    else if (t.startsWith('!')) appendAction(out, ids, stripEmphasis(t.substring(1)), prevBlank)
    else if (t.startsWith('~')) add('LYRICS', t.substring(1).trim())
    else if (t.startsWith('>') && t.endsWith('<')) add('CENTERED', stripEmphasis(t.slice(1, -1).trim()))
    else if (t.startsWith('>')) add('TRANSITION', t.substring(1).trim().toUpperCase())
    else if (prevBlank && nextBlank && isUpper(t) && t.endsWith('TO:')) add('TRANSITION', t)
    else if (t.startsWith('@') && !nextBlank) {
      add('CHARACTER', t.substring(1).replace(/\^$/, '').trim().toUpperCase(), t.endsWith('^'))
      inDialogue = true
    }
    else if (prevBlank && !nextBlank && isCharacterCue(t)) {
      add('CHARACTER', t.replace(/\^$/, '').trim(), t.endsWith('^'))
      inDialogue = true
    }
    else appendAction(out, ids, stripEmphasis(raw.trimEnd()), prevBlank)
    prevBlank = false
    i++
  }
  return { titlePage: tp, elements: out }
}

/** Every key/value of the title block in order, including repeats (Credit/Author pairs). */
function collectPairs(lines: string[], endExclusive: number): [string, string][] {
  const out: [string, string][] = []
  let i = 0
  while (i < endExclusive && !lines[i].trim()) i++
  for (; i < endExclusive; i++) {
    const raw = lines[i]
    const m = raw.trim().match(titleKeyRe)
    if (m && !raw.startsWith(' ') && !raw.startsWith('\t')) out.push([m[1].trim().toLowerCase(), m[2].trim()])
    else if (out.length) { const last = out[out.length - 1]; last[1] = (last[1] ? last[1] + '\n' : '') + raw.trim() }
  }
  return out
}

function appendAction(out: Element[], ids: () => number, t: string, prevBlank: boolean) {
  const last = out[out.length - 1]
  if (!prevBlank && last && last.type === 'ACTION') out[out.length - 1] = { ...last, text: last.text + '\n' + t }
  else out.push(el(ids(), 'ACTION', t.trimStart()))
}

// ---------------------------------------------------------------- writer

export function writeFountain(script: Script): string {
  let sb = ''
  const tp = script.titlePage
  const kv = (k: string, v: string) => {
    if (!v.trim()) return
    const ls = v.split('\n')
    if (ls.length === 1) sb += `${k}: ${v.trim()}\n`
    else { sb += `${k}:\n`; for (const l of ls) sb += `    ${l.trim()}\n` }
  }
  kv('Title', tp.title.trim() ? tp.title : script.title)
  for (const c of tp.credits.filter(c => c.names.trim())) { kv('Credit', c.role); kv('Author', c.names) }
  kv('Source', basedOnLine(tp))
  kv('Draft date', [tp.draft, tp.draftDate].filter(s => s.trim()).join('\n'))
  kv('Contact', contactLines(tp).join('\n'))
  kv('Copyright', [tp.copyright, tp.registration].filter(s => s.trim()).join('\n'))
  kv('Notes', tp.notes)
  sb += '\n'

  const els = script.elements
  let i = 0
  const inSpeech = new Set<ElementType>(['DIALOGUE', 'PARENTHETICAL', 'LYRICS', 'NOTE'])
  while (i < els.length) {
    const e = els[i]
    const t = e.text
    switch (e.type) {
      case 'SCENE_HEADING':
        sb += '\n' + (headingRe.test(t) ? t.toUpperCase() : '.' + t) + '\n\n'
        if (e.synopsis.trim()) sb += `= ${e.synopsis}\n\n`
        break
      case 'ACTION': case 'SHOT': {
        const needsForce = headingRe.test(t) || (isUpper(t) && !t.includes('\n')) || t.startsWith('@') || t.startsWith('>')
        sb += (needsForce ? '!' + t : t) + '\n\n'
        break
      }
      case 'CHARACTER': {
        const cue = t.toUpperCase()
        sb += isCharacterCue(cue) ? cue : '@' + cue
        if (e.dual) sb += ' ^'
        sb += '\n'
        let j = i + 1
        while (j < els.length && inSpeech.has(els[j].type)) {
          const d = els[j]
          if (d.type === 'PARENTHETICAL') sb += normalizeParenthetical(d.text)
          else if (d.type === 'LYRICS') sb += '~' + d.text
          else if (d.type === 'NOTE') sb += `[[${d.text}]]`
          else sb += (d.text || ' ').split('\n').map(l => l || '  ').join('\n')
          sb += '\n'
          j++
        }
        sb += '\n'
        i = j
        continue
      }
      case 'DIALOGUE': case 'PARENTHETICAL': sb += t + '\n\n'; break
      case 'TRANSITION': sb += (t.toUpperCase().endsWith('TO:') ? t.toUpperCase() : '> ' + t.toUpperCase()) + '\n\n'; break
      case 'CENTERED': sb += `> ${t} <\n\n`; break
      case 'LYRICS': sb += `~${t}\n\n`; break
      case 'NOTE': sb += `[[${t}]]\n\n`; break
    }
    i++
  }
  return sb.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
