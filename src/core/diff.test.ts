import { describe, expect, it } from 'vitest'
import { el } from './model'
import { diffScripts, summarize, wordDiff } from './diff'

describe('track changes', () => {
  it('diffs words and keeps the spacing', () => {
    const ops = wordDiff('Eli puts down the can.', 'Eli slowly puts down the film can.')
    expect(ops.filter(o => o.kind === 'ins').map(o => o.text.trim())).toEqual(['slowly', 'film'])
    expect(ops.filter(o => o.kind !== 'del').map(o => o.text).join('')).toBe('Eli slowly puts down the film can.')
    expect(ops.filter(o => o.kind !== 'ins').map(o => o.text).join('')).toBe('Eli puts down the can.')
  })

  it('matches elements by id: rewrites, additions and removals in reading order', () => {
    const before = [el(1, 'SCENE_HEADING', 'INT. BOOTH - NIGHT'), el(2, 'ACTION', 'Dust.'), el(3, 'ACTION', 'Eli waits.'), el(4, 'ACTION', 'Rain.')]
    const after = [el(1, 'SCENE_HEADING', 'INT. BOOTH - NIGHT'), el(3, 'ACTION', 'Eli waits, smiling.'), el(5, 'ACTION', 'Thunder.'), el(4, 'ACTION', 'Rain.')]
    const c = diffScripts(before, after)
    expect(c.map(x => `${x.kind}:${x.id}`)).toEqual(['removed:2', 'changed:3', 'added:5'])
    expect(c[0].before).toBe(3)
    const s = summarize(c, before, after)
    expect(s).toMatchObject({ added: 1, removed: 1, changed: 1, scenesTouched: 1, wordsAdded: 3, wordsRemoved: 2 })
  })

  it('reports nothing for identical drafts', () => {
    const els = [el(1, 'ACTION', 'Same.')]
    expect(diffScripts(els, els)).toEqual([])
  })
})
