import { useEffect, useMemo, useRef, useState } from 'react'
import { plan, todayIso } from '../core/production'
import { lineFor, type Line } from '../data/inspiration'
import { stillFor, type Still } from '../data/still'
import { createSample } from '../data/sample'
import { CRAFT, LEARN, OPPORTUNITIES, SCRIPT_LIBRARIES, SPARK, STUDY, type Source } from '../data/discover'
import { MANUAL } from '../data/manual'
import { el, newId, SCENE_COLORS } from '../core/model'
import { createScript, deleteScript, duplicateScript, loadScript, type ScriptMeta } from '../state/library'
import { openLink } from '../state/media'
import { syncUserDeleted } from '../state/sync'
import { allDays, lastDays, streak, useSettings, wordsOn } from '../state/settings'
import { importFile, exportPageOne } from '../io/files'
import { Icon } from './Icon'
import { confirmAction, openMenu, toast, useModal } from './kit'
import { useApp } from './appState'

/** A script's tag colour (the phone's scene colours), or the accent when it has none. */
const tint = (i: number) => (i >= 1 && i < SCENE_COLORS.length ? SCENE_COLORS[i] : 'var(--accent)')

/** The cover, as on the phone: a sheet of paper with the title in Courier, lifted off a wash of the script's colour. */
const Sheet = ({ m, small }: { m: ScriptMeta; small?: boolean }) => (
  <span className={'sheet-cover' + (small ? ' small' : '')} style={{ ['--tint' as string]: tint(m.coverColor) }}>
    <span className="sheet-paper">
      <b>{(m.title || 'Untitled').toUpperCase()}</b>
      {!small && m.author && <i>by {m.author}</i>}
    </span>
  </span>
)

type Sort = 'recent' | 'title' | 'pages'

const TAGLINES = [
  'A quieter mind writes a deeper story.',
  'Write the scene only you can see.',
  'Every draft is closer than the last.',
  'Find the moment. Cut to it.',
  'Pages first. Polish later.',
  'Trust the next line.',
  'The story is already in you.',
]
const ENCOURAGE = ['Small, consistent steps lead to remarkable stories.', 'One good page a day is a feature film in four months.', 'Momentum is a habit. Keep it warm.']

function greeting(name: string) {
  const h = new Date().getHours()
  const part = h < 5 ? 'Writing late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return { part, name: name.trim().split(' ')[0] }
}

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return d < 7 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const pickOf = <T,>(list: T[], salt = 0) => list[(dayOfYear() + salt) % list.length]
const sparkLine = () => {
  const any = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
  const who = any(SPARK.who)
  const subject = /^a [aeiou]/i.test(who) ? 'An' + who.slice(1) : who.charAt(0).toUpperCase() + who.slice(1)
  return `${subject} wants ${any(SPARK.wants)}, but ${any(SPARK.but)}.`
}

const dayOfYear = () => Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000)

