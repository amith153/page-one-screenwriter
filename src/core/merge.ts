/**
 * Three-way merge of two versions of a script that share element ids (port of `core/Merge.kt`),
 * and a word-level diff (port of `core/Diff.kt`).
 */
import { el, newId, type Element } from './model'

export interface MergeResult { elements: Element[]; added: number; changed: number; deleted: number; conflicts: number }

const same = (a: Element, b: Element) =>
  a.type === b.type && a.text === b.text && a.dual === b.dual && a.color === b.color && a.synopsis === b.synopsis

/** How to settle a line both writers changed: keep mine, take theirs, or keep mine with theirs in a note beneath. */
export type Resolution = 'mine' | 'theirs' | 'both'

export function threeWay(base: Element[] | null, local: Element[], remote: Element[], theirName = 'Co-writer', ids: () => number = newId,
  resolve: (id: number) => Resolution = () => 'both'): MergeResult {
  const B = new Map((base ?? []).map(e => [e.id, e]))
  const L = new Map(local.map(e => [e.id, e]))
  const R = new Map(remote.map(e => [e.id, e]))
  let added = 0, changed = 0, deleted = 0, conflicts = 0

  const keep = new Map<number, Element>()
  const conflictNotes = new Map<number, Element>()
  for (const l of local) {
    const r = R.get(l.id)
    const b = B.get(l.id)
    if (r) {
      if (same(l, r)) keep.set(l.id, l)
      else if (b && same(l, b)) { keep.set(l.id, { ...r, revision: Math.max(l.revision, r.revision) }); changed++ }
      else if (b && same(r, b)) keep.set(l.id, l)
      else {
        const how = resolve(l.id)
        keep.set(l.id, how === 'theirs' ? r : l)
        if (how === 'both') conflictNotes.set(l.id, el(ids(), 'NOTE', `${theirName}'s version: ${r.text}`))
        conflicts++
      }
    } else if (b && same(l, b)) deleted++
    else keep.set(l.id, l)
  }
  for (const r of remote) {
    if (L.has(r.id)) continue
    const b = B.get(r.id)
    if (!b || !same(r, b)) { keep.set(r.id, r); added++ }
  }

  // Order: if we didn't reorder anything since the base but they did, follow theirs.
  const common = local.map(e => e.id).filter(id => R.has(id))
  const baseCommon = (base ?? []).map(e => e.id).filter(id => L.has(id) && R.has(id))
  const localOrderUnchanged = base != null && common.length === baseCommon.length && common.every((v, i) => v === baseCommon[i])
  const remoteCommon = remote.map(e => e.id).filter(id => L.has(id))
  const remoteReordered = !(common.length === remoteCommon.length && common.every((v, i) => v === remoteCommon[i]))
  const primary = localOrderUnchanged && remoteReordered ? remote : local
  const secondary = primary === remote ? local : remote

  const out: Element[] = []
  const placed = new Set<number>()
  const noteIds = new Set([...conflictNotes.values()].map(n => n.id))
  for (const e of primary) {
    const k = keep.get(e.id)
    if (!k) continue
    out.push(k); placed.add(k.id)
    const n = conflictNotes.get(k.id); if (n) out.push(n)
  }
  // Insert the rest after their nearest predecessor in the other ordering.
  let anchor: number | null = null
  for (const e of secondary) {
    const k = keep.get(e.id)
    if (!k) continue
    if (placed.has(k.id)) { anchor = k.id; continue }
    let at = anchor == null ? 0 : out.findIndex(x => x.id === anchor) + 1
    while (at < out.length && out[at].type === 'NOTE' && noteIds.has(out[at].id)) at++
    out.splice(at, 0, k); placed.add(k.id); anchor = k.id
    const n = conflictNotes.get(k.id); if (n) out.splice(at + 1, 0, n)
  }
  return { elements: out, added, changed, deleted, conflicts }
}

// ---------------------------------------------------------------- merging a draft passed back

/** One thing a returned draft would change, for the writer to accept or not. */
export type MergeOp =
  | { kind: 'change'; id: number; mine: Element; theirs: Element }
  | { kind: 'add'; id: number; theirs: Element }
  | { kind: 'delete'; id: number; mine: Element }
  | { kind: 'conflict'; id: number; mine: Element; theirs: Element }

