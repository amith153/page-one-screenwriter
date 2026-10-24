import { useEffect, useState } from 'react'
import { authorOf, CREDIT_ROLES, SOURCE_TYPES, type TitlePage } from '../core/model'
import { characterNames } from '../core/analysis'
import { todayIso } from '../core/production'
import { useDoc } from '../state/doc'
import { ACCENTS, useSettings, type PaperLook, type ThemeMode } from '../state/settings'
import { listVersions, loadVersion, deleteVersion, libraryRoot, type VersionInfo } from '../state/library'
import { exportPdf, exportTo, settingsWatermark, FORMATS, type Format } from '../io/files'
import { driveClientId } from '../io/drive'
import { isTauri, openPath } from '../platform/fs'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { Modal, Switch, confirmAction, openMenu, toast, useModal } from './kit'
import { useApp } from './appState'
import { printNow } from './menus'
import { JoinModal, ShareModal } from './Collab'
import { DriveModal } from './Drive'

export function ModalHost() {
  const id = useModal(m => m.id)
  const about = useApp(a => a.about)
  return <>
    {id === 'settings' && <SettingsModal />}
    {id === 'export' && <ExportModal />}
    {id === 'titlepage' && <TitlePageModal />}
    {id === 'versions' && <VersionsModal />}
    {id === 'shortcuts' && <ShortcutsModal />}
    {id === 'sides' && <SidesModal />}
    {id === 'deadline' && <DeadlineModal />}
    {id === 'reports' && <ReportsRedirect />}
    {id === 'share' && <ShareModal />}
    {id === 'join' && <JoinModal />}
    {id === 'drive' && <DriveModal />}
    {about && <AboutModal />}
  </>
}

function ReportsRedirect() {
  useEffect(() => { useDoc.getState().setView('production'); useModal.getState().close() }, [])
  return null
}

// ---------------------------------------------------------------- settings

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return <><label>{label}{desc && <span className="desc">{desc}</span>}</label><div className="row" style={{ flexWrap: 'wrap' }}>{children}</div></>
}

