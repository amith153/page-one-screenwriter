import { describe, expect, it } from 'vitest'
import { el, type Element, type ElementType } from '../core/model'
import { ghostFor, suggestionCache, suggestions } from './suggest'
import type { Here } from './commands'

/** The caret at the end of the last element. */
function at(els: Element[]): Here {
  const index = els.length - 1
  const e = els[index]
  return { node: null as never, pos: 0, index, offset: e.text.length, text: e.text, type: e.type }
}

const script = (...rows: [ElementType, string][]) => rows.map(([t, s], i) => el(i + 1, t, s))

describe('autocomplete', () => {
  const base = script(
    ['SCENE_HEADING', 'INT. PROJECTION BOOTH - NIGHT'], ['CHARACTER', 'ELI'], ['DIALOGUE', 'Hi.'],
    ['CHARACTER', 'THE DEVELOPER (V.O.)'], ['DIALOGUE', 'No.'],
    ['SCENE_HEADING', 'EXT. PALACE CINEMA - DAY'], ['CHARACTER', 'NADIA'], ['DIALOGUE', 'Yes.'],
  )

  it('offers the place just left first, then runs the time on when it is the same place', () => {
    const els = [...base, el(99, 'SCENE_HEADING', 'INT. ')]
    const first = suggestions(at(els), els, suggestionCache(els))[0]
    expect(first.label).toBe('PALACE CINEMA')
    expect(first.hint).toBe('last scene')
    const els2 = [...base, el(99, 'SCENE_HEADING', 'EXT. PALACE CINEMA - ')]
    expect(suggestions(at(els2), els2, suggestionCache(els2))[0].label).toBe('CONTINUOUS')
  })

  it('finds a name by any word in it', () => {
    const els = [...base, el(99, 'CHARACTER', 'DEV')]
    expect(suggestions(at(els), els, suggestionCache(els)).map(s => s.label)).toContain('THE DEVELOPER')
  })

  it("remembers a character's extensions", () => {
    const els = [...base, el(99, 'CHARACTER', 'THE DEVELOPER (')]
    const first = suggestions(at(els), els, suggestionCache(els))[0]
    expect(first.label).toBe('(V.O.)')
    expect(first.hint).toBe('used before')
  })

  it('ranks the cast near the caret above the rest', () => {
    const els = [...base, el(99, 'CHARACTER', '')]
    expect(suggestions(at(els), els, suggestionCache(els))[0].label).toBe('NADIA')
  })

  it('shows ghost text only for a completion of what was typed', () => {
    expect(ghostFor('INT. PRO', { label: '', text: 'INT. PROJECTION BOOTH - ' })).toBe('JECTION BOOTH - ')
    expect(ghostFor('dev', { label: '', text: 'THE DEVELOPER' })).toBe('')
  })
})
