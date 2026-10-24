/**
 * The user guide on the home screen: how to use Page One, a chapter per part of the app.
 * In the text, `Ctrl+K` shows as a key and **words** in bold.
 */
export interface Chapter { id: string; icon: string; title: string; summary: string; steps: string[] }

export const MANUAL: Chapter[] = [
  {
    id: 'start', icon: 'sparkle', title: 'Start here', summary: 'Your first script in two minutes.',
    steps: [
      'Press **New script** (or `Ctrl+N`) on the home screen. Not sure where to begin? While your library is empty, Page One offers **The Last Projectionist**, a short sample that uses every feature.',
      'Type a scene heading such as `INT. KITCHEN - NIGHT` and press `Enter`. Page One moves to the next sensible element — action, then character, then dialogue — so you mostly just type and press `Enter`.',
      'Everything saves by itself to your library folder (Documents › Page One). The dot next to the title says **Saved**.',
      'Press `Ctrl+K` for the command palette: every action in the app, searchable by name.',
      'Back to the library any time with the bird logo at the top left.',
    ],
  },
  {
    id: 'writing', icon: 'script', title: 'Writing in screenplay format', summary: 'Elements, shortcuts and autocomplete.',
    steps: [
      '`Enter` goes to the next element; `Tab` cycles the current line through element types; `Shift+Tab` goes back.',
      'Jump straight to a type: `Ctrl+1` scene heading · `Ctrl+2` action · `Ctrl+3` character · `Ctrl+4` parenthetical · `Ctrl+5` dialogue · `Ctrl+6` transition.',
      'Character names, locations and times of day autocomplete as you type — take a suggestion with `Tab` or `→`.',
      '`Ctrl+D` makes the speech dual dialogue. `Ctrl+Enter` starts a new scene. `Alt+↑` / `Alt+↓` jumps between scenes.',
      '`Ctrl+F` finds and replaces. `Ctrl+M` pins a note to the words you selected.',
      'Scene headings are **bold** by default. Turn that off — or make character names bold too — in Settings (`Ctrl+,`); exports follow the same choice.',
    ],
  },
  {
    id: 'navigate', icon: 'cards', title: 'Navigator and index cards', summary: 'See the whole story; move scenes around.',
    steps: [
      '`Ctrl+B` shows the navigator: every scene in order. Click one to jump there.',
      '**Cards** (`Alt+2`) shows each scene as an index card with its synopsis. Drag cards to reorder scenes — the script follows.',
      'Give a card a colour or a storyline to see the shape of your plot at a glance.',
      'Characters and scenes live here, on the cards and in the navigator, rather than in the command palette.',
    ],
  },
  {
    id: 'story', icon: 'story', title: 'Story structure', summary: 'Pick a structure, place your scenes on its beats.',
    steps: [
      'Open **Story** (`Alt+4`) › **Structure** and choose a structure: Save the Cat!, the Hero\'s Journey, three acts, TV formats and more.',
      'Each structure comes with a worked example from a famous film. Open **In <film>** on any beat to see where it happens in that film.',
      'Press **Open the example script** to get the whole film as a beat outline: every beat is a scene, already placed, so you can see the cards, the beat map and the checks working.',
      'Drag your own scenes onto beats (or use **+ Place a scene**). Page One checks each beat against its target page and tells you if it lands early or late.',
      '**Characters** and **Locations** keep a bible for each; **Read only <name>\'s lines** checks a voice. **X-ray** shows pacing, rhythm and who is in which scene.',
    ],
  },
  {
    id: 'focus', icon: 'eye', title: 'Focus mode, goals and sprints', summary: 'Just you and the page.',
    steps: [
      'Press `F11` (or the eye icon) for focus mode: the chrome goes and the page sits alone. The bar at the bottom shows words, time and page, plays rain or brown noise, and switches the **Focus line** on and off. `Esc` leaves.',
      'Set a daily word goal in Settings. The ring on the home screen fills as you write, and your streak counts the days in a row.',
      'Start a timed sprint from the command palette (`Ctrl+K` › sprint).',
      'Give a script a deadline (`Ctrl+K` › Deadline) and Page One works out the pages a day you need.',
    ],
  },
  {
    id: 'doctor', icon: 'doctor', title: 'Script Doctor, notes and versions', summary: 'Check, annotate, go back in time.',
    steps: [
      '`Ctrl+Shift+K` opens the Script Doctor: formatting slips, characters whose names drift, overlong action — with one-click fixes.',
      'Notes (`Ctrl+M`) are pinned to the words you selected; open them all from the inspector (`Ctrl+I`).',
      '`Ctrl+S` saves a named version. Page One also saves one every 15 minutes of writing. Restore any version from `Ctrl+K` › Versions.',
      '**Track changes** (`Ctrl+K` › Track changes) compares the draft with any saved version, word by word.',
    ],
  },
  {
    id: 'together', icon: 'users', title: 'Writing together', summary: 'Pass drafts back and forth, merge them, and see who wrote what.',
    steps: [
      'Open **Share** at the top right. Set the name you **write as**: every line you change is stamped with it (a random id, never your phone number or email).',
      '**Save draft to send** makes a .pageone file and remembers the draft as it left. No connection is needed.',
      'When their draft comes back (.pageone, Fountain or Final Draft), **Open their draft…** lists every change. Accept or turn down each one; where you both changed the same line, keep **Mine**, take **Theirs**, or keep **Both** (theirs goes in a note under yours).',
      'Before any merge your draft is saved under Versions, so nothing is ever lost.',
      'Switch on **Show who wrote what** (in Share, or Settings) for a coloured bar beside each line, by the writer who last changed it. Hover a line for the name and time. Each change in the merge list says who made it.',
    ],
  },
  {
    id: 'production', icon: 'production', title: 'Production', summary: 'Revisions, locking, reports, sides.',
    steps: [
      'In **Production** (`Alt+6`), turn on revision mode: changed lines get an asterisk and the page takes the revision colour (Blue, Pink, Yellow…).',
      '**Lock pages & scenes** freezes numbering: new scenes become 12A, overflowing pages 34A, cut scenes stay as OMITTED.',
      'Reports — scenes, characters, locations, breakdown — export as **CSV** for a spreadsheet or **PDF** to print and hand out (one report, or all four in one PDF).',
      '**Sides** makes a PDF of just the scenes chosen characters are in, for auditions and table reads.',
    ],
  },
  {
    id: 'export', icon: 'export', title: 'Export, print and your phone', summary: 'Every format, the same pages.',
    steps: [
      '`Ctrl+E` exports: PDF, Final Draft (.fdx), Fountain, Word, Rich Text, plain text, a web page, or a .pageone file with everything.',
      'The PDF breaks pages exactly where the page view (`Alt+3`) does. Add a watermark (a reader\'s name, CONFIDENTIAL) in Settings or in the export window.',
      '`Ctrl+P` prints through your system, which can also save a PDF in your own fonts.',
      'Import Fountain, Final Draft or .pageone from the home screen. Page One on your phone opens the same files.',
      'Connect **Drive** from the home screen to keep scripts and exports in a Page One folder in your Google Drive.',
    ],
  },
]
