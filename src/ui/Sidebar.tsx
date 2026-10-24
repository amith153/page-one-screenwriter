/** The navigator: scenes (with search, page numbers, colours and storylines), characters and locations. */
import { useMemo, useState } from 'react'
import { SCENE_COLORS, sceneOf } from '../core/model'
import { scenes as scenesOf, stats, locations as locationsOf, location as locationOf, sceneIndexFor } from '../core/analysis'
import { characterName } from '../core/formatting'
import { useDoc } from '../state/doc'
import { Icon } from './Icon'
import { openMenu } from './kit'

type Tab = 'scenes' | 'characters' | 'locations'

export const nameColor = (name: string) => {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return `hsl(${h} 42% 62%)`
}

export function Sidebar() {
  const open = useDoc(d => d.sidebar)
  const script = useDoc(d => d.script)
  const pagination = useDoc(d => d.pagination)
  const labels = useDoc(d => d.sceneLabels)
  const currentId = useDoc(d => d.currentId)
  const [tab, setTab] = useState<Tab>('scenes')
  const [q, setQ] = useState('')

  const els = script?.elements ?? []
  const scenes = useMemo(() => scenesOf(els), [els])
  const currentScene = useMemo(() => {
    const i = els.findIndex(e => e.id === currentId)
    const h = i >= 0 ? sceneIndexFor(els, i) : -1
    return h >= 0 ? els[h].id : null
  }, [els, currentId])
  const chars = useMemo(() => (tab === 'characters' ? stats(els).characters : []), [els, tab])
  const locs = useMemo(() => (tab === 'locations' ? locationsOf(els) : []), [els, tab])

  if (!script) return null
  const threads = new Map(script.extras.threads.map(t => [t.id, t]))
  const query = q.trim().toLowerCase()
  const shown = query ? scenes.filter(s => (s.heading + ' ' + s.synopsis + ' ' + s.preview).toLowerCase().includes(query)) : scenes

  return (
    <aside className={'sidebar' + (open ? '' : ' is-closed')}>
      <div className="pane-tabs">
        <button className={tab === 'scenes' ? 'is-on' : ''} onClick={() => setTab('scenes')}>Scenes <span className="badge">{scenes.length}</span></button>
        <button className={tab === 'characters' ? 'is-on' : ''} onClick={() => setTab('characters')}>Cast</button>
        <button className={tab === 'locations' ? 'is-on' : ''} onClick={() => setTab('locations')}>Places</button>
      </div>
      <div className="pane-body">
        {tab === 'scenes' && <>
          <label className="search">
            <Icon name="search" size={14} />
            <input value={q} placeholder="Search scenes" onChange={e => setQ(e.target.value)} />
            {q && <button className="icon-btn sm" onClick={() => setQ('')}><Icon name="close" size={12} /></button>}
          </label>
          {shown.length === 0 && (
            <div className="empty-state">
              <Icon name="pin" size={22} />
              <h4>{query ? 'No scenes match' : 'No scenes yet'}</h4>
              <p>{query ? 'Try another word.' : 'Start a line with INT. or EXT. — or press Ctrl+Enter.'}</p>
            </div>
          )}
          {shown.map(sc => {
            const meta = sceneOf(script.extras, sc.elementId)
            const page = (pagination?.elementPage[sc.elementIndex] ?? 0)
            return (
              <button key={sc.elementId} className={'scene-item' + (sc.elementId === currentScene ? ' is-on' : '')}
                onClick={() => useDoc.getState().jumpTo(sc.elementId)}
                onContextMenu={e => {
                  e.preventDefault()
                  openMenu([
                    { heading: 'Scene colour' },
                    ...SCENE_COLORS.map((_c, i) => ({ label: i === 0 ? 'None' : ['', 'Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Violet', 'Pink', 'Brown'][i], on: sc.color === i,
                      run: () => useDoc.getState().update(s => ({ ...s, elements: s.elements.map(x => (x.id === sc.elementId ? { ...x, color: i } : x)) })) })),
                  ], { x: e.clientX, y: e.clientY })
                }}>
                <span className="num">{labels.get(sc.elementId) ?? sc.number}</span>
                <span className="head">{sc.heading || 'UNTITLED SCENE'}</span>
                <span className="pg">p.{pagination?.labels[page] ?? page + 1}</span>
                {(sc.synopsis || sc.preview) && <span className="syn">{sc.synopsis || sc.preview}</span>}
                {sc.color > 0 && <span className="bar" style={{ background: SCENE_COLORS[sc.color] }} />}
                {meta.threads.length > 0 && (
                  <span style={{ gridColumn: '2 / 4', display: 'flex', gap: 4, marginTop: 2 }}>
                    {meta.threads.map(t => threads.get(t)).filter(Boolean).map(t => <span key={t!.id} className="dot" title={t!.name} style={{ background: SCENE_COLORS[t!.color] || 'var(--text-3)', width: 6, height: 6 }} />)}
                  </span>
                )}
              </button>
            )
          })}
        </>}

        {tab === 'characters' && <>
          {chars.length === 0 && <div className="empty-state"><Icon name="users" size={22} /><h4>No characters yet</h4><p>Names appear here as soon as someone speaks.</p></div>}
          {chars.map(c => {
            const total = chars.reduce((n, x) => n + x.words, 0) || 1
            const first = els.find(e => e.type === 'CHARACTER' && characterName(e.text) === c.name)
            return (
              <button key={c.name} className="list-row" onClick={() => first && useDoc.getState().jumpTo(first.id)}>
                <span className="avatar" style={{ background: nameColor(c.name) }}>{c.name.substring(0, 2)}</span>
                <span className="grow">
                  <span style={{ display: 'block', fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 12 }}>{c.name}</span>
                  <span className="faint" style={{ fontSize: 11.5 }}>{c.cues} lines · {c.scenes} scenes · {Math.round((c.words / total) * 100)}% of dialogue</span>
                </span>
              </button>
            )
          })}
        </>}

        {tab === 'locations' && <>
          {locs.length === 0 && <div className="empty-state"><Icon name="pin" size={22} /><h4>No places yet</h4><p>Locations come from your scene headings.</p></div>}
          {locs.map(l => {
            const scs = scenes.filter(s => locationOf(s.heading) === l)
            return (
              <button key={l} className="list-row" onClick={() => scs[0] && useDoc.getState().jumpTo(scs[0].elementId)}>
                <span className="avatar" style={{ background: 'var(--surface-4)', color: 'var(--text-2)' }}><Icon name="pin" size={14} /></span>
                <span className="grow">
                  <span className="ellipsis" style={{ display: 'block', fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 12 }}>{l}</span>
                  <span className="faint" style={{ fontSize: 11.5 }}>{scs.length} scene{scs.length === 1 ? '' : 's'}</span>
                </span>
              </button>
            )
          })}
        </>}
      </div>
    </aside>
  )
}
