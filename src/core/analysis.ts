import { countWords, TYPE_INFO, type Element } from './model'
import { characterName } from './formatting'

export interface SceneInfo {
  elementIndex: number
  endIndex: number // exclusive
  number: number
  heading: string
  color: number
  synopsis: string
  elementId: number
  words: number
  preview: string // first action text, for cards
}

export interface CharacterStat { name: string; cues: number; words: number; scenes: number }

export interface ScriptStats {
  words: number; scenes: number; interior: number; exterior: number; day: number; night: number
  characters: CharacterStat[]; dialogueWords: number; actionWords: number
}

export function scenes(elements: readonly Element[]): SceneInfo[] {
  const heads: number[] = []
  elements.forEach((e, i) => { if (e.type === 'SCENE_HEADING') heads.push(i) })
  return heads.map((start, n) => {
    const end = n + 1 < heads.length ? heads[n + 1] : elements.length
    let words = 0
    let preview = ''
    for (let i = start + 1; i < end; i++) {
      const e = elements[i]
      if (TYPE_INFO[e.type].printed) words += countWords(e.text)
      if (!preview && e.type === 'ACTION' && e.text.trim()) preview = e.text
    }
    const h = elements[start]
    return { elementIndex: start, endIndex: end, number: n + 1, heading: h.text, color: h.color, synopsis: h.synopsis, elementId: h.id, words, preview }
  })
}

/** Index of the scene heading at or before index, or -1. */
export function sceneIndexFor(elements: readonly Element[], index: number): number {
  for (let i = Math.min(index, elements.length - 1); i >= 0; i--) if (elements[i].type === 'SCENE_HEADING') return i
  return -1
}

/** For each element: should a (CONT'D) be shown automatically after this character cue? */
export function contd(elements: readonly Element[]): boolean[] {
  const out = new Array<boolean>(elements.length).fill(false)
  let last: string | null = null
  elements.forEach((e, i) => {
    if (e.type === 'SCENE_HEADING') last = null
    else if (e.type === 'CHARACTER') {
      const name = characterName(e.text)
      const up = e.text.toUpperCase()
      const explicit = up.includes("CONT'D") || up.includes('CONT’D')
      if (name && name === last && !explicit && !e.dual) out[i] = true
      if (name) last = name
    }
  })
  return out
}

function byFrequency(names: string[]): string[] {
  const counts = new Map<string, number>()
  for (const n of names) if (n) counts.set(n, (counts.get(n) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
}

/** Distinct character names, most frequent first. */
export const characterNames = (elements: readonly Element[]) =>
  byFrequency(elements.filter(e => e.type === 'CHARACTER').map(e => characterName(e.text)))

/** Distinct locations used in scene headings ("INT. KITCHEN - DAY" → "KITCHEN"). */
export const locations = (elements: readonly Element[]) =>
  byFrequency(elements.filter(e => e.type === 'SCENE_HEADING').map(e => location(e.text)))

export function location(heading: string): string {
  let h = heading.trim().toUpperCase()
  h = h.replace(/^(INT\.\/EXT\.|INT\/EXT\.?|I\/E\.?|INT\.?|EXT\.?|EST\.?)\s*/, '')
  const dash = h.lastIndexOf(' - ')
  if (dash >= 0) h = h.substring(0, dash)
  return h.trim()
}

export function stats(elements: readonly Element[]): ScriptStats {
  let words = 0, dWords = 0, aWords = 0, interior = 0, exterior = 0, day = 0, night = 0, sceneCount = 0
  const chars = new Map<string, { cues: number; words: number; scenes: Set<number> }>()
  let current: string | null = null
  let sceneNo = 0
  for (const e of elements) {
    if (!TYPE_INFO[e.type].printed) continue
    const w = countWords(e.text)
    words += w
    switch (e.type) {
      case 'SCENE_HEADING': {
        sceneCount++; sceneNo++
        const u = e.text.toUpperCase()
        if (u.startsWith('INT') || u.startsWith('I/E')) interior++
        if (u.startsWith('EXT') || u.includes('/EXT') || u.startsWith('I/E')) exterior++
        if (u.includes('NIGHT') || u.includes('EVENING') || u.includes('DUSK')) night++
        else if (u.includes('DAY') || u.includes('MORNING') || u.includes('DAWN') || u.includes('AFTERNOON')) day++
        current = null
        break
      }
      case 'CHARACTER': {
        const n = characterName(e.text)
        current = n || null
        if (n) {
          let a = chars.get(n)
          if (!a) { a = { cues: 0, words: 0, scenes: new Set() }; chars.set(n, a) }
          a.cues++; a.scenes.add(sceneNo)
        }
        break
      }
      case 'DIALOGUE': case 'LYRICS':
        dWords += w
        if (current) { const a = chars.get(current); if (a) a.words += w }
        break
      case 'ACTION': aWords += w; current = null; break
    }
  }
  const cs = [...chars.entries()].map(([name, v]) => ({ name, cues: v.cues, words: v.words, scenes: v.scenes.size }))
    .sort((a, b) => b.words - a.words)
  return { words, scenes: sceneCount, interior, exterior, day, night, characters: cs, dialogueWords: dWords, actionWords: aWords }
}
