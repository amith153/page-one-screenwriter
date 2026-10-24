/** Who wrote what: the colour an author gets, and the stamp put on a line when it is changed. */
import type { Element } from './model'

export const AUTHOR_COLORS = [0xFF4D9DFF, 0xFF3FBF7F, 0xFFB388FF, 0xFFFF5C8A, 0xFFFFB74D, 0xFF26C6DA, 0xFFE0B040]

/** Java's String.hashCode, so an author gets the same colour here as on the phone. */
function javaHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
export const colorFor = (id: string) => AUTHOR_COLORS[(javaHash(id) & 0x7fffffff) % AUTHOR_COLORS.length]
export const argbHex = (argb: number) => '#' + (argb >>> 0).toString(16).padStart(8, '0').substring(2)

export interface Author { id: string; name: string }

/** The id a draft with no stamps gets for a writer known only by name, so the same name keeps the same colour. */
export const guestId = (name: string) => 'guest:' + name.trim().toLowerCase()

const sameLine = (a: Element, b: Element) =>
  a.type === b.type && a.text === b.text && a.dual === b.dual && a.color === b.color && a.synopsis === b.synopsis

/**
 * [next] with every line that is new or different from [prev] stamped as written by [me]; lines that
 * didn't change keep their old stamp, whatever the editor handed back.
 */
export function stampEdits(prev: readonly Element[], next: readonly Element[], me: Author, now = Date.now()): Element[] {
  const before = new Map(prev.map(e => [e.id, e]))
  return next.map(e => {
    const p = before.get(e.id)
    if (p && sameLine(p, e)) return p.by === e.by && p.byName === e.byName && p.at === e.at ? e : { ...e, by: p.by, byName: p.byName, at: p.at }
    return { ...e, by: me.id, byName: me.name, at: now }
  })
}

/** A line taken from someone else's draft: if their file carries no stamp, credit it to them by name. */
export const credited = (e: Element, name: string, now = Date.now()): Element =>
  e.by ? e : { ...e, by: guestId(name), byName: name, at: e.at || now }

export interface Credit { name: string; color: number; at: number }

/** Who last changed each line that carries a stamp, by element id. */
export function authorsOf(els: readonly Element[]): Map<number, Credit> {
  const out = new Map<number, Credit>()
  for (const e of els) if (e.by) out.set(e.id, { name: e.byName || 'Writer', color: colorFor(e.by), at: e.at })
  return out
}

/** Every author in a script, newest first among equals, with how many lines each last touched. */
export function authorList(els: readonly Element[]): { id: string; name: string; color: number; lines: number }[] {
  const m = new Map<string, { id: string; name: string; color: number; lines: number }>()
  for (const e of els) {
    if (!e.by) continue
    const a = m.get(e.by) ?? { id: e.by, name: e.byName || 'Writer', color: colorFor(e.by), lines: 0 }
    a.lines++
    m.set(e.by, a)
  }
  return [...m.values()].sort((a, b) => b.lines - a.lines)
}
