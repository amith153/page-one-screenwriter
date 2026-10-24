/** Story-structure templates and the page-target check (port of `core/Structures.kt`). */
import { uuid, type Beat, type Structure } from './model'

export interface Template {
  id: string; name: string; blurb: string; pages: number
  beats: [string, string, number][]
  /** Fractions where acts 2, 3… begin. */
  acts: number[]
}

export const TEMPLATES: Template[] = [
  {
    id: 'save_the_cat', name: 'Save the Cat!', blurb: "Blake Snyder's 15 beats — the modern studio standard.", pages: 110,
    beats: [
      ['Opening Image', "A snapshot of the hero's world before the story.", 0.00],
      ['Set-Up', 'Hero, stakes and everything that needs fixing.', 0.01],
      ['Theme Stated', 'Someone hints at the lesson the hero must learn.', 0.045],
      ['Catalyst', "The event that knocks the hero's world off course.", 0.11],
      ['Debate', 'Should I go? The hero hesitates.', 0.12],
      ['Break into Two', 'The hero chooses and enters the upside-down world.', 0.23],
      ['B Story', 'A new relationship that carries the theme.', 0.27],
      ['Fun and Games', 'The promise of the premise — the trailer moments.', 0.27],
      ['Midpoint', 'False victory or false defeat; stakes are raised.', 0.50],
      ['Bad Guys Close In', 'Doubt, jealousy and real enemies tighten the screws.', 0.50],
      ['All Is Lost', 'The opposite of the midpoint. A whiff of death.', 0.68],
      ['Dark Night of the Soul', 'The hero hits bottom and wallows.', 0.68],
      ['Break into Three', 'The solution, thanks to the B story.', 0.77],
      ['Finale', "The hero proves they've changed and wins.", 0.77],
      ['Final Image', 'The opposite of the opening image.', 0.99],
    ],
    acts: [0.23, 0.77],
  },
  {
    id: 'short_film', name: 'Short film', blurb: 'Seven beats for a 5–15 page short: one want, one turn, one image that stays.', pages: 12,
    beats: [
      ['Opening image', 'Drop us into the world and the mood in a single shot.', 0.0],
      ['Want', 'What does the character want, right now, today?', 0.08],
      ['Disruption', 'Something gets in the way — the story starts here.', 0.2],
      ['Escalation', 'They try; it gets harder, more personal.', 0.4],
      ['Turn', 'A reversal or reveal that changes what the story is about.', 0.65],
      ['Climax', 'The choice that shows who they really are.', 0.85],
      ['Final image', 'The button — an image that answers the opening one.', 0.97],
    ],
    acts: [0.2, 0.8],
  },
  {
    id: 'three_act', name: 'Three-act structure', blurb: 'Set-up, confrontation, resolution — with the key turning points.', pages: 110,
    beats: [
      ['Hook', 'Grab the audience in the first pages.', 0.0],
      ['Inciting incident', 'The event that sets the story in motion.', 0.10],
      ['First plot point', 'The hero commits; Act Two begins.', 0.25],
      ['Pinch point 1', "A reminder of the antagonist's power.", 0.375],
      ['Midpoint', 'A shift from reaction to action.', 0.50],
      ['Pinch point 2', 'The antagonist strikes again, harder.', 0.625],
      ['Second plot point', 'The final piece; Act Three begins.', 0.75],
      ['Climax', 'The final confrontation.', 0.88],
      ['Resolution', 'The new normal.', 0.97],
    ],
    acts: [0.25, 0.75],
  },
  {
    id: 'heros_journey', name: "The Hero's Journey", blurb: "Vogler's twelve stages of the monomyth.", pages: 110,
    beats: [
      ['Ordinary World', 'The hero at home, incomplete.', 0.0],
      ['Call to Adventure', 'A problem or challenge appears.', 0.08],
      ['Refusal of the Call', 'Fear makes the hero hesitate.', 0.14],
      ['Meeting the Mentor', 'Guidance, a gift, confidence.', 0.19],
      ['Crossing the Threshold', 'Committing to the special world.', 0.25],
      ['Tests, Allies, Enemies', 'Learning the rules of the new world.', 0.32],
      ['Approach to the Inmost Cave', 'Preparing for the central ordeal.', 0.44],
      ['The Ordeal', 'Facing the greatest fear; death and rebirth.', 0.52],
      ['Reward', 'Seizing the sword.', 0.62],
      ['The Road Back', 'Consequences; the chase home.', 0.75],
      ['Resurrection', 'A final test where everything is at stake.', 0.86],
      ['Return with the Elixir', 'Home, transformed.', 0.96],
    ],
    acts: [0.25, 0.75],
  },
  {
    id: 'story_circle', name: 'Story Circle', blurb: "Dan Harmon's eight steps — great for TV and shorts.", pages: 30,
    beats: [
      ['You', 'A character in a zone of comfort.', 0.0],
      ['Need', 'But they want something.', 0.12],
      ['Go', 'They enter an unfamiliar situation.', 0.25],
      ['Search', 'Adapt to it.', 0.37],
      ['Find', 'Get what they wanted.', 0.50],
      ['Take', 'Pay a heavy price for it.', 0.62],
      ['Return', 'Then return to their familiar situation.', 0.75],
      ['Change', 'Having changed.', 0.90],
    ],
    acts: [0.25, 0.75],
  },
  {
    id: 'tv_hour', name: 'TV drama (one hour)', blurb: 'Teaser, five acts and a tag, with act-out cliffhangers.', pages: 60,
    beats: [
      ['Teaser', "Hook and the episode's question.", 0.0],
      ['Act One out', 'The problem becomes unavoidable.', 0.20],
      ['Act Two out', 'A complication raises the stakes.', 0.38],
      ['Act Three out', 'Midpoint reversal.', 0.56],
      ['Act Four out', 'Lowest point / biggest cliffhanger.', 0.75],
      ['Act Five', 'Climax and resolution.', 0.88],
      ['Tag', 'A button — or a hook for next week.', 0.98],
    ],
    acts: [0.08, 0.20, 0.38, 0.56, 0.75],
  },
  {
    id: 'tv_half', name: 'TV comedy (half hour)', blurb: 'Cold open, two acts and a tag.', pages: 30,
    beats: [
      ['Cold open', "A standalone runner or the episode's setup.", 0.0],
      ['Inciting incident', 'The A-story problem lands.', 0.12],
      ['Act One break', 'The plan goes wrong.', 0.45],
      ['Act Two crisis', 'Everything collides.', 0.75],
      ['Resolution', 'Lessons (not) learned.', 0.90],
      ['Tag', 'One last laugh.', 0.97],
    ],
    acts: [0.10, 0.50],
  },
  {
    id: 'syd_field', name: 'Syd Field Paradigm', blurb: 'The original three-act paradigm: two plot points hold the story up, a midpoint keeps Act Two from sagging.', pages: 120,
    beats: [
      ['Set-up', 'Who, where, what is wrong — establish the dramatic premise.', 0.0],
      ['Inciting incident', 'The event that sets the story going.', 0.08],
      ['Plot Point I', 'An event that spins the story in a new direction and launches Act Two.', 0.23],
      ['Pinch I', 'A scene that keeps the story on track and reminds us of the central conflict.', 0.375],
      ['Midpoint', 'A link in the chain that splits the confrontation into two halves.', 0.50],
      ['Pinch II', 'Another reminder of the conflict, tightening the screws.', 0.625],
      ['Plot Point II', 'The event that hooks into the action and spins it toward the ending.', 0.75],
      ['Resolution', 'The solution — not just the last scene, but how it all resolves.', 0.92],
    ],
    acts: [0.23, 0.75],
  },
  {
    id: 'eight_sequence', name: 'Eight-sequence approach', blurb: "Frank Daniel's method: eight mini-movies of 10–15 pages, each with its own tension and turn.", pages: 110,
    beats: [
      ['Sequence A — Status quo', 'The world, the hero and the want; ends with the inciting incident.', 0.0],
      ['Sequence B — Predicament', 'The hero wrestles with the new problem; ends on the lock-in.', 0.12],
      ['Sequence C — First attempt', 'The first, easiest way of solving the problem.', 0.25],
      ['Sequence D — Raising the stakes', 'The first attempt fails or grows; ends on the midpoint.', 0.37],
      ['Sequence E — New tension', 'Subplots surface; a new plan or relationship takes over.', 0.50],
      ['Sequence F — Highest stakes', 'Everything is tested; ends on the main culmination.', 0.62],
      ['Sequence G — Twist', 'Fallout and the final push; the story turns once more.', 0.75],
      ['Sequence H — Resolution', 'The climax and the new equilibrium.', 0.88],
    ],
    acts: [0.25, 0.75],
  },
  {
    id: 'seven_point', name: 'Seven-point structure', blurb: "Dan Wells' method: design the ending first, then build backwards to an opposite start.", pages: 110,
    beats: [
      ['Hook', 'Start in the opposite state to the resolution.', 0.0],
      ['Plot turn 1', 'The call to adventure — the world changes and the story begins to move.', 0.15],
      ['Pinch 1', 'Pressure applied: the antagonist forces the hero to act.', 0.30],
      ['Midpoint', 'The hero moves from reacting to acting.', 0.50],
      ['Pinch 2', 'More pressure — the plan fails, the mentor falls, all seems lost.', 0.65],
      ['Plot turn 2', 'The hero finds the last piece they need.', 0.80],
      ['Resolution', 'The climax; everything the story built toward.', 0.95],
    ],
    acts: [0.15, 0.80],
  },
  {
    id: 'story_spine', name: 'Story Spine', blurb: "Kenn Adams' improv skeleton, loved at Pixar: “Once upon a time… until finally…”", pages: 90,
    beats: [
      ['Once upon a time…', 'The world and the character as they are.', 0.0],
      ['Every day…', 'The routine — what normally happens.', 0.06],
      ['Until one day…', 'Something breaks the routine.', 0.12],
      ['Because of that…', 'The first consequence.', 0.30],
      ['Because of that… (2)', 'Things escalate.', 0.48],
      ['Because of that… (3)', 'Things come to a head.', 0.66],
      ['Until finally…', 'The climax that settles it.', 0.85],
      ['And ever since then…', 'The new normal — what changed.', 0.96],
    ],
    acts: [0.12, 0.85],
  },
  {
    id: 'kishotenketsu', name: 'Kishōtenketsu', blurb: 'Four-part East Asian form built on contrast rather than conflict: introduction, development, twist, reconciliation.', pages: 90,
    beats: [
      ['Ki — Introduction', 'Characters and world, plainly set out.', 0.0],
      ['Shō — Development', 'Follow them; deepen what we know without a big change.', 0.25],
      ['Ten — Twist', 'An unexpected turn or new element that recasts everything.', 0.50],
      ['Ketsu — Reconciliation', 'Bring the parts together; the meaning lands.', 0.75],
    ],
    acts: [0.25, 0.50, 0.75],
  },
  {
    id: 'freytag', name: "Freytag's Pyramid", blurb: 'Five-act arc from classical tragedy: rising action up to a climax, then the fall.', pages: 110,
    beats: [
      ['Exposition', 'Background, setting and characters.', 0.0],
      ['Inciting moment', 'The conflict begins.', 0.10],
      ['Rising action', 'Complications build toward the peak.', 0.20],
      ['Climax', "The turning point of the protagonist's fortunes.", 0.50],
      ['Falling action', 'Consequences unwind; the opposing force gains.', 0.65],
      ['Moment of final suspense', 'A last chance that things could turn out otherwise.', 0.82],
      ['Dénouement', 'The catastrophe or resolution.', 0.92],
    ],
    acts: [0.20, 0.50, 0.65, 0.82],
  },
  {
    id: 'fichtean', name: 'Fichtean curve', blurb: 'Crisis after crisis from page one: no slow set-up, backstory woven in as you go. Good for thrillers.', pages: 100,
    beats: [
      ['First crisis', 'Open in trouble — the hook is a crisis already under way.', 0.0],
      ['Crisis 2', 'A new, bigger problem; reveal backstory only as needed.', 0.18],
      ['Crisis 3', 'Higher stakes; the hero adapts.', 0.36],
      ['Crisis 4', 'The problems start to converge.', 0.54],
      ['Crisis 5', 'The worst one yet, setting up the showdown.', 0.70],
      ['Climax', 'Every thread pulled tight at once.', 0.85],
      ['Falling action', 'A short wind-down; the new normal.', 0.95],
    ],
    acts: [0.70, 0.85],
  },
  {
    id: 'truby', name: 'Truby: seven key steps', blurb: "John Truby's organic core: the steps every strong story's spine passes through.", pages: 110,
    beats: [
      ['Weakness and need', 'The flaw holding the hero back, and what they must learn.', 0.0],
      ['Desire', 'The specific goal that drives the story.', 0.10],
      ['Opponent', 'The character who wants the same thing and fights for it.', 0.18],
      ['Plan', 'The strategy the hero uses to beat the opponent.', 0.25],
      ['Battle', 'The final conflict that decides who wins the goal.', 0.80],
      ['Self-revelation', 'The hero sees the truth about themselves.', 0.88],
      ['New equilibrium', 'Everything is back to normal — but the hero has changed.', 0.96],
    ],
    acts: [0.25, 0.80],
  },
]

