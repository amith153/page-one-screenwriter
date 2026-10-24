/**
 * Script Doctor: a format and consistency check of the whole script (port of `core/ScriptDoctor.kt`).
 * Deterministic — no network, no AI — so the same script always gets the same report.
 *
 * Every issue points at an element and may carry fixes. A fix is a pure function from the element
 * list to a new one; it finds its target by id and returns the same array when there is nothing to fix.
 */
import { authorOf, contactLines, el, isDialogueBlockPart, TYPE_INFO, type Element, type ElementType, type Script } from './model'
import { characterName, looksLikeSceneHeading, normalizeParenthetical, TIMES_OF_DAY } from './formatting'
import { location as locationOf } from './analysis'
import { endsSentence, FULL_WIDTH, pageLabel, wrap, type Pagination } from './paginator'

export type Severity = 'PROBLEM' | 'CHECK' | 'POLISH'
export const SEVERITY_LABEL: Record<Severity, string> = { PROBLEM: 'Problems', CHECK: 'Consistency', POLISH: 'Polish' }
const SEVERITY_ORDER: Severity[] = ['PROBLEM', 'CHECK', 'POLISH']

export interface RuleInfo { title: string; severity: Severity; why: string; batchSafe: boolean }
const rule = (title: string, severity: Severity, why: string, batchSafe = false): RuleInfo => ({ title, severity, why, batchSafe })

export const RULES = {
  CUE_WITHOUT_DIALOGUE: rule('Character with nothing to say', 'PROBLEM', 'A character cue must be followed by dialogue or a parenthetical, or it prints as a stray name.'),
  ORPHAN_DIALOGUE: rule('Dialogue without a speaker', 'PROBLEM', 'Dialogue and parentheticals need a character cue above them.'),
  PAREN_ENDS_SPEECH: rule('Parenthetical ends a speech', 'PROBLEM', "A parenthetical can't be the last thing in a speech. If it describes what someone does, make it action."),
  CHARACTER_VARIANT: rule('Character name spelt two ways', 'CHECK', 'Readers, reports and table reads treat each spelling as a different person.'),
  LOCATION_VARIANT: rule('Location spelt two ways', 'CHECK', 'Scheduling and location reports treat each spelling as a different place.'),
  HEADING_NO_PREFIX: rule('Scene heading without INT. / EXT.', 'CHECK', "Scene headings start with INT., EXT. or INT./EXT. so production knows where it's shot."),
  CUE_LOOKS_LIKE_ACTION: rule('Character cue that reads like action', 'CHECK', 'This looks like a sentence, not a name — it may have been typed as the wrong element.'),
  PAGE_BREAK_ORPHAN: rule('Awkward page break', 'CHECK', 'A heading or character name stranded at the foot of a page, or a single widowed line at the top of the next, reads badly in print.'),
  TRANSITION_NOT_INTO_SCENE: rule("Transition that doesn't lead anywhere", 'CHECK', 'A “TO:” transition should be followed by a new scene heading.'),
  TITLE_NO_AUTHOR: rule('No writer on the title page', 'CHECK', 'The title page should say who wrote the script.'),
  HEADING_NO_TIME: rule('Scene heading without a time of day', 'POLISH', 'End scene headings with – DAY, – NIGHT, – CONTINUOUS… It drives the schedule and the day/night breakdown.'),
  HEADING_PREFIX_FORMAT: rule('INT / EXT without a period', 'POLISH', 'The standard form is “INT.” and “EXT.”.', true),
  EXTENSION_FORMAT: rule('Non-standard character extension', 'POLISH', "Use the standard forms: (V.O.), (O.S.), (O.C.), (CONT'D).", true),
  PAREN_UNWRAPPED: rule('Parenthetical without brackets', 'POLISH', 'Parentheticals print inside ( ).', true),
  TRANSITION_PUNCTUATION: rule('Transition without punctuation', 'POLISH', 'Transitions end with a colon (CUT TO:) — or a period for FADE OUT.', true),
  LONG_ACTION: rule('Dense action paragraph', 'POLISH', 'Action longer than four lines is often skimmed. Shorter paragraphs read faster and feel like shots.'),
  LONG_PARENTHETICAL: rule('Long parenthetical', 'POLISH', 'Parentheticals work best as a word or two. Longer stage directions usually belong in action.'),
  LONG_SPEECH: rule('Very long speech', 'POLISH', 'Fine for a monologue — but worth a look: long speeches are where scripts slow down.'),
  STRAY_SPACES: rule('Extra spaces', 'POLISH', 'Double or trailing spaces can shift text in the PDF.', true),
  EMPTY_ELEMENT: rule('Empty line', 'POLISH', 'Empty elements print as extra blank space.', true),
  NOTE_LEFT: rule('Note to self', 'POLISH', "Notes never print, but it's worth clearing them before you send a draft."),
  TITLE_NO_CONTACT: rule('No contact details on the title page', 'POLISH', 'A spec script should say how to reach you (or your representation).'),
} satisfies Record<string, RuleInfo>
export type Rule = keyof typeof RULES
const RULE_ORDER = Object.keys(RULES) as Rule[]

