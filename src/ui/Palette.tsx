/** Ctrl+K: one place for every action and script. Scenes and characters live on the index cards and in the navigator. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { ELEMENT_TYPES, TYPE_INFO } from '../core/model'
import { useDoc } from '../state/doc'
import { useSettings } from '../state/settings'
import { runCommand } from '../editor/bridge'
import { setType } from '../editor/commands'
import { importFile } from '../io/files'
import { Icon } from './Icon'
import { useModal } from './kit'
import { useApp } from './appState'
import { printNow } from './menus'
import { useFocus } from './Focus'
import { addNoteFromSelection } from './notes'

export const usePalette = create<{ on: boolean; open: () => void; close: () => void }>(set => ({
  on: false, open: () => set({ on: true }), close: () => set({ on: false }),
}))

interface Cmd { id: string; group: string; label: string; sub?: string; icon: string; keys?: string; run: () => void }

function commands(): Cmd[] {
  const d = useDoc.getState()
  const st = useSettings.getState()
  const modal = useModal.getState().open
  const out: Cmd[] = []
  const s = d.script
  if (s) {
    out.push(
      { id: 'v-script', group: 'Views', label: 'Script', icon: 'script', keys: 'Alt+1', run: () => d.setView('script') },
      { id: 'v-cards', group: 'Views', label: 'Index cards', icon: 'cards', keys: 'Alt+2', run: () => d.setView('cards') },
      { id: 'v-page', group: 'Views', label: 'Page view', icon: 'page', keys: 'Alt+3', run: () => d.setView('page') },
      { id: 'v-story', group: 'Views', label: 'Story — structure, bible, X-ray', icon: 'story', keys: 'Alt+4', run: () => d.setView('story') },
      { id: 'v-board', group: 'Views', label: 'Mood board', icon: 'board', keys: 'Alt+5', run: () => d.setView('board') },
      { id: 'v-prod', group: 'Views', label: 'Production — revisions, lock, reports', icon: 'production', keys: 'Alt+6', run: () => d.setView('production') },
      { id: 'p-doctor', group: 'Tools', label: 'Script Doctor', icon: 'doctor', keys: 'Ctrl+Shift+K', run: () => d.setPanel('doctor') },
      { id: 'p-notes', group: 'Tools', label: 'Notes', icon: 'notes', run: () => d.setPanel('notes') },
      { id: 'p-scene', group: 'Tools', label: 'Scene inspector', icon: 'inspector', keys: 'Ctrl+I', run: () => d.setPanel('scene') },
      { id: 'p-stats', group: 'Tools', label: 'Statistics', icon: 'stats', run: () => d.setPanel('stats') },
      { id: 'sprint', group: 'Tools', label: 'Start a writing sprint', icon: 'timer', run: () => modal('sprint') },
      { id: 'tp', group: 'Script', label: 'Title page…', icon: 'type', run: () => modal('titlepage') },
      { id: 'snap', group: 'Script', label: 'Save a version', icon: 'clock', keys: 'Ctrl+S', run: () => void d.snapshot('Saved version') },
      { id: 'versions', group: 'Script', label: 'Versions…', icon: 'clock', run: () => modal('versions') },
      { id: 'deadline', group: 'Script', label: 'Deadline…', icon: 'target', run: () => modal('deadline') },
      { id: 'pdf', group: 'Export', label: 'Export — PDF, Final Draft, Word, RTF, Fountain, text…', icon: 'export', keys: 'Ctrl+E', run: () => modal('export') },
      { id: 'share', group: 'Script', label: 'Share a draft and merge theirs back in…', icon: 'users', run: () => modal('share') },
      { id: 'note', group: 'Script', label: 'Pin a note to the selection', icon: 'notes', keys: 'Ctrl+M', run: () => { d.setView('script'); window.setTimeout(addNoteFromSelection, 30) } },
      { id: 'print', group: 'Export', label: 'Print…', icon: 'page', keys: 'Ctrl+P', run: printNow },
      { id: 'sides', group: 'Export', label: 'Sides for actors…', icon: 'users', run: () => modal('sides') },
      { id: 'reports', group: 'Export', label: 'Reports (CSV)…', icon: 'stats', run: () => modal('reports') },
      { id: 'focus', group: 'Writing', label: st.s.focusLine ? 'Turn off focus line' : 'Focus line — dim everything but the current line', icon: 'focus', run: () => st.set({ focusLine: !st.s.focusLine }) },
      { id: 'tw', group: 'Writing', label: st.s.typewriter ? 'Turn off typewriter scrolling' : 'Typewriter scrolling', icon: 'type', run: () => st.set({ typewriter: !st.s.typewriter }) },
      { id: 'zen', group: 'Writing', label: 'Focus mode — just you and the page', icon: 'eye', keys: 'F11', run: () => useFocus.getState().toggle() },
      { id: 'changes', group: 'Tools', label: 'Track changes — compare with a saved version', icon: 'revision', run: () => d.setPanel('changes') },
    )
    ELEMENT_TYPES.forEach((t, i) => out.push({
      id: 'type-' + t, group: 'Element', label: `Make this line ${TYPE_INFO[t].label}`, icon: 'type', keys: `Ctrl+${(i + 1) % 10}`,
      run: () => { d.setView('script'); window.setTimeout(() => runCommand(setType(t)), 30) },
    }))
  }
  out.push(
    { id: 'home', group: 'App', label: 'Library', icon: 'home', run: () => void useApp.getState().goHome() },
    { id: 'import', group: 'App', label: 'Import a script (Fountain, Final Draft, .pageone)…', icon: 'import', run: async () => { const id = await importFile(); if (id) await useApp.getState().openScript(id) } },
    { id: 'settings', group: 'App', label: 'Settings', icon: 'settings', keys: 'Ctrl+,', run: () => modal('settings') },
    { id: 'drive', group: 'App', label: 'Google Drive…', icon: 'cloud', run: () => modal('drive') },
    { id: 'shortcuts', group: 'App', label: 'Keyboard shortcuts', icon: 'command', keys: 'Ctrl+/', run: () => modal('shortcuts') },
    { id: 'theme', group: 'App', label: `Theme: switch to ${st.s.theme === 'light' ? 'dark' : 'light'}`, icon: st.s.theme === 'light' ? 'moon' : 'sun', run: () => st.set({ theme: st.s.theme === 'light' ? 'dark' : 'light' }) },
  )
  for (const m of useApp.getState().library.slice(0, 12)) {
    if (m.id !== s?.id) out.push({ id: 'open-' + m.id, group: 'Open script', label: m.title, sub: m.author, icon: 'book', run: () => void useApp.getState().openScript(m.id) })
  }
  return out
}

/** Subsequence match with a bonus for word starts. */
function score(q: string, text: string): number {
  if (!q) return 1
  const t = text.toLowerCase()
  const i = t.indexOf(q)
  if (i >= 0) return 100 - i + (i === 0 || t[i - 1] === ' ' ? 50 : 0)
  let k = 0, s = 0
  for (let j = 0; j < t.length && k < q.length; j++) if (t[j] === q[k]) { s += j === 0 || t[j - 1] === ' ' ? 3 : 1; k++ }
  return k === q.length ? s : 0
}

