import { useDoc } from '../state/doc'
import { exportFdx, exportFountain, exportPageOne, printScript } from '../io/files'
import { openMenu, useModal } from './kit'

export function printNow() {
  const d = useDoc.getState()
  if (d.view !== 'page') d.setView('page')
  window.setTimeout(printScript, 350)
}

export function exportMenu(anchor: HTMLElement) {
  const s = useDoc.getState().script
  if (!s) return
  openMenu([
    { heading: 'Export' },
    { label: 'PDF, Word, RTF, text…', icon: 'page', hint: 'Ctrl+E', run: () => useModal.getState().open('export') },
    { label: 'Final Draft (.fdx)', icon: 'film', run: () => void exportFdx(useDoc.getState().script!) },
    { label: 'Fountain', icon: 'script', run: () => void exportFountain(useDoc.getState().script!) },
    { label: 'Page One file (.pageone)', icon: 'copy', run: () => void exportPageOne(useDoc.getState().script!) },
    { label: 'Google Drive…', icon: 'cloud', run: () => useModal.getState().open('drive') },
    { label: 'Share & merge…', icon: 'users', run: () => useModal.getState().open('share') },
    { divider: true },
    { label: 'Print…', icon: 'page', hint: 'Ctrl+P', run: printNow },
    { label: 'Sides for actors…', icon: 'users', run: () => useModal.getState().open('sides') },
    { label: 'Reports (CSV)…', icon: 'stats', run: () => useModal.getState().open('reports') },
  ], anchor, 'right')
}
