/**
 * Autocomplete for the element being typed: cues, scene headings, transitions, parentheticals.
 *
 * Names, places and times are ranked by how often the script uses them and how close to the caret
 * they were last used, so the cast of the scene you're in comes first. Prefix matches lead; a name
 * can also be found by any word in it ("DEV" finds "THE DEVELOPER") or, failing that, by any part.
 */
import type { Element } from '../core/model'
import { characterName, EXTENSIONS, PARENTHETICALS, SCENE_PREFIXES, TIMES_OF_DAY, TRANSITIONS } from '../core/formatting'
import { location } from '../core/analysis'
import type { Here } from './commands'

export interface Suggestion {
  label: string
  /** The element's whole new text if accepted. */
  text: string
  hint?: string
}

/** How a name, place or time is used: how often, and where last (element index). */
interface Usage { key: string; count: number; last: number }

export interface SuggestCache {
  names: Usage[]
  locations: Usage[]
  times: Usage[]
  /** Character → the extensions they've been given, e.g. ELI → (V.O.). */
  extensions: Map<string, Usage[]>
}

const startsWithCi = (s: string, p: string) => s.toUpperCase().startsWith(p.toUpperCase())

function tally(map: Map<string, Usage>, key: string, at: number) {
  if (!key) return
  const u = map.get(key)
  if (u) { u.count++; u.last = at } else map.set(key, { key, count: 1, last: at })
}

/** Splits "INT. KITCHEN - NIGHT" into its time of day ("NIGHT"), if it has one. */
const timeOf = (heading: string) => {
  const dash = heading.lastIndexOf(' - ')
  return dash >= 0 ? heading.substring(dash + 3).trim().toUpperCase() : ''
}

export function suggestionCache(els: readonly Element[]): SuggestCache {
  const names = new Map<string, Usage>(), locs = new Map<string, Usage>(), times = new Map<string, Usage>()
  const ext = new Map<string, Map<string, Usage>>()
  els.forEach((e, i) => {
    if (e.type === 'CHARACTER') {
      const n = characterName(e.text)
      tally(names, n, i)
      for (const m of e.text.toUpperCase().matchAll(/\([^)]*\)/g)) {
        if (m[0] === "(CONT'D)") continue
        if (!ext.has(n)) ext.set(n, new Map())
        tally(ext.get(n)!, m[0], i)
      }
    } else if (e.type === 'SCENE_HEADING') {
      tally(locs, location(e.text), i)
      tally(times, timeOf(e.text), i)
    }
  })
  return {
    names: [...names.values()], locations: [...locs.values()], times: [...times.values()],
    extensions: new Map([...ext].map(([k, v]) => [k, [...v.values()]])),
  }
}

/** Frequency, plus a boost that fades with distance from the caret (about a scene's worth of elements). */
const score = (u: Usage, at: number) => u.count + 6 / (1 + Math.abs(at - u.last) / 30)

const ranked = (list: Usage[], at: number) => [...list].sort((a, b) => score(b, at) - score(a, at)).map(u => u.key)

/** Prefix matches first, then matches on the start of any word, then (for 2+ letters) anywhere. */
function find(keys: string[], typed: string): string[] {
  const t = typed.trim().toUpperCase()
  if (!t) return keys
  const prefix = keys.filter(k => k.startsWith(t) && k !== t)
  const word = keys.filter(k => !prefix.includes(k) && k !== t && k.split(/[\s.\-/]+/).some(w => w.startsWith(t)))
  const any = t.length >= 2 ? keys.filter(k => !prefix.includes(k) && !word.includes(k) && k !== t && k.includes(t)) : []
  return [...prefix, ...word, ...any]
}

/** Who usually answers: the speaker before the last one in this scene, then the rest of the scene's cast. */
function likelySpeakers(els: readonly Element[], index: number): string[] {
  const seq: string[] = []
  for (let i = index - 1; i >= 0; i--) {
    const e = els[i]
    if (e.type === 'SCENE_HEADING') break
    if (e.type === 'CHARACTER') { const n = characterName(e.text); if (n && seq[seq.length - 1] !== n) seq.push(n) }
    if (seq.length >= 4) break
  }
  const ordered: string[] = []
  if (seq[1]) ordered.push(seq[1])
  for (const n of seq) if (!ordered.includes(n)) ordered.push(n)
  return ordered
}

