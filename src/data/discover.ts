/**
 * The home screen's "Discover" shelf: where to read real screenplays for free, a script to study
 * each day, a craft note, a story spark to start from, and where to send a finished draft.
 * Links are to the sources themselves (they host the scripts); nothing is copied into the app.
 */

export interface Source { name: string; url: string; blurb: string }

/** Free, long-running places to read produced screenplays. */
export const SCRIPT_LIBRARIES: Source[] = [
  { name: 'BBC Writersroom', url: 'https://www.bbc.co.uk/writers/scripts', blurb: 'Film, TV and radio scripts from BBC productions, shared by the writers.' },
  { name: 'Script Slug', url: 'https://www.scriptslug.com', blurb: 'Clean PDFs of recent films and series, including awards-season releases.' },
  { name: 'IMSDb', url: 'https://imsdb.com', blurb: 'The Internet Movie Script Database: a deep archive of features, by genre.' },
  { name: 'SimplyScripts', url: 'https://www.simplyscripts.com', blurb: 'Links to thousands of film, TV and unproduced scripts across the web.' },
  { name: 'Daily Script', url: 'https://www.dailyscript.com', blurb: 'Classic film and TV scripts and transcripts, kept since the late nineties.' },
  { name: '8FLiX', url: 'https://8flix.com', blurb: 'Screenplays alongside breakdowns of their structure and scenes.' },
]

export interface Study { title: string; year: number; by: string; url: string; look: string }

