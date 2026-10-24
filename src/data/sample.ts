/** A short original screenplay that shows off what Page One can do (the phone's sample, unchanged). */
import { characterProfile, titlePage, type Comment, type PlotThread, type SceneMeta, type ScriptExtras } from '../core/model'
import { parseFountain } from '../core/fountain'
import { createStructure, template } from '../core/structures'
import { createScript, saveScript } from '../state/library'

const TEXT = `FADE IN:

EXT. PALACE CINEMA - NIGHT

Rain hammers a dead neon marquee. Half the letters are gone: P A  CE.

A single window glows above the entrance.

INT. PROJECTION BOOTH - CONTINUOUS

Cramped. Film cans stacked to the ceiling. A 35mm projector hums like an old cat.

ELI (70s), cardigan, reading glasses on a cord, threads film through the gate with hands that have done this ten thousand times.

ELI
(to the projector)
Easy, old girl. One more night.

He flicks a switch. Light pours through the porthole.

INT. AUDITORIUM - CONTINUOUS

Four hundred red seats. Every one of them empty.

The beam lands on the screen. A black-and-white couple kiss in a train station.

A side door BANGS open. NADIA (17), soaked hoodie, earbuds, a phone held up like a torch.

NADIA
Hello? The sign said open.

ELI (O.S.)
The sign says "P A CE." It's been lying for years.

INT. PROJECTION BOOTH - MOMENTS LATER

Nadia squeezes in. She stares at the projector like it's an alien.

NADIA
Where's the screen thing? The laptop?

ELI
This is the screen thing.

NADIA
It's on fire.

ELI
It's a carbon arc. It's supposed to look like that.

He offers her a biscuit from a tin. She takes two.

NADIA
My mum says they're knocking this place down. Friday.

Eli keeps his eyes on the porthole.

ELI
Your mum's well informed.

INT. AUDITORIUM - LATER

Nadia sits in the front row, feet up. On screen, the train pulls away.

She takes out her phone. Films the screen. Stops. Puts the phone face down.

EXT. PALACE CINEMA - DAY

Bulldozers idle in the car park. A DEVELOPER (40s), hard hat over a good haircut, checks his watch.

DEVELOPER
He's got till five.

INT. PROJECTION BOOTH - DAY

Eli packs film cans into a shopping trolley. Nadia arrives with two coffees and a camera bag.

NADIA
I posted a clip. Of the kiss. People want to come.

ELI
How many people?

NADIA
(beat)
Eleven thousand.

Eli puts down the can.

ELI
The roof leaks on seats nine to forty.

NADIA
Then we'll need buckets.

INT. AUDITORIUM - NIGHT

Every seat is full. People stand in the aisles. Buckets everywhere, catching rain.

Up in the booth, Eli's hands are shaking. Nadia steadies the reel.

NADIA
Easy, old girl.

He laughs. Flicks the switch.

The beam cuts through the dark. Four hundred faces turn up to the light.

FADE OUT.
`

export async function createSample(): Promise<string> {
  const els = parseFountain(TEXT).elements
  const heads = els.filter(e => e.type === 'SCENE_HEADING')
  const sid = (i: number) => heads[i]?.id

  const st = createStructure(template('save_the_cat')!)
  const place: Record<string, number> = { 'Opening Image': 0, 'Set-Up': 1, Catalyst: 3, Debate: 4, 'Break into Two': 6, Midpoint: 7, Finale: 8, 'Final Image': 8 }
  const structure = { ...st, targetPages: 30, beats: st.beats.map(b => (b.name in place && sid(place[b.name]) ? { ...b, sceneIds: [sid(place[b.name])!] } : b)) }

  const threads: PlotThread[] = [{ id: 'a', name: 'Saving the Palace', color: 1 }, { id: 'b', name: 'Eli & Nadia', color: 6 }]
  const scenes: Record<string, SceneMeta> = {}
  heads.forEach((h, i) => {
    scenes[String(h.id)] = { threads: [3, 4, 7].includes(i) ? ['b'] : i === 0 || i === 5 ? ['a'] : ['a', 'b'], breakdown: {}, moods: [] }
  })

  const firstLine = els.find(e => e.type === 'DIALOGUE')
  const comments: Comment[] = firstLine ? [{
    id: 'sample-note', elementId: firstLine.id, start: 0, end: firstLine.text.length, quote: firstLine.text, author: 'Page One',
    color: 0xFFE7B35A, text: 'Notes like this one are pinned to words. Select any text and press Ctrl+M to pin your own.',
    at: Date.now(), resolved: false, replies: [], attachments: [],
  }] : []

  const extras: ScriptExtras = {
    characters: [
      characterProfile('ELI', { role: 'Protagonist', age: '70s', want: 'One more night in the booth', need: 'To let someone else carry it on', arc: 'From last projectionist to first teacher', voice: 'Dry, patient, talks to machines more than people' }),
      characterProfile('NADIA', { role: 'Deuteragonist', age: '17', want: 'Somewhere dry to kill time', need: "Something real that isn't on a screen in her hand", arc: 'Filming life → living it', voice: 'Quick, flat, funny' }),
      characterProfile('DEVELOPER', { role: 'Antagonist', age: '40s', want: 'The site cleared by Friday' }),
    ],
    locations: [
      { name: 'PALACE CINEMA', description: '1930s picture palace, dead neon, art-deco tiles cracked by weather', notes: '', photo: '' },
      { name: 'PROJECTION BOOTH', description: 'Hot, cramped, film cans to the ceiling, a porthole of light', notes: '', photo: '' },
    ],
    threads, structure, scenes, board: [], comments, lock: { locked: false, lockedAt: 0, sceneNumbers: {}, pageStarts: [] }, deadline: null,
  }
  const tp = titlePage({ title: 'The Last Projectionist', credits: [{ role: 'Written by', names: 'Page One' }], draft: 'Sample script', notes: 'Delete me whenever you like.' })
  const s = await createScript('The Last Projectionist', els, tp)
  await saveScript({ ...s, extras, coverColor: 2 }, 4)
  return s.id
}
