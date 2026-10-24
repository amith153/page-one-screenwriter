/** Index cards: every scene is a card. Drag to restructure (whole scenes move), colour-tag, filter by storyline, lay out by act or sequence. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { el, newId, SCENE_COLORS, sceneOf, type Element, type Script } from '../core/model'
import { scenes as scenesOf, type SceneInfo } from '../core/analysis'
import { eighths, formatEighths, sceneLines } from '../core/production'
import { actBreaks } from '../core/structures'
import { currentLinesPerPage, useDoc } from '../state/doc'
import { Icon } from './Icon'
import { openMenu } from './kit'

/** Move scene `from` (index into scenes) to sit before scene `to` (or at the end when to === scenes.length). */
export function moveScene(els: Element[], scs: SceneInfo[], from: number, to: number): Element[] {
  if (from === to || from + 1 === to) return els
  const pre = els.slice(0, scs[0]?.elementIndex ?? els.length)
  const blocks = scs.map(s => els.slice(s.elementIndex, s.endIndex))
  const [moved] = blocks.splice(from, 1)
  blocks.splice(to > from ? to - 1 : to, 0, moved)
  return [...pre, ...blocks.flat()]
}

type Layout = 'grid' | 'acts' | 'sequences'
const SEQUENCES = ['Set-up', 'Inciting incident', 'New world', 'First culmination', 'Complications', 'Midpoint fallout', 'Lowest point', 'Resolution']
const ACT_NAMES = ['Set-up', 'Confrontation', 'Resolution']

interface Lane { title: string; sub: string; from: number; to: number }

/** Split the cards into lanes by where each scene falls in the story (its page against act or sequence breaks). */
function lanesFor(layout: Layout, script: Script, scs: SceneInfo[], pageOf: (i: number) => number, pages: number): Lane[] {
  if (layout === 'grid') return [{ title: '', sub: '', from: 0, to: scs.length }]
  const st = script.extras.structure
  const length = st && pages * 2 < st.targetPages ? st.targetPages : Math.max(1, pages)
  const breaks = layout === 'acts' ? actBreaks(st) : [1, 2, 3, 4, 5, 6, 7].map(k => k / 8)
  const lanes: Lane[] = []
  let start = 0
  for (let k = 0; k <= breaks.length; k++) {
    const endPage = k < breaks.length ? breaks[k] * length : Infinity
    let end = start
    while (end < scs.length && pageOf(end) < endPage) end++
    const p0 = Math.round((k === 0 ? 0 : breaks[k - 1]) * length) + 1
    const p1 = k < breaks.length ? Math.round(breaks[k] * length) : length
    const name = layout === 'acts' ? `Act ${k + 1}` : `Sequence ${String.fromCharCode(65 + k)}`
    const theme = layout === 'acts' ? (breaks.length === 2 ? ACT_NAMES[k] : '') : SEQUENCES[k]
    lanes.push({ title: theme ? `${name} — ${theme}` : name, sub: `pp. ${p0}–${p1}`, from: start, to: end })
    start = end
  }
  return lanes
}

interface Drag { from: number; x: number; y: number; on: boolean; to: number | null }