/** One produced script a day, with something specific to look for while reading it. */
export const STUDY: Study[] = [
  { title: 'Chinatown', year: 1974, by: 'Robert Towne', url: 'https://imsdb.com/scripts/Chinatown.html', look: 'how every clue Gittes finds raises the stakes instead of settling them.' },
  { title: 'Pulp Fiction', year: 1994, by: 'Quentin Tarantino', url: 'https://imsdb.com/scripts/Pulp-Fiction.html', look: 'long dialogue scenes that stay tense because something dangerous waits underneath.' },
  { title: 'Taxi Driver', year: 1976, by: 'Paul Schrader', url: 'https://imsdb.com/scripts/Taxi-Driver.html', look: 'voice-over that tells you who Travis is by what he gets wrong.' },
  { title: 'Alien', year: 1979, by: "Dan O'Bannon", url: 'https://imsdb.com/scripts/Alien.html', look: 'the stripped, white-space-heavy action lines that read at the speed of the film.' },
  { title: 'Fargo', year: 1996, by: 'Joel & Ethan Coen', url: 'https://imsdb.com/scripts/Fargo.html', look: 'how small talk becomes character, and comedy sits right next to horror.' },
  { title: 'Good Will Hunting', year: 1997, by: 'Matt Damon & Ben Affleck', url: 'https://imsdb.com/scripts/Good-Will-Hunting.html', look: 'the park-bench scene: a monologue that turns the whole relationship.' },
  { title: 'The Godfather', year: 1972, by: 'Mario Puzo & Francis Ford Coppola', url: 'https://imsdb.com/scripts/Godfather.html', look: 'the wedding opening, which sets up every major thread in one sequence.' },
  { title: 'Annie Hall', year: 1977, by: 'Woody Allen & Marshall Brickman', url: 'https://imsdb.com/scripts/Annie-Hall.html', look: 'breaking form (split screens, subtitles, asides) without losing the story.' },
  { title: 'The Apartment', year: 1960, by: 'Billy Wilder & I.A.L. Diamond', url: 'https://imsdb.com/scripts/Apartment,-The.html', look: 'props that carry emotion: the key, the mirror, the tennis racket.' },
  { title: 'The Social Network', year: 2010, by: 'Aaron Sorkin', url: 'https://imsdb.com/scripts/Social-Network,-The.html', look: 'a cold open that is pure argument and still tells you the whole film.' },
  { title: 'Eternal Sunshine of the Spotless Mind', year: 2004, by: 'Charlie Kaufman', url: 'https://imsdb.com/scripts/Eternal-Sunshine-of-the-Spotless-Mind.html', look: 'how a reader stays oriented while time and memory fall apart.' },
  { title: 'The Silence of the Lambs', year: 1991, by: 'Ted Tally', url: 'https://imsdb.com/scripts/Silence-of-the-Lambs.html', look: 'the first Lecter scene, where status shifts with nearly every line.' },
  { title: 'The Shawshank Redemption', year: 1994, by: 'Frank Darabont', url: 'https://imsdb.com/scripts/Shawshank-Redemption,-The.html', look: 'planted details that pay off decades later in story time.' },
  { title: 'Lost in Translation', year: 2003, by: 'Sofia Coppola', url: 'https://imsdb.com/scripts/Lost-in-Translation.html', look: 'how much a sparse script leaves to mood, place and silence.' },
  { title: 'Juno', year: 2007, by: 'Diablo Cody', url: 'https://imsdb.com/scripts/Juno.html', look: 'a voice so specific you could pick out Juno’s lines with no names attached.' },
  { title: 'Get Out', year: 2017, by: 'Jordan Peele', url: 'https://imsdb.com/scripts/Get-Out.html', look: 'scenes that play one way the first time and another way once you know.' },
  { title: 'Groundhog Day', year: 1993, by: 'Danny Rubin & Harold Ramis', url: 'https://imsdb.com/scripts/Groundhog-Day.html', look: 'repetition used to show change: the same day, a different man.' },
  { title: 'Witness', year: 1985, by: 'Earl W. Wallace & William Kelley', url: 'https://imsdb.com/scripts/Witness.html', look: 'a thriller that slows right down for the barn-raising, and why that works.' },
  { title: 'The Usual Suspects', year: 1995, by: 'Christopher McQuarrie', url: 'https://imsdb.com/scripts/Usual-Suspects,-The.html', look: 'an unreliable narrator, and the fair clues hidden in plain sight.' },
  { title: 'Sideways', year: 2004, by: 'Alexander Payne & Jim Taylor', url: 'https://imsdb.com/scripts/Sideways.html', look: 'the wine monologue: a character talking about himself without knowing it.' },
  { title: 'Whiplash', year: 2014, by: 'Damien Chazelle', url: 'https://imsdb.com/scripts/Whiplash.html', look: 'rehearsal scenes written with the tension of action sequences.' },
  { title: 'Her', year: 2013, by: 'Spike Jonze', url: 'https://imsdb.com/scripts/Her.html', look: 'a love story where one of the two leads is only ever a voice.' },
]

/** Short, practical notes on the craft. One a day. */
export const CRAFT: { title: string; note: string }[] = [
  { title: 'Enter late, leave early', note: 'Start each scene as close to its turn as you can, and cut out the moment it lands. The audience fills in the hellos and goodbyes.' },
  { title: 'Want versus need', note: 'Your lead chases what they want; the story gives them what they need. The gap between the two is where the theme lives.' },
  { title: 'Every scene turns', note: 'Something should be different at the end of a scene: a value flips, a plan fails, a secret comes out. If nothing turns, ask whether the scene earns its place.' },
  { title: 'Action lines are camera', note: 'Write what we see and hear, in the present tense, in the order we notice it. A new paragraph often suggests a new shot.' },
  { title: 'Subtext over speeches', note: 'People rarely say what they mean when it matters. Let them talk about the dishes while the marriage ends.' },
  { title: 'Make it cost something', note: 'A choice is only dramatic when both options hurt. Give your character a dilemma, not just a decision.' },
  { title: 'Plant and pay off', note: 'Anything that matters at the end should be seen, lightly, earlier. Anything set up should come back. Keep a list of both.' },
  { title: 'Character names are labels', note: 'Make names easy to tell apart on the page: different first letters, different lengths. Readers skim the names first.' },
  { title: 'White space is pace', note: 'Short paragraphs read fast; dense blocks read slow. Use the page to set the rhythm of the scene.' },
  { title: 'The midpoint shift', note: 'Around halfway through, raise the stakes or reverse the direction. A false victory or a false defeat keeps act two from sagging.' },
  { title: 'Read it out loud', note: 'Dialogue that looks fine can sound stiff. Read your scenes aloud, or have someone read them to you, and listen for where you stumble.' },
  { title: 'One page, one minute', note: 'Correctly formatted, a page runs about a minute of screen time. Use the page count to judge whether a scene runs too long for what it does.' },
  { title: 'Give the antagonist a plan', note: 'The opposition should want something and be working to get it, even off screen. A passive villain makes for a passive hero.' },
  { title: 'Draft fast, rewrite slow', note: 'Get to FADE OUT before you polish. A finished bad draft can be fixed; a perfect first act cannot.' },
  { title: 'Specific beats general', note: '“A car” tells us little; “a dented hearse with a surfboard on top” tells us about a person. Choose details that characterize.' },
]