/** The heading of the scene before the one being written. */
function previousHeading(els: readonly Element[], index: number): string | null {
  for (let i = index - 1; i >= 0; i--) if (els[i].type === 'SCENE_HEADING') return els[i].text
  return null
}

export function suggestions(h: Here, els: readonly Element[], cache: SuggestCache): Suggestion[] {
  // Only while the caret is at the end of the line: completing mid-text would be surprising.
  if (h.offset < h.text.length) return []
  const raw = h.text
  const t = raw.toUpperCase()

  switch (h.type) {
    case 'CHARACTER': {
      const paren = raw.indexOf('(')
      if (paren >= 0) {
        const base = raw.substring(0, paren).trimEnd()
        const typed = raw.substring(paren).toUpperCase()
        const own = ranked(cache.extensions.get(characterName(base)) ?? [], h.index)
        const all = [...own, ...EXTENSIONS.filter(x => !own.includes(x))]
        return all.filter(x => x.startsWith(typed) && x !== typed).map(x => ({ label: x, text: `${base} ${x}`, hint: own.includes(x) ? 'used before' : undefined }))
      }
      const names = ranked(cache.names, h.index)
      if (!t.trim()) {
        const likely = likelySpeakers(els, h.index)
        const rest = names.filter(n => !likely.includes(n))
        return [...likely, ...rest].slice(0, 6).map((n, i) => ({ label: n, text: n, hint: i === 0 && likely.length ? 'likely next' : undefined }))
      }
      return find(names, t).slice(0, 7).map(n => ({ label: n, text: n }))
    }
    case 'SCENE_HEADING': {
      const prefix = SCENE_PREFIXES.find(p => t.startsWith(p))
      if (!prefix) {
        return SCENE_PREFIXES.filter(p => p.startsWith(t) && p !== t).map(p => ({ label: p.trim(), text: p }))
      }
      const prev = previousHeading(els, h.index)
      const prevLoc = prev ? location(prev) : ''
      const rest = raw.substring(prefix.length)
      const dash = rest.lastIndexOf(' - ')
      if (dash >= 0) {
        const tod = rest.substring(dash + 3).toUpperCase()
        const head = raw.substring(0, prefix.length + dash + 3)
        // Back in the same place: the scene most likely runs straight on.
        const same = prevLoc !== '' && rest.substring(0, dash).trim().toUpperCase() === prevLoc
        const flow = same ? ['CONTINUOUS', 'MOMENTS LATER', 'LATER'] : []
        const used = ranked(cache.times, h.index).filter(x => !flow.includes(x))
        const order = [...flow, ...used, ...TIMES_OF_DAY.filter(x => !flow.includes(x) && !used.includes(x))]
        return order.filter(x => x.startsWith(tod) && x !== tod).slice(0, 7)
          .map(x => ({ label: x, text: head + x, hint: flow.includes(x) && x === flow[0] ? 'same place' : undefined }))
      }
      const loc = rest.toUpperCase()
      if (loc.endsWith(' -') || loc.endsWith(' – ')) return []
      const places = ranked(cache.locations, h.index)
      // With nothing typed yet, offer the place we just left first.
      const order = !loc.trim() && prevLoc ? [prevLoc, ...places.filter(l => l !== prevLoc)] : places
      return find(order, loc).slice(0, 7).map(l => ({ label: l, text: raw.substring(0, prefix.length) + l + ' - ', hint: l === prevLoc && !loc.trim() ? 'last scene' : undefined }))
    }
    case 'TRANSITION':
      return TRANSITIONS.filter(x => startsWithCi(x, raw.trim()) && x !== t.trim()).map(x => ({ label: x, text: x }))
    case 'PARENTHETICAL': {
      const inner = raw.replace(/^\(/, '').replace(/\)$/, '')
      if (!inner) return PARENTHETICALS.map(x => ({ label: x, text: x }))
      return PARENTHETICALS.filter(x => startsWithCi(x.substring(1), inner) && x.substring(1, x.length - 1) !== inner).map(x => ({ label: x, text: x }))
    }
    default:
      return []
  }
}

/**
 * What to show as faint inline text after the caret: the rest of the chosen suggestion, when it
 * continues exactly what's been typed (a word or substring match can't be shown inline).
 */
export function ghostFor(typed: string, s: Suggestion | undefined): string {
  if (!s || !typed) return ''
  return s.text.length > typed.length && s.text.toUpperCase().startsWith(typed.toUpperCase()) ? s.text.substring(typed.length) : ''
}
