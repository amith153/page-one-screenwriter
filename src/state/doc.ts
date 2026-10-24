/**
 * The open script. The editor owns the text while you type and reports element lists here;
 * everything else (cards, story tools, Script Doctor fixes) edits through `update`, and the
 * editor picks those changes up as one undoable step.
 */
import { create } from 'zustand'
import { stampEdits } from '../core/authors'
import { countWords, pruneExtras, TYPE_INFO, type Element, type Script } from '../core/model'
import { Paginator, defaultLayout, linesPerPage, type LayoutOptions, type Pagination } from '../core/paginator'
import { forcedBreaks, sceneLabels } from '../core/production'
import { loadScript, saveScript, saveVersion } from './library'
import { useSettings } from './settings'
import { useChanges } from './changes'

/** This install as an author: its random id and the name it writes under. */
export const me = () => {
  const s = useSettings.getState().s
  return { id: s.authorId, name: s.name.trim() || 'Writer' }
}

export type View = 'script' | 'cards' | 'page' | 'story' | 'board' | 'production'
export type Panel = 'scene' | 'doctor' | 'notes' | 'changes' | 'stats' | null

interface DocStore {
  script: Script | null
  pagination: Pagination | null
  sceneLabels: Map<number, string>
  /** Bumped when elements change from outside the editor, so it reloads them. */
  externalRev: number
  saved: 'saved' | 'saving' | 'dirty' | 'error'
  view: View
  panel: Panel
  sidebar: boolean
  /** The element the cursor is in (id), for the navigator and inspector. */
  currentId: number | null
  jump: { id: number; n: number; select?: [number, number] } | null
  sessionWords: number
  activeComment: string | null
  open: (id: string) => Promise<void>
  openScript: (s: Script) => void
  close: () => Promise<void>
  /** Elements from the editor (as the writer types). */
  fromEditor: (els: Element[]) => void
  /** Any other change to the script. */
  update: (f: (s: Script) => Script, opts?: { elementsChanged?: boolean; unstamped?: boolean }) => void
  setView: (v: View) => void
  setPanel: (p: Panel) => void
  toggleSidebar: () => void
  setCurrent: (id: number | null) => void
  jumpTo: (id: number, select?: [number, number]) => void
  setActiveComment: (id: string | null) => void
  snapshot: (name: string) => Promise<void>
  flush: () => Promise<void>
}

export const layoutFor = (): LayoutOptions => {
  const s = useSettings.getState().s
  return { ...defaultLayout(), paper: s.paperSize, autoContd: s.autoContd, moreContd: s.moreContd, sceneSpacing: s.sceneSpacing }
}

export function paginate(script: Script): Pagination {
  return new Paginator(layoutFor()).paginate(script.elements, forcedBreaks(script.elements, script.extras.lock))
}

export const currentLinesPerPage = () => linesPerPage(useSettings.getState().s.paperSize)

const printedWords = (els: readonly Element[]) => els.reduce((n, e) => n + (TYPE_INFO[e.type].printed ? countWords(e.text) : 0), 0)

let saveTimer: number | undefined
let pageTimer: number | undefined
let lastSnapshot = 0
let lastWords = 0

/** Revision mode: elements whose text or type changed take the current revision level. */
function markRevisions(prev: readonly Element[], next: Element[], level: number): Element[] {
  const before = new Map(prev.map(e => [e.id, e]))
  return next.map(e => {
    const b = before.get(e.id)
    const changed = !b || b.text !== e.text || b.type !== e.type
    return changed && e.revision !== level ? { ...e, revision: level } : e
  })
}