/** Spark pieces: who, wants what, and what is in the way. */
export const SPARK = {
  who: [
    'a night-shift projectionist', 'a retired stunt double', 'a teenage chess hustler', 'a wedding photographer', 'a lighthouse keeper’s widow',
    'a disgraced weather presenter', 'a hospital translator', 'a street-food vendor', 'a forger of old maps', 'a substitute teacher',
    'a former child star', 'a long-haul trucker', 'an auctioneer', 'a sound recordist', 'a twin who lied about who died',
  ],
  wants: [
    'to win back a family heirloom', 'to finish a film their father abandoned', 'to disappear for one week', 'to prove they didn’t start the fire',
    'to reunite a band for one last show', 'to return a letter forty years late', 'to stop a wedding', 'to be forgotten by the internet',
    'to cross the border before sunrise', 'to find who keeps leaving gifts at their door', 'to buy back the house they grew up in', 'to keep a promise to a stranger',
  ],
  but: [
    'the only witness is their worst enemy', 'they have just lost their memory of the last year', 'a storm closes every road', 'their partner is secretly working against them',
    'it has to happen during a family funeral', 'nobody believes a word they say', 'the clock resets every night', 'the money is counterfeit',
    'their own sibling is the one in the way', 'they have twelve hours to live a lie', 'the city is in blackout', 'the evidence is in a language they can’t read',
  ],
}

/** Fellowships, labs and competitions with long track records. Deadlines change each year, so check the site. */
export const OPPORTUNITIES: Source[] = [
  { name: 'Academy Nicholl Fellowships', url: 'https://www.oscars.org/nicholl', blurb: 'The Academy’s international screenwriting competition for feature scripts.' },
  { name: 'Austin Film Festival', url: 'https://austinfilmfestival.com', blurb: 'A writers’ festival with a long-running screenplay and teleplay competition.' },
  { name: 'Sundance Institute', url: 'https://www.sundance.org', blurb: 'Labs and fellowships for independent screenwriters and directors.' },
  { name: 'BBC Writersroom', url: 'https://www.bbc.co.uk/writers/opportunities', blurb: 'Open calls and development schemes for new UK writers.' },
  { name: 'The Black List', url: 'https://blcklst.com', blurb: 'Host a script, get professional reads, and be found by producers.' },
  { name: 'Script Pipeline', url: 'https://www.scriptpipeline.com', blurb: 'Screenwriting and TV competitions focused on development and representation.' },
]

/** Where to learn more: free, writer-run resources. */
export const LEARN: Source[] = [
  { name: 'Go Into The Story', url: 'https://gointothestory.blcklst.com', blurb: 'The Black List’s craft blog: script analysis, interviews and daily lessons.' },
  { name: 'No Film School', url: 'https://nofilmschool.com', blurb: 'Free articles and interviews on writing, directing and getting made.' },
  { name: 'John August', url: 'https://johnaugust.com', blurb: 'A working screenwriter’s notes on craft and the business, plus the Scriptnotes podcast.' },
]