/** Everything [remote] changes relative to [base] that [local] doesn't already have, in script order. */
export function planMerge(base: Element[] | null, local: Element[], remote: Element[]): MergeOp[] {
  const B = new Map((base ?? []).map(e => [e.id, e]))
  const L = new Map(local.map(e => [e.id, e]))
  const R = new Map(remote.map(e => [e.id, e]))
  const onMine = new Map<number, MergeOp>()
  for (const l of local) {
    const r = R.get(l.id), b = B.get(l.id)
    if (r) {
      if (same(l, r)) continue
      if (b && same(l, b)) onMine.set(l.id, { kind: 'change', id: l.id, mine: l, theirs: r })
      else if (!(b && same(r, b))) onMine.set(l.id, { kind: 'conflict', id: l.id, mine: l, theirs: r })
    } else if (b && same(l, b)) onMine.set(l.id, { kind: 'delete', id: l.id, mine: l })
  }
  // Their new lines, grouped under the last line both drafts share before them.
  const addsAfter = new Map<number | null, MergeOp[]>()
  let anchor: number | null = null
  for (const r of remote) {
    if (L.has(r.id)) { anchor = r.id; continue }
    const b = B.get(r.id)
    if (!b || !same(r, b)) addsAfter.set(anchor, [...(addsAfter.get(anchor) ?? []), { kind: 'add', id: r.id, theirs: r }])
  }
  const ops: MergeOp[] = [...(addsAfter.get(null) ?? [])]
  for (const l of local) {
    const o = onMine.get(l.id)
    if (o) ops.push(o)
    ops.push(...(addsAfter.get(l.id) ?? []))
  }
  return ops
}

/**
 * Merge only the accepted parts of [remote]: a rejected change keeps my line, a rejected addition
 * stays out, a rejected deletion keeps my line where it is; conflicts follow [resolutions].
 */
export function applyMerge(base: Element[] | null, local: Element[], remote: Element[], ops: MergeOp[], accepted: Set<number>,
  resolutions: Map<number, Resolution>, theirName = 'Co-writer'): MergeResult {
  const L = new Map(local.map(e => [e.id, e]))
  let r: Element[] = remote.filter(e => !ops.some(o => o.kind === 'add' && o.id === e.id && !accepted.has(o.id)))
  r = r.map(e => (ops.some(o => o.kind === 'change' && o.id === e.id && !accepted.has(o.id)) ? L.get(e.id) ?? e : e))
  for (const o of ops) {
    if (o.kind !== 'delete' || accepted.has(o.id)) continue
    // Keep my line: put it back after the line before it in my draft.
    const i = local.findIndex(e => e.id === o.id)
    let after = -1
    for (let k = i - 1; k >= 0 && after < 0; k--) after = r.findIndex(e => e.id === local[k].id)
    r.splice(after + 1, 0, o.mine)
  }
  return threeWay(base, local, r, theirName, newId, id => resolutions.get(id) ?? 'both')
}

/**
 * A draft from another app (Fountain, Final Draft) has its own element ids. Give each line the id of
 * the matching line in [reference] — same type and text in the same order, or failing that the
 * same type in the same gap between matches (an edited line) — so a three-way merge can follow it.
 */
export function alignIds(reference: readonly Element[], incoming: readonly Element[], ids: () => number = newId): Element[] {
  const key = (e: Element) => e.type + '\u0000' + e.text.trim()
  const n = reference.length, m = incoming.length
  const pairs: [number, number][] = []
  if (n * m <= 16_000_000) {
    const w = m + 1
    const dp = new Int32Array((n + 1) * w)
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
      dp[i * w + j] = key(reference[i]) === key(incoming[j]) ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    let i = 0, j = 0
    while (i < n && j < m) {
      if (key(reference[i]) === key(incoming[j])) { pairs.push([i, j]); i++; j++ }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++
      else j++
    }
  } else {
    // Very long scripts: match lines greedily in order.
    let i = 0
    for (let j = 0; j < m && i < n; j++) {
      const k = reference.findIndex((e, x) => x >= i && key(e) === key(incoming[j]))
      if (k >= 0) { pairs.push([k, j]); i = k + 1 }
    }
  }
  const idOf = new Map<number, number>()
  const gaps: [number, number, number, number][] = []
  let pi = 0, pj = 0
  for (const [i, j] of [...pairs, [n, m] as [number, number]]) {
    gaps.push([pi, i, pj, j])
    if (i < n) idOf.set(j, reference[i].id)
    pi = i + 1; pj = j + 1
  }
  for (const [i0, i1, j0, j1] of gaps) {
    let i = i0
    for (let j = j0; j < j1; j++) {
      while (i < i1 && reference[i].type !== incoming[j].type) i++
      if (i < i1) { idOf.set(j, reference[i].id); i++ }
    }
  }
  return incoming.map((e, j) => ({ ...e, id: idOf.get(j) ?? ids() }))
}

export type DiffOp = 'SAME' | 'ADDED' | 'REMOVED'
export interface Piece { op: DiffOp; text: string }

export function diffWords(before: string, after: string): Piece[] {
  const a = before.match(/\s+|[^\s]+/g) ?? []
  const b = after.match(/\s+|[^\s]+/g) ?? []
  // Keep it cheap on very long elements.
  if (a.length * b.length > 400_000) return [{ op: 'REMOVED', text: before }, { op: 'ADDED', text: after }]
  const n = a.length, m = b.length
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: Piece[] = []
  const add = (op: DiffOp, t: string) => {
    const last = out[out.length - 1]
    if (last && last.op === op) last.text += t; else out.push({ op, text: t })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { add('SAME', a[i]); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { add('REMOVED', a[i]); i++ }
    else { add('ADDED', b[j]); j++ }
  }
  while (i < n) add('REMOVED', a[i++])
  while (j < m) add('ADDED', b[j++])
  return out
}
