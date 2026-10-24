/** Track changes: the draft the open script is compared against, and whether the script shows the marks. */
import { create } from 'zustand'
import type { Element } from '../core/model'

export interface Baseline { elements: Element[]; name: string; time: number; pages: number; path: string }

interface ChangesStore {
  base: Baseline | null
  /** Draw the changes in the script itself (insertions highlighted, deletions struck through). */
  show: boolean
  setBase: (b: Baseline | null) => void
  setShow: (on: boolean) => void
}

export const useChanges = create<ChangesStore>(set => ({
  base: null,
  show: false,
  setBase: base => set(base ? { base } : { base: null, show: false }),
  setShow: show => set({ show }),
}))
