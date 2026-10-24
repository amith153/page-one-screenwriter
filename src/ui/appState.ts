/** Where the app is (library or a script) and the library listing. */
import { create } from 'zustand'
import { deleteScript, listLibrary, type ScriptMeta } from '../state/library'
import { isExampleScript } from '../data/structureExamples'
import { useDoc } from '../state/doc'
import { toast } from './kit'

interface AppState {
  library: ScriptMeta[]
  loaded: boolean
  about: boolean
  /** The home screen's search (in the title bar), filtering the library. */
  query: string
  setQuery: (q: string) => void
  refresh: () => Promise<void>
  openScript: (id: string) => Promise<void>
  goHome: () => Promise<void>
  setAbout: (v: boolean) => void
}

/** Close the open script; a structure example is a study aid, so it goes with it. */
async function leave() {
  const cur = useDoc.getState().script
  if (!cur) return
  const example = isExampleScript(cur.titlePage.draft)
  await useDoc.getState().close()
  if (example) { try { await deleteScript(cur.id) } catch { /* swept up on the next listing */ } }
}

export const useApp = create<AppState>((set, get) => ({
  library: [],
  loaded: false,
  about: false,
  query: '',
  setQuery: q => set({ query: q }),
  refresh: async () => {
    try { set({ library: await listLibrary(useDoc.getState().script?.id), loaded: true }) } catch (e) { console.error(e); set({ loaded: true }) }
  },
  openScript: async id => {
    try {
      await leave()
      await useDoc.getState().open(id)
    } catch (e) {
      console.error(e)
      toast('That script could not be opened.', 'close')
    }
  },
  goHome: async () => {
    if (!useDoc.getState().script) return
    await leave()
    await get().refresh()
  },
  setAbout: v => set({ about: v }),
}))