export const template = (id: string) => TEMPLATES.find(t => t.id === id)

/** Fractions where acts 2, 3… begin: the template's, or worked out from the beats for one it doesn't know. */
export function actBreaks(s: Structure | null): number[] {
  if (!s) return [0.25, 0.75]
  const known = template(s.template)
  if (known) return known.acts
  const starts = new Map<number, number>()
  for (const b of s.beats) if (b.act > 1) starts.set(b.act, Math.min(starts.get(b.act) ?? 1, b.target))
  return starts.size ? [...starts.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]) : [0.25, 0.75]
}

/** Switch structures, keeping scenes on any beat whose name matches one in the new template (as the phone does). */
export function switchStructure(old: Structure | null, t: Template): Structure {
  const next = createStructure(t)
  if (!old) return next
  const placed = new Map(old.beats.map(b => [b.name.toLowerCase(), b.sceneIds]))
  return { ...next, beats: next.beats.map(b => ({ ...b, sceneIds: placed.get(b.name.toLowerCase()) ?? [] })) }
}

export function createStructure(t: Template): Structure {
  const beats: Beat[] = t.beats.map(([name, description, f]) => ({
    id: uuid(), name, description, target: f, act: 1 + t.acts.filter(a => f >= a).length, sceneIds: [],
  }))
  return { template: t.id, beats, targetPages: t.pages }
}