function SettingsModal() {
  const close = useModal(m => m.close)
  const s = useSettings(x => x.s)
  const set = useSettings(x => x.set)
  const [root, setRoot] = useState('')
  useEffect(() => { void libraryRoot().then(setRoot) }, [])
  return (
    <Modal title="Settings" icon="settings" onClose={close} wide>
      <div className="settings-grid">
        <Row label="Your name" desc="On notes, and suggested for title pages.">
          <input className="input" style={{ maxWidth: 300 }} value={s.name} placeholder="Your name" onChange={e => set({ name: e.target.value })} />
        </Row>
        <Row label="Theme">
          <div className="seg">
            {(['system', 'dark', 'black', 'light'] as ThemeMode[]).map(t => <button key={t} className={s.theme === t ? 'is-on' : ''} onClick={() => set({ theme: t })}>{t === 'black' ? 'Pure black' : t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
        </Row>
        <Row label="Accent">
          {ACCENTS.map(a => <button key={a.id} className={'accent-swatch' + (s.accent === a.id ? ' is-on' : '')} style={{ ['--sw' as string]: a.hex }} title={a.label} onClick={() => set({ accent: a.id })} />)}
        </Row>
        <Row label="Paper" desc="How the page looks while you write.">
          <div className="seg">
            {(['white', 'sepia', 'theme'] as PaperLook[]).map(p => <button key={p} className={s.paper === p ? 'is-on' : ''} onClick={() => set({ paper: p })}>{p === 'theme' ? 'Match theme' : p === 'sepia' ? 'Warm sepia' : 'White'}</button>)}
          </div>
        </Row>
        <Row label="Paper size">
          <div className="seg">
            <button className={s.paperSize === 'LETTER' ? 'is-on' : ''} onClick={() => set({ paperSize: 'LETTER' })}>US Letter</button>
            <button className={s.paperSize === 'A4' ? 'is-on' : ''} onClick={() => set({ paperSize: 'A4' })}>A4</button>
          </div>
        </Row>
        <Row label="Zoom"><input type="range" className="zoom-range" style={{ width: 200 }} min={0.7} max={1.6} step={0.05} value={s.zoom} onChange={e => set({ zoom: +e.target.value })} /><span className="faint tabular">{Math.round(s.zoom * 100)}%</span></Row>
        <Row label="Scene numbers" desc="In the margins, on screen and in the PDF."><Switch on={s.sceneNumbers} onChange={v => set({ sceneNumbers: v })} /></Row>
        <Row label="Bold scene headings" desc="On by default — in the editor, page view and every export."><Switch on={s.boldHeadings} onChange={v => set({ boldHeadings: v })} /></Row>
        <Row label="Bold character names" desc="The name above each speech, on screen and in every export."><Switch on={s.boldCharacters} onChange={v => set({ boldCharacters: v })} /></Row>
        <Row label="Automatic (CONT'D)" desc="When the same character speaks again after action."><Switch on={s.autoContd} onChange={v => set({ autoContd: v })} /></Row>
        <Row label="(MORE) / (CONT'D) across pages" desc="Split long speeches at page breaks."><Switch on={s.moreContd} onChange={v => set({ moreContd: v })} /></Row>
        <Row label="Space before scene headings">
          <div className="seg">{[1, 2].map(n => <button key={n} className={s.sceneSpacing === n ? 'is-on' : ''} onClick={() => set({ sceneSpacing: n })}>{n} line{n > 1 ? 's' : ''}</button>)}</div>
        </Row>
        <Row label="Focus line" desc="Dim everything but the line you're on."><Switch on={s.focusLine} onChange={v => set({ focusLine: v })} /></Row>
        <Row label="Typewriter scrolling" desc="Keep the current line at the same height."><Switch on={s.typewriter} onChange={v => set({ typewriter: v })} /></Row>
        <Row label="Daily word goal"><input className="input" type="number" min={0} step={50} style={{ width: 120 }} value={s.dailyGoal} onChange={e => set({ dailyGoal: Math.max(0, +e.target.value || 0) })} /><span className="faint">words a day</span></Row>
        <div className="settings-section">PDF watermark</div>
        <Row label="Watermark every PDF" desc="A reader's name, CONFIDENTIAL, DRAFT… drawn faintly across each page.">
          <Switch on={s.watermarkOn} onChange={v => set({ watermarkOn: v })} />
          {s.watermarkOn && <input className="input" style={{ maxWidth: 240 }} value={s.watermark} placeholder="CONFIDENTIAL" onChange={e => set({ watermark: e.target.value })} />}
        </Row>
        {s.watermarkOn && <Row label="Strength">
          <input type="range" className="zoom-range" style={{ width: 200 }} min={0.05} max={0.4} step={0.01} value={s.watermarkOpacity} onChange={e => set({ watermarkOpacity: +e.target.value })} />
          <span className="watermark-sample" style={{ opacity: Math.min(1, s.watermarkOpacity * 2.5) }}>{(s.watermark || 'CONFIDENTIAL').toUpperCase()}</span>
        </Row>}
        <div className="settings-section">Home</div>
        <Row label="A film still every day" desc="Behind the day's line on the home screen."><Switch on={s.dailyStill} onChange={v => set({ dailyStill: v })} /></Row>
        <div className="settings-section">Files</div>
        <Row label="Library folder" desc="Same layout as the phone. Copy scripts in, or keep it in a synced folder.">
          <code className="faint ellipsis" style={{ maxWidth: 360, fontSize: 11.5 }}>{root}</code>
          {isTauri && <button className="btn ghost sm" onClick={() => void openPath(root)}><Icon name="folder" size={13} />Show</button>}
        </Row>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- export

function ExportModal() {
  const close = useModal(m => m.close)
  const script = useDoc(d => d.script)
  const s = useSettings(x => x.s)
  const driveReady = !!driveClientId()
  const [format, setFormat] = useState<Format>('pdf')
  const [titlePage, setTitlePage] = useState(true)
  const [sceneNumbers, setSceneNumbers] = useState(s.sceneNumbers)
  const [boldHeadings, setBoldHeadings] = useState(s.boldHeadings)
  const [boldCharacters, setBoldCharacters] = useState(s.boldCharacters)
  const [watermark, setWatermark] = useState(s.watermarkOn ? s.watermark : '')
  const [revisedOnly, setRevisedOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!script) return null
  const hasRevisions = script.elements.some(e => e.revision > 0)
  const f = FORMATS.find(x => x.id === format)!
  const go = async (dest: 'file' | 'drive') => {
    setBusy(true)
    try { await exportTo(script, { format, titlePage, sceneNumbers, boldHeadings, boldCharacters, watermark, revisedOnly: revisedOnly && hasRevisions }, dest); close() }
    catch (e) { console.error(e); toast('Export failed — ' + (e as Error).message, 'close') } finally { setBusy(false) }
  }
  return (
    <Modal title="Export" icon="export" onClose={close} wide
      foot={<>
        <button className="btn quiet" onClick={() => { close(); printNow() }}><Icon name="page" size={14} />Print instead</button>
        <span className="spacer" />
        <button className="btn ghost" onClick={close}>Cancel</button>
        {driveReady && <button className="btn ghost" disabled={busy} onClick={() => void go('drive')}><Icon name="cloud" size={14} />Save to Drive</button>}
        <button className="btn" disabled={busy} onClick={() => void go('file')}>{busy ? 'Exporting…' : `Export ${f.label}`}</button>
      </>}>
      <div className="format-grid">
        {FORMATS.map(x => (
          <button key={x.id} className={'format-card' + (format === x.id ? ' is-on' : '')} onClick={() => setFormat(x.id)}>
            <span className="format-ext">.{x.ext}</span><b>{x.label}</b><span className="faint">{x.desc}</span>
          </button>
        ))}
      </div>
      {format !== 'pageone' && format !== 'fountain' && (
        <div className="settings-grid" style={{ marginTop: 18 }}>
          {format !== 'fdx' && <Row label="Title page"><Switch on={titlePage} onChange={setTitlePage} /></Row>}
          {format !== 'fdx' && <Row label="Scene numbers"><Switch on={sceneNumbers} onChange={setSceneNumbers} /></Row>}
          <Row label="Bold scene headings"><Switch on={boldHeadings} onChange={setBoldHeadings} /></Row>
          <Row label="Bold character names"><Switch on={boldCharacters} onChange={setBoldCharacters} /></Row>
          {format === 'pdf' && <Row label="Watermark" desc="Default set in Settings › PDF watermark"><input className="input" style={{ maxWidth: 260 }} value={watermark} placeholder="None" onChange={e => setWatermark(e.target.value)} /></Row>}
          {format === 'pdf' && <Row label="Revised pages only" desc={hasRevisions ? 'Just the pages with revisions, with their colour and date in the header — for issuing revision pages.' : 'Turn on revision mode (Production) to mark changes first.'}>
            <Switch on={revisedOnly && hasRevisions} onChange={v => hasRevisions && setRevisedOnly(v)} />
          </Row>}
        </div>
      )}
      <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>Industry format in Courier Prime, {s.paperSize === 'A4' ? 'A4' : 'US Letter'}, 1.5″ left margin — the same pages the page view shows.</p>
    </Modal>
  )
}

// ---------------------------------------------------------------- title page

function TitlePageModal() {
  const close = useModal(m => m.close)
  const script = useDoc(d => d.script)
  const name = useSettings(x => x.s.name)
  if (!script) return null
  const tp = script.titlePage
  const set = (p: Partial<TitlePage>) => useDoc.getState().update(s => ({ ...s, titlePage: { ...s.titlePage, ...p }, title: p.title ?? s.title }), { elementsChanged: false })
  const field = (k: keyof TitlePage, label: string, ph = '', area = false) => (
    <label className="field" key={k}><span>{label}</span>
      {area ? <textarea className="textarea" rows={3} value={String(tp[k])} placeholder={ph} onChange={e => set({ [k]: e.target.value })} />
        : <input className="input" value={String(tp[k])} placeholder={ph} onChange={e => set({ [k]: e.target.value })} />}
    </label>
  )
  return (
    <Modal title="Title page" icon="type" onClose={close} wide foot={<button className="btn" onClick={close}>Done</button>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>{field('title', 'Title')}</div>
        <div style={{ gridColumn: '1 / -1' }} className="col">
          <span className="eyebrow">Credits</span>
          {tp.credits.map((c, i) => (
            <div key={i} className="row">
              <select className="select" style={{ width: 170 }} value={c.role} onChange={e => set({ credits: tp.credits.map((x, k) => (k === i ? { ...x, role: e.target.value } : x)) })}>
                {CREDIT_ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
              <input className="input" value={c.names} placeholder={name || 'Names'} onChange={e => set({ credits: tp.credits.map((x, k) => (k === i ? { ...x, names: e.target.value } : x)) })} />
              {tp.credits.length > 1 && <button className="icon-btn" onClick={() => set({ credits: tp.credits.filter((_, k) => k !== i) })}><Icon name="close" /></button>}
            </div>
          ))}
          <button className="btn quiet sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ credits: [...tp.credits, { role: 'Story by', names: '' }] })}><Icon name="plus" size={13} />Add credit</button>
        </div>
        <div className="row" style={{ gridColumn: '1 / -1' }}><Switch on={tp.isAdaptation} onChange={v => set({ isAdaptation: v })} /><span>Based on another work</span></div>
        {tp.isAdaptation && <>
          <label className="field"><span>Source</span><select className="select" value={tp.sourceType} onChange={e => set({ sourceType: e.target.value })}>{SOURCE_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
          {field('sourceTitle', 'Source title')}
          {field('sourceAuthor', 'Source author')}
        </>}
        {field('draft', 'Draft', 'First draft')}
        {field('draftDate', 'Date', todayIso())}
        {field('contactName', 'Contact name', name)}
        {field('email', 'Email')}
        {field('phone', 'Phone')}
        {field('address', 'Address', '', true)}
        {field('representation', 'Agent / manager', '', true)}
        <label className="field"><span>Copyright</span>
          <div className="row">
            <input className="input" value={tp.copyright} placeholder={copyrightLines(tp, name)[0]} onChange={e => set({ copyright: e.target.value })} />
            <button className="btn ghost sm" title="Fill in a copyright line" onClick={e => openMenu(copyrightLines(tp, name).map(l => ({ label: l, run: () => set({ copyright: l }) })), e.currentTarget, 'right')}>
              <Icon name="wand" size={13} />Fill
            </button>
          </div>
        </label>
        {field('registration', 'Registration', 'WGA reg. no.')}
      </div>
    </Modal>
  )
}

/** Standard copyright notices for the writers on the title page (or you, if none yet). */
function copyrightLines(tp: TitlePage, fallback: string): string[] {
  const names = authorOf(tp) || tp.contactName.trim() || fallback.trim() || 'Your Name'
  const y = tp.draftDate.match(/\b(19|20)\d\d\b/)?.[0] ?? String(new Date().getFullYear())
  return [
    `© ${y} ${names}. All rights reserved.`,
    `Copyright © ${y} ${names}`,
    `© ${y} ${names}`,
    `© ${y} ${names}. No portion of this script may be reproduced without written permission.`,
  ]
}

// ---------------------------------------------------------------- versions

function VersionsModal() {
  const close = useModal(m => m.close)
  const script = useDoc(d => d.script)
  const [list, setList] = useState<VersionInfo[] | null>(null)
  const [name, setName] = useState('')
  const refresh = () => { if (script) void listVersions(script.id).then(setList) }
  useEffect(refresh, [script?.id])
  if (!script) return null
  return (
    <Modal title="Versions" icon="clock" onClose={close}>
      <div className="row" style={{ marginBottom: 16 }}>
        <input className="input" value={name} placeholder="Name this version — e.g. Draft for producers" onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget.nextSibling as HTMLButtonElement)?.click() }} />
        <button className="btn" onClick={async () => { await useDoc.getState().snapshot(name.trim() || 'Saved version'); setName(''); refresh(); toast('Version saved', 'clock') }}>Save version</button>
      </div>
      {list && list.length === 0 && <div className="empty-state"><Icon name="clock" size={22} /><h4>No versions yet</h4><p>Page One saves one automatically every 15 minutes of writing. Save your own any time with Ctrl+S.</p></div>}
      {list?.map(v => (
        <div key={v.path} className="list-row" style={{ cursor: 'default' }}>
          <Icon name="clock" />
          <span className="grow"><b style={{ fontWeight: 600 }}>{v.name}</b><span className="faint" style={{ display: 'block', fontSize: 11.5 }}>{new Date(v.time).toLocaleString()} · {v.pages} pages</span></span>
          <button className="btn ghost sm" onClick={() => confirmAction(`Restore “${v.name}”? Your current draft is saved as a version first.`, 'Restore', async () => {
            await useDoc.getState().snapshot('Before restoring')
            const old = await loadVersion(v)
            useDoc.getState().update(s => ({ ...s, elements: old.elements, titlePage: old.titlePage, extras: old.extras }))
            close(); toast(`Restored “${v.name}” — Ctrl+Z to undo`, 'undo')
          }, false)}>Restore</button>
          <button className="icon-btn" title="Delete" onClick={() => confirmAction(`Delete “${v.name}”?`, 'Delete', async () => { await deleteVersion(v); refresh() })}><Icon name="trash" /></button>
        </div>
      ))}
    </Modal>
  )
}

// ---------------------------------------------------------------- deadline

function DeadlineModal() {
  const close = useModal(m => m.close)
  const script = useDoc(d => d.script)
  const pages = useDoc(d => d.pagination?.pages.length ?? 0)
  const d = script?.extras.deadline
  const [date, setDate] = useState(d?.date ?? '')
  const [target, setTarget] = useState(d?.targetPages ?? 110)
  const [label, setLabel] = useState(d?.label ?? 'First draft')
  if (!script) return null
  const save = (clear = false) => {
    useDoc.getState().update(s => ({ ...s, extras: { ...s.extras, deadline: clear || !date ? null : { date, targetPages: target, label, startDate: d?.startDate || todayIso(), startPages: d?.startPages ?? pages } } }), { elementsChanged: false })
    close()
  }
  return (
    <Modal title="Deadline" icon="target" onClose={close}
      foot={<>{d && <button className="btn quiet" onClick={() => save(true)}>Remove</button>}<span className="spacer" /><button className="btn ghost" onClick={close}>Cancel</button><button className="btn" disabled={!date} onClick={() => save()}>Save</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>Page One works out how many pages a day you need, and whether you're ahead or behind.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <label className="field"><span>What</span><input className="input" value={label} onChange={e => setLabel(e.target.value)} /></label>
        <label className="field"><span>Finish by</span><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="field"><span>Target pages</span><input className="input" type="number" min={1} value={target} onChange={e => setTarget(Math.max(1, +e.target.value || 1))} /></label>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- sides

function SidesModal() {
  const close = useModal(m => m.close)
  const script = useDoc(d => d.script)
  const [sel, setSel] = useState<Set<string>>(new Set())
  if (!script) return null
  const names = characterNames(script.elements)
  return (
    <Modal title="Sides" icon="users" onClose={close}
      foot={<><button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn" disabled={!sel.size} onClick={async () => { await exportPdf(script, { titlePage: false, sceneNumbers: true, boldHeadings: useSettings.getState().s.boldHeadings, boldCharacters: useSettings.getState().s.boldCharacters, watermark: settingsWatermark(), names: sel }); close() }}>Export sides PDF</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>A PDF of only the scenes these characters are in, with the script's scene numbers.</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {names.map(n => {
          const on = sel.has(n)
          return <button key={n} className={'chip' + (on ? ' accent' : '')} style={{ height: 28, fontFamily: 'var(--font-script)', fontWeight: 700 }} onClick={() => { const s = new Set(sel); if (on) s.delete(n); else s.add(n); setSel(s) }}>{on && <Icon name="check" size={12} />}{n}</button>
        })}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- shortcuts & about

const SHORTCUTS: [string, string][] = [
  ['Enter / Tab', 'Next sensible element / cycle element type'], ['Shift+Tab', 'Previous element type'], ['Shift+Enter', 'Line break inside an element'],
  ['Ctrl+1 … Ctrl+0', 'Scene · Action · Character · Paren · Dialogue · Transition · Shot · Lyrics · Centered · Note'],
  ['Ctrl+Enter', 'New scene'], ['Alt+↑ / Alt+↓', 'Previous / next scene'], ['Ctrl+D', 'Dual dialogue'],
  ['Ctrl+K', 'Command palette'], ['Ctrl+F', 'Find and replace'], ['Ctrl+M', 'Pin a note'], ['Ctrl+Shift+K', 'Script Doctor'],
  ['Ctrl+S', 'Save a version'], ['Ctrl+E', 'Export PDF'], ['Ctrl+P', 'Print'], ['Ctrl+B', 'Navigator'], ['Ctrl+I', 'Inspector'],
  ['Alt+1 … Alt+6', 'Script · Cards · Page · Story · Board · Production'], ['Ctrl+Shift+P', 'Page view'], ['Ctrl+= / Ctrl+-', 'Zoom'],
  ['F11 or Ctrl+Shift+F', 'Focus mode'], ['Tab or →', 'Take the autocomplete'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+/', 'This list'],
]

function ShortcutsModal() {
  const close = useModal(m => m.close)
  return (
    <Modal title="Keyboard shortcuts" icon="command" onClose={close}>
      <table className="table"><tbody>{SHORTCUTS.map(([k, v]) => <tr key={k}><td style={{ width: 190 }}>{k.split(' ').map((p, i) => /^[A-Z+]|^[↑↓/=…-]/.test(p) && p !== '/' && p.length < 18 ? <span key={i}><span className="kbd">{p}</span> </span> : <span key={i}>{p} </span>)}</td><td className="muted">{v}</td></tr>)}</tbody></table>
    </Modal>
  )
}

function AboutModal() {
  return (
    <Modal title="Page One" onClose={() => useApp.getState().setAbout(false)}>
      <div className="row" style={{ gap: 16 }}>
        <Logo size={56} className="onboard-mark" />
        <div>
          <div style={{ fontWeight: 600 }}>Version 0.1 · desktop</div>
          <div className="muted">Write screenplays. Plan the story. Keep writing.</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Opens and saves the same files as Page One on your phone.</div>
        </div>
      </div>
    </Modal>
  )
}
