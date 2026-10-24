import { useEffect } from 'react'
import { useDoc } from './state/doc'
import './state/collab'
import { useSettings } from './state/settings'
import { ScriptEditor } from './editor/ScriptEditor'
import { TitleBar } from './ui/TitleBar'
import { StatusBar } from './ui/StatusBar'
import { Sidebar } from './ui/Sidebar'
import { Inspector } from './ui/Inspector'
import { Cards } from './ui/Cards'
import { PageView } from './ui/PageView'
import { Story } from './ui/Story'
import { Production } from './ui/Production'
import { Moodboard } from './ui/Moodboard'
import { Home } from './ui/Home'
import { Onboarding } from './ui/Onboarding'
import { Palette, usePalette } from './ui/Palette'
import { ModalHost } from './ui/Modals'
import { SprintModal } from './ui/Sprint'
import { ConfirmHost, MenuHost, ToastHost, useModal } from './ui/kit'
import { useApp } from './ui/appState'
import { useTheme } from './ui/theme'
import { printNow } from './ui/menus'
import { FocusHud, useFocus } from './ui/Focus'
import { redo, undo } from 'prosemirror-history'
import { getEditorView } from './editor/bridge'

/** App-wide keyboard shortcuts (the editor handles its own writing keys). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const d = useDoc.getState()
      const key = e.key.toLowerCase()
      const hit = (f: () => void) => { e.preventDefault(); f() }
      if (mod && key === 'k' && !e.shiftKey) return hit(() => usePalette.getState().open())
      if (mod && key === ',') return hit(() => useModal.getState().open('settings'))
      if (mod && key === '/') return hit(() => useModal.getState().open('shortcuts'))
      if (e.key === 'F11' || (mod && e.shiftKey && key === 'f')) return hit(() => { if (d.script) useFocus.getState().toggle() })
      if (!d.script) {
        if (mod && key === 'n') hit(() => document.querySelector<HTMLButtonElement>('.cover.new')?.click())
        if (mod && key === 'o') hit(() => document.querySelector<HTMLButtonElement>('.lib-head .btn.ghost')?.click())
        return
      }
      // Cards, Story and the rest edit through the editor's history, so undo works there too (but not inside a text field).
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')
      if (mod && d.view !== 'script' && !typing && (key === 'z' || key === 'y')) {
        const v = getEditorView()
        if (v) return hit(() => { (key === 'y' || e.shiftKey ? redo : undo)(v.state, v.dispatch) })
      }
      if (mod && key === 'k' && e.shiftKey) return hit(() => d.setPanel('doctor'))
      if (mod && key === 's') return hit(() => void d.snapshot('Saved version').then(() => import('./ui/kit').then(k => k.toast('Version saved — see Versions in the command palette', 'clock'))))
      if (mod && key === 'e') return hit(() => useModal.getState().open('export'))
      if (mod && key === 'p' && e.shiftKey) return hit(() => d.setView(d.view === 'page' ? 'script' : 'page'))
      if (mod && key === 'p') return hit(printNow)
      if (mod && key === 'b') return hit(() => d.toggleSidebar())
      if (mod && key === 'i') return hit(() => d.setPanel(d.panel ?? 'scene'))
      if (mod && (key === '=' || key === '+')) return hit(() => { const z = useSettings.getState(); z.set({ zoom: Math.min(1.6, +(z.s.zoom + 0.1).toFixed(2)) }) })
      if (mod && key === '-') return hit(() => { const z = useSettings.getState(); z.set({ zoom: Math.max(0.7, +(z.s.zoom - 0.1).toFixed(2)) }) })
      if (e.altKey && !mod && /^Digit[1-6]$/.test(e.code)) return hit(() => d.setView((['script', 'cards', 'page', 'story', 'board', 'production'] as const)[+e.code.slice(5) - 1]))
      if (e.key === 'Escape' && useFocus.getState().on && !document.querySelector('.suggest, .scrim, .menu')) return hit(() => useFocus.getState().toggle())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Workspace() {
  const view = useDoc(d => d.view)
  return (
    <div className="workspace">
      <Sidebar />
      <main className="main">
        {/* The editor stays mounted so undo history and scroll position survive view switches. */}
        <div style={{ display: view === 'script' ? 'contents' : 'none' }}><ScriptEditor /></div>
        {view === 'cards' && <Cards />}
        {view === 'page' && <PageView />}
        {view === 'story' && <Story />}
        {view === 'board' && <Moodboard />}
        {view === 'production' && <Production />}
      </main>
      <Inspector />
    </div>
  )
}

export default function App() {
  useTheme()
  useShortcuts()
  const script = useDoc(d => d.script)
  const onboarded = useSettings(s => s.s.onboarded)
  const modal = useModal(m => m.id)
  const focus = useFocus(f => f.on)
  useEffect(() => { void useApp.getState().refresh() }, [])
  useEffect(() => { document.title = script ? `${script.title} — Page One` : 'Page One' }, [script?.title])

  return (
    <div className={'app' + (script ? ' with-status' : '') + (focus && script ? ' zen' : '')}>
      <TitleBar />
      {script ? <Workspace /> : <Home />}
      {script && <StatusBar />}
      {script && <FocusHud />}
      {!onboarded && <Onboarding />}
      <Palette />
      <ModalHost />
      {modal === 'sprint' && <SprintModal />}
      <ConfirmHost />
      <MenuHost />
      <ToastHost />
    </div>
  )
}