export const useDoc = create<DocStore>((set, get) => {
  const schedulePages = () => {
    window.clearTimeout(pageTimer)
    pageTimer = window.setTimeout(() => {
      const s = get().script
      if (!s) return
      set({ pagination: paginate(s), sceneLabels: sceneLabels(s.elements, s.extras.lock) })
    }, 120)
  }
  const scheduleSave = () => {
    set({ saved: 'dirty' })
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void get().flush(), 900)
  }
  const trackWords = (els: readonly Element[]) => {
    const w = printedWords(els)
    const delta = w - lastWords
    lastWords = w
    // Big jumps are pastes, imports or deletions of whole scenes — not writing.
    if (delta !== 0 && Math.abs(delta) < 200) {
      useSettings.getState().addWords(delta)
      set({ sessionWords: Math.max(0, get().sessionWords + delta) })
    }
  }

  return {
    script: null, pagination: null, sceneLabels: new Map(), externalRev: 0, saved: 'saved', view: 'script', panel: null,
    sidebar: true, currentId: null, jump: null, sessionWords: 0, activeComment: null,

    open: async id => { get().openScript(await loadScript(id)) },

    openScript: s => {
      if (s.id !== get().script?.id) useChanges.getState().setBase(null)
      lastWords = printedWords(s.elements)
      lastSnapshot = Date.now()
      set({
        script: s, pagination: paginate(s), sceneLabels: sceneLabels(s.elements, s.extras.lock), externalRev: get().externalRev + 1,
        saved: 'saved', view: 'script', sessionWords: 0, currentId: s.elements[0]?.id ?? null, activeComment: null,
      })
    },

    close: async () => {
      await get().flush()
      const s = get().script
      if (s && get().sessionWords > 0) await saveVersion(s, 'Auto-saved', get().pagination?.pages.length ?? 0).catch(() => {})
      set({ script: null, pagination: null })
    },

    fromEditor: els => {
      const s = get().script
      if (!s) return
      const marked = s.revisionMode ? markRevisions(s.elements, els, s.revisionLevel) : els
      const next = stampEdits(s.elements, marked, me())
      set({ script: { ...s, elements: next, extras: pruneExtras(s.extras, next), modifiedAt: Date.now() } })
      trackWords(next)
      schedulePages()
      scheduleSave()
    },

    update: (f, opts) => {
      const s = get().script
      if (!s) return
      const made = f(s)
      const stamped = made.elements !== s.elements && !opts?.unstamped ? { ...made, elements: stampEdits(s.elements, made.elements, me()) } : made
      const next = { ...stamped, modifiedAt: Date.now() }
      const changed = opts?.elementsChanged ?? next.elements !== s.elements
      set({ script: next, externalRev: changed ? get().externalRev + 1 : get().externalRev })
      if (changed) { lastWords = printedWords(next.elements) }
      schedulePages()
      scheduleSave()
    },

    setView: v => set({ view: v }),
    setPanel: p => set({ panel: get().panel === p ? null : p }),
    toggleSidebar: () => set({ sidebar: !get().sidebar }),
    setCurrent: id => { if (id !== get().currentId) set({ currentId: id }) },
    // Jumping to a line always lands in the script view.
    jumpTo: (id, select) => set({ view: 'script', jump: { id, n: (get().jump?.n ?? 0) + 1, select } }),
    setActiveComment: id => set({ activeComment: id }),

    snapshot: async name => {
      await get().flush()
      const s = get().script
      if (s) await saveVersion(s, name, get().pagination?.pages.length ?? 0)
    },

    flush: async () => {
      window.clearTimeout(saveTimer)
      const s = get().script
      if (!s || get().saved === 'saved') return
      set({ saved: 'saving' })
      try {
        await saveScript(s, get().pagination?.pages.length ?? 0)
        // A quiet safety net: one automatic snapshot every 15 minutes of writing.
        if (Date.now() - lastSnapshot > 15 * 60_000) { lastSnapshot = Date.now(); await saveVersion(s, 'Auto-saved', get().pagination?.pages.length ?? 0) }
        if (get().script === s) set({ saved: 'saved' })
      } catch (e) {
        console.error(e)
        set({ saved: 'error' })
      }
    },
  }
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => { void useDoc.getState().flush() })
}
