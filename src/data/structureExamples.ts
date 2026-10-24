/**
 * A worked example for every story structure: a well-known film, beat by beat — where each beat
 * falls in it and what happens there, in our own words. Open one as an example script and every
 * beat is a scene, placed on its beat, so the Story view, index cards and beat map all show the
 * structure at work. Read the real screenplay alongside it to see the beats on the page.
 */
import { el, newId, titlePage, type Element, type ScriptExtras } from '../core/model'
import { createStructure, template } from '../core/structures'
import { createScript, EXAMPLE_DRAFT, saveScript } from '../state/library'
import { paginate } from '../state/doc'

export interface StructureExample {
  film: string
  year: number
  by: string
  /** Why this film suits this structure. */
  why: string
  /** Where to read the screenplay, if a free copy is well known; otherwise a web search is offered. */
  read?: string
  /** Notes such as "no published screenplay — watch the film". */
  note?: string
  /** One per template beat, in order: [scene heading, what happens]. */
  beats: [string, string][]
}

export const EXAMPLES: Record<string, StructureExample> = {
  save_the_cat: {
    film: 'Back to the Future', year: 1985, by: 'Robert Zemeckis & Bob Gale',
    why: 'Every one of the 15 beats is easy to spot, and the B story (Marty and his father) is what wins the finale.',
    beats: [
      ['INT. DOC BROWN\'S GARAGE - MORNING', 'Clocks tick on every wall. Marty plugs his guitar into a giant amp and the blast throws him across the room — a kid with big ambitions in a world that keeps knocking him back.'],
      ['INT. HILL VALLEY HIGH - DAY', 'Late again; the principal calls him a slacker; his band is rejected at the audition. At home his father is bullied by Biff and his family has given up. Everything that needs fixing is on show.'],
      ['EXT. TOWN SQUARE - DAY', 'Marty won\'t send his demo tape — what if they say he\'s no good? He sounds exactly like his father. The lesson is planted: believe in yourself and stand up.'],
      ['EXT. TWIN PINES MALL - NIGHT', 'Doc unveils the time machine, the Libyans gun him down, and Marty floors the DeLorean — straight into 1955.'],
      ['EXT. HILL VALLEY - 1955 - DAY', 'Lost in the past, Marty bumbles about — and pushes young George out of the way of a car, taking the hit himself. Can he even get home? Young Doc says he\'ll need 1.21 gigawatts.'],
      ['INT. DOC\'S HOUSE - 1955 - NIGHT', 'His brother is fading from the family photo. Marty commits: get his parents together, or he\'ll never be born.'],
      ['INT. CAFE - 1955 - DAY', 'The B story: Marty and George — a teenage father who can\'t stand up for himself, and a son who has to teach him.'],
      ['INT. GEORGE\'S BEDROOM - 1955 - NIGHT', 'The promise of the premise: "Darth Vader from planet Vulcan", the skateboard chase through the square, the culture clash of a kid from the future.'],
      ['INT. LORRAINE\'S HOUSE - 1955 - DAY', 'Lorraine asks Marty — not George — to the dance. The plan is set for the night of the dance; the stakes jump.'],
      ['EXT. HILL VALLEY HIGH - 1955 - NIGHT', 'Doc tears up Marty\'s warning letter, the lightning plan is fragile, and at the dance Biff\'s gang shoves Marty into a car trunk.'],
      ['EXT. SCHOOL PARKING LOT - NIGHT', 'The plan collapses: Marty is locked away, George opens the car door to find Biff, not Marty. Marty starts to vanish.'],
      ['INT. CAR / PARKING LOT - NIGHT', 'Alone, George faces the man who has bullied him all his life while Lorraine is hurt. The lowest point — for both father and son.'],
      ['EXT. SCHOOL PARKING LOT - CONTINUOUS', 'George punches Biff. The B story pays off: the lesson Marty taught his father turns the story.'],
      ['EXT. CLOCK TOWER - NIGHT', 'The kiss on the dance floor saves Marty; then the race to the clock tower as lightning strikes, and back to 1985 — where Doc survived after all.'],
      ['INT. MCFLY HOUSE - 1985 - MORNING', 'A confident father, a happy mother, Biff waxing their car. The opposite of the opening image.'],
    ],
  },
  short_film: {
    film: 'Bao', year: 2018, by: 'Domee Shi',
    why: 'Eight minutes, no dialogue, and every short-film beat — one want, one turn, and a final image that answers the first.',
    note: 'A dialogue-free Pixar short, so there is no screenplay to read — watch it and follow these beats.',
    beats: [
      ['INT. KITCHEN - DAY', 'A mother folds dumplings alone; her husband eats in silence and leaves. An empty nest in one shot.'],
      ['INT. KITCHEN - CONTINUOUS', 'She wants someone to care for again.'],
      ['INT. KITCHEN - MOMENTS LATER', 'One of the dumplings sprouts arms and legs and cries. She raises it as her son.'],
      ['EXT. PARK - YEARS LATER', 'He grows up and away — soccer, friends, a teenager\'s shrug — while she holds on tighter.'],
      ['INT. HALLWAY - NIGHT', 'He announces he\'s leaving with his fiancée. She blocks the door and, in panic, eats him.'],
      ['INT. BEDROOM - LATER', 'Her real, grown son comes home and sits with her. The dumpling was her grief; they share the pastry she used to buy him.'],
      ['INT. KITCHEN - DAY', 'The family — and his fiancée — fold dumplings together at the same table. The opening image, answered.'],
    ],
  },
  three_act: {
    film: 'Die Hard', year: 1988, by: 'Jeb Stuart & Steven E. de Souza',
    why: 'The textbook three-act action film: clean turning points, and the antagonist strikes at each pinch.',
    beats: [
      ['INT. AIRLINER - NIGHT', 'New York cop John McClane lands in Los Angeles to win back his wife, Holly. A nervous flyer, he\'s told to make fists with his toes.'],
      ['INT. NAKATOMI PLAZA - 30TH FLOOR - NIGHT', 'Hans Gruber\'s men seize the office Christmas party. Barefoot, McClane slips away.'],
      ['INT. NAKATOMI PLAZA - STAIRWELL - NIGHT', 'Gruber executes Takagi in front of the hidden McClane. McClane commits: he takes out the first terrorist and sends the body down in the lift.'],
      ['EXT. NAKATOMI PLAZA - NIGHT', 'The police assault is crushed by a rocket launcher. Gruber is in control and nobody outside can help.'],
      ['INT. NAKATOMI PLAZA - ROOF ACCESS - NIGHT', 'McClane meets Gruber, who poses as a hostage. The cop stops reacting and starts playing the game.'],
      ['INT. NAKATOMI PLAZA - OFFICE - NIGHT', 'Gruber has the glass shot out; McClane escapes over it barefoot. The FBI cuts the power — exactly what Gruber needed to open the vault.'],
      ['INT. NAKATOMI PLAZA - NIGHT', 'A TV report reveals that Holly is McClane\'s wife. Gruber takes her. Now it\'s personal.'],
      ['INT. NAKATOMI PLAZA - 30TH FLOOR - NIGHT', 'Wounded, with a gun taped to his back, McClane walks in laughing, shoots Gruber, and Gruber falls thirty floors.'],
      ['EXT. NAKATOMI PLAZA - DAWN', 'Holly and John walk out together and drive away. The new normal.'],
    ],
  },
  heros_journey: {
    film: 'Star Wars', year: 1977, by: 'George Lucas',
    why: 'Lucas built it on Joseph Campbell\'s monomyth, so all twelve stages are there in order.',
    beats: [
      ['EXT. LARS HOMESTEAD - TATOOINE - DAY', 'Farm boy Luke Skywalker longs to leave his desert planet; his uncle says next season, again.'],
      ['INT. LARS GARAGE - NIGHT', 'Cleaning a droid, Luke finds a princess\'s message asking Obi-Wan Kenobi for help.'],
      ['INT. BEN KENOBI\'S HUT - NIGHT', 'Obi-Wan asks Luke to come to Alderaan. Luke says he can\'t: there\'s the harvest.'],
      ['INT. BEN KENOBI\'S HUT - CONTINUOUS', 'Obi-Wan gives Luke his father\'s lightsaber and tells him about the Force.'],
      ['EXT. MOS EISLEY - DAY', 'Luke finds his aunt and uncle killed, and leaves Tatooine on the Millennium Falcon.'],
      ['INT. MOS EISLEY CANTINA - DAY', 'A smuggler and his co-pilot, a bar full of enemies, lightsaber training aboard the Falcon.'],
      ['INT. DEATH STAR - HANGAR - DAY', 'The Falcon is pulled into the Death Star; the heroes hide and disguise themselves.'],
      ['INT. DEATH STAR - DETENTION BLOCK', 'They free Leia, nearly drown in a trash compactor, and Obi-Wan falls to Darth Vader.'],
      ['INT. MILLENNIUM FALCON - COCKPIT', 'They escape with the princess — and the plans to the Death Star.'],
      ['INT. REBEL BASE - YAVIN - DAY', 'The Rebels plan the attack. Han takes his reward and leaves.'],
      ['INT. X-WING COCKPIT - SPACE', 'The trench run. Luke switches off his targeting computer and trusts the Force; Han returns; the Death Star explodes.'],
      ['INT. REBEL BASE - THRONE ROOM - DAY', 'The medal ceremony. The farm boy comes home a hero.'],
    ],
  },
  story_circle: {
    film: 'Groundhog Day', year: 1993, by: 'Danny Rubin & Harold Ramis',
    why: 'A full circle: Phil goes out, gets what he wants, pays for it, and comes back changed — on the same day.',
    read: 'https://imsdb.com/scripts/Groundhog-Day.html',
    beats: [
      ['INT. TV STATION - PITTSBURGH - DAY', 'Phil Connors, a smug weatherman, is sent to cover Groundhog Day in a small town he despises.'],
      ['EXT. PUNXSUTAWNEY - DAY', 'He wants out of town as fast as possible. What he needs is to stop living only for himself.'],
      ['INT. BED AND BREAKFAST - MORNING', 'A blizzard traps him. The next morning the radio plays the same song: it\'s February 2nd, again.'],
      ['INT. DINER - DAY', 'He adapts: gorging, robbing, seducing with what he learned yesterday — then despair, and every way out he can think of.'],
      ['EXT. TOWN SQUARE - NIGHT', 'He gets what he wanted: he knows everything. He builds the perfect evening with Rita.'],
      ['INT. PHIL\'S ROOM - NIGHT', 'She sees through it, every time. And the old man in the alley dies however hard Phil tries — he can\'t control everything.'],
      ['INT. HOTEL BALLROOM - NIGHT', 'He lives one day for other people — the piano, the boy in the tree, the man choking at dinner — and the town loves him for it.'],
      ['INT. BED AND BREAKFAST - MORNING', 'February 3rd. He wakes beside Rita, changed, and wants to stay.'],
    ],
  },
  tv_hour: {
    film: 'Breaking Bad — Pilot', year: 2008, by: 'Vince Gilligan',
    why: 'A cold open that jumps ahead, act-outs that each change Walt\'s life, and a tag that shows who he\'s becoming.',
    beats: [
      ['EXT. DESERT - DAY', 'An RV careens through the desert, driven by a man in a gas mask and his underwear. He crashes, records a goodbye to his family, and raises a gun toward the sirens.'],
      ['INT. DOCTOR\'S OFFICE - DAY', 'Walter White, a chemistry teacher who works a second job at a car wash, learns he has inoperable lung cancer.'],
      ['EXT. SUBURBAN STREET - DAY', 'On a DEA ride-along with his brother-in-law, Walt watches his former student escape a meth-lab bust — and sees a way to provide for his family.'],
      ['EXT. JESSE\'S HOUSE - NIGHT', 'Walt finds Jesse Pinkman and offers a deal: partner with me, or I turn you in. The mild teacher is making threats.'],
      ['INT. RV - DESERT - DAY', 'Two dealers come to kill them; Walt gasses them inside the RV. We\'re back at the cold open — sirens closing in.'],
      ['EXT. DESERT - CONTINUOUS', 'The sirens are fire engines, going past. Walt lives, hides the money and goes home.'],
      ['INT. WHITE HOUSE - BEDROOM - NIGHT', 'In bed, Walt is suddenly assertive. His wife barely recognises him. A hook for next week.'],
    ],
  },
  tv_half: {
    film: 'Seinfeld — "The Chinese Restaurant"', year: 1991, by: 'Larry David & Jerry Seinfeld',
    why: 'A whole half hour about waiting for a table: a tiny problem, a plan that keeps going wrong, and a tag that twists the knife.',
    beats: [
      ['INT. CHINESE RESTAURANT - NIGHT', 'Jerry, Elaine and George drop in for a quick bite before a one-night-only movie.'],
      ['INT. CHINESE RESTAURANT - CONTINUOUS', 'The maître d\' says five, ten minutes. They have no table and no time.'],
      ['INT. CHINESE RESTAURANT - PAYPHONE', 'Everything goes wrong: George needs the payphone to call a date and someone is hogging it; Elaine is starving and gets dared to eat off a stranger\'s plate.'],
      ['INT. CHINESE RESTAURANT - LATER', 'George misses his call, Elaine\'s bribe disappears without a table, Jerry runs into someone he\'s lied to. Everything collides.'],
      ['EXT. CHINESE RESTAURANT - NIGHT', 'They give up and go — no dinner, no movie.'],
      ['INT. CHINESE RESTAURANT - MOMENTS LATER', 'The maître d\' calls their table. They\'re gone.'],
    ],
  },
  syd_field: {
    film: 'Chinatown', year: 1974, by: 'Robert Towne',
    why: 'Syd Field\'s own favourite example: two plot points that spin the story, and every clue raises the stakes.',
    read: 'https://imsdb.com/scripts/Chinatown.html',
    beats: [
      ['INT. GITTES\' OFFICE - DAY', 'J.J. Gittes, a private eye who makes his living on adultery, is hired by a "Mrs. Mulwray" to follow her husband, the city\'s water engineer.'],
      ['EXT. ECHO PARK - DAY', 'Gittes photographs Mulwray with a young woman, and the pictures end up in the paper.'],
      ['INT. GITTES\' OFFICE - DAY', 'The real Evelyn Mulwray walks in with her lawyer and sues. Someone set Gittes up — and he has to find out who.'],
      ['EXT. RESERVOIR - NIGHT', 'Mulwray is found drowned in a reservoir in the middle of a drought. Snooping at night, Gittes gets his nose cut.'],
      ['INT. ALBACORE CLUB - DAY', 'Gittes meets Noah Cross — Evelyn\'s father and Mulwray\'s old partner — who hires him to find the girl.'],
      ['EXT. ORANGE GROVE - DAY', 'The scheme surfaces: water dumped at night, land bought up in dead men\'s names. The woman who posed as Mrs. Mulwray is murdered.'],
      ['EXT. MULWRAY HOUSE - POND - DAY', 'Glasses in the salt-water pond. Gittes confronts Evelyn and learns the terrible truth about the girl and her father.'],
      ['EXT. CHINATOWN - NIGHT', 'Evelyn is shot, Cross takes the girl, and Gittes is led away from the one place he swore never to come back to.'],
    ],
  },
  eight_sequence: {
    film: 'Toy Story', year: 1995, by: 'Joss Whedon, Andrew Stanton, Joel Cohen & Alec Sokolow',
    why: 'Eight clean mini-movies, each with its own problem and turn — the way Pixar\'s story room built it.',
    beats: [
      ['INT. ANDY\'S ROOM - DAY', 'Woody is Andy\'s favourite and the toys\' leader. At the birthday party, a new toy arrives: Buzz Lightyear.'],
      ['INT. ANDY\'S ROOM - LATER', 'Buzz wins over the room and Andy; jealous Woody knocks him out of the window. Both end up lost at a gas station.'],
      ['EXT. GAS STATION - DAY', 'First attempt: Woody gets them onto a Pizza Planet truck, to find Andy there.'],
      ['INT. PIZZA PLANET - DAY', 'Buzz climbs into the claw machine; Sid, the boy next door who tortures toys, grabs them both.'],
      ['INT. SID\'S HOUSE - DAY', 'Buzz sees his own TV advert, learns he is a toy, tries to fly anyway — and breaks.'],
      ['INT. SID\'S ROOM - NIGHT', 'Sid straps Buzz to a rocket. Woody convinces him that being a toy, Andy\'s toy, is what matters.'],
      ['EXT. SID\'S BACKYARD - DAY', 'Woody leads Sid\'s mutant toys to scare Sid straight and save Buzz — as Andy\'s moving van pulls away.'],
      ['EXT. STREET - DAY', 'The rocket lights, Buzz falls with style, and they drop into Andy\'s car. Christmas: a puppy.'],
    ],
  },
  seven_point: {
    film: 'The Matrix', year: 1999, by: 'Lana & Lilly Wachowski',
    why: 'Neo ends as the One, so he starts as the opposite — a passive doubter — and each point pushes him along.',
    beats: [
      ['INT. NEO\'S APARTMENT - NIGHT', 'Thomas Anderson, office worker and hacker, senses something is wrong with the world and does nothing about it.'],
      ['INT. POWER PLANT - POD', 'He takes the red pill and wakes in a pod in the real world. Nothing will be the same.'],
      ['INT. ORACLE\'S KITCHEN - DAY', 'The Oracle tells him he isn\'t the One; a betrayal brings the Agents down on them and Morpheus is taken.'],
      ['INT. NEBUCHADNEZZAR - DAY', 'Neo decides to go back in and save Morpheus. He stops reacting and acts.'],
      ['INT. HEART O\' THE CITY HOTEL - ROOM 303', 'The rescue works, but Agent Smith corners Neo — and kills him.'],
      ['INT. HOTEL CORRIDOR - CONTINUOUS', 'Neo rises. He sees the Matrix for what it is: code.'],
      ['EXT. CITY STREET - DAY', 'He stops bullets, beats Smith, and calls the machines with a promise.'],
    ],
  },
  story_spine: {
    film: 'Up', year: 2009, by: 'Bob Peterson & Pete Docter',
    why: 'Pixar\'s own storytelling exercise, and Up follows it almost word for word.',
    beats: [
      ['INT. CARL AND ELLIE\'S HOUSE - DAY', 'Once upon a time, two adventure-mad kids grew up, married, and dreamed of Paradise Falls.'],
      ['EXT. CARL\'S HOUSE - DAY', 'Every day, after Ellie died, Carl lived alone in their house as the city built up around it.'],
      ['EXT. CARL\'S HOUSE - MORNING', 'Until one day a court sent him to a retirement home — so he tied balloons to the house and floated away, with a Wilderness Explorer on the porch.'],
      ['EXT. TEPUI - DAY', 'Because of that, they had to walk the house to the Falls, and met a giant bird and a talking dog.'],
      ['INT. SPIRIT OF ADVENTURE - NIGHT', 'Because of that, they met Carl\'s childhood hero, who was hunting the bird.'],
      ['INT. CARL\'S HOUSE - PARADISE FALLS - DAY', 'Because of that, Carl chose the house over the bird and lost the boy — until Ellie\'s scrapbook told him to go and have a new adventure.'],
      ['EXT. AIRSHIP - SKY - DAY', 'Until finally Carl emptied the house, flew after Russell, beat his hero and let the house go.'],
      ['INT. EXPLORER CEREMONY - DAY', 'And ever since then, Carl has been the one who shows up for Russell.'],
    ],
  },
  kishotenketsu: {
    film: 'My Neighbor Totoro', year: 1988, by: 'Hayao Miyazaki',
    why: 'Almost no conflict for most of its length: just the girls\' world, deepened, until one turn recasts it.',
    note: 'No English screenplay is published — watch the film and follow the four parts.',
    beats: [
      ['EXT. COUNTRY HOUSE - DAY', 'Satsuki and Mei move with their father to an old house near the hospital where their mother is recovering.'],
      ['EXT. CAMPHOR TREE - DAY', 'Daily life, gently explored: soot sprites, school, Mei finding Totoro asleep, the umbrella at the rainy bus stop and the Catbus.'],
      ['INT. COUNTRY HOUSE - DAY', 'A telegram from the hospital. Their mother can\'t come home. The sisters quarrel, and Mei sets off alone — and goes missing.'],
      ['EXT. HOSPITAL WINDOW - EVENING', 'Satsuki asks Totoro for help; the Catbus finds Mei and carries them to the hospital, where they leave an ear of corn on the sill.'],
    ],
  },
  freytag: {
    film: 'The Godfather', year: 1972, by: 'Mario Puzo & Francis Ford Coppola',
    why: 'A tragedy in five movements: Michael rises to the climax at the restaurant, then everything falls toward the final door.',
    read: 'https://imsdb.com/scripts/Godfather.html',
    beats: [
      ['EXT. CORLEONE MALL - DAY', 'Connie\'s wedding. Vito grants favours; Michael, the war hero, tells Kay the family business isn\'t his.'],
      ['EXT. FRUIT STAND - DAY', 'Vito turns down Sollozzo\'s narcotics deal and is shot in the street.'],
      ['INT. HOSPITAL - NIGHT', 'Michael finds his father unguarded and saves him; the police captain breaks his jaw; Michael offers to kill them himself.'],
      ['INT. LOUIS\' RESTAURANT - NIGHT', 'He takes the gun from behind the toilet and kills both men. The outsider is gone.'],
      ['EXT. SICILY - DAY', 'Exile. His young wife is killed by a car bomb; back home Sonny is murdered at a tollbooth.'],
      ['EXT. TOMATO GARDEN - DAY', 'Vito warns Michael who the traitor will be, then dies among his tomato plants. Michael could still turn back.'],
      ['INT. CHURCH - DAY', 'At the baptism Michael\'s men kill the heads of the families. He lies to Kay, and the door closes on her.'],
    ],
  },
  fichtean: {
    film: 'Speed', year: 1994, by: 'Graham Yost',
    why: 'It opens mid-crisis and never lets up; we learn who Jack is only through what he does under pressure.',
    beats: [
      ['INT. OFFICE TOWER - ELEVATOR SHAFT - DAY', 'A bomber traps a lift full of office workers. SWAT officer Jack Traven gets them out.'],
      ['INT. CITY BUS - DAY', 'A bus is wired to explode if it drops below 50 mph. Jack gets aboard; the driver is shot and a passenger, Annie, takes the wheel.'],
      ['EXT. UNFINISHED FREEWAY - DAY', 'A gap in the freeway ahead. The bus has to jump it.'],
      ['EXT. AIRPORT RUNWAY - DAY', 'Jack slides under the bus to reach the bomb; fuel is leaking; his partner is killed by a booby trap at the bomber\'s house.'],
      ['EXT. AIRPORT RUNWAY - LATER', 'Jack loops the hidden camera, gets the passengers off, and the bus blows up — but the bomber takes Annie into the subway.'],
      ['INT. SUBWAY TRAIN - NIGHT', 'On the roof of a runaway train Jack fights the bomber to the end. The train has no brakes.'],
      ['EXT. HOLLYWOOD BOULEVARD - NIGHT', 'The train bursts out onto the street. Jack and Annie lie in the wreck, alive.'],
    ],
  },
  truby: {
    film: 'Tootsie', year: 1982, by: 'Larry Gelbart & Murray Schisgal',
    why: 'John Truby\'s favourite teaching film: a hero whose moral need is exactly what his plan forces him to learn.',
    beats: [
      ['INT. ACTING CLASS - DAY', 'Michael Dorsey is a gifted actor so impossible nobody will hire him — and he treats women as less than himself.'],
      ['INT. AGENT\'S OFFICE - DAY', 'He wants work. Soon, he wants Julie.'],
      ['INT. TV STUDIO - DAY', 'His opponents: Julie, who can only love "Dorothy" as a friend, and the director who treats Dorothy the way Michael treats women.'],
      ['INT. MICHAEL\'S APARTMENT - DAY', 'The plan: dress as Dorothy Michaels and win the role on a daytime soap.'],
      ['INT. TV STUDIO - LIVE BROADCAST', 'Live on air, Michael tears off the wig and unmasks himself in front of everyone — Julie included.'],
      ['EXT. STUDIO - DAY', 'He tells Julie that being a woman made him a better man than he ever was as one.'],
      ['EXT. NEW YORK STREET - DAY', 'She forgives him. They walk off together, talking — friends first.'],
    ],
  },
}

