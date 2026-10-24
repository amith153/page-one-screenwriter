import { useMemo, useState } from 'react'
import { BREAKDOWN_CATEGORIES, newId, SCENE_COLORS, sceneOf, withScene, commentRange, uuid, type BreakdownCategory, type Script } from '../core/model'
import { scenes as scenesOf, sceneIndexFor, stats as statsOf } from '../core/analysis'
import { check, fixAll, issueKey, RULES, SEVERITY_LABEL, type Issue, type Severity } from '../core/doctor'
import { eighths, formatEighths, intExt, plan, sceneLines, timeOfDay } from '../core/production'
import { currentLinesPerPage, useDoc, type Panel } from '../state/doc'
import { Icon } from './Icon'
import { toast, useModal } from './kit'
import { authorName, updateNote } from './notes'
import { AttachBar, AttachmentList, dropAttachment } from './NoteAttachments'
import { nameColor } from './Sidebar'
import { ChangesTab } from './Changes'

const TABS: { id: Exclude<Panel, null>; label: string; icon: string }[] = [
  { id: 'scene', label: 'Scene', icon: 'pin' },
  { id: 'doctor', label: 'Doctor', icon: 'doctor' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
  { id: 'changes', label: 'Changes', icon: 'revision' },
  { id: 'stats', label: 'Stats', icon: 'stats' },
]

// ---------------------------------------------------------------- ignore list (per script, like the phone)

const ignoreKey = (id: string) => `pageone-doctor-ignore:${id}`
const loadIgnores = (id: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(ignoreKey(id)) ?? '[]')) } catch { return new Set() } }
const saveIgnores = (id: string, s: Set<string>) => { try { localStorage.setItem(ignoreKey(id), JSON.stringify([...s])) } catch { /* ignore */ } }

export function useDoctor(script: Script | null) {
  const pagination = useDoc(d => d.pagination)
  const [rev, setRev] = useState(0)
  const issues = useMemo(() => {
    if (!script) return []
    const ign = loadIgnores(script.id)
    return check(script, pagination ?? undefined).filter(i => !ign.has(issueKey(i)))
  }, [script, pagination, rev])
  const ignore = (i: Issue) => { if (!script) return; const s = loadIgnores(script.id); s.add(issueKey(i)); saveIgnores(script.id, s); setRev(r => r + 1) }
  return { issues, ignore }
}

export function Inspector() {
  const panel = useDoc(d => d.panel)
  const script = useDoc(d => d.script)
  const { issues } = useDoctor(panel === 'doctor' || panel === null ? null : script)
  const openNotes = script?.extras.comments.filter(c => !c.resolved).length ?? 0
  return (
    <aside className={'inspector' + (panel ? '' : ' is-closed')}>
      <div className="pane-tabs">
        {TABS.map(t => (
          <button key={t.id} className={panel === t.id ? 'is-on' : ''} title={t.label} onClick={() => useDoc.getState().setPanel(t.id)}>
            <Icon name={t.icon} size={14} /><span className="tab-label">{t.label}</span>
            {t.id === 'notes' && openNotes > 0 && <span className="badge">{openNotes}</span>}
            {t.id === 'doctor' && panel !== 'doctor' && issues.some(i => RULES[i.rule].severity === 'PROBLEM') && <span className="badge warn">!</span>}
          </button>
        ))}
      </div>
      <div className="pane-body">
        {script && panel === 'scene' && <SceneTab script={script} />}
        {script && panel === 'doctor' && <DoctorTab script={script} />}
        {script && panel === 'notes' && <NotesTab script={script} />}
        {script && panel === 'changes' && <ChangesTab script={script} />}
        {script && panel === 'stats' && <StatsTab script={script} />}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------- scene

function ChipInput({ onAdd, placeholder }: { onAdd: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState('')
  return (
    <input className="input" style={{ minHeight: 28, height: 28, fontSize: 12, width: 130, padding: '0 9px' }} value={v} placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV('') } }} />
  )
}

