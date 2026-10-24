/**
 * Ports of the Android unit tests (ScriptDoctorTest.kt, ProductionTest.kt). Same inputs, same
 * expectations — so the desktop core behaves exactly like the phone's.
 */
import { describe, expect, it } from 'vitest'
import { commentRange, el as mk, newScript, titlePage, type Element, type ElementType, type ScriptExtras } from './model'
import { check, canonExtensions, fixAll, oneEditApart, RULES, variants, ACTION_MAX_LINES, type Rule } from './doctor'
import { cells, defaultLayout, FULL_WIDTH, linesPerPage, Paginator, runs, tall, wrap } from './paginator'
import { characterRows, charactersCsv, eighths, forcedBreaks, formatEighths, lock, nextLabel, omitScene, plan, sceneLabels, scenesCsv, sides, xray } from './production'
import { checkBeats, createStructure, template } from './structures'
import { decodeScript, encodeScript } from './codec'
import { parseFountain, writeFountain } from './fountain'
import { parseFdx, writeFdx } from './fdx'
import { authorList, stampEdits } from './authors'
import { alignIds, applyMerge, planMerge, threeWay } from './merge'

let nextId = 1
const el = (type: ElementType, text: string): Element => mk(nextId++, type, text)
const h = (t: string) => el('SCENE_HEADING', t)
const a = (t: string) => el('ACTION', t)
const c = (t: string) => el('CHARACTER', t)
const d = (t: string) => el('DIALOGUE', t)
const p = (t: string) => el('PARENTHETICAL', t)
const tr = (t: string) => el('TRANSITION', t)
const ids = () => nextId++

const goodTitle = titlePage({ title: 'Test', credits: [{ role: 'Written by', names: 'Amit' }], email: 'a@b.c' })
const script = (...els: Element[]) => newScript({ id: 's', title: 'Test', elements: els, titlePage: goodTitle })
const rules = (s: ReturnType<typeof script>) => check(s).map(i => i.rule)