export interface BeatCheck { beat: Beat; targetPage: number; actualPage: number | null; verdict: string; onTrack: boolean }

/** Where each beat lands vs. where the template says it should, scaled to the script's length. */
export function checkBeats(s: Structure, totalPages: number, pageOfScene: (id: number) => number | null): BeatCheck[] {
  const length = totalPages * 2 < s.targetPages ? s.targetPages : totalPages
  return s.beats.map(b => {
    const target = Math.max(1, Math.trunc(b.target * length))
    const pages = b.sceneIds.map(pageOfScene).filter((p): p is number => p != null)
    const actual = pages.length ? Math.min(...pages) : null
    const tolerance = Math.max(3, Math.trunc(length * 0.05))
    if (actual == null) return { beat: b, targetPage: target, actualPage: null, verdict: `Not placed yet — aim for p.${target}`, onTrack: false }
    if (actual > target + tolerance) return { beat: b, targetPage: target, actualPage: actual, verdict: `${b.name} should land by p.${target} — yours is on p.${actual}`, onTrack: false }
    if (actual < target - tolerance) return { beat: b, targetPage: target, actualPage: actual, verdict: `Early: p.${actual} (target p.${target})`, onTrack: false }
    return { beat: b, targetPage: target, actualPage: actual, verdict: `On track: p.${actual} (target p.${target})`, onTrack: true }
  })
}
