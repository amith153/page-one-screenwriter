/** Story: structure and beats, the character & location bible, and Script X-ray. */
import { useMemo, useState } from 'react'
import { characterProfile, SCENE_COLORS, sceneOf, type Beat, type CharacterProfile, type LocationProfile, type Script } from '../core/model'
import { characterNames, locations as locationsOf, location as locationOf, scenes as scenesOf } from '../core/analysis'
import { characterName } from '../core/formatting'
import { actBreaks, checkBeats, switchStructure, TEMPLATES, template } from '../core/structures'
import { xray, formatEighths } from '../core/production'
import { currentLinesPerPage, useDoc } from '../state/doc'
import { Icon } from './Icon'
import { nameColor } from './Sidebar'
import { createExample, exampleFor, isExampleScript, readLink, type StructureExample } from '../data/structureExamples'
import { openLink } from '../state/media'
import { useApp } from './appState'
import { toast } from './kit'

type Tab = 'structure' | 'characters' | 'locations' | 'xray'

export function Story() {
  const script = useDoc(d => d.script)
  const [tab, setTab] = useState<Tab>('structure')
  if (!script) return null
  return (
    <div className="story">
      <div className="row story-tabs">
        <div className="seg">
          <button className={tab === 'structure' ? 'is-on' : ''} onClick={() => setTab('structure')}><Icon name="story" size={14} />Structure</button>
          <button className={tab === 'characters' ? 'is-on' : ''} onClick={() => setTab('characters')}><Icon name="users" size={14} />Characters</button>
          <button className={tab === 'locations' ? 'is-on' : ''} onClick={() => setTab('locations')}><Icon name="pin" size={14} />Locations</button>
          <button className={tab === 'xray' ? 'is-on' : ''} onClick={() => setTab('xray')}><Icon name="eye" size={14} />X-ray</button>
        </div>
      </div>
      {tab === 'structure' && <StructureTab script={script} />}
      {tab === 'characters' && <CharactersTab script={script} />}
      {tab === 'locations' && <LocationsTab script={script} />}
      {tab === 'xray' && <XrayTab script={script} />}
    </div>
  )
}

// ---------------------------------------------------------------- structure

