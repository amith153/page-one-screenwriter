/** Restructuring on the index-card board, and switching story structures. */
import { describe, expect, it } from 'vitest'
import { el, type Element } from '../core/model'
import { scenes } from '../core/analysis'
import { actBreaks, createStructure, switchStructure, TEMPLATES, template } from '../core/structures'
import { moveScene } from './Cards'

let id = 1
const scene = (h: string): Element[] => [el(id++, 'SCENE_HEADING', h), el(id++, 'ACTION', h.toLowerCase() + ' action')]
const order = (els: Element[]) => els.filter(e => e.type === 'SCENE_HEADING').map(e => e.text)

describe('moveScene', () => {
  const els = [el(id++, 'ACTION', 'FADE IN:'), ...scene('INT. A'), ...scene('INT. B'), ...scene('INT. C'), ...scene('INT. D')]
  const move = (from: number, to: number) => moveScene(els, scenes(els), from, to)

  it('moves a scene earlier, keeping its action with it', () => {
    const out = move(2, 0)
    expect(order(out)).toEqual(['INT. C', 'INT. A', 'INT. B', 'INT. D'])
    expect(out[0].text).toBe('FADE IN:')
    expect(out[2].text).toBe('int. c action')
  })
  it('moves a scene later and to the end', () => {
    expect(order(move(0, 2))).toEqual(['INT. B', 'INT. A', 'INT. C', 'INT. D'])
    expect(order(move(0, 4))).toEqual(['INT. B', 'INT. C', 'INT. D', 'INT. A'])
  })
  it('leaves the script alone when dropped in place', () => {
    expect(move(1, 1)).toBe(els)
    expect(move(1, 2)).toBe(els)
  })
  it('never loses or duplicates elements', () => {
    for (let f = 0; f < 4; f++) for (let t = 0; t <= 4; t++) {
      const out = move(f, t)
      expect(out.map(e => e.id).sort()).toEqual(els.map(e => e.id).sort())
    }
  })
})

describe('structures', () => {
  it('every template is well formed', () => {
    const ids = new Set<string>()
    for (const t of TEMPLATES) {
      expect(ids.has(t.id)).toBe(false); ids.add(t.id)
      const fs = t.beats.map(b => b[2])
      expect(fs).toEqual([...fs].sort((a, b) => a - b))
      expect(fs.every(f => f >= 0 && f < 1)).toBe(true)
      expect(new Set(t.beats.map(b => b[0])).size).toBe(t.beats.length)
    }
  })
  it('act breaks come from the template, or from the beats of one it does not know', () => {
    const st = createStructure(template('syd_field')!)
    expect(actBreaks(st)).toEqual([0.23, 0.75])
    expect(actBreaks({ ...st, template: 'from_the_future' })).toEqual([0.23, 0.75])
    expect(actBreaks(null)).toEqual([0.25, 0.75])
  })
  it('switching keeps scenes on beats with the same name', () => {
    const old = createStructure(template('three_act')!)
    old.beats.find(b => b.name === 'Midpoint')!.sceneIds = [42]
    old.beats.find(b => b.name === 'Hook')!.sceneIds = [7]
    const next = switchStructure(old, template('syd_field')!)
    expect(next.template).toBe('syd_field')
    expect(next.beats.find(b => b.name === 'Midpoint')!.sceneIds).toEqual([42])
    expect(next.beats.flatMap(b => b.sceneIds)).toEqual([42])
  })
})
