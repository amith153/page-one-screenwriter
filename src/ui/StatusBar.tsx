import { useEffect, useState } from 'react'
import { ELEMENT_TYPES, REVISION_COLORS, TYPE_INFO } from '../core/model'
import { todayIso } from '../core/production'
import { getEditorView, onEditorChange, runCommand } from '../editor/bridge'
import { here, setType } from '../editor/commands'
import { useDoc } from '../state/doc'
import { useSettings, wordsOn } from '../state/settings'
import { Icon } from './Icon'
import { openMenu } from './kit'

function useCurrentType() {
  const [, force] = useState(0)
  useEffect(() => onEditorChange(() => force(n => n + 1)), [])
  const v = getEditorView()
  return v ? here(v.state) : null
}

export function StatusBar() {
  const script = useDoc(d => d.script)
  const p = useDoc(d => d.pagination)
  const view = useDoc(d => d.view)
  const session = useDoc(d => d.sessionWords)
  const s = useSettings(x => x.s)
  const set = useSettings(x => x.set)
  const today = useSettings(x => wordsOn(x.log, todayIso()))
  const h = useCurrentType()
  if (!script) return null
  const page = h && p ? p.elementPage[h.index] ?? 0 : 0
  const scenes = script.elements.filter(e => e.type === 'SCENE_HEADING').length

  return (
    <footer className="statusbar">
      {view === 'script' && h && (
        <button className="sb-item type-pill" title="Element type (Tab to change)" onClick={e => openMenu(
          ELEMENT_TYPES.map((t, i) => ({ label: TYPE_INFO[t].label, hint: `Ctrl+${(i + 1) % 10}`, on: t === h.type, run: () => runCommand(setType(t)) })),
          { x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().top - 330 })}>
          {TYPE_INFO[h.type].label}<Icon name="up" size={11} />
        </button>
      )}
      <span className="sb-sep" />
      <span className="sb-item">Page {p?.labels[page] ?? page + 1} of {p?.pages.length ?? 1}</span>
      <span className="sb-item">{scenes} scene{scenes === 1 ? '' : 's'}</span>
      {script.revisionMode && <span className="sb-item" style={{ color: REVISION_COLORS[script.revisionLevel]?.hex }}><Icon name="revision" size={12} />{REVISION_COLORS[script.revisionLevel]?.label} revisions</span>}
      {script.extras.lock.locked && <span className="sb-item"><Icon name="lock" size={12} />Locked</span>}
      <span className="spacer" />
      <span className="sb-item" title={`${today} words today · goal ${s.dailyGoal}`}>
        {session > 0 ? `+${session.toLocaleString()} this session` : `${today.toLocaleString()} today`}
        {s.dailyGoal > 0 && <span className="goal-mini"><i style={{ width: `${Math.min(100, (today / s.dailyGoal) * 100)}%` }} /></span>}
      </span>
      <span className="sb-sep" />
      <button className={'sb-item' + (s.focusLine ? ' type-pill' : '')} title="Focus line" onClick={() => set({ focusLine: !s.focusLine })}><Icon name="focus" size={13} /></button>
      <button className={'sb-item' + (s.typewriter ? ' type-pill' : '')} title="Typewriter scrolling" onClick={() => set({ typewriter: !s.typewriter })}><Icon name="type" size={13} /></button>
      <span className="sb-sep" />
      <button className="sb-item" onClick={() => set({ zoom: Math.max(0.7, +(s.zoom - 0.1).toFixed(2)) })}><Icon name="minus" size={12} /></button>
      <button className="sb-item" style={{ minWidth: 44, justifyContent: 'center' }} onClick={() => set({ zoom: 1 })} title="Reset zoom">{Math.round(s.zoom * 100)}%</button>
      <button className="sb-item" onClick={() => set({ zoom: Math.min(1.6, +(s.zoom + 0.1).toFixed(2)) })}><Icon name="plus" size={12} /></button>
    </footer>
  )
}