function SceneTab({ script }: { script: Script }) {
  const currentId = useDoc(d => d.currentId)
  const pagination = useDoc(d => d.pagination)
  const labels = useDoc(d => d.sceneLabels)
  const els = script.elements
  const idx = els.findIndex(e => e.id === currentId)
  const hi = idx >= 0 ? sceneIndexFor(els, idx) : -1
  if (hi < 0) return (
    <div className="empty-state"><Icon name="pin" size={22} /><h4>Not in a scene</h4><p>Put the cursor in a scene to see its synopsis, storylines and breakdown.</p></div>
  )
  const head = els[hi]
  const sc = scenesOf(els).find(s => s.elementId === head.id)!
  const meta = sceneOf(script.extras, head.id)
  const lines = pagination ? sceneLines(els, pagination)[sc.number - 1] ?? 0 : 0
  const update = useDoc.getState().update
  const setHead = (p: Partial<typeof head>) => update(s => ({ ...s, elements: s.elements.map(e => (e.id === head.id ? { ...e, ...p } : e)) }))
  const setMeta = (m: typeof meta) => update(s => ({ ...s, extras: withScene(s.extras, head.id, m) }), { elementsChanged: false })
  const beats = script.extras.structure?.beats ?? []
  const beat = beats.find(b => b.sceneIds.includes(head.id))
  const speaking = [...new Set(els.slice(sc.elementIndex, sc.endIndex).filter(e => e.type === 'CHARACTER').map(e => e.text.replace(/\(.*?\)/g, '').trim()))]

  return (
    <div>
      <div className="section">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="chip accent tabular">Scene {labels.get(head.id) ?? sc.number}</span>
          <span className="chip tabular">p.{pagination?.labels[pagination.elementPage[hi]] ?? '–'}</span>
          <span className="chip tabular">{formatEighths(eighths(lines, currentLinesPerPage()))} pg</span>
        </div>
        <div style={{ margin: '12px 0 4px', fontFamily: 'var(--font-script)', fontWeight: 700, fontSize: 13 }}>{head.text || 'UNTITLED SCENE'}</div>
        <div className="faint" style={{ fontSize: 11.5 }}>{[intExt(head.text), timeOfDay(head.text)].filter(Boolean).join(' · ')} · {sc.words} words</div>
      </div>
      <div className="section">
        <div className="section-title">Synopsis</div>
        <textarea className="textarea" rows={3} value={head.synopsis} placeholder="What happens — one or two lines for the cards and navigator."
          onChange={e => setHead({ synopsis: e.target.value })} />
      </div>
      <div className="section">
        <div className="section-title">Colour</div>
        <div className="swatches">
          {SCENE_COLORS.map((c, i) => (
            <button key={i} className={'swatch' + (i === 0 ? ' none' : '') + (head.color === i ? ' is-on' : '')} style={{ ['--sw' as string]: c }} onClick={() => setHead({ color: i })} title={i === 0 ? 'None' : undefined} />
          ))}
        </div>
      </div>
      <div className="section">
        <div className="section-title">Storylines</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {script.extras.threads.map(t => {
            const on = meta.threads.includes(t.id)
            return (
              <button key={t.id} className={'chip' + (on ? ' accent' : '')} onClick={() => setMeta({ ...meta, threads: on ? meta.threads.filter(x => x !== t.id) : [...meta.threads, t.id] })}>
                <span className="dot" style={{ background: SCENE_COLORS[t.color] || 'var(--text-3)', width: 7, height: 7 }} />{t.name}
              </button>
            )
          })}
          <ChipInput placeholder="+ New storyline" onAdd={name => {
            const t = { id: uuid().substring(0, 8), name, color: 1 + (script.extras.threads.length % 9) }
            update(s => ({ ...s, extras: withScene({ ...s.extras, threads: [...s.extras.threads, t] }, head.id, { ...meta, threads: [...meta.threads, t.id] }) }), { elementsChanged: false })
          }} />
        </div>
      </div>
      {beats.length > 0 && (
        <div className="section">
          <div className="section-title">Beat</div>
          <select className="select" value={beat?.id ?? ''} onChange={e => {
            const id = e.target.value
            update(s => s.extras.structure ? ({ ...s, extras: { ...s.extras, structure: { ...s.extras.structure, beats: s.extras.structure.beats.map(b => ({ ...b, sceneIds: b.id === id ? [...b.sceneIds.filter(x => x !== head.id), head.id] : b.sceneIds.filter(x => x !== head.id) })) } } }) : s, { elementsChanged: false })
          }}>
            <option value="">No beat</option>
            {beats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <div className="section">
        <div className="section-title">Breakdown</div>
        {speaking.length > 0 && <div className="faint" style={{ fontSize: 11.5, marginBottom: 10 }}>Speaking: {speaking.join(', ')}</div>}
        <div className="col" style={{ gap: 12 }}>
          {BREAKDOWN_CATEGORIES.map(([cat, label]) => {
            const items = meta.breakdown[cat as BreakdownCategory] ?? []
            const set = (v: string[]) => setMeta({ ...meta, breakdown: { ...meta.breakdown, [cat]: v } })
            return (
              <div key={cat}>
                <div className="faint" style={{ fontSize: 11, fontWeight: 600, marginBottom: 5 }}>{label}</div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
                  {items.map(x => <button key={x} className="chip" title="Remove" onClick={() => set(items.filter(y => y !== x))}>{x}<Icon name="close" size={10} /></button>)}
                  <ChipInput placeholder="+ Add" onAdd={v => set([...items, v])} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- doctor

function DoctorTab({ script }: { script: Script }) {
  const { issues, ignore } = useDoctor(script)
  const update = useDoc.getState().update
  const batch = issues.filter(i => RULES[i.rule].batchSafe && i.fixes.length)
  const groups = (['PROBLEM', 'CHECK', 'POLISH'] as Severity[]).map(s => [s, issues.filter(i => RULES[i.rule].severity === s)] as const).filter(g => g[1].length)
  const apply = (f: Issue['fixes'][number]) => update(s => ({ ...s, elements: f.apply(s.elements, newId) }))

  return (
    <div style={{ paddingTop: 10 }}>
      <div className="doctor-hero">
        <b className="tabular">{issues.length}</b>
        <div className="grow">
          <div style={{ fontWeight: 600 }}>{issues.length === 0 ? 'Clean bill of health' : issues.length === 1 ? 'thing to look at' : 'things to look at'}</div>
          <div className="faint" style={{ fontSize: 11.5 }}>Format and consistency, the way a script coordinator reads a draft.</div>
        </div>
      </div>
      {batch.length > 0 && (
        <button className="btn" style={{ width: '100%', marginBottom: 14 }} onClick={() => {
          update(s => ({ ...s, elements: fixAll(s.elements, batch, newId) }))
          toast(`Tidied up ${batch.length} thing${batch.length === 1 ? '' : 's'} — Ctrl+Z to undo`, 'wand')
        }}><Icon name="wand" size={14} />Tidy up {batch.length} automatically</button>
      )}
      {issues.length === 0 && <div className="empty-state"><Icon name="check" size={24} /><h4>Ready to send</h4><p>No format problems, no spelling variants, no awkward page breaks.</p></div>}
      {groups.map(([sev, list]) => (
        <div key={sev} style={{ marginBottom: 14 }}>
          <div className="section-title"><span className={'sev ' + sev} />{SEVERITY_LABEL[sev]} · {list.length}</div>
          {list.map(i => (
            <div key={issueKey(i) + i.message} className="doctor-issue" onClick={() => i.elementId != null ? useDoc.getState().jumpTo(i.elementId) : useModal.getState().open('titlepage')}>
              <div className="t">{RULES[i.rule].title}</div>
              <div className="m">{i.message}</div>
              <div className="fixes" onClick={e => e.stopPropagation()}>
                {i.fixes.map(f => <button key={f.label} className="btn ghost sm" onClick={() => apply(f)}>{f.label}</button>)}
                {i.elementId == null && <button className="btn ghost sm" onClick={() => useModal.getState().open('titlepage')}>Open title page</button>}
                <button className="btn quiet sm" title={RULES[i.rule].why} onClick={() => ignore(i)}>Ignore</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- notes

const noteHex = (argb: number) => '#' + (argb >>> 0).toString(16).padStart(8, '0').substring(2)

function NotesTab({ script }: { script: Script }) {
  const active = useDoc(d => d.activeComment)
  const currentId = useDoc(d => d.currentId)
  const [onlyHere, setOnlyHere] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const byId = new Map(script.elements.map((e, i) => [e.id, i]))
  const all = [...script.extras.comments].sort((a, b) => (byId.get(a.elementId) ?? 1e9) - (byId.get(b.elementId) ?? 1e9) || a.start - b.start)
  const list = all.filter(c => (!onlyHere || c.elementId === currentId) && (showResolved || !c.resolved))

  return (
    <div style={{ paddingTop: 10 }}>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={'chip' + (onlyHere ? ' accent' : '')} onClick={() => setOnlyHere(!onlyHere)}>This line only</button>
        <button className={'chip' + (showResolved ? ' accent' : '')} onClick={() => setShowResolved(!showResolved)}>Show resolved</button>
      </div>
      {list.length === 0 && <div className="empty-state"><Icon name="notes" size={22} /><h4>No notes{onlyHere ? ' on this line' : ''}</h4><p>Select words in the script and press <span className="kbd">Ctrl</span> <span className="kbd">M</span> to pin a note.</p></div>}
      {list.map(c => {
        const e = script.elements.find(x => x.id === c.elementId)
        const range = e ? commentRange(c, e.text) : null
        return <NoteCard key={c.id} c={c} active={c.id === active} orphan={!range} />
      })}
    </div>
  )
}

function NoteCard({ c, active, orphan }: { c: Script['extras']['comments'][number]; active: boolean; orphan: boolean }) {
  const [reply, setReply] = useState('')
  const els = useDoc.getState().script?.elements ?? []
  const jump = () => {
    useDoc.getState().setActiveComment(c.id)
    const e = els.find(x => x.id === c.elementId)
    if (!e) return
    const r = commentRange(c, e.text)
    useDoc.getState().jumpTo(c.elementId, r ?? undefined)
  }
  return (
    <div className={'note-card' + (active ? ' is-active' : '') + (c.resolved ? ' resolved' : '')} style={{ ['--note' as string]: noteHex(c.color) }} onClick={() => useDoc.getState().setActiveComment(c.id)}>
      <div className="row">
        <span className="avatar" style={{ width: 22, height: 22, fontSize: 9.5, background: nameColor(c.author) }}>{c.author.substring(0, 2).toUpperCase()}</span>
        <span className="note-author">{c.author}</span>
        <span className="faint" style={{ fontSize: 11 }}>{new Date(c.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        <span className="spacer" />
        <button className="icon-btn sm" title={c.resolved ? 'Reopen' : 'Resolve'} onClick={() => updateNote(c.id, x => ({ ...x, resolved: !x.resolved }))}><Icon name={c.resolved ? 'undo' : 'check'} size={13} /></button>
        <button className="icon-btn sm" title="Delete" onClick={() => updateNote(c.id, () => null)}><Icon name="trash" size={13} /></button>
      </div>
      <div className="note-quote" onClick={jump} title={orphan ? 'The noted words were changed' : 'Show in script'}>{orphan ? '⚠ ' : ''}{c.quote}</div>
      <textarea className="textarea" style={{ minHeight: 40, background: 'transparent', border: 0, padding: '2px 0', boxShadow: 'none' }} rows={2}
        value={c.text} placeholder="Write a note…" autoFocus={active && !c.text}
        onChange={e => updateNote(c.id, x => ({ ...x, text: e.target.value }))} />
      {c.replies.map((r, i) => (
        <div key={i} className="note-reply"><span className="note-author">{r.author}</span> <span className="muted">{r.text}</span></div>
      ))}
      <AttachmentList list={c.attachments} onRemove={c.resolved ? undefined : a => { dropAttachment(a); updateNote(c.id, x => ({ ...x, attachments: x.attachments.filter(y => y.file !== a.file) })) }} />
      {!c.resolved && <AttachBar onAdd={a => updateNote(c.id, x => ({ ...x, attachments: [...x.attachments, a] }))} />}
      {!c.resolved && (
        <input className="input" style={{ marginTop: 8, minHeight: 28, height: 28, fontSize: 12 }} value={reply} placeholder="Reply…"
          onChange={e => setReply(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && reply.trim()) {
              updateNote(c.id, x => ({ ...x, replies: [...x.replies, { author: authorName(), color: c.color, text: reply.trim(), at: Date.now() }] }))
              setReply('')
            }
          }} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- stats

function StatsTab({ script }: { script: Script }) {
  const pagination = useDoc(d => d.pagination)
  const st = useMemo(() => statsOf(script.elements), [script.elements])
  const pages = pagination?.pages.length ?? 0
  const total = st.dialogueWords + st.actionWords || 1
  const dl = script.extras.deadline
  const pl = dl ? plan(dl, pages) : null
  const top = st.characters.slice(0, 8)
  const maxW = Math.max(1, ...top.map(c => c.words))
  return (
    <div style={{ paddingTop: 10 }}>
      <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat"><b>{pages}</b><span>pages · about {pages} min</span></div>
        <div className="stat"><b>{st.scenes}</b><span>scenes</span></div>
        <div className="stat"><b>{st.words.toLocaleString()}</b><span>words</span></div>
        <div className="stat"><b>{st.characters.length}</b><span>speaking parts</span></div>
      </div>
      <div className="section" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="section-title">Balance</div>
        <Balance a="Dialogue" b="Action" x={st.dialogueWords} total={total} />
        <Balance a="INT." b="EXT." x={st.interior} total={st.interior + st.exterior || 1} />
        <Balance a="Day" b="Night" x={st.day} total={st.day + st.night || 1} />
      </div>
      {top.length > 0 && (
        <div className="section" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div className="section-title">Speaking time</div>
          {top.map(c => (
            <div key={c.name} style={{ marginBottom: 8 }}>
              <div className="row" style={{ fontSize: 11.5 }}><span style={{ fontFamily: 'var(--font-script)', fontWeight: 700 }}>{c.name}</span><span className="spacer" /><span className="faint tabular">{c.words} words</span></div>
              <div className="split-bar" style={{ height: 5, marginTop: 4 }}><i style={{ width: `${(c.words / maxW) * 100}%`, background: nameColor(c.name) }} /></div>
            </div>
          ))}
        </div>
      )}
      <div className="section" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="section-title">Deadline</div>
        {pl && dl ? (
          <div className="col" style={{ gap: 4 }}>
            <div style={{ fontWeight: 600 }}>{dl.label} · {new Date(dl.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</div>
            <div className="muted" style={{ fontSize: 12 }}>{pl.status}</div>
            <div className="split-bar"><i style={{ width: `${Math.min(100, (pages / Math.max(1, dl.targetPages)) * 100)}%`, background: pl.behind > 0.5 ? 'var(--warning)' : 'var(--accent)' }} /></div>
            <button className="btn quiet sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => useModal.getState().open('deadline')}>Change</button>
          </div>
        ) : <button className="btn ghost sm" onClick={() => useModal.getState().open('deadline')}><Icon name="target" size={13} />Set a deadline</button>}
      </div>
    </div>
  )
}

function Balance({ a, b, x, total }: { a: string; b: string; x: number; total: number }) {
  const p = Math.round((x / total) * 100)
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row" style={{ fontSize: 11.5 }}><span>{a} <b className="tabular">{p}%</b></span><span className="spacer" /><span className="faint">{b} <b className="tabular">{100 - p}%</b></span></div>
      <div className="split-bar"><i style={{ width: `${p}%`, background: 'var(--accent)' }} /><i style={{ width: `${100 - p}%`, background: 'var(--accent-2)', opacity: .55 }} /></div>
    </div>
  )
}
