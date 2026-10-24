import { useEffect, useRef, useState } from 'react'
import { TextSelection } from 'prosemirror-state'
import { getEditorView } from './bridge'
import { nodeText } from './schema'
import { Icon } from '../ui/Icon'

interface Hit { from: number; to: number }

function hits(query: string): Hit[] {
  const v = getEditorView()
  if (!v || !query) return []
  const q = query.toLowerCase()
  const out: Hit[] = []
  v.state.doc.forEach((n, pos) => {
    const t = nodeText(n).toLowerCase()
    for (let k = t.indexOf(q); k >= 0; k = t.indexOf(q, k + q.length)) out.push({ from: pos + 1 + k, to: pos + 1 + k + q.length })
  })
  return out
}

/** Ctrl+F: find and replace across the script, with hits highlighted on the page. */
export function FindBar({ query, onQuery, onClose }: { query: string; onQuery: (q: string) => void; onClose: () => void }) {
  const [replace, setReplace] = useState('')
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = hits(query)

  useEffect(() => { input.current?.focus(); input.current?.select() }, [])

  const go = (dir: 1 | -1) => {
    const v = getEditorView()
    if (!v || !list.length) return
    const head = v.state.selection.from
    let i = dir > 0 ? list.findIndex(h => h.from > head) : list.map(h => h.from < head).lastIndexOf(true)
    if (i < 0) i = dir > 0 ? 0 : list.length - 1
    setAt(i)
    const h = list[i]
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, h.from, h.to)).scrollIntoView())
  }

  const replaceOne = () => {
    const v = getEditorView()
    if (!v || !list.length) return
    const sel = v.state.selection
    const cur = list.find(h => h.from === sel.from && h.to === sel.to)
    if (!cur) { go(1); return }
    v.dispatch(v.state.tr.insertText(replace, cur.from, cur.to))
    go(1)
  }

  const replaceAll = () => {
    const v = getEditorView()
    if (!v || !list.length) return
    const tr = v.state.tr
    for (const h of [...list].reverse()) tr.insertText(replace, h.from, h.to)
    v.dispatch(tr)
  }

  return (
    <div className="findbar" onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1) }
    }}>
      <Icon name="search" />
      <input ref={input} value={query} placeholder="Find in script" onChange={e => { onQuery(e.target.value); setAt(0) }} />
      <span className="findbar-count">{query ? (list.length ? `${Math.min(at + 1, list.length)} of ${list.length}` : 'No matches') : ''}</span>
      <button className="icon-btn" title="Previous (Shift+Enter)" onClick={() => go(-1)}><Icon name="up" /></button>
      <button className="icon-btn" title="Next (Enter)" onClick={() => go(1)}><Icon name="down" /></button>
      <span className="findbar-sep" />
      <input value={replace} placeholder="Replace with" onChange={e => setReplace(e.target.value)} />
      <button className="btn ghost sm" onClick={replaceOne} disabled={!list.length}>Replace</button>
      <button className="btn ghost sm" onClick={replaceAll} disabled={!list.length}>All</button>
      <button className="icon-btn" title="Close (Esc)" onClick={onClose}><Icon name="close" /></button>
    </div>
  )
}