describe('Script Doctor', () => {
  it('clean script has no issues', () => {
    const s = script(h('INT. KITCHEN - DAY'), a('Maya pours coffee.'), c('MAYA'), p('(quietly)'), d('Morning.'), tr('CUT TO:'), h('EXT. STREET - NIGHT'), a('Rain.'))
    expect(rules(s)).toEqual([])
  })

  it('cue without dialogue', () => {
    const s = script(h('INT. ROOM - DAY'), c('MAYA'), a('She leaves.'), a('End.'))
    const issues = check(s).filter(i => i.rule === 'CUE_WITHOUT_DIALOGUE')
    expect(issues).toHaveLength(1)
    expect(issues[0].fixes.map(f => f.label)).toEqual(['Make the next line dialogue', 'Make it action'])
    const fixed = issues[0].fixes[0].apply(s.elements, ids)
    expect(fixed[2].type).toBe('DIALOGUE')
    expect(rules({ ...s, elements: fixed })).not.toContain('CUE_WITHOUT_DIALOGUE')
  })

  it('cue being typed at the end is not flagged', () => {
    expect(rules(script(h('INT. ROOM - DAY'), a('Quiet.'), c('MAYA')))).not.toContain('CUE_WITHOUT_DIALOGUE')
  })

  it('orphan dialogue', () => {
    expect(rules(script(h('INT. ROOM - DAY'), a('Quiet.'), d('Hello?')))).toContain('ORPHAN_DIALOGUE')
  })

  it('parenthetical ending a speech becomes action', () => {
    const s = script(h('INT. ROOM - DAY'), c('MAYA'), d('Fine.'), p('(she walks out)'), a('Silence.'))
    const issue = check(s).filter(i => i.rule === 'PAREN_ENDS_SPEECH')
    expect(issue).toHaveLength(1)
    const fixed = issue[0].fixes[0].apply(s.elements, ids)
    expect(fixed[3].type).toBe('ACTION')
    expect(fixed[3].text).toBe('She walks out.')
  })

  it('character spelling variants', () => {
    const els = [h('INT. ROOM - DAY')]
    for (let k = 0; k < 9; k++) els.push(c('MAYA'), d(`Line ${k}.`))
    els.push(c('MAYAH (V.O.)'), d('Typo.'), c('DR. SMITH'), d('Hi.'), c('DR SMITH'), d('Hi.'))
    const s = script(...els)
    const issues = check(s).filter(i => i.rule === 'CHARACTER_VARIANT')
    expect(new Set(issues.map(i => i.subject))).toEqual(new Set(['MAYAH', 'DR SMITH']))
    const fixed = issues.find(i => i.subject === 'MAYAH')!.fixes[0].apply(s.elements, ids)
    expect(fixed.some(e => e.text === 'MAYA (V.O.)')).toBe(true)
    expect(fixed.some(e => e.text.startsWith('MAYAH'))).toBe(false)
  })

  it('different people with similar names are not merged', () => {
    const els = [h('INT. ROOM - DAY')]
    for (let k = 0; k < 5; k++) els.push(c('JOHN'), d('Hi.'), c('JOAN'), d('Hi.'))
    expect(rules(script(...els))).not.toContain('CHARACTER_VARIANT')
    expect(variants(new Map([['TOM', 20], ['TIM', 1]]), 4)).toEqual([])
  })

  it('location variants', () => {
    const s = script(h("INT. JOHN'S APARTMENT - DAY"), a('x.'), h("INT. JOHN'S APARTMENT - NIGHT"), a('x.'), h('INT. JOHNS APARTMENT - NIGHT'), a('x.'))
    const issue = check(s).filter(i => i.rule === 'LOCATION_VARIANT')
    expect(issue).toHaveLength(1)
    expect(issue[0].fixes[0].apply(s.elements, ids)[4].text).toBe("INT. JOHN'S APARTMENT - NIGHT")
  })

  it('heading checks', () => {
    const s = script(h('KITCHEN'), a('x.'), h('INT HALL - DAY'), a('x.'), h('EXT. GARDEN'), a('x.'), h('MONTAGE'), a('x.'))
    const r = rules(s)
    expect(r).toContain('HEADING_NO_PREFIX')
    expect(r).toContain('HEADING_PREFIX_FORMAT')
    expect(r).toContain('HEADING_NO_TIME')
    expect(r.filter(x => x === 'HEADING_NO_PREFIX')).toHaveLength(1)
    const noTime = check(s).find(i => i.rule === 'HEADING_NO_TIME')!
    expect(noTime.fixes[1].apply(s.elements, ids)[4].text).toBe('EXT. GARDEN - NIGHT')
    const period = check(s).find(i => i.rule === 'HEADING_PREFIX_FORMAT')!
    expect(period.fixes[0].apply(s.elements, ids)[2].text).toBe('INT. HALL - DAY')
  })

  it('extensions', () => {
    expect(canonExtensions('MAYA (VO)')).toBe('MAYA (V.O.)')
    expect(canonExtensions('MAYA (O.S)')).toBe('MAYA (O.S.)')
    expect(canonExtensions('MAYA (CONTD)')).toBe("MAYA (CONT'D)")
    expect(canonExtensions('MAYA (CONT’D)')).toBe('MAYA (CONT’D)')
    expect(canonExtensions('MAYA (INTO PHONE)')).toBe('MAYA (INTO PHONE)')
  })

  it('cue that is really action', () => {
    expect(rules(script(h('INT. ROOM - DAY'), c('SHE WALKS SLOWLY TO THE DOOR AND STOPS.'), d('x')))).toContain('CUE_LOOKS_LIKE_ACTION')
    expect(rules(script(h('INT. ROOM - DAY'), c('MRS. ROBINSON'), d('x')))).not.toContain('CUE_LOOKS_LIKE_ACTION')
  })

  it('transitions', () => {
    const s = script(h('INT. ROOM - DAY'), a('x.'), tr('CUT TO'), a('Still here.'))
    expect(rules(s)).toContain('TRANSITION_PUNCTUATION')
    const fixed = fixAll(s.elements, check(s), ids)
    expect(fixed[2].text).toBe('CUT TO:')
    expect(rules({ ...s, elements: fixed })).toContain('TRANSITION_NOT_INTO_SCENE')
    const fade = script(h('INT. ROOM - DAY'), a('x.'), tr('FADE OUT'))
    const ff = fixAll(fade.elements, check(fade), ids)
    expect(ff[ff.length - 1].text).toBe('FADE OUT.')
  })

  it('long action splits at sentences', () => {
    const sentence = 'Maya crosses the room, past the broken lamp and the boxes nobody unpacked.'
    const text = Array(6).fill(sentence).join(' ')
    const s = script(h('INT. ROOM - DAY'), a(text), a('End.'))
    const issue = check(s).filter(i => i.rule === 'LONG_ACTION')
    expect(issue).toHaveLength(1)
    const fixed = issue[0].fixes[0].apply(s.elements, ids)
    expect(fixed.length).toBeGreaterThan(s.elements.length)
    for (const e of fixed.filter(e => e.type === 'ACTION')) expect(wrap(e.text, FULL_WIDTH).length).toBeLessThanOrEqual(ACTION_MAX_LINES)
    expect(fixed.slice(1, -1).map(e => e.text).join(' ')).toBe(text)
    expect(new Set(fixed.map(e => e.id)).size).toBe(fixed.length)
  })

  it('empty elements and spaces fix all', () => {
    const s = script(h('INT. ROOM - DAY'), a('Two  spaces. '), a(''), c('MAYA'), p('beat'), d('Hi.'), h('EXT. YARD - DAY'), a(''), h('EXT. ROAD - DAY'), a('End.'))
    const issues = check(s)
    expect(issues.filter(i => i.rule === 'EMPTY_ELEMENT')).toHaveLength(1)
    const fixed = fixAll(s.elements, issues, ids)
    expect(fixed[1].text).toBe('Two spaces.')
    expect(fixed.find(e => e.type === 'PARENTHETICAL')!.text).toBe('(beat)')
    expect(fixed.length).toBe(s.elements.length - 1)
    expect(check({ ...s, elements: fixed }).some(i => RULES[i.rule].batchSafe)).toBe(false)
  })

  it('fixes are no-ops once applied', () => {
    const s = script(h('INT. ROOM - DAY'), a('Two  spaces.'), a('End.'))
    const fix = check(s).find(i => i.rule === 'STRAY_SPACES')!.fixes[0]
    const once = fix.apply(s.elements, ids)
    expect(fix.apply(once, ids)).toBe(once)
  })

  it('title page checks', () => {
    const r = check(newScript({ id: 's', title: 'T', elements: [h('INT. ROOM - DAY'), a('x.')], titlePage: titlePage({ title: 'T' }) })).map(i => i.rule)
    expect(r).toContain('TITLE_NO_AUTHOR')
    expect(r).toContain('TITLE_NO_CONTACT')
  })

  it('one edit apart', () => {
    expect(oneEditApart('MAYA', 'MAYAH')).toBe(true)
    expect(oneEditApart('MAYA', 'MAIA')).toBe(true)
    expect(oneEditApart('MAYA', 'MYAA')).toBe(true)
    expect(oneEditApart('MAYA', 'MAYA')).toBe(false)
    expect(oneEditApart('MAYA', 'MARIA')).toBe(false)
  })

  it('issues are ordered by severity', () => {
    const order: Rule[] = []
    const s = newScript({ id: 's', title: 'T', elements: [h('KITCHEN'), a('Two  spaces.'), d('Orphan.')], titlePage: titlePage({ title: 'T' }) })
    for (const i of check(s)) order.push(i.rule)
    const sev = order.map(r => ['PROBLEM', 'CHECK', 'POLISH'].indexOf(RULES[r].severity))
    expect(sev).toEqual([...sev].sort((x, y) => x - y))
  })
})