export function Palette() {
  const on = usePalette(p => p.on)
  const close = usePalette(p => p.close)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const all = useMemo(() => (on ? commands() : []), [on])
  const items = useMemo(() => {
    const query = q.trim().toLowerCase()
    const scored = all.map(c => ({ c, s: Math.max(score(query, c.label), score(query, c.group + ' ' + c.label) * 0.6, c.sub ? score(query, c.sub) * 0.5 : 0) }))
      .filter(x => x.s > 0)
    if (query) scored.sort((a, b) => b.s - a.s)
    return scored.map(x => x.c).slice(0, query ? 60 : 200)
  }, [q, all])

  useEffect(() => { if (on) { setQ(''); setAt(0) } }, [on])
  useEffect(() => { list.current?.querySelector('.is-on')?.scrollIntoView({ block: 'nearest' }) }, [at])
  if (!on) return null

  const run = (c: Cmd) => { close(); window.setTimeout(c.run, 0) }
  let lastGroup = ''
  return (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className="modal palette" onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); close() }
        if (e.key === 'ArrowDown') { e.preventDefault(); setAt(a => Math.min(items.length - 1, a + 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setAt(a => Math.max(0, a - 1)) }
        if (e.key === 'Enter' && items[at]) { e.preventDefault(); run(items[at]) }
      }}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input autoFocus value={q} placeholder="Type a command…" onChange={e => { setQ(e.target.value); setAt(0) }} />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list" ref={list}>
          {items.length === 0 && <div className="empty-state"><p>Nothing matches “{q}”.</p></div>}
          {items.map((c, i) => {
            const head = !q.trim() && c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <div key={c.id}>
                {head && <div className="palette-group">{head}</div>}
                <button className={'palette-item' + (i === at ? ' is-on' : '')} onMouseMove={() => setAt(i)} onClick={() => run(c)}>
                  <Icon name={c.icon} />
                  <span className="ellipsis">{c.label}</span>
                  {c.sub && <span className="sub">{c.sub}</span>}
                  <span className="hint">{q.trim() && <span>{c.group}</span>}{c.keys && <span className="kbd">{c.keys}</span>}</span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
