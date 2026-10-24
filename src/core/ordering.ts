/**
 * Fractional ordering keys for live sync (port of `core/Ordering.kt`). Each element carries a
 * number "position"; the script is the elements sorted by it. When the local order changes we keep
 * as many existing keys as possible (longest increasing subsequence) and only give new keys to the
 * elements that moved or were inserted — so a typical edit rewrites one or two documents.
 */
export const GAP = 1024

export function assignOrder(ids: number[], existing: Map<number, number>): Map<number, number> {
  const n = ids.length
  const vals = ids.map(id => existing.get(id) ?? NaN)
  const idx = vals.flatMap((v, i) => (isNaN(v) ? [] : [i]))
  const tails: number[] = []
  const prev = new Array<number>(idx.length).fill(-1)
  idx.forEach((i, k) => {
    let lo = 0, hi = tails.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (vals[idx[tails[m]]] < vals[i]) lo = m + 1; else hi = m }
    if (lo > 0) prev[k] = tails[lo - 1]
    if (lo === tails.length) tails.push(k); else tails[lo] = k
  })
  const keep = new Array<boolean>(n).fill(false)
  for (let t = tails.length ? tails[tails.length - 1] : -1; t >= 0; t = prev[t]) keep[idx[t]] = true

  const out = new Map<number, number>()
  let i = 0
  let lastKept = NaN
  while (i < n) {
    if (keep[i]) { out.set(ids[i], vals[i]); lastKept = vals[i]; i++; continue }
    let j = i
    while (j < n && !keep[j]) j++
    const lo = isNaN(lastKept) ? (j < n ? vals[j] - GAP * (j - i + 1) : 0) : lastKept
    const hi = j < n ? vals[j] : lo + GAP * (j - i + 1)
    const step = (hi - lo) / (j - i + 1)
    for (let k = i; k < j; k++) out.set(ids[k], lo + step * (k - i + 1))
    i = j
  }
  const sorted = ids.map(id => out.get(id)!)
  if (sorted.some((v, k) => k > 0 && v - sorted[k - 1] < 1e-6)) ids.forEach((id, k) => out.set(id, (k + 1) * GAP))
  return out
}