describe('Production', () => {
  const longScript = (n: number, lines = 20): Element[] => {
    const out: Element[] = []
    const para = Array.from({ length: lines }, (_, k) => `Line of action number ${k} goes here.`).join(' ')
    for (let k = 0; k < n; k++) out.push(h(`INT. ROOM ${k} - DAY`), a(para), c(k % 2 === 0 ? 'MAYA' : 'SAM'), d(`Something to say in scene ${k}.`))
    return out
  }
  const pag = (els: Element[]) => new Paginator(defaultLayout()).paginate(els)

  it('lock keeps scene numbers and adds A-numbers', () => {
    const els = longScript(4)
    const lk = lock(els, pag(els))
    const s3 = els.findIndex(e => e.text === 'INT. ROOM 2 - DAY')
    const added = [...els.slice(0, s3), h('EXT. NEW - NIGHT'), ...els.slice(s3)]
    const labels = sceneLabels(added, lk)
    expect(added.filter(e => e.type === 'SCENE_HEADING').map(e => labels.get(e.id))).toEqual(['1', '2', '2A', '3', '4'])
    expect(nextLabel('2A')).toBe('2B')
    expect(nextLabel('12Z')).toBe('12AA')
  })

  it('omitted scenes keep their number', () => {
    const els = longScript(3)
    const lk = lock(els, pag(els))
    const second = els.filter(e => e.type === 'SCENE_HEADING')[1]
    const omitted = omitScene(els, second.id)
    expect(omitted.find(e => e.id === second.id)!.text).toBe('OMITTED')
    expect(omitted.length).toBe(els.length - 3)
    expect(sceneLabels(omitted, lk).get(second.id)).toBe('2')
  })

  it('locked pages get A-pages', () => {
    const els = longScript(6, 30)
    const p1 = pag(els)
    expect(p1.pages.length).toBeGreaterThanOrEqual(3)
    const lk = lock(els, p1)
    els[1] = { ...els[1], text: [els[1].text, els[1].text, els[1].text].join(' ') }
    const p2 = new Paginator(defaultLayout()).paginate(els, forcedBreaks(els, lk))
    expect(p2.labels[0]).toBe('1')
    expect(p2.labels).toContain('1A')
    expect(p2.labels).toContain('2')
    expect(p2.labels.filter(l => /^\d+$/.test(l)).length).toBe(p1.pages.length)
  })

  it('unlocked pages are just numbers', () => {
    const p1 = pag(longScript(5, 30))
    expect(p1.labels).toEqual(p1.pages.map((_, i) => `${i + 1}`))
  })

  it('eighths', () => {
    expect(formatEighths(1)).toBe('1/8')
    expect(formatEighths(8)).toBe('1')
    expect(formatEighths(19)).toBe('2 3/8')
    expect(eighths(55, 55)).toBe(8)
    expect(eighths(2, 55)).toBe(1)
  })

  it('x-ray and reports', () => {
    const els = longScript(3)
    const s = newScript({ id: 'x', title: 'X', elements: els })
    const xs = xray(s, pag(els), linesPerPage('LETTER'))
    expect(xs).toHaveLength(3)
    expect(xs[0].speaking).toEqual(['MAYA'])
    expect(xs[0].intExt).toBe('INT')
    expect(xs[0].time).toBe('DAY')
    expect(xs.every(x => x.eighths > 0)).toBe(true)
    const chars = characterRows(s, xs)
    expect(new Set(chars.map(r => r.name))).toEqual(new Set(['MAYA', 'SAM']))
    expect(scenesCsv(s, xs).split(/\r?\n/)).toHaveLength(4)
    expect(charactersCsv(chars).startsWith('Character,')).toBe(true)
  })

  it('sides keep only the actor’s scenes', () => {
    const sd = sides(newScript({ id: 'x', title: 'X', elements: longScript(4) }), new Set(['SAM']))
    expect(sd.elements.filter(e => e.type === 'SCENE_HEADING').map(e => e.text)).toEqual(['INT. ROOM 1 - DAY', 'INT. ROOM 3 - DAY'])
  })

  it('structure check', () => {
    const st = createStructure(template('save_the_cat')!)
    expect(st.beats).toHaveLength(15)
    const cat = { ...st.beats.find(b => b.name === 'Catalyst')!, sceneIds: [42] }
    const s2 = { ...st, beats: st.beats.map(b => (b.id === cat.id ? cat : b)) }
    const res = checkBeats(s2, 110, id => (id === 42 ? 19 : null)).find(r => r.beat.name === 'Catalyst')!
    expect(res.targetPage).toBe(12)
    expect(res.actualPage).toBe(19)
    expect(res.onTrack).toBe(false)
    expect(res.verdict).toContain('p.12')
    expect(res.verdict).toContain('p.19')
  })

  it('deadline plan', () => {
    const dl = { date: '2026-12-01', targetPages: 110, startDate: '2026-10-01', startPages: 0, label: 'First draft' }
    const pl = plan(dl, 40, '2026-11-01')
    expect(pl.daysLeft).toBe(30)
    expect(pl.pagesLeft).toBe(70)
    expect(pl.pagesPerDay).toBeCloseTo(70 / 30, 2)
    expect(pl.behind).toBeGreaterThan(10)
    expect(pl.status).toContain('behind')
    expect(plan(dl, 110, '2026-11-01').done).toBe(true)
    expect(plan(dl, 50, '2026-12-05').overdue).toBe(true)
  })

  it('Indic lines print in taller slots', () => {
    expect(tall('ಅಷ್ಟೆಲ್ಲಾ ಮಾತಾಡ್ತಿರೋದು')).toBe(true)
    expect(tall('तुम कहाँ हो')).toBe(true)
    expect(tall('Plain English (V.O.)')).toBe(false)
    const long = Array(4).fill('ಅಷ್ಟೆಲ್ಲಾ ಮಾತಾಡ್ತಿರೋದು ನಿಂಗೆ').join(' ')
    expect(pag([c('MAN'), d('ಅಷ್ಟೆಲ್ಲಾ ಮಾತಾಡ್ತಿರೋದು')]).pages[0].lines).toHaveLength(2)
    const lines = pag([c('MAN'), d(long)]).pages[0].lines
    expect(lines.length).toBeGreaterThanOrEqual(3)
    expect(lines.some(l => l.segs.length === 0)).toBe(false)
    expect(lines[0].h).toBeUndefined()
    expect(lines[1].h).toBe(1.5)
  })

  it('Indic text wraps by printed width', () => {
    expect(cells('Hello')).toBeCloseTo(5)
    const word = 'ಮಾತಾಡ್ತಿರೋದು'
    expect(cells(word)).toBeLessThan(word.length * 0.75)
    const lines = wrap(Array(8).fill(word).join(' '), 35)
    expect(lines.every(l => cells(l) <= 35)).toBe(true)
    expect(lines[0].length).toBeGreaterThan(35)
  })

  it('mixed lines split into runs', () => {
    expect(runs('ನಿಂಗೆ HURT')).toEqual([['ನಿಂಗೆ ', true], ['HURT', false]])
    expect(runs("I'M ಆಗಿದೆ?")).toEqual([["I'M ", false], ['ಆಗಿದೆ', true], ['?', false]])
  })

  it('comment range follows edits', () => {
    const cm = { id: 'c', elementId: 1, start: 4, end: 9, quote: 'brown', author: 'A', color: 0, text: '?', at: 0, resolved: false, replies: [], attachments: [] }
    expect(commentRange(cm, 'The brown fox')).toEqual([4, 9])
    expect(commentRange(cm, 'The quick brown fox')).toEqual([10, 15])
    expect(commentRange(cm, 'The red fox')).toBeNull()
  })

  it('extras survive save and load', () => {
    const x: ScriptExtras = {
      characters: [{ name: 'MAYA', role: 'Lead', age: '', want: 'Home', need: '', arc: '', voice: '', bio: '', photo: '', ttsVoice: '', pitch: 1.2, rate: 1, cloudVoice: '' }],
      locations: [{ name: 'KITCHEN', description: 'Cramped', notes: '', photo: '' }],
      threads: [{ id: 'a', name: 'A story', color: 3 }],
      structure: { template: 'save_the_cat', beats: [{ id: 'b1', name: 'Catalyst', description: 'x', target: 0.11, act: 1, sceneIds: [7] }], targetPages: 100 },
      scenes: { '7': { threads: ['a'], breakdown: { PROPS: ['Knife'] }, moods: ['m.jpg'] } },
      board: [{ file: 'b.jpg', caption: 'Dusk' }],
      comments: [{ id: 'c1', elementId: 7, start: 0, end: 3, quote: 'INT', author: 'Amit', color: 0xFF00FF00, text: 'Night instead?', at: 5, resolved: false,
        replies: [{ author: 'Priya', color: 1, text: 'Agreed', at: 6 }],
        attachments: [{ file: 'a.jpg', kind: 'IMAGE', name: 'Ref', durationMs: 0 }, { file: 'b.m4a', kind: 'AUDIO', name: 'Memo', durationMs: 4200 }] }],
      lock: { locked: true, lockedAt: 9, sceneNumbers: { '7': '1' }, pageStarts: [8] },
      deadline: { date: '2026-12-01', targetPages: 110, startDate: '2026-10-01', startPages: 3, label: 'First draft' },
    }
    const s = newScript({ id: 'id', title: 'T', elements: [mk(7, 'SCENE_HEADING', 'INT. KITCHEN - DAY')], extras: x })
    const back = decodeScript(JSON.parse(JSON.stringify(encodeScript(s))))
    expect(back.extras).toEqual(x)
    expect(back.elements).toEqual(s.elements)
  })
})

