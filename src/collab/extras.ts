/** What a shared copy of a script carries besides its lines, and how a remote copy is folded into a local one. */
import { encodeExtras } from '../core/codec'
import type { Element, ScriptExtras } from '../core/model'

/** Story data everyone shares — not notes (they sync one by one) or pictures (they stay on each device), as on the phone. */
export function sharedExtras(x: ScriptExtras): string {
  const o = encodeExtras({
    ...x, comments: [], board: [],
    characters: x.characters.map(c => ({ ...c, photo: '' })), locations: x.locations.map(l => ({ ...l, photo: '' })),
    scenes: Object.fromEntries(Object.entries(x.scenes).map(([k, m]) => [k, { ...m, moods: [] }])),
  })
  return JSON.stringify(o)
}

/** Take the shared story data, keeping this device's own pictures and notes. */
export function mergeRemote(local: ScriptExtras, remote: ScriptExtras): ScriptExtras {
  const scenes: ScriptExtras['scenes'] = {}
  for (const id of new Set([...Object.keys(remote.scenes), ...Object.keys(local.scenes)])) {
    const m = { ...(remote.scenes[id] ?? { threads: [], breakdown: {}, moods: [] }), moods: local.scenes[id]?.moods ?? [] }
    if (m.threads.length || m.moods.length || Object.values(m.breakdown).some(v => v?.length)) scenes[id] = m
  }
  return {
    ...remote, scenes, board: local.board, comments: local.comments,
    characters: remote.characters.map(r => ({ ...r, photo: local.characters.find(c => c.name === r.name)?.photo ?? '' })),
    locations: remote.locations.map(r => ({ ...r, photo: local.locations.find(l => l.name === r.name)?.photo ?? '' })),
  }
}

/** Remote elements don't carry the writer's own casing; keep ours where the text still matches. */
export function keepCasing(local: readonly Element[], remote: Element[]): Element[] {
  const byId = new Map(local.map(e => [e.id, e]))
  return remote.map(r => {
    const l = byId.get(r.id)
    return l && l.orig != null && l.text === r.text ? { ...r, orig: l.orig } : r
  })
}

export const sameEls = (a: readonly Element[], b: readonly Element[]) =>
  a.length === b.length && a.every((x, i) => {
    const y = b[i]
    return x.id === y.id && x.type === y.type && x.text === y.text && x.dual === y.dual && x.revision === y.revision && x.color === y.color && x.synopsis === y.synopsis
  })