export function Home() {
  const library = useApp(a => a.library)
  const loaded = useApp(a => a.loaded)
  const openScript = useApp(a => a.openScript)
  const refresh = useApp(a => a.refresh)
  const query = useApp(a => a.query).trim().toLowerCase()
  const s = useSettings(x => x.s)
  const log = useSettings(x => x.log)
  const [line, setLine] = useState<Line | null>(null)
  useEffect(() => { void lineFor().then(setLine) }, [])
  const [still, setStill] = useState<Still | null>(null)
  const [stillIn, setStillIn] = useState(false)
  useEffect(() => { if (s.dailyStill) void stillFor().then(st => { setStill(st); requestAnimationFrame(() => setStillIn(true)) }); else setStill(null) }, [s.dailyStill])
  const scroller = useRef<HTMLDivElement>(null)
  const [section, setSection] = useState('home')
  const [sort, setSort] = useState<Sort>('recent')
  const [spark, setSpark] = useState(sparkLine)

  const merged = useMemo(() => allDays(log), [log])
  const today = wordsOn(log, todayIso())
  const pct = s.dailyGoal ? Math.min(1, today / s.dailyGoal) : 0
  const week = lastDays(merged, 7)
  const year = useMemo(() => lastDays(merged, 7 * 52), [merged])
  const days = streak(merged)
  const g = greeting(s.name)
  const deadlines = library.filter(m => m.deadline)
  const recent = useMemo(() => {
    const i = library.reduce((best, m, k) => (best < 0 || m.modifiedAt > library[best].modifiedAt ? k : best), -1)
    return i >= 0 ? { m: library[i], i } : null
  }, [library])
  const shown = (query ? library.filter(m => `${m.title} ${m.author} ${m.logline}`.toLowerCase().includes(query)) : library).slice().sort((a, b) =>
    sort === 'title' ? a.title.localeCompare(b.title) : sort === 'pages' ? b.pages - a.pages : b.modifiedAt - a.modifiedAt)
  const study = pickOf(STUDY)
  const craft = pickOf(CRAFT, 7)
  const weekWords = week.reduce((n, d) => n + d.words, 0)
  const activeDays = year.filter(d => d.words > 0).length
  const libraryWords = library.reduce((n, m) => n + m.words, 0)
  const libraryPages = library.reduce((n, m) => n + m.pages, 0)

  // A search jumps to the results.
  useEffect(() => { if (query) document.getElementById('home-scripts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [query])

  const go = (id: string) => {
    setSection(id)
    if (id === 'home') scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
    else document.getElementById(`home-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const onScroll = () => {
    const box = scroller.current
    if (!box) return
    const at = ['stats', 'discover', 'guide', 'deadlines', 'scripts'].find(id => {
      const el = document.getElementById(`home-${id}`)
      return el && el.getBoundingClientRect().top - box.getBoundingClientRect().top < box.clientHeight * 0.45
    })
    setSection(at ?? 'home')
  }

  const newScript = async () => {
    const sc = await createScript('Untitled script')
    await refresh()
    await openScript(sc.id)
  }
  const fromSpark = async () => {
    const sc = await createScript('Untitled script', [el(newId(), 'ACTION', 'FADE IN:'), el(newId(), 'SCENE_HEADING', '', { synopsis: spark })])
    await refresh()
    await openScript(sc.id)
    toast('The spark is in the first scene’s synopsis', 'sparkle')
  }
  const doImport = async () => {
    try { const id = await importFile(); if (id) { await refresh(); await openScript(id); toast('Imported', 'import') } } catch (e) { toast('Could not import: ' + (e as Error).message, 'close') }
  }

  const nav: { id: string; label: string; icon: string; count?: number }[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'scripts', label: 'Scripts', icon: 'script', count: library.length },
    ...(deadlines.length ? [{ id: 'deadlines', label: 'Deadlines', icon: 'target', count: deadlines.length }] : []),
    { id: 'guide', label: 'User guide', icon: 'help' },
    { id: 'discover', label: 'Discover', icon: 'book' },
    { id: 'stats', label: 'Statistics', icon: 'stats' },
  ]

  return (
    <div className="home">
      <nav className="home-rail">
        <div className="rail-group">
          {nav.map(n => (
            <button key={n.id} className={'rail-item' + (section === n.id ? ' is-on' : '')} onClick={() => go(n.id)}>
              <Icon name={n.icon} size={17} /><span>{n.label}</span>{!!n.count && <em>{n.count}</em>}
            </button>
          ))}
        </div>
        <div className="rail-group">
          <span className="rail-label">Bring in</span>
          <button className="rail-item" onClick={newScript}><Icon name="plus" size={17} /><span>New script</span><kbd>Ctrl N</kbd></button>
          <button className="rail-item" onClick={doImport}><Icon name="import" size={17} /><span>Import</span></button>
        </div>
        <span className="spacer" />
        <div className="rail-group">
          <button className="rail-item" onClick={() => useModal.getState().open('drive')}><Icon name="cloud" size={17} /><span>Drive</span></button>
          <button className="rail-item" onClick={() => useModal.getState().open('settings')}><Icon name="settings" size={17} /><span>Settings</span><kbd>Ctrl ,</kbd></button>
        </div>
      </nav>

      <div className="home-scroll" ref={scroller} onScroll={onScroll}>
        <div className="home-inner">
          <header className="home-hero">
            <div>
              <h1 className="greeting display">{g.part}{g.name && <>, <em>{g.name}</em></>}.</h1>
              <p className="home-sub">
                {today > 0 ? <><b className="tabular">{today.toLocaleString()}</b> words today. Keep the pages turning.</>
                  : library.length ? 'The page is waiting. Pick up where you left off.' : 'Every film starts on page one.'}
              </p>
            </div>
            <p className="tagline">{TAGLINES[dayOfYear() % TAGLINES.length]}<i /></p>
          </header>

          {recent && (
            <div className="resume" role="button" tabIndex={0} onClick={() => void openScript(recent.m.id)} onKeyDown={e => { if (e.key === 'Enter') void openScript(recent.m.id) }}>
              <Sheet m={recent.m} small />
              <span className="resume-text">
                <span className="eyebrow">Continue writing</span>
                <b className="display">{recent.m.title || 'Untitled'}</b>
                <span className="resume-meta">
                  <span>{recent.m.pages || 0} pages</span><i /><span>{recent.m.scenes} scenes</span><i /><span>edited {ago(recent.m.modifiedAt)}</span>
                </span>
              </span>
              <span className="btn btn-lg">Open<Icon name="arrow" size={15} /></span>
              <button className="icon-btn" aria-label="More" onClick={e => { e.stopPropagation(); menu(recent.m, e.currentTarget, refresh) }}><Icon name="more" size={16} style={{ transform: 'rotate(90deg)' }} /></button>
            </div>
          )}

          <div className="home-grid">
            <div className={'panel inspire' + (still ? ' has-still' : '')}>
              {still && <div className={'still' + (stillIn ? ' is-in' : '')}><img src={still.url} alt={`A frame from ${still.film}`} /></div>}
              <h3>{line?.film ? 'Today’s line' : 'Today’s thought'}</h3>
              <div>
                {line && <blockquote>{line.text}</blockquote>}
                {line && <cite>{line.film ? <><b>{line.film.by || 'Unknown'}</b><span><em>{line.film.title}</em>{line.film.year ? ` (${line.film.year})` : ''}</span></> : <b>{line.by}</b>}</cite>}
              </div>
              <div className="film-meta">
                {line?.film && <span className="chip"><Icon name="film" size={12} />{line.film.director}</span>}
                {still && <span className="still-credit" title={`Still via ${still.via}`}>{still.film}{still.year ? ` (${still.year})` : ''} · {still.via}</span>}
              </div>
            </div>

            <div className="panel goal-card">
              <div className="row"><h3>Writing goal</h3><span className="spacer" /><span className="streak"><Icon name="flame" size={15} />{days} day streak</span></div>
              <div className="goal">
                <div className="ring">
                  <svg width="132" height="132" viewBox="0 0 132 132">
                    <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="color-mix(in oklab, var(--accent) 70%, var(--accent-2))" /></linearGradient></defs>
                    <circle cx="66" cy="66" r="57" fill="none" stroke="var(--surface-4)" strokeWidth="7" />
                    <circle cx="66" cy="66" r="57" fill="none" stroke="url(#rg)" strokeWidth="7" strokeLinecap="round"
                      strokeDasharray={`${pct * 358.1} 358.1`} style={{ transition: 'stroke-dasharray .8s var(--ease-out)' }} />
                  </svg>
                  <div className="ring-center"><div><b>{today.toLocaleString()}</b><span>of {s.dailyGoal.toLocaleString()}<br />words</span></div></div>
                </div>
                <div className="week">
                  {week.map((d, k) => {
                    const hit = s.dailyGoal > 0 && d.words >= s.dailyGoal
                    return (
                      <div key={d.day} title={`${d.words.toLocaleString()} words`}>
                        <span>{new Date(d.day + 'T12:00').toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                        <i className={(hit ? 'hit' : d.words > 0 ? 'some' : '') + (k === week.length - 1 ? ' today' : '')} />
                      </div>
                    )
                  })}
                </div>
              </div>
              <p className="goal-note">{pct >= 1 ? 'Goal met. Anything more is a gift to tomorrow.' : ENCOURAGE[dayOfYear() % ENCOURAGE.length]}</p>
            </div>
          </div>

          {deadlines.length > 0 && <>
            <div className="lib-head" id="home-deadlines"><h2>Deadlines</h2><span className="count">{deadlines.length}</span></div>
            <div className="deadline-row">
              {deadlines.map(m => {
                const pl = plan(m.deadline!, m.pages)
                return (
                  <button key={m.id} className="panel deadline" onClick={() => void openScript(m.id)}>
                    <div className="row"><Icon name="target" size={15} style={{ color: pl.behind > 0.5 || pl.overdue ? 'var(--warning)' : 'var(--accent)' }} />
                      <b>{m.title}</b><span className="faint">· {m.deadline!.label}</span><span className="spacer" />
                      <span className="chip tabular">{pl.overdue ? 'overdue' : `${pl.daysLeft} days left`}</span></div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{pl.status}</div>
                  </button>
                )
              })}
            </div>
          </>}

          <div className="lib-head" id="home-scripts">
            <h2>{query ? 'Matching scripts' : 'Your scripts'}</h2>
            <span className="count">{shown.length}</span>
            <span className="spacer" />
            {library.length > 1 && <div className="seg" role="tablist" aria-label="Sort scripts">
              {(['recent', 'title', 'pages'] as Sort[]).map(k => <button key={k} className={sort === k ? 'is-on' : ''} onClick={() => setSort(k)}>{k === 'recent' ? 'Recent' : k === 'title' ? 'A–Z' : 'Longest'}</button>)}
            </div>}
          </div>

          <div className="lib-grid">
            {!query && (
              <button className="cover new" onClick={newScript}>
                <span className="new-plus"><Icon name="plus" size={20} /></span>
                <span>New script</span>
                <span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>Ctrl N · import Fountain or Final Draft from the left</span>
              </button>
            )}
            {shown.map((m, i) => <Cover key={m.id} m={m} i={i} />)}
            {query && shown.length === 0 && <div className="empty-state" style={{ gridColumn: '1 / -1' }}><Icon name="search" size={22} /><h4>No scripts match “{query}”</h4><p>Try a title, a writer or a word from the logline.</p></div>}
            {loaded && library.length === 0 && (
              <button className="cover new" onClick={async () => { const id = await createSample(); await refresh(); await openScript(id) }}>
                <span className="new-plus"><Icon name="sparkle" size={20} /></span><span>Open the sample</span><span className="faint" style={{ fontSize: 12, fontWeight: 400 }}>The Last Projectionist</span>
              </button>
            )}
          </div>

          <div className="lib-head" id="home-guide"><h2>User guide</h2><span className="faint" style={{ fontSize: 13 }}>How to use Page One, a part at a time</span></div>
          <Guide />

          <div className="lib-head" id="home-discover"><h2>Discover</h2><span className="faint" style={{ fontSize: 13 }}>Read, learn, and find somewhere to send it</span></div>
          <div className="discover-grid">
            <div className="panel study">
              <h3>Script to study today</h3>
              <div className="study-title display">{study.title}<span> ({study.year})</span></div>
              <div className="muted" style={{ fontSize: 13 }}>Written by {study.by}</div>
              <p className="study-look"><b>Look for</b> {study.look}</p>
              <div className="row" style={{ marginTop: 'auto', gap: 10 }}>
                <button className="btn" onClick={() => openLink(study.url)}><Icon name="book" size={14} />Read the screenplay</button>
                <span className="faint" style={{ fontSize: 11.5 }}>Free on IMSDb</span>
              </div>
            </div>
            <div className="panel craft">
              <h3>Craft note</h3>
              <div className="craft-title display">{craft.title}</div>
              <p>{craft.note}</p>
            </div>
            <div className="panel spark">
              <div className="row"><h3>Story spark</h3><span className="spacer" />
                <button className="btn quiet sm" onClick={() => setSpark(sparkLine())}><Icon name="sparkle" size={13} />Shuffle</button></div>
              <p className="spark-line display">{spark}</p>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost" onClick={() => void fromSpark()}><Icon name="plus" size={14} />Start a script from this</button>
                <button className="btn quiet" onClick={() => { void navigator.clipboard?.writeText(spark); toast('Copied', 'copy') }}><Icon name="copy" size={14} />Copy</button>
              </div>
            </div>
          </div>
          <div className="section-title" style={{ marginTop: 26 }}>Free screenplays to read</div>
          <div className="source-grid">{SCRIPT_LIBRARIES.map(x => <SourceTile key={x.url} x={x} icon="script" />)}</div>
          <div className="section-title" style={{ marginTop: 26 }}>Fellowships, labs &amp; competitions</div>
          <div className="source-grid">{OPPORTUNITIES.map(x => <SourceTile key={x.url} x={x} icon="target" />)}</div>
          <div className="section-title" style={{ marginTop: 26 }}>Keep learning</div>
          <div className="source-grid">{LEARN.map(x => <SourceTile key={x.url} x={x} icon="quote" />)}</div>

          <div className="lib-head" id="home-stats"><h2>Statistics</h2></div>
          <div className="stats-row">
            <div className="panel stat"><span>This week</span><b className="tabular">{weekWords.toLocaleString()}</b><em>words</em></div>
            <div className="panel stat"><span>Streak</span><b className="tabular">{days}</b><em>day{days === 1 ? '' : 's'} in a row</em></div>
            <div className="panel stat"><span>Writing days</span><b className="tabular">{activeDays}</b><em>in the last year</em></div>
            <div className="panel stat"><span>Your library</span><b className="tabular">{libraryPages.toLocaleString()}</b><em>pages · {libraryWords.toLocaleString()} words</em></div>
          </div>
          <div className="panel year">
            <div className="row"><h3>Your writing year</h3><span className="spacer" /><span className="faint" style={{ fontSize: 11.5 }}>Less</span>
              <span className="heat-key"><i /><i className="l1" /><i className="l2" /><i className="l3" /><i className="l4" /></span><span className="faint" style={{ fontSize: 11.5 }}>More</span></div>
            <div className="heat" title="Your writing year">
              {year.map(d => {
                const r = s.dailyGoal ? d.words / s.dailyGoal : d.words > 0 ? 1 : 0
                const l = d.words === 0 ? '' : r < 0.25 ? 'l1' : r < 0.6 ? 'l2' : r < 1 ? 'l3' : 'l4'
                return <i key={d.day} className={l} title={`${d.day}: ${d.words} words`} />
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** `keys` and **bold** in the guide's text. */
function rich(text: string) {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('`') ? <kbd key={i} className="kbd">{part.slice(1, -1)}</kbd> : part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part)
}

function Guide() {
  const [open, setOpen] = useState('start')
  const ch = MANUAL.find(c => c.id === open) ?? MANUAL[0]
  return (
    <div className="guide panel">
      <div className="guide-toc" role="tablist" aria-label="User guide">
        {MANUAL.map(c => (
          <button key={c.id} role="tab" aria-selected={c.id === ch.id} className={'guide-tab' + (c.id === ch.id ? ' is-on' : '')} onClick={() => setOpen(c.id)}>
            <Icon name={c.icon} size={15} /><span><b>{c.title}</b><em>{c.summary}</em></span>
          </button>
        ))}
      </div>
      <div className="guide-body" role="tabpanel">
        <h3 className="display">{ch.title}</h3>
        <ol>{ch.steps.map((st, i) => <li key={i}>{rich(st)}</li>)}</ol>
        <div className="row guide-foot">
          <span className="faint" style={{ fontSize: 12 }}>{MANUAL.indexOf(ch) + 1} of {MANUAL.length}</span>
          <span className="spacer" />
          {MANUAL.indexOf(ch) < MANUAL.length - 1 && <button className="btn quiet sm" onClick={() => setOpen(MANUAL[MANUAL.indexOf(ch) + 1].id)}>Next: {MANUAL[MANUAL.indexOf(ch) + 1].title}<Icon name="arrow" size={13} /></button>}
        </div>
      </div>
    </div>
  )
}

function SourceTile({ x, icon }: { x: Source; icon: string }) {
  return (
    <button className="source" onClick={() => openLink(x.url)} title={x.url}>
      <Icon name={icon} size={16} />
      <span><b>{x.name}</b><span>{x.blurb}</span></span>
      <Icon name="arrow" size={13} className="source-go" />
    </button>
  )
}

function Cover({ m, i }: { m: ScriptMeta; i: number }) {
  const openScript = useApp(a => a.openScript)
  const refresh = useApp(a => a.refresh)
  const pl = m.deadline ? plan(m.deadline, m.pages) : null
  return (
    <button className="cover" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }} onClick={() => void openScript(m.id)}
      onContextMenu={e => { e.preventDefault(); menu(m, { x: e.clientX, y: e.clientY }, refresh) }}>
      <Sheet m={m} />
      {m.locked && <span className="cover-badge"><Icon name="lock" size={11} />Locked</span>}
      <span className="icon-btn sm cover-more" onClick={e => { e.stopPropagation(); menu(m, e.currentTarget as HTMLElement, refresh) }}><Icon name="more" size={14} /></span>
      <div className="cover-body">
        <h3 className="cover-title">{m.title || 'Untitled'}</h3>
        <div className="cover-stats">{Math.max(1, m.pages)} pp · {m.scenes} scene{m.scenes === 1 ? '' : 's'}</div>
        {m.logline && <p className="cover-logline">{m.logline}</p>}
        {pl && <div className="cover-deadline"><Icon name="target" size={12} />{pl.overdue ? 'overdue' : `${pl.daysLeft}d left`}</div>}
        <div className="cover-when">{ago(m.modifiedAt)}</div>
      </div>
    </button>
  )
}

function menu(m: ScriptMeta, at: HTMLElement | { x: number; y: number }, refresh: () => Promise<void>) {
  openMenu([
    { label: 'Open', icon: 'script', run: () => void useApp.getState().openScript(m.id) },
    { label: 'Duplicate', icon: 'copy', run: async () => { await duplicateScript(m.id); await refresh() } },
    { label: 'Export .pageone', icon: 'export', run: async () => exportPageOne(await loadScript(m.id)) },
    { divider: true },
    { label: 'Delete', icon: 'trash', danger: true, run: () => confirmAction(`Delete “${m.title}” and all its versions? This can't be undone.`, 'Delete', async () => { await deleteScript(m.id); syncUserDeleted(m.id); await refresh() }) },
  ], at, 'right')
}