function StructureTab({ script }: { script: Script }) {
  const p = useDoc(d => d.pagination)
  const labels = useDoc(d => d.sceneLabels)
  const update = useDoc.getState().update
  const st = script.extras.structure
  const scs = scenesOf(script.elements)
  const [drop, setDrop] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)

  if (!st || picking) {
    return (
      <div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <h1 className="display" style={{ fontSize: 30, margin: '0 0 6px' }}>{st ? 'Choose a different structure' : 'Give your story a spine'}</h1>
          <span className="spacer" />
          {st && <button className="btn quiet sm" onClick={() => setPicking(false)}>Cancel</button>}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{st ? 'Scenes you placed stay on beats with the same name.' : 'Pick a structure, then place your scenes on its beats. Page One checks where each beat lands against its target page.'}</p>
        <div className="beats" style={{ marginTop: 20 }}>
          {TEMPLATES.map(t => (
            <button key={t.id} className={'beat' + (st?.template === t.id ? ' drop' : '')} style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => { update(s => ({ ...s, extras: { ...s.extras, structure: switchStructure(s.extras.structure, t) } }), { elementsChanged: false }); setPicking(false) }}>
              <h4>{t.name} <small>{t.beats.length} beats · {t.pages} pp</small></h4>
              <p>{t.blurb}</p>
              {exampleFor(t.id) && <span className="beat-eg-line"><Icon name="film" size={12} />Worked example: {exampleFor(t.id)!.film}</span>}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const pages = p?.pages.length ?? 1
  const pageOf = (id: number) => {
    const i = script.elements.findIndex(e => e.id === id)
    return i >= 0 && p ? p.elementPage[i] + 1 : null
  }
  // In an example script (a one-page beat outline) each beat shows where it falls in the film itself.
  const outline = isExampleScript(script.titlePage.draft)
  const checks = checkBeats(st, outline ? 1 : pages, pageOf).map(c => (outline
    ? { ...c, actualPage: c.beat.sceneIds.length ? c.targetPage : null, onTrack: c.beat.sceneIds.length > 0, verdict: `In the film: around p.${c.targetPage} of ${st.targetPages}` }
    : c))
  const length = outline || pages * 2 < st.targetPages ? st.targetPages : pages
  const tmpl = template(st.template)
  const example = tmpl ? exampleFor(tmpl.id) : undefined
  const setBeats = (f: (b: Beat[]) => Beat[]) =>
    update(s => s.extras.structure ? ({ ...s, extras: { ...s.extras, structure: { ...s.extras.structure, beats: f(s.extras.structure.beats) } } }) : s, { elementsChanged: false })
  const assign = (beatId: string, sceneId: number) => setBeats(bs => bs.map(b => (b.id === beatId ? { ...b, sceneIds: b.sceneIds.includes(sceneId) ? b.sceneIds : [...b.sceneIds, sceneId] } : b)))

  return (
    <div>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h1 className="display" style={{ fontSize: 28, margin: 0 }}>{tmpl?.name ?? 'Structure'}</h1>
        <span className="faint">{outline ? `A beat outline of a ${st.targetPages}-page film — pages are the film's` : `${checks.filter(c => c.onTrack).length} of ${checks.length} beats on track · target ${st.targetPages} pages`}</span>
        <span className="spacer" />
        <label className="row faint" style={{ fontSize: 12 }}>Target pages
          <input className="input" type="number" style={{ width: 76, minHeight: 28, height: 28 }} value={st.targetPages}
            onChange={e => update(s => s.extras.structure ? ({ ...s, extras: { ...s.extras, structure: { ...s.extras.structure, targetPages: Math.max(1, +e.target.value || 1) } } }) : s, { elementsChanged: false })} />
        </label>
        <button className="btn quiet sm" onClick={() => setPicking(true)}>Change</button>
      </div>

      {tmpl && exampleFor(tmpl.id) && <ExampleBar id={tmpl.id} x={exampleFor(tmpl.id)!} outline={outline} />}

      <div className="beat-map">
        {actBreaks(st).map((a, i) => <div key={i} className="act" style={{ left: `${a * 100}%` }}><span>Act {i + 2}</span></div>)}
        {!outline && scs.map(sc => {
          const pg = pageOf(sc.elementId) ?? 1
          return <div key={sc.elementId} className="scene-tick" style={{ left: `${((pg - 1) / length) * 100}%`, width: 3, background: sc.color ? SCENE_COLORS[sc.color] : 'var(--line-3)' }} />
        })}
        {checks.map(c => (
          <div key={c.beat.id} className={'tick' + (c.actualPage ? ' placed' : '') + (c.actualPage && !c.onTrack ? ' off' : '')}
            title={`${c.beat.name} — ${c.verdict}`} style={{ left: `${(((c.actualPage ?? c.targetPage) - 1) / length) * 100}%` }} />
        ))}
      </div>

      <div className="beats">
        {checks.map(c => (
          <div key={c.beat.id} className={'beat' + (drop === c.beat.id ? ' drop' : '')}
            onDragOver={e => { e.preventDefault(); setDrop(c.beat.id) }} onDragLeave={() => setDrop(null)}
            onDrop={e => { e.preventDefault(); setDrop(null); const id = Number(e.dataTransfer.getData('text/scene')); if (id) assign(c.beat.id, id) }}>
            <h4>{c.beat.name} <small>ACT {c.beat.act} · p.{c.targetPage}</small></h4>
            <p>{c.beat.description}</p>
            {example?.beats[tmpl!.beats.findIndex(([n]) => n === c.beat.name)] && (
              <details className="beat-eg">
                <summary><Icon name="film" size={12} />In {example.film}</summary>
                <p>{example.beats[tmpl!.beats.findIndex(([n]) => n === c.beat.name)][1]}</p>
              </details>
            )}
            <div className={'verdict' + (c.onTrack ? ' ok' : c.actualPage ? ' off' : '')}>{c.verdict}</div>
            <div className="beat-scenes">
              {c.beat.sceneIds.map(id => {
                const sc = scs.find(s => s.elementId === id)
                if (!sc) return null
                return (
                  <span key={id} className="chip" style={{ cursor: 'pointer' }} onClick={() => useDoc.getState().jumpTo(id)}>
                    {labels.get(id)}. <span className="ellipsis" style={{ maxWidth: 150, fontFamily: 'var(--font-script)', fontSize: 11 }}>{sc.heading}</span>
                    <button className="icon-btn sm" style={{ width: 16, height: 16 }} onClick={e => { e.stopPropagation(); setBeats(bs => bs.map(b => (b.id === c.beat.id ? { ...b, sceneIds: b.sceneIds.filter(x => x !== id) } : b))) }}><Icon name="close" size={10} /></button>
                  </span>
                )
              })}
              <select className="select" style={{ minHeight: 24, height: 24, padding: '0 6px', fontSize: 11.5, width: 'auto', maxWidth: '100%', background: 'transparent' }} value=""
                onChange={e => { if (e.target.value) assign(c.beat.id, Number(e.target.value)) }}>
                <option value="">+ Place a scene</option>
                {scs.map(sc => <option key={sc.elementId} value={sc.elementId}>{labels.get(sc.elementId)}. {sc.heading || 'Untitled'}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className="section-title" style={{ marginTop: 30 }}>Scenes — drag onto a beat</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {scs.map(sc => (
          <span key={sc.elementId} className="chip" draggable onDragStart={e => e.dataTransfer.setData('text/scene', String(sc.elementId))} style={{ cursor: 'grab' }}>
            {sc.color > 0 && <span className="dot" style={{ background: SCENE_COLORS[sc.color], width: 6, height: 6 }} />}
            {labels.get(sc.elementId)}. <span style={{ fontFamily: 'var(--font-script)', fontSize: 11 }}>{sc.heading || 'Untitled'}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** The film this structure is shown in, with the example script and the real screenplay one click away. */
function ExampleBar({ id, x, outline }: { id: string; x: StructureExample; outline: boolean }) {
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try {
      const sid = await createExample(id)
      await useApp.getState().refresh()
      await useApp.getState().openScript(sid)
      useDoc.getState().setView('story')
      toast(`Example opened — every beat of ${x.film} is a scene. It's in your library; delete it whenever you like.`, 'film')
    } catch (e) { toast((e as Error).message, 'close') } finally { setBusy(false) }
  }
  return (
    <div className="example-bar">
      <Icon name="film" size={18} />
      <div className="grow">
        <b>{outline ? `${x.film}, beat by beat` : `See it in ${x.film}`}</b> <span className="faint">({x.year}) · {x.by}</span>
        <div className="muted" style={{ fontSize: 12.5 }}>{outline ? 'Each beat is a scene in this outline, already placed below. Look at the Cards view and the navigator too: every card is a beat.' : `${x.why} Open any beat below to see where it happens in the film.`}</div>
        {x.note && <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{x.note}</div>}
      </div>
      {!outline && <button className="btn sm" disabled={busy} onClick={() => void open()}><Icon name="script" size={13} />{busy ? 'Opening…' : 'Open the example script'}</button>}
      {!x.note && <button className="btn ghost sm" onClick={() => openLink(readLink(x))}><Icon name="book" size={13} />Read the screenplay</button>}
    </div>
  )
}

// ---------------------------------------------------------------- characters

const FIELDS: [keyof CharacterProfile, string, string][] = [
  ['role', 'Role', 'Protagonist, mentor, antagonist…'], ['age', 'Age', ''],
  ['want', 'Want', 'What they are chasing'], ['need', 'Need', 'What they actually need'],
  ['arc', 'Arc', 'From… → to…'], ['voice', 'Voice', 'How they talk'],
]

function CharactersTab({ script }: { script: Script }) {
  const names = useMemo(() => {
    const fromScript = characterNames(script.elements)
    return [...fromScript, ...script.extras.characters.map(c => c.name).filter(n => !fromScript.includes(n))]
  }, [script.elements, script.extras.characters])
  const [sel, setSel] = useState<string | null>(null)
  const [voiceCheck, setVoiceCheck] = useState(false)
  const name = sel ?? names[0]
  const update = useDoc.getState().update
  if (!name) return <div className="empty-state"><Icon name="users" size={24} /><h4>No characters yet</h4><p>Characters appear here as soon as they speak.</p></div>
  const prof = script.extras.characters.find(c => c.name === name) ?? characterProfile(name)
  const set = (p: Partial<CharacterProfile>) => update(s => ({ ...s, extras: { ...s.extras, characters: [...s.extras.characters.filter(c => c.name !== name), { ...prof, ...p }] } }), { elementsChanged: false })

  // "Read only MAYA's lines": every speech in order, to check the voice stays consistent.
  const lines: { id: number; text: string; scene: string }[] = []
  let scene = ''
  let speaking = false
  for (const e of script.elements) {
    if (e.type === 'SCENE_HEADING') { scene = e.text; speaking = false }
    else if (e.type === 'CHARACTER') speaking = characterName(e.text) === name
    else if ((e.type === 'DIALOGUE' || e.type === 'PARENTHETICAL') && speaking) lines.push({ id: e.id, text: e.text, scene })
    else if (e.type !== 'LYRICS' && e.type !== 'NOTE') speaking = false
  }

  return (
    <div className="bible">
      <div className="bible-list">
        {names.map(n => (
          <button key={n} className={'list-row' + (n === name ? ' scene-item is-on' : '')} style={{ display: 'flex' }} onClick={() => { setSel(n); setVoiceCheck(false) }}>
            <span className="avatar" style={{ background: nameColor(n) }}>{n.substring(0, 2)}</span>
            <span className="grow ellipsis" style={{ fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 12 }}>{n}</span>
          </button>
        ))}
      </div>
      <div>
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="avatar" style={{ width: 48, height: 48, fontSize: 16, background: nameColor(name) }}>{name.substring(0, 2)}</span>
          <div>
            <h2 className="display" style={{ margin: 0, fontSize: 26 }}>{name}</h2>
            <div className="faint">{prof.role || 'No role yet'} · {lines.length} speeches</div>
          </div>
          <span className="spacer" />
          <button className={'btn ' + (voiceCheck ? '' : 'ghost')} onClick={() => setVoiceCheck(!voiceCheck)}><Icon name="quote" size={14} />Read only {name}'s lines</button>
        </div>
        {voiceCheck ? (
          <div className="bible-card" style={{ display: 'block' }}>
            {lines.length === 0 && <p className="muted">{name} has no lines yet.</p>}
            {lines.map((l, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => useDoc.getState().jumpTo(l.id)}>
                <div className="faint" style={{ fontSize: 10.5, fontFamily: 'var(--font-script)' }}>{l.scene}</div>
                <div style={{ fontFamily: 'var(--font-script)', fontSize: 13, marginTop: 3, whiteSpace: 'pre-wrap' }}>{l.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bible-card">
            {FIELDS.map(([k, label, ph]) => (
              <label key={k} className="field"><span>{label}</span>
                <input className="input" value={String(prof[k] ?? '')} placeholder={ph} onChange={e => set({ [k]: e.target.value })} /></label>
            ))}
            <label className="field full"><span>Backstory</span>
              <textarea className="textarea" rows={6} value={prof.bio} placeholder="Where they come from, what happened to them, what they hide." onChange={e => set({ bio: e.target.value })} /></label>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- locations

function LocationsTab({ script }: { script: Script }) {
  const names = useMemo(() => {
    const fromScript = locationsOf(script.elements)
    return [...fromScript, ...script.extras.locations.map(l => l.name).filter(n => !fromScript.includes(n))]
  }, [script.elements, script.extras.locations])
  const [sel, setSel] = useState<string | null>(null)
  const name = sel ?? names[0]
  const labels = useDoc(d => d.sceneLabels)
  const update = useDoc.getState().update
  if (!name) return <div className="empty-state"><Icon name="pin" size={24} /><h4>No locations yet</h4><p>Locations come from your scene headings.</p></div>
  const prof: LocationProfile = script.extras.locations.find(l => l.name === name) ?? { name, description: '', notes: '', photo: '' }
  const set = (p: Partial<LocationProfile>) => update(s => ({ ...s, extras: { ...s.extras, locations: [...s.extras.locations.filter(l => l.name !== name), { ...prof, ...p }] } }), { elementsChanged: false })
  const here = scenesOf(script.elements).filter(s => locationOf(s.heading) === name)
  return (
    <div className="bible">
      <div className="bible-list">
        {names.map(n => (
          <button key={n} className={'list-row' + (n === name ? ' scene-item is-on' : '')} style={{ display: 'flex' }} onClick={() => setSel(n)}>
            <span className="grow ellipsis" style={{ fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 12 }}>{n}</span>
          </button>
        ))}
      </div>
      <div>
        <h2 className="display" style={{ margin: '0 0 14px', fontSize: 26 }}>{name}</h2>
        <div className="bible-card">
          <label className="field full"><span>Description</span><textarea className="textarea" rows={3} value={prof.description} placeholder="What it looks, sounds and smells like." onChange={e => set({ description: e.target.value })} /></label>
          <label className="field full"><span>Notes</span><textarea className="textarea" rows={3} value={prof.notes} placeholder="Scouting, permits, practical concerns…" onChange={e => set({ notes: e.target.value })} /></label>
          <div className="full">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Scenes here · {here.length}</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {here.map(s => <button key={s.elementId} className="chip" onClick={() => useDoc.getState().jumpTo(s.elementId)}>{labels.get(s.elementId)}. <span style={{ fontFamily: 'var(--font-script)', fontSize: 11 }}>{s.heading}</span></button>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- x-ray

type ColorBy = 'intext' | 'daynight' | 'thread' | 'card'

function XrayTab({ script }: { script: Script }) {
  const p = useDoc(d => d.pagination)
  const [by, setBy] = useState<ColorBy>('intext')
  const xs = useMemo(() => (p ? xray(script, p, currentLinesPerPage()) : []), [script, p])
  const names = useMemo(() => characterNames(script.elements).slice(0, 18), [script.elements])
  const threads = new Map(script.extras.threads.map(t => [t.id, t]))
  const total = Math.max(1, xs.reduce((n, x) => n + Math.max(1, x.eighths), 0))
  const color = (x: (typeof xs)[number]) => {
    if (by === 'intext') return x.intExt === 'EXT' ? 'var(--accent)' : x.intExt === 'INT' ? 'var(--accent-2)' : 'var(--warning)'
    if (by === 'daynight') return /NIGHT|EVENING|DUSK/.test(x.time) ? '#3B4C7A' : /DAY|MORNING|DAWN|AFTERNOON/.test(x.time) ? '#E8C26A' : 'var(--surface-4)'
    if (by === 'thread') { const t = threads.get(sceneOf(script.extras, x.headingId).threads[0] ?? ''); return t ? SCENE_COLORS[t.color] : 'var(--surface-4)' }
    const c = script.elements.find(e => e.id === x.headingId)?.color ?? 0
    return c ? SCENE_COLORS[c] : 'var(--surface-4)'
  }
  const maxE = Math.max(1, ...xs.map(x => x.eighths))
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 24 }}>Pacing</h2>
        <span className="spacer" />
        <div className="seg">
          {([['intext', 'INT / EXT'], ['daynight', 'Day / night'], ['thread', 'Storyline'], ['card', 'Card colour']] as [ColorBy, string][]).map(([k, l]) => (
            <button key={k} className={by === k ? 'is-on' : ''} onClick={() => setBy(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="xray-strip">
        {xs.map(x => <div key={x.headingId} title={`${x.label}. ${x.heading} — ${formatEighths(x.eighths)} pp`} style={{ width: `${(Math.max(1, x.eighths) / total) * 100}%`, background: color(x) }} onClick={() => useDoc.getState().jumpTo(x.headingId)} />)}
      </div>

      <h2 className="display" style={{ margin: '30px 0 10px', fontSize: 24 }}>Rhythm</h2>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 110, padding: '0 2px', borderBottom: '1px solid var(--line-2)' }}>
        {xs.map(x => <div key={x.headingId} title={`${x.label}. ${x.heading} — ${formatEighths(x.eighths)} pp`} onClick={() => useDoc.getState().jumpTo(x.headingId)}
          style={{ flex: 1, height: `${(x.eighths / maxE) * 100}%`, minHeight: 3, background: color(x), borderRadius: '3px 3px 0 0', cursor: 'pointer' }} />)}
      </div>

      <h2 className="display" style={{ margin: '30px 0 4px', fontSize: 24 }}>Who's in which scene</h2>
      <div className="faint" style={{ fontSize: 12 }}>Solid: speaks · faint: mentioned in action</div>
      <div className="heatmap" style={{ gridTemplateColumns: `140px repeat(${Math.max(1, xs.length)}, minmax(6px, 1fr))` }}>
        {names.map(n => (
          <div key={n} style={{ display: 'contents' }}>
            <span className="hm-name">{n}</span>
            {xs.map(x => <i key={x.headingId} className={x.speaking.includes(n) ? 'speaks' : x.mentioned.includes(n) ? 'mentioned' : ''} title={`${n} · ${x.label}. ${x.heading}`} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
