import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { isTauri, platform, windowAction } from '../platform/fs'
import { useDoc, type View } from '../state/doc'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { openMenu, useModal } from './kit'
import { usePalette } from './Palette'
import { SprintPill } from './Sprint'
import { useApp } from './appState'
import { exportMenu } from './menus'
import { useFocus } from './Focus'
import { CollabButton } from './Collab'
import { useSettings } from '../state/settings'
import { resolvedTheme } from './theme'

const VIEWS: { id: View; label: string; icon: string; key: string }[] = [
  { id: 'script', label: 'Script', icon: 'script', key: 'Alt+1' },
  { id: 'cards', label: 'Cards', icon: 'cards', key: 'Alt+2' },
  { id: 'page', label: 'Page', icon: 'page', key: 'Alt+3' },
  { id: 'story', label: 'Story', icon: 'story', key: 'Alt+4' },
  { id: 'board', label: 'Board', icon: 'board', key: 'Alt+5' },
  { id: 'production', label: 'Production', icon: 'production', key: 'Alt+6' },
]

/** Double-click to maximise, drag to move — on the empty parts of the bar only. */
function dragHandlers() {
  if (!isTauri) return {}
  return {
    onMouseDown: (e: MouseEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, .no-drag')) return
      if (e.detail === 2) void windowAction('maximize'); else void windowAction('drag')
    },
  }
}

/** The view switcher: a segmented control whose selection slides from segment to segment. */
function ViewSwitcher({ view }: { view: View }) {
  const box = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const on = box.current?.querySelector<HTMLElement>('button.is-on')
      if (on) setThumb({ x: on.offsetLeft, w: on.offsetWidth })
    }
    measure()
    // Fonts arriving late change the segment widths.
    void document.fonts?.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [view])
  return (
    <div ref={box} className={'seg no-drag' + (thumb ? ' has-thumb' : '')}>
      {thumb && <span className="seg-thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {VIEWS.map(v => (
        <button key={v.id} className={view === v.id ? 'is-on' : ''} onClick={() => useDoc.getState().setView(v.id)} title={`${v.label} (${v.key})`}>
          <Icon name={v.icon} size={14} />{v.label}
        </button>
      ))}
    </div>
  )
}

/** The library search, on the home screen: filters the scripts as you type; Enter opens the first. */
function HomeSearch() {
  const q = useApp(a => a.query)
  return (
    <label className="home-search no-drag">
      <Icon name="search" size={15} />
      <input value={q} placeholder="Search your scripts…" spellCheck={false}
        onChange={e => useApp.getState().setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') useApp.getState().setQuery('')
          if (e.key === 'Enter') document.querySelector<HTMLButtonElement>('.lib-grid .cover:not(.new)')?.click()
        }} />
      {q ? <button className="icon-btn sm" onClick={() => useApp.getState().setQuery('')} aria-label="Clear"><Icon name="close" size={12} /></button>
        : <kbd onClick={() => usePalette.getState().open()} title="Command palette">Ctrl K</kbd>}
    </label>
  )
}

function ThemeToggle() {
  const mode = useSettings(x => x.s.theme)
  const dark = resolvedTheme(mode) !== 'light'
  return (
    <button className="icon-btn" title={dark ? 'Light theme' : 'Dark theme'} onClick={() => useSettings.getState().set({ theme: dark ? 'light' : 'dark' })}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  )
}

export function TitleBar() {
  const script = useDoc(d => d.script)
  const view = useDoc(d => d.view)
  const saved = useDoc(d => d.saved)
  const panel = useDoc(d => d.panel)
  const sidebar = useDoc(d => d.sidebar)
  const goHome = useApp(a => a.goHome)
  const showControls = isTauri && platform === 'windows'

  return (
    <header className={'titlebar' + (isTauri && platform === 'mac' ? ' mac' : '')} {...dragHandlers()}>
      <div className="titlebar-left">
        <button className="brand" onClick={() => void goHome()} title="Library">
          <Logo size={24} className="brand-mark" />
          {!script && <span className="brand-name">Page One</span>}
        </button>
        {script && <>
          <button className={'icon-btn' + (sidebar ? ' is-on' : '')} title="Navigator (Ctrl+B)" onClick={() => useDoc.getState().toggleSidebar()}><Icon name="sidebar" /></button>
          <span className="crumb-sep">/</span>
          <input
            className="title-input no-drag"
            value={script.title}
            size={Math.max(8, script.title.length + 1)}
            onChange={e => {
              const title = e.target.value
              useDoc.getState().update(s => ({ ...s, title, titlePage: { ...s.titlePage, title } }), { elementsChanged: false })
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            spellCheck={false}
          />
          <span className={'save-state ' + saved} title={saved === 'error' ? 'Could not save — check the library folder' : 'Saved to your library'}>
            <span className="dot" />{saved === 'saved' ? 'Saved' : saved === 'error' ? 'Not saved' : 'Saving…'}
          </span>
        </>}
      </div>

      <div className="titlebar-center">
        {script ? <ViewSwitcher view={view} /> : <HomeSearch />}
      </div>

      <div className="titlebar-right">
        {script && <>
          <CollabButton />
          <SprintPill />
          <button className="icon-btn" title="Focus mode (F11)" onClick={() => useFocus.getState().toggle()}><Icon name="eye" /></button>
          <button className="icon-btn" title="Command palette (Ctrl+K)" onClick={() => usePalette.getState().open()}><Icon name="command" /></button>
          <button className="icon-btn" title="Export" onClick={e => exportMenu(e.currentTarget)}><Icon name="export" /></button>
          <button className={'icon-btn' + (panel ? ' is-on' : '')} title="Inspector (Ctrl+I)" onClick={() => useDoc.getState().setPanel(panel ?? 'scene')}><Icon name="inspector" /></button>
        </>}
        {!script && <ThemeToggle />}
        <button className="icon-btn" title="More" onClick={e => openMenu([
          { label: 'Settings', icon: 'settings', hint: 'Ctrl+,', run: () => useModal.getState().open('settings') },
          { label: 'Keyboard shortcuts', icon: 'command', hint: 'Ctrl+/', run: () => useModal.getState().open('shortcuts') },
          { divider: true },
          { label: 'About Page One', icon: 'heart', run: () => useApp.getState().setAbout(true) },
        ], e.currentTarget, 'right')}><Icon name="more" /></button>
        {showControls && (
          <div className="win-controls">
            <button onClick={() => void windowAction('minimize')} aria-label="Minimise"><Icon name="minimize" size={14} /></button>
            <button onClick={() => void windowAction('maximize')} aria-label="Maximise"><Icon name="maximize" size={12} /></button>
            <button className="close" onClick={async () => { await useDoc.getState().flush(); void windowAction('close') }} aria-label="Close"><Icon name="close" size={14} /></button>
          </div>
        )}
      </div>
    </header>
  )
}