export function Cards() {
  const script = useDoc(d => d.script)
  const pagination = useDoc(d => d.pagination)
  const labels = useDoc(d => d.sceneLabels)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [thread, setThread] = useState<string | null>(null)
  const [paper, setPaper] = useState(true)
  const [layout, setLayout] = useState<Layout>('grid')
  const boardRef = useRef<HTMLDivElement>(null)
  const els = script?.elements ?? []
  const scs = useMemo(() => scenesOf(els), [els])
  const lens = useMemo(() => (pagination ? sceneLines(els, pagination) : []), [els, pagination])
  const dragRef = useRef(drag)
  dragRef.current = drag

  // Pointer-driven dragging: HTML5 drag-and-drop is unreliable inside the desktop webview, and this also auto-scrolls.
  useEffect(() => {
    if (!drag) return
    let scroll = 0
    const tick = window.setInterval(() => { if (scroll && boardRef.current) boardRef.current.scrollTop += scroll }, 16)
    const move = (e: PointerEvent) => {
      const d = dragRef.current!
      const on = d.on || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6
      let to: number | null = null
      if (on && !d.on) {
        (document.activeElement as HTMLElement | null)?.blur?.()
        window.getSelection()?.removeAllRanges()
      }
      if (on) {
        const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-slot]')
        if (hit) {
          const i = Number(hit.dataset.slot)
          const r = hit.getBoundingClientRect()
          to = hit.dataset.end ? i : e.clientX > r.left + r.width / 2 ? i + 1 : i
        }
        const b = boardRef.current?.getBoundingClientRect()
        scroll = b ? (e.clientY < b.top + 60 ? -14 : e.clientY > b.bottom - 60 ? 14 : 0) : 0
      }
      setDrag({ ...d, on, to, x: on ? e.clientX : d.x, y: on ? e.clientY : d.y })
    }
    const up = () => {
      const d = dragRef.current
      if (d?.on && d.to != null) {
        const { from, to } = d
        useDoc.getState().update(s => ({ ...s, elements: moveScene(s.elements, scenesOf(s.elements), from, to) }))
      }
      setDrag(null)
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrag(null) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('keydown', key)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', key)
    }
  }, [drag != null])

  if (!script) return null
  const threads = new Map(script.extras.threads.map(t => [t.id, t]))
  const update = useDoc.getState().update
  const move = (from: number, to: number) => update(s => ({ ...s, elements: moveScene(s.elements, scenesOf(s.elements), from, to) }))
  const pageOf = (i: number) => (pagination?.elementPage[scs[i].elementIndex] ?? 0) + 1
  const lanes = lanesFor(layout, script, scs, pageOf, pagination?.pages.length ?? 1)
  const dragging = drag?.on ? drag : null

  const addCard = () => {
    const h = el(newId(), 'SCENE_HEADING', '')
    update(s => ({ ...s, elements: [...s.elements, h, el(newId(), 'ACTION', '')] }))
    window.setTimeout(() => useDoc.getState().jumpTo(h.id), 50)
  }

  const card = (sc: SceneInfo, i: number) => {
    const meta = sceneOf(script.extras, sc.elementId)
    const dim = thread != null && !meta.threads.includes(thread)
    const page = pagination?.elementPage[sc.elementIndex] ?? 0
    const isOver = dragging?.to === i && dragging.from !== i && dragging.from + 1 !== i
    return (
      <div key={sc.elementId} data-slot={i}
        className={'icard' + (dragging?.from === i ? ' is-dragging' : '') + (isOver ? ' is-over' : '')}
        style={{ ['--card' as string]: sc.color ? SCENE_COLORS[sc.color] : undefined, opacity: dim && dragging?.from !== i ? 0.28 : undefined }}
        onPointerDown={e => {
          if (e.button !== 0) return
          // The synopsis stays clickable for editing; a drag that starts on it still moves the card.
          if (!(e.target as HTMLElement).closest('.icard-syn')) e.preventDefault()
          setDrag({ from: i, x: e.clientX, y: e.clientY, on: false, to: null })
        }}
        onDoubleClick={() => { useDoc.getState().jumpTo(sc.elementId) }}
        onContextMenu={e => {
          e.preventDefault()
          openMenu([
            { label: 'Open in script', icon: 'script', run: () => useDoc.getState().jumpTo(sc.elementId) },
            { divider: true },
            { heading: 'Move' },
            ...(i > 0 ? [{ label: 'To the start', run: () => move(i, 0) }, { label: 'One earlier', run: () => move(i, i - 1) }] : []),
            ...(i < scs.length - 1 ? [{ label: 'One later', run: () => move(i, i + 2) }, { label: 'To the end', run: () => move(i, scs.length) }] : []),
            { divider: true },
            { heading: 'Colour' },
            ...SCENE_COLORS.map((_, ci) => ({ label: ci === 0 ? 'None' : ['', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Violet', 'Pink', 'Brown'][ci], on: sc.color === ci, run: () => update(s => ({ ...s, elements: s.elements.map(x => (x.id === sc.elementId ? { ...x, color: ci } : x)) })) })),
            { divider: true },
            { label: 'Delete scene', icon: 'trash', danger: true, run: () => update(s => ({ ...s, elements: s.elements.filter((_, k) => k < sc.elementIndex || k >= sc.endIndex) })) },
          ], { x: e.clientX, y: e.clientY })
        }}
      >
        <div className="icard-head">
          <span className="icard-num">{labels.get(sc.elementId) ?? sc.number}</span>
          <span className="icard-heading" title={sc.heading}>{sc.heading || 'Untitled scene'}</span>
        </div>
        <div className="icard-syn" contentEditable suppressContentEditableWarning data-ph={sc.preview ? sc.preview.substring(0, 140) : 'What happens in this scene?'}
          onBlur={e => {
            const v = e.currentTarget.innerText.trim()
            if (v !== sc.synopsis) update(s => ({ ...s, elements: s.elements.map(x => (x.id === sc.elementId ? { ...x, synopsis: v } : x)) }))
          }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() } }}>
          {sc.synopsis}
        </div>
        <div className="icard-foot">
          {meta.threads.map(t => threads.get(t)).filter(Boolean).map(t => <span key={t!.id} className="dot" title={t!.name} style={{ background: SCENE_COLORS[t!.color] || '#999' }} />)}
          <span className="spacer" />
          <span>p.{pagination?.labels[page] ?? page + 1}</span>
          <span>· {formatEighths(eighths(lens[i] ?? 0, currentLinesPerPage()))}</span>
        </div>
      </div>
    )
  }

  const ghost = dragging ? scs[dragging.from] : null
  return (
    <div ref={boardRef} className={'board' + (paper ? '' : ' dark-cards') + (dragging ? ' is-dragging' : '')}>
      <div className="board-bar">
        <h2 className="display" style={{ margin: 0, fontSize: 22 }}>Index cards</h2>
        <span className="faint">{scs.length} scenes · drag to restructure</span>
        <span className="spacer" />
        {script.extras.threads.length > 0 && (
          <div className="seg">
            <button className={thread == null ? 'is-on' : ''} onClick={() => setThread(null)}>All</button>
            {script.extras.threads.map(t => (
              <button key={t.id} className={thread === t.id ? 'is-on' : ''} onClick={() => setThread(t.id)}>
                <span className="dot" style={{ background: SCENE_COLORS[t.color] || 'var(--text-3)', width: 7, height: 7 }} />{t.name}
              </button>
            ))}
          </div>
        )}
        <div className="seg" title="Lay the cards out by where they fall in the story">
          <button className={layout === 'grid' ? 'is-on' : ''} onClick={() => setLayout('grid')}>Grid</button>
          <button className={layout === 'acts' ? 'is-on' : ''} onClick={() => setLayout('acts')}>Acts</button>
          <button className={layout === 'sequences' ? 'is-on' : ''} onClick={() => setLayout('sequences')}>8 sequences</button>
        </div>
        <button className="icon-btn" title={paper ? 'Dark cards' : 'Paper cards'} onClick={() => setPaper(!paper)}><Icon name={paper ? 'moon' : 'sun'} /></button>
        <button className="btn sm" onClick={addCard}><Icon name="plus" size={14} />New card</button>
      </div>

      {scs.length === 0 && <div className="empty-state"><Icon name="cards" size={26} /><h4>No scenes yet</h4><p>Add a card to start outlining — each card becomes a scene in your script.</p><button className="btn" onClick={addCard}>Add the first card</button></div>}

      {scs.length > 0 && lanes.map((lane, li) => (
        <section key={li} className={layout === 'grid' ? '' : 'board-lane'}>
          {lane.title && <div className="board-lane-head"><b>{lane.title}</b><span className="faint">{lane.sub} · {lane.to - lane.from} scene{lane.to - lane.from === 1 ? '' : 's'}</span></div>}
          <div className="board-grid">
            {scs.slice(lane.from, lane.to).map((sc, k) => card(sc, lane.from + k))}
            {lane.from === lane.to && <div className="board-lane-empty faint">No scenes land here yet</div>}
            {li === lanes.length - 1 && (
              <div data-slot={scs.length} data-end="1" className={'icard icard-new' + (dragging?.to === scs.length && dragging.from !== scs.length - 1 ? ' is-over' : '')} onClick={addCard}>
                <span className="row"><Icon name="plus" />New card</span>
              </div>
            )}
          </div>
        </section>
      ))}

      {ghost && dragging && (
        <div className="icard icard-ghost" style={{ left: dragging.x, top: dragging.y, ['--card' as string]: ghost.color ? SCENE_COLORS[ghost.color] : undefined }}>
          <div className="icard-head">
            <span className="icard-num">{labels.get(ghost.elementId) ?? ghost.number}</span>
            <span className="icard-heading">{ghost.heading || 'Untitled scene'}</span>
          </div>
          <div className="icard-syn">{ghost.synopsis || ghost.preview.substring(0, 100)}</div>
        </div>
      )}
    </div>
  )
}