export interface Fix { label: string; apply: (els: Element[], nextId: () => number) => Element[] }

export interface Issue {
  rule: Rule
  /** The element to jump to; null for title-page issues. */
  elementId: number | null
  message: string
  /** What the issue is about, for a stable ignore key (a name, a location…). */
  subject: string
  fixes: Fix[]
}
export const issueKey = (i: Issue) => `${i.rule}:${i.elementId ?? 'title'}:${i.subject}`

export const ACTION_MAX_LINES = 4
export const PAREN_MAX_CHARS = 50
export const SPEECH_MAX_LINES = 18

const printedDialogue = new Set<ElementType>(['DIALOGUE', 'PARENTHETICAL', 'LYRICS'])

/** Headings that are legitimately not INT./EXT. */
const specialHeadings = [
  'MONTAGE', 'FLASHBACK', 'SERIES OF SHOTS', 'INTERCUT', 'DREAM', 'BACK TO', 'LATER', 'END OF',
  'TITLE', 'SUPER', 'BLACK', 'OPENING', 'CREDITS', 'PRELAP', 'INSERT', 'ANGLE', 'FLASH', 'OMITTED',
]
const prefixNoPeriod = /^(INT|EXT)(?=\s)/i
const timeSeparator = /\s[-–—]\s*\S/
const extensionForms: [RegExp, string][] = [
  [/^V\.?\s?O\.?$/i, 'V.O.'],
  [/^O\.?\s?S\.?$/i, 'O.S.'],
  [/^O\.?\s?C\.?$/i, 'O.C.'],
  [/^CONT['’]?\s?D\.?$|^CONTD\.?$|^CONT\.?$/i, "CONT'D"],
]
const sentenceEnd = /(?<=[.!?…]["”’)]?)\s+/

const issue = (rule: Rule, elementId: number | null, message: string, fixes: Fix[] = [], subject = ''): Issue =>
  ({ rule, elementId, message, subject, fixes })
const fix = (label: string, apply: Fix['apply']): Fix => ({ label, apply })

export function check(script: Script, pagination?: Pagination): Issue[] {
  const els = script.elements
  const out: Issue[] = []
  if (pagination) pageBreaks(els, pagination, out)
  const lastIndex = els.length - 1

  els.forEach((e, i) => {
    const text = e.text
    const blank = !text.trim() || (e.type === 'PARENTHETICAL' && text.trim() === '()')
    if (blank) {
      // The last element is where the writer is typing; a lone blank action in a scene is an index card's placeholder.
      if (i !== lastIndex && !isPlaceholder(els, i) && e.type !== 'NOTE')
        out.push(issue('EMPTY_ELEMENT', e.id, `Empty ${TYPE_INFO[e.type].label.toLowerCase()}`, [fix('Remove', l => edit(l, e.id, () => null))]))
      return
    }
    if (e.type !== 'NOTE' && hasStraySpaces(text))
      out.push(issue('STRAY_SPACES', e.id, `“${preview(text)}”`, [fix('Tidy spaces', l => edit(l, e.id, x => ({ ...x, text: tidySpaces(x.text) })))]))

    switch (e.type) {
      case 'SCENE_HEADING': checkHeading(e, out); break
      case 'CHARACTER': checkCue(els, i, out); break
      case 'DIALOGUE': case 'LYRICS': case 'PARENTHETICAL': {
        const prev = els[i - 1]?.type
        if (!prev || !isDialogueBlockPart(prev))
          out.push(issue('ORPHAN_DIALOGUE', e.id, `“${preview(text)}”`, [fix('Make it action', l => edit(l, e.id, toAction))]))
        if (e.type === 'PARENTHETICAL') checkParenthetical(els, i, out)
        if (e.type === 'DIALOGUE') {
          const lines = wrap(text, 35).length
          if (lines > SPEECH_MAX_LINES) out.push(issue('LONG_SPEECH', e.id, `${lines} lines of dialogue`))
        }
        break
      }
      case 'ACTION': {
        const lines = wrap(text, FULL_WIDTH).length
        if (lines > ACTION_MAX_LINES) {
          const parts = splitAction(text)
          const fixes = parts.length > 1 ? [fix(`Split into ${parts.length} paragraphs`, (l, next) => splitElement(l, e.id, next))] : []
          out.push(issue('LONG_ACTION', e.id, `${lines} lines — “${preview(text)}”`, fixes))
        }
        break
      }
      case 'TRANSITION': checkTransition(els, i, out); break
      case 'NOTE': out.push(issue('NOTE_LEFT', e.id, `“${preview(text)}”`, [fix('Remove note', l => edit(l, e.id, () => null))])); break
    }
  })

  nameVariants(els, out)
  locationVariants(els, out)

  const tp = script.titlePage
  if (!authorOf(tp).trim()) out.push(issue('TITLE_NO_AUTHOR', null, 'Add your name in the title page'))
  if (contactLines(tp).length === 0) out.push(issue('TITLE_NO_CONTACT', null, 'Add an email, phone or agent'))

  return out
    .map((x, k) => [x, k] as const)
    .sort((a, b) =>
      SEVERITY_ORDER.indexOf(RULES[a[0].rule].severity) - SEVERITY_ORDER.indexOf(RULES[b[0].rule].severity) ||
      RULE_ORDER.indexOf(a[0].rule) - RULE_ORDER.indexOf(b[0].rule) || a[1] - b[1])
    .map(x => x[0])
}

/** Apply the first fix of every batch-safe issue, in one go. */
export function fixAll(elements: Element[], issues: Issue[], nextId: () => number): Element[] {
  let list = elements
  for (const iss of issues) if (RULES[iss.rule].batchSafe && iss.fixes[0]) list = iss.fixes[0].apply(list, nextId)
  return list
}

// ---------------------------------------------------------------- element checks

function checkHeading(e: Element, out: Issue[]) {
  const t = e.text.trim().toUpperCase()
  if (!looksLikeSceneHeading(t)) {
    if (!specialHeadings.some(s => t.includes(s))) {
      out.push(issue('HEADING_NO_PREFIX', e.id, t, [
        fix('Add INT.', l => edit(l, e.id, x => ({ ...x, text: 'INT. ' + x.text.trim() }))),
        fix('Add EXT.', l => edit(l, e.id, x => ({ ...x, text: 'EXT. ' + x.text.trim() }))),
      ]))
    }
    return
  }
  if (prefixNoPeriod.test(t))
    out.push(issue('HEADING_PREFIX_FORMAT', e.id, t, [fix('Add the period', l => edit(l, e.id, x => ({ ...x, text: x.text.trim().replace(prefixNoPeriod, '$1.') })))]))
  if (!timeSeparator.test(t) && !TIMES_OF_DAY.some(tod => t.endsWith(' ' + tod))) {
    const add = (tod: string) => fix(`Add – ${tod}`, l => edit(l, e.id, x => ({ ...x, text: x.text.trimEnd() + ' - ' + tod })))
    out.push(issue('HEADING_NO_TIME', e.id, t, [add('DAY'), add('NIGHT'), add('CONTINUOUS')]))
  }
}

function checkCue(els: Element[], i: number, out: Issue[]) {
  const e = els[i]
  const next = els[i + 1]
  if (next && !printedDialogue.has(next.type)) {
    const fixes: Fix[] = []
    if (next.type === 'ACTION' && next.text.trim()) fixes.push(fix('Make the next line dialogue', l => edit(l, next.id, x => ({ ...x, type: 'DIALOGUE' }))))
    fixes.push(fix('Make it action', l => edit(l, e.id, toAction)))
    out.push(issue('CUE_WITHOUT_DIALOGUE', e.id, e.text.trim(), fixes))
  }
  const fixed = canonExtensions(e.text)
  if (fixed !== e.text)
    out.push(issue('EXTENSION_FORMAT', e.id, `${e.text.trim()}  →  ${fixed.trim()}`, [fix('Fix', l => edit(l, e.id, x => ({ ...x, text: canonExtensions(x.text) })))]))
  // "HE WALKS TO THE DOOR." typed as a cue.
  const name = characterName(e.text)
  const words = name.split(/\s+/).filter(Boolean)
  const last = words[words.length - 1] ?? ''
  const sentence = name.endsWith('!') || name.endsWith('?') || (name.endsWith('.') && last.length > 4)
  if (words.length > 5 || sentence) out.push(issue('CUE_LOOKS_LIKE_ACTION', e.id, e.text.trim(), [fix('Make it action', l => edit(l, e.id, toAction))]))
}

function checkParenthetical(els: Element[], i: number, out: Issue[]) {
  const e = els[i]
  const t = e.text.trim()
  if (!t.startsWith('(') || !t.endsWith(')'))
    out.push(issue('PAREN_UNWRAPPED', e.id, t, [fix('Add ( )', l => edit(l, e.id, x => ({ ...x, text: normalizeParenthetical(x.text) })))]))
  const next = els[i + 1]?.type
  const prev = els[i - 1]?.type
  if (prev && isDialogueBlockPart(prev) && (!next || (next !== 'DIALOGUE' && next !== 'LYRICS')))
    out.push(issue('PAREN_ENDS_SPEECH', e.id, t, [fix('Make it action', l => edit(l, e.id, toAction))]))
  if (t.replace(/^\(/, '').replace(/\)$/, '').length > PAREN_MAX_CHARS) out.push(issue('LONG_PARENTHETICAL', e.id, `“${preview(t)}”`))
}

function checkTransition(els: Element[], i: number, out: Issue[]) {
  const e = els[i]
  const t = e.text.trim().toUpperCase()
  if (!t.endsWith(':') && !t.endsWith('.')) {
    const add = t.endsWith('OUT') || t.endsWith('BLACK') ? '.' : ':'
    out.push(issue('TRANSITION_PUNCTUATION', e.id, `${t}  →  ${t}${add}`, [fix(`Add “${add}”`, l => edit(l, e.id, x => {
      const s = x.text.trimEnd()
      return s.endsWith(':') || s.endsWith('.') ? x : { ...x, text: s + add }
    }))]))
  }
  if (t.endsWith('TO:')) {
    const next = els.slice(i + 1).find(x => x.type !== 'NOTE' && x.text.trim())
    if (next && next.type !== 'SCENE_HEADING') out.push(issue('TRANSITION_NOT_INTO_SCENE', e.id, t))
  }
}

// ---------------------------------------------------------------- page breaks

function pageBreaks(els: Element[], p: Pagination, out: Issue[]) {
  for (let pi = 0; pi < p.pages.length - 1; pi++) {
    const lines = p.pages[pi].lines.filter(l => l.segs.length)
    const last = lines[lines.length - 1]?.segs[0]
    if (!last) continue
    const label = pageLabel(p, pi)
    if (last.element >= 0 && (last.type === 'SCENE_HEADING' || last.type === 'SHOT')) {
      const x = els[last.element]
      if (x) out.push(issue('PAGE_BREAK_ORPHAN', x.id, `Heading alone at the bottom of page ${label}`, [], `foot${label}`))
    }
    if (last.element >= 0 && last.type === 'CHARACTER') {
      const x = els[last.element]
      if (x) out.push(issue('PAGE_BREAK_ORPHAN', x.id, `${x.text.trim()} is cut off from their dialogue at the bottom of page ${label}`, [], `foot${label}`))
    }
    // A single closing line of an action paragraph at the top of the next page.
    const next = p.pages[pi + 1].lines.filter(l => l.segs.length)
    const first = next[0]?.segs[0]
    if (!first) continue
    if (first.type === 'ACTION' && first.element >= 0) {
      const onNext = next.filter(l => l.segs.some(s => s.element === first.element)).length
      const onThis = lines.filter(l => l.segs.some(s => s.element === first.element)).length
      const x = els[first.element]
      if (onThis > 0 && onNext === 1 && x) {
        const nl = pageLabel(p, pi + 1)
        out.push(issue('PAGE_BREAK_ORPHAN', x.id, `One widowed line of action at the top of page ${nl}`, [], `top${nl}`))
      }
    }
  }
}

// ---------------------------------------------------------------- consistency

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

function nameVariants(els: Element[], out: Issue[]) {
  const counts = new Map<string, number>()
  const firstId = new Map<string, number>()
  for (const e of els) if (e.type === 'CHARACTER') {
    const n = characterName(e.text)
    if (!n) continue
    counts.set(n, (counts.get(n) ?? 0) + 1)
    if (!firstId.has(n)) firstId.set(n, e.id)
  }
  for (const [rare, common] of variants(counts, 4)) {
    out.push(issue('CHARACTER_VARIANT', firstId.get(rare) ?? null,
      `“${rare}” (${plural(counts.get(rare)!, 'cue')}) — did you mean “${common}” (${plural(counts.get(common)!, 'cue')})?`,
      [fix(`Rename to ${common}`, l => renameCharacter(l, rare, common))], rare))
  }
}

function locationVariants(els: Element[], out: Issue[]) {
  const counts = new Map<string, number>()
  const firstId = new Map<string, number>()
  for (const e of els) if (e.type === 'SCENE_HEADING') {
    const loc = locationOf(e.text)
    if (!loc) continue
    counts.set(loc, (counts.get(loc) ?? 0) + 1)
    if (!firstId.has(loc)) firstId.set(loc, e.id)
  }
  for (const [rare, common] of variants(counts, 7)) {
    out.push(issue('LOCATION_VARIANT', firstId.get(rare) ?? null,
      `“${rare}” (${plural(counts.get(rare)!, 'scene')}) — same place as “${common}” (${plural(counts.get(common)!, 'scene')})?`,
      [fix(`Rename to ${common}`, l => renameLocation(l, rare, common))], rare))
  }
}

const letterOrDigit = /[\p{L}\p{N}]/u
const hasDigit = /\p{N}/u

/**
 * Pairs [rare spelling, likely intended spelling]. Two spellings are variants if they're equal
 * ignoring punctuation and spaces (DR. SMITH / DR SMITH), or one letter apart (MAYAH / MAYA)
 * when one is clearly the usual spelling.
 */
export function variants(counts: Map<string, number>, minLength: number): [string, string][] {
  const names = [...counts.keys()]
  const key = new Map(names.map(n => [n, [...n].filter(c => letterOrDigit.test(c)).join('')]))
  const out: [string, string][] = []
  const claimed = new Set<string>()
  const byUse = [...names].sort((a, b) => counts.get(b)! - counts.get(a)! || b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
  for (let ai = 0; ai < byUse.length; ai++) {
    const a = byUse[ai]
    if (claimed.has(a)) continue
    for (let bi = ai + 1; bi < byUse.length; bi++) {
      const b = byUse[bi]
      if (claimed.has(b)) continue
      const ca = counts.get(a)!, cb = counts.get(b)!
      const ka = key.get(a)!, kb = key.get(b)!
      const same = ka === kb && ka.length > 0
      const close = !same && ka.length >= minLength && kb.length >= minLength && !hasDigit.test(ka) && !hasDigit.test(kb) &&
        cb <= 3 && ca >= cb * 3 && oneEditApart(ka, kb)
      if (same || close) { out.push([b, a]); claimed.add(b) }
    }
  }
  return out
}

export function oneEditApart(a: string, b: string): boolean {
  if (a === b) return false
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const diffs: number[] = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i)
    if (diffs.length === 1) return true
    // A swap of two neighbouring letters (MYAA / MAYA) counts as one slip.
    return diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]]
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < s.length && s[i] === l[i]) i++
  return s.substring(i) === l.substring(i + 1)
}

// ---------------------------------------------------------------- fixes

const sameEl = (a: Element, b: Element) =>
  a.id === b.id && a.type === b.type && a.text === b.text && a.dual === b.dual && a.revision === b.revision &&
  a.color === b.color && a.synopsis === b.synopsis && a.orig === b.orig

function edit(list: Element[], id: number, f: (e: Element) => Element | null): Element[] {
  const i = list.findIndex(e => e.id === id)
  if (i < 0) return list
  const r = f(list[i])
  if (r && sameEl(r, list[i])) return list
  const copy = [...list]
  if (r == null) copy.splice(i, 1); else copy[i] = r
  return copy
}

function toAction(e: Element): Element {
  let t = e.text.trim()
  if (e.type === 'PARENTHETICAL') {
    t = t.replace(/^\(/, '').replace(/\)$/, '').trim()
    t = t.charAt(0).toUpperCase() + t.slice(1)
    if (!endsSentence(t)) t += '.'
  }
  return { ...e, type: 'ACTION', text: t, dual: false }
}

export function renameCharacter(list: Element[], from: string, to: string): Element[] {
  let changed = false
  const out = list.map(e => {
    if (e.type === 'CHARACTER' && characterName(e.text) === from) {
      changed = true
      const paren = e.text.indexOf('(')
      const suffix = paren >= 0 ? ' ' + e.text.substring(paren).trim() : ''
      return { ...e, text: to + suffix }
    }
    return e
  })
  return changed ? out : list
}

export function renameLocation(list: Element[], from: string, to: string): Element[] {
  let changed = false
  const out = list.map(e => {
    if (e.type === 'SCENE_HEADING' && locationOf(e.text) === from) {
      const at = e.text.toUpperCase().indexOf(from)
      if (at < 0) return e
      changed = true
      return { ...e, text: e.text.substring(0, at) + to + e.text.substring(at + from.length) }
    }
    return e
  })
  return changed ? out : list
}

/** Break dense action into paragraphs of at most ACTION_MAX_LINES lines, at sentence ends. */
export function splitAction(text: string): string[] {
  const sentences = text.trim().split(sentenceEnd).filter(s => s.trim())
  if (sentences.length < 2) return [text]
  const parts: string[] = []
  let cur = ''
  for (const s of sentences) {
    const joined = cur ? `${cur} ${s}` : s
    if (cur && wrap(joined, FULL_WIDTH).length > ACTION_MAX_LINES) { parts.push(cur); cur = s } else cur = joined
  }
  if (cur) parts.push(cur)
  return parts
}

function splitElement(list: Element[], id: number, nextId: () => number): Element[] {
  const i = list.findIndex(e => e.id === id)
  if (i < 0) return list
  const e = list[i]
  const parts = splitAction(e.text)
  if (parts.length < 2) return list
  const copy = [...list]
  copy[i] = { ...e, text: parts[0] }
  copy.splice(i + 1, 0, ...parts.slice(1).map(p => el(nextId(), 'ACTION', p, { revision: e.revision })))
  return copy
}

// ---------------------------------------------------------------- helpers

/** A lone blank action under a scene heading: the placeholder an index card creates. */
function isPlaceholder(els: Element[], i: number): boolean {
  if (els[i].type !== 'ACTION') return false
  const prev = els[i - 1]?.type
  const next = els[i + 1]?.type
  return prev === 'SCENE_HEADING' && (next === undefined || next === 'SCENE_HEADING')
}

/** "(VO)" → "(V.O.)", "(CONTD)" → "(CONT'D)". The curly CONT’D is left alone. */
export function canonExtensions(cue: string): string {
  return cue.replace(/\(([^)]*)\)/g, (m, g1: string) => {
    const inner = g1.trim()
    if (inner.toUpperCase() === 'CONT’D') return m
    const f = extensionForms.find(([re]) => re.test(inner))
    return f ? `(${f[1]})` : m
  })
}

const hasStraySpaces = (t: string) => t.split(/\r?\n/).some(l => l !== l.trim() || l.includes('  '))
export const tidySpaces = (t: string) => t.split(/\r?\n/).map(l => l.trim().replace(/ {2,}/g, ' ')).join('\n')

function preview(t: string): string {
  const s = t.trim().replace(/\s+/g, ' ')
  return s.length > 60 ? s.substring(0, 57).trimEnd() + '…' : s
}
