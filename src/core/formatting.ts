import type { ElementType } from './model'

/** Behavioural rules of the editor: what Enter / Tab / Backspace do, and smart type detection. */

/** Element created when Enter is pressed at the end of an element of [type]. */
export function nextOnEnter(type: ElementType): ElementType {
  switch (type) {
    case 'SCENE_HEADING': return 'ACTION'
    case 'ACTION': return 'ACTION'
    case 'CHARACTER': return 'DIALOGUE'
    case 'PARENTHETICAL': return 'DIALOGUE'
    case 'DIALOGUE': return 'CHARACTER'
    case 'LYRICS': return 'CHARACTER'
    case 'TRANSITION': return 'SCENE_HEADING'
    case 'SHOT': return 'ACTION'
    case 'CENTERED': return 'ACTION'
    case 'NOTE': return 'ACTION'
  }
}

/** Pressing Enter on an *empty* element changes its type instead of adding a row. */
export function onEnterWhenEmpty(type: ElementType): ElementType | null {
  switch (type) {
    case 'CHARACTER': return 'ACTION'
    case 'DIALOGUE': return 'ACTION'
    case 'PARENTHETICAL': return 'DIALOGUE'
    case 'ACTION': return 'CHARACTER'
    case 'SCENE_HEADING': return 'ACTION'
    case 'TRANSITION': return 'SCENE_HEADING'
    default: return null
  }
}

/** Tab cycles through the most useful types for the current one. */
export function nextOnTab(type: ElementType): ElementType {
  switch (type) {
    case 'ACTION': return 'CHARACTER'
    case 'CHARACTER': return 'TRANSITION'
    case 'TRANSITION': return 'SCENE_HEADING'
    case 'SCENE_HEADING': return 'ACTION'
    case 'DIALOGUE': return 'PARENTHETICAL'
    case 'PARENTHETICAL': return 'DIALOGUE'
    case 'SHOT': return 'ACTION'
    case 'LYRICS': return 'DIALOGUE'
    case 'CENTERED': return 'ACTION'
    case 'NOTE': return 'ACTION'
  }
}

/** Backspace on an empty element demotes it before deleting it (Final Draft–style). */
export function demote(type: ElementType): ElementType | null {
  switch (type) {
    case 'DIALOGUE': return 'CHARACTER'
    case 'PARENTHETICAL': return 'DIALOGUE'
    case 'LYRICS': return 'DIALOGUE'
    case 'CHARACTER': return 'ACTION'
    case 'TRANSITION': case 'SHOT': case 'CENTERED': case 'NOTE': return 'ACTION'
    case 'SCENE_HEADING': case 'ACTION': return null
  }
}

const sceneStart = /^(INT|EXT|EST|INT\.\/EXT|INT\/EXT|I\/E)[ .]/i

export const looksLikeSceneHeading = (text: string) => sceneStart.test(text.trimStart())

export function looksLikeTransition(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t === t.toUpperCase() &&
    (t.endsWith('TO:') || t === 'FADE OUT.' || t === 'FADE TO BLACK.' || t === 'FADE IN:')
}

/** While typing in an Action line, detect an obvious scene heading ("int. ") and return the type to switch to. */
export function detectWhileTyping(type: ElementType, text: string): ElementType | null {
  if (type === 'ACTION' && looksLikeSceneHeading(text) && text.length <= 12) return 'SCENE_HEADING'
  return null
}

/** On Enter, an all-caps action line that ends in "TO:" is really a transition. */
export function detectOnEnter(type: ElementType, text: string): ElementType | null {
  if (type === 'ACTION' && looksLikeTransition(text)) return 'TRANSITION'
  return null
}

/** Wrap parenthetical text in parentheses if the writer didn't. */
export function normalizeParenthetical(text: string): string {
  const t = text.trim()
  if (!t) return text
  let r = t
  if (!r.startsWith('(')) r = '(' + r
  if (!r.endsWith(')')) r = r + ')'
  return r
}

/** Character cue minus extensions: "JOHN (V.O.)" → "JOHN". */
export const characterName = (cue: string) =>
  cue.replace(/\(.*?\)/g, '').replaceAll('^', '').trim().toUpperCase()

export const TIMES_OF_DAY = ['DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'MORNING', 'EVENING', 'DAWN', 'DUSK', 'SAME TIME']
export const SCENE_PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EST. ']
export const TRANSITIONS = ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'FADE OUT.', 'FADE TO BLACK.', 'FADE IN:']
export const EXTENSIONS = ['(V.O.)', '(O.S.)', '(O.C.)', "(CONT'D)"]
export const PARENTHETICALS = ['(beat)', '(pause)', '(quietly)', '(sotto)', '(re: ', '(into phone)', '(continuing)']
