/** Where the app is (library or a script) and the library listing. */
import { create } from 'zustand'
import { listLibrary, type ScriptMeta } from '../state/library'
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

export const useApp = create<AppState>((set, get) => ({
  library: [],
  loaded: false,
  about: false,
  query: '',
  setQuery: q => set({ query: q }),
  refresh: async () => {
    try { set({ library: await listLibrary(), loaded: true }) } catch (e) { console.error(e); set({ loaded: true }) }
  },
  openScript: async id => {
    try {
      if (useDoc.getState().script) await useDoc.getState().close()
      await useDoc.getState().open(id)
    } catch (e) {
      console.error(e)
      toast('That script could not be opened.', 'close')
    }
  },
  goHome: async () => {
    if (!useDoc.getState().script) return
    await useDoc.getState().close()
    await get().refresh()
  },
  setAbout: v => set({ about: v }),
}))