export const exampleFor = (templateId: string) => EXAMPLES[templateId]

/** Example scripts are marked on their title page (and kept out of the project list); their beats are read against the film, not the outline's own pages. */
export { EXAMPLE_DRAFT }
export const isExampleScript = (draft: string) => draft === EXAMPLE_DRAFT

/** Where to read the screenplay: the known free copy, or a search for one. */
export const readLink = (x: StructureExample) => x.read ?? `https://duckduckgo.com/?q=${encodeURIComponent(`${x.film} ${x.year} screenplay`)}`

/**
 * Make the example as a script in the library: one scene per beat (heading, the beat's name as its
 * index-card synopsis, what happens, and a note on what the beat is for), with the structure applied
 * and every scene already placed on its beat. Returns the new script's id.
 */
export async function createExample(templateId: string): Promise<string> {
  const t = template(templateId)
  const x = EXAMPLES[templateId]
  if (!t || !x) throw new Error('No example for this structure')
  const elements: Element[] = [el(newId(), 'ACTION', 'FADE IN:')]
  const heads: number[] = []
  t.beats.forEach(([name, purpose], i) => {
    const [heading, what] = x.beats[i] ?? ['INT. SOMEWHERE - DAY', '']
    const h = el(newId(), 'SCENE_HEADING', heading, { synopsis: `${name} — ${what.split('. ')[0].replace(/\.$/, '')}.` })
    heads.push(h.id)
    elements.push(h, el(newId(), 'NOTE', `${name.toUpperCase()}: ${purpose}`), el(newId(), 'ACTION', what))
  })
  elements.push(el(newId(), 'TRANSITION', 'FADE OUT.'))

  const title = `${x.film} — ${t.name}`
  const tp = titlePage({
    title, credits: [{ role: 'Written by', names: 'Page One (beat outline)' }], isAdaptation: true, sourceType: 'film', sourceTitle: x.film, sourceAuthor: x.by,
    draft: EXAMPLE_DRAFT, notes: `How ${x.film} (${x.year}) follows ${t.name}, beat by beat, in our own words. Read the real screenplay alongside it.`,
  })
  const s = await createScript(title, elements, tp)
  const st = createStructure(t)
  const draft = { ...s, extras: { ...s.extras, structure: { ...st, beats: st.beats.map((b, i) => ({ ...b, sceneIds: heads[i] != null ? [heads[i]] : [] })) } } as ScriptExtras }
  const pages = paginate({ ...s, extras: draft.extras }).pages.length
  await saveScript({ ...s, extras: draft.extras, coverColor: 6 }, pages)
  return s.id
}