describe('File formats', () => {
  const sample = [h('INT. KITCHEN - DAY'), a('Maya pours coffee.'), c('MAYA'), p('(quietly)'), d('Morning.'), c('SAM'), d('Hey.'), c('MAYA'), d('Both at once.'),
    { ...c('SAM'), dual: true }, d('Both at once.'), tr('CUT TO:'), h('EXT. STREET - NIGHT'), a('Rain.')]
  const s = newScript({ id: 's', title: 'Test', elements: sample, titlePage: goodTitle })
  const shape = (els: Element[]) => els.map(e => [e.type, e.text, e.dual])

  it('Fountain round-trips', () => {
    const back = parseFountain(writeFountain(s), ids)
    expect(shape(back.elements)).toEqual(shape(sample))
    expect(back.titlePage.title).toBe('Test')
    expect(back.titlePage.credits[0].names).toBe('Amit')
  })

  it('an opening FADE IN: is not mistaken for a title page', () => {
    const back = parseFountain('FADE IN:\n\nEXT. ROAD - DAY\n\nDust.\n', ids)
    expect(back.elements.map(e => [e.type, e.text])).toEqual([['ACTION', 'FADE IN:'], ['SCENE_HEADING', 'EXT. ROAD - DAY'], ['ACTION', 'Dust.']])
    expect(parseFountain('Title: Dust\nAuthor: Amit\n\nEXT. ROAD - DAY\n', ids).titlePage.title).toBe('Dust')
  })

  it('Final Draft round-trips', () => {
    const back = parseFdx(writeFdx(s), ids)
    expect(shape(back.elements)).toEqual(shape(sample))
    expect(back.titlePage.title).toBe('TEST')
  })

  it('three-way merge combines edits on different elements', () => {
    const base = sample
    const local = base.map(e => (e.id === base[1].id ? { ...e, text: 'Maya pours tea.' } : e))
    const remote = base.map(e => (e.id === base[13].id ? { ...e, text: 'Heavy rain.' } : e))
    const r = threeWay(base, local, remote)
    expect(r.conflicts).toBe(0)
    expect(r.elements[1].text).toBe('Maya pours tea.')
    expect(r.elements[13].text).toBe('Heavy rain.')
  })

  it('stamps only the lines a writer changed, and keeps older stamps', () => {
    const amith = { id: 'a-1', name: 'Amith' }, sam = { id: 's-1', name: 'Sam' }
    const first = stampEdits([], sample, amith, 100)
    expect(first.every(e => e.by === 'a-1' && e.byName === 'Amith' && e.at === 100)).toBe(true)
    const edited = first.map(e => (e.id === first[2].id ? { ...e, text: e.text + ' Rain.', by: null, byName: null, at: 0 } : { ...e, by: null, byName: null, at: 0 }))
    const second = stampEdits(first, edited, sam, 200)
    expect(second[2].by).toBe('s-1')
    expect(second[2].at).toBe(200)
    expect(second[1].by).toBe('a-1')
    expect(authorList(second).map(a => [a.name, a.lines])).toEqual([['Amith', sample.length - 1], ['Sam', 1]])
  })

  it('a merge credits what came from their draft to them, by name when their file has no stamps', () => {
    const base = sample
    const local = base.map(e => (e.id === base[1].id ? { ...e, text: 'Maya pours tea.', by: 'me', byName: 'Amith', at: 5 } : e))
    const added = mk(9002, 'ACTION', 'Thunder.')
    const remote = [...base.slice(0, 13), added, ...base.slice(13)].map(e => (e.id === base[13].id ? { ...e, text: 'Heavy rain.', by: 'sam', byName: 'Sam', at: 9 } : e))
    const r = threeWay(base, local, remote, 'Sam')
    const byId = new Map(r.elements.map(e => [e.id, e]))
    expect(byId.get(base[1].id)!.byName).toBe('Amith')
    expect(byId.get(9002)!.byName).toBe('Sam')
    expect(byId.get(9002)!.by).toBe('guest:sam')
    expect(byId.get(base[13].id)!.by).toBe('sam')
  })

  it('a returned draft can be merged change by change', () => {
    const base = sample
    const local = base.map(e => (e.id === base[1].id ? { ...e, text: 'Maya pours tea.' } : e))
    const added = mk(9001, 'ACTION', 'Thunder.')
    const remote = [...base.slice(0, 13), added, ...base.slice(13)]
      .map(e => (e.id === base[13].id ? { ...e, text: 'Heavy rain.' } : e.id === base[1].id ? { ...e, text: 'Maya pours juice.' } : e))
      .filter(e => e.id !== base[11].id)
    const ops = planMerge(base, local, remote)
    expect(ops.map(o => o.kind)).toEqual(['conflict', 'delete', 'add', 'change'])
    // Take everything, settle the conflict their way.
    const all = applyMerge(base, local, remote, ops, new Set(ops.map(o => o.id)), new Map([[base[1].id, 'theirs' as const]]))
    expect(all.elements.map(e => e.text)).toEqual(remote.map(e => e.text))
    // Turn down the deletion and the addition; keep my side of the conflict.
    const some = applyMerge(base, local, remote, ops, new Set([base[13].id]), new Map([[base[1].id, 'mine' as const]]))
    expect(some.elements.map(e => e.text)).toEqual(local.map(e => (e.id === base[13].id ? 'Heavy rain.' : e.text)))
  })

  it('a Fountain draft lines up with the script it came from', () => {
    const back = parseFountain(writeFountain({ ...s, elements: sample.map((e, i) => (i === 6 ? { ...e, text: 'Hi.' } : e)) }), ids)
    const aligned = alignIds(sample, back.elements)
    expect(aligned.map(e => e.id)).toEqual(sample.map(e => e.id))
    const ops = planMerge(sample, sample, aligned)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'change', id: sample[6].id })
  })
})
