/**
 * Track changes for screenplays: what changed between two drafts, element by element and word by
 * word. Elements are matched by id (ids survive edits, moves and restores), so a rewritten line is
 * a change to that line rather than a deletion plus an insertion.
 */
import { countWords, type Element, type ElementType } from './model'

export interface Op { kind: 'same' | 'ins' | 'del'; text: string }

export interface Change {
  kind: 'added' | 'removed' | 'changed'
  id: number
  type: ElementType
  /** Word-level edits from the old text to the new (for added/removed, the whole text). */
  ops: Op[]
  /** The element's index in the new draft; for a removed element, where it would have been. */
  index: number
  /** Removed elements: the id of the next element that survives (null: the end of the script). */
  before: number | null
}

export interface ChangeSummary {
  added: number
  removed: number
  changed: number
  wordsAdded: number
  wordsRemoved: number
  /** Scenes (by heading id) that gained, lost or rewrote anything. */
  scenesTouched: number
  scenesAdded: number
  scenesRemoved: number
}

/** Words and the spaces between them, so a diff can be put back together exactly. */
const tokens = (s: string) => s.split(/(\s+)/).filter(t => t !== '')

/** Longest-common-subsequence diff over words. Very long texts fall back to a whole replacement. */
export function wordDiff(a: string, b: string): Op[] {
  if (a === b) return a ? [{ kind: 'same', text: a }] : []
  const x = tokens(a), y = tokens(b)
  const n = x.length, m = y.length
  if (n * m > 400_000) return [...(a ? [{ kind: 'del' as const, text: a }] : []), ...(b ? [{ kind: 'ins' as const, text: b }] : [])]
  // dp[i][j]: LCS length of x[i..] and y[j..]
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: Op[] = []
  const push = (kind: Op['kind'], text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text; else out.push({ kind, text })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (x[i] === y[j]) { push('same', x[i]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push('del', x[i++])
    else push('ins', y[j++])
  }
  while (i < n) push('del', x[i++])
  while (j < m) push('ins', y[j++])
  return out
}

/** Every element added, removed or rewritten (text or type) between two drafts, in reading order. */
export function diffScripts(before: readonly Element[], after: readonly Element[]): Change[] {
  const old = new Map(before.map(e => [e.id, e]))
  const kept = new Set(after.map(e => e.id))
  const out: Change[] = []
  after.forEach((e, index) => {
    const o = old.get(e.id)
    if (!o) out.push({ kind: 'added', id: e.id, type: e.type, ops: e.text ? [{ kind: 'ins', text: e.text }] : [], index, before: null })
    else if (o.text !== e.text || o.type !== e.type) out.push({ kind: 'changed', id: e.id, type: e.type, ops: wordDiff(o.text, e.text), index, before: null })
  })
  // Removed elements sit just before the next element that survives.
  const indexOf = new Map(after.map((e, i) => [e.id, i]))
  before.forEach((e, i) => {
    if (kept.has(e.id)) return
    let next: number | null = null
    for (let k = i + 1; k < before.length; k++) if (kept.has(before[k].id)) { next = before[k].id; break }
    const index = next == null ? after.length : indexOf.get(next)!
    out.push({ kind: 'removed', id: e.id, type: e.type, ops: e.text ? [{ kind: 'del', text: e.text }] : [], index, before: next })
  })
  // Removed lines read before whatever now stands in their place.
  return out.sort((a, b) => a.index - b.index || (a.kind === 'removed' ? -1 : 0) - (b.kind === 'removed' ? -1 : 0))
}

/** The scene heading each element belongs to (by id), or 0 before the first scene. */
function sceneIds(els: readonly Element[]): Map<number, number> {
  const out = new Map<number, number>()
  let cur = 0
  for (const e of els) { if (e.type === 'SCENE_HEADING') cur = e.id; out.set(e.id, cur) }
  return out
}

export function summarize(changes: readonly Change[], before: readonly Element[], after: readonly Element[]): ChangeSummary {
  const s: ChangeSummary = { added: 0, removed: 0, changed: 0, wordsAdded: 0, wordsRemoved: 0, scenesTouched: 0, scenesAdded: 0, scenesRemoved: 0 }
  const sceneOfNew = sceneIds(after), sceneOfOld = sceneIds(before)
  const touched = new Set<number>()
  for (const c of changes) {
    s[c.kind]++
    for (const op of c.ops) {
      if (op.kind === 'ins') s.wordsAdded += countWords(op.text)
      if (op.kind === 'del') s.wordsRemoved += countWords(op.text)
    }
    if (c.type === 'SCENE_HEADING' && c.kind === 'added') s.scenesAdded++
    if (c.type === 'SCENE_HEADING' && c.kind === 'removed') s.scenesRemoved++
    touched.add((c.kind === 'removed' ? sceneOfOld.get(c.id) : sceneOfNew.get(c.id)) ?? 0)
  }
  s.scenesTouched = touched.size
  return s
}
