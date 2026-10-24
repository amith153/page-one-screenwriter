/** Production: revisions, the production lock, reports and sides. */
import { useMemo, useState } from 'react'
import { REVISION_COLORS, unlocked, type Script } from '../core/model'
import { scenes as scenesOf } from '../core/analysis'
import { breakdownCsv, breakdownTable, characterRows, charactersCsv, charactersTable, formatEighths, lock, locationRows, locationsCsv, locationsTable, omitScene, scenesCsv, scenesTable, todayIso, xray } from '../core/production'
import { currentLinesPerPage, useDoc } from '../state/doc'
import { exportCsv, exportReportPdf } from '../io/files'
import { Icon } from './Icon'
import { confirmAction, openMenu, toast, useModal, Switch } from './kit'

type Report = 'scenes' | 'characters' | 'locations' | 'breakdown'

export function Production() {
  const script = useDoc(d => d.script)
  const p = useDoc(d => d.pagination)
  const [report, setReport] = useState<Report>('scenes')
  const xs = useMemo(() => (script && p ? xray(script, p, currentLinesPerPage()) : []), [script, p])
  if (!script || !p) return null
  const update = useDoc.getState().update
  const lk = script.extras.lock
  const used = [...new Set(script.elements.map(e => e.revision).filter(r => r > 0))].sort()

  /** Each revision set starts from a saved draft, so Changes can show exactly what it altered. */
  const baseline = (level: number) => void useDoc.getState().snapshot(`Before ${REVISION_COLORS[level]?.label} revisions`)
  const setLevel = (level: number) => update(s => ({ ...s, revisionLevel: level, revisionDates: { ...s.revisionDates, [String(level)]: s.revisionDates[String(level)] || todayIso() } }), { elementsChanged: false })

  return (
    <div className="story">
      <h1 className="display" style={{ fontSize: 30, margin: '0 0 22px' }}>Production</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="panel">
          <div className="row"><h3>Revisions</h3><span className="spacer" />
            <Switch on={script.revisionMode} label="Revision mode" onChange={on => { if (on) baseline(script.revisionLevel || 1); update(s => ({ ...s, revisionMode: on }), { elementsChanged: false }); if (on) setLevel(script.revisionLevel || 1) }} />
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>{script.revisionMode ? `New edits are marked ${REVISION_COLORS[script.revisionLevel]?.label} with an asterisk in the margin.` : 'Turn on to mark changed lines with asterisks and coloured pages, the way production expects.'}
            {' '}<button className="link-btn" onClick={() => useDoc.getState().setPanel('changes')}>See every change word by word</button></p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {REVISION_COLORS.slice(1).map((c, i) => (
              <button key={c.label} className={'chip' + (script.revisionLevel === i + 1 ? ' accent' : '')} onClick={() => { if (script.revisionMode && script.revisionLevel !== i + 1) baseline(i + 1); setLevel(i + 1) }}>
                <span className="dot" style={{ background: c.hex }} />{c.label}
                {script.revisionDates[String(i + 1)] && <span className="faint">· {script.revisionDates[String(i + 1)]}</span>}
              </button>
            ))}
          </div>
          {used.length > 0 && (
            <div className="row" style={{ marginTop: 14 }}>
              <span className="faint" style={{ fontSize: 12 }}>{script.elements.filter(e => e.revision > 0).length} revised lines</span>
              <span className="spacer" />
              <button className="btn quiet sm" onClick={() => confirmAction('Clear every revision mark? The text stays as it is.', 'Clear marks', () => update(s => ({ ...s, elements: s.elements.map(e => (e.revision ? { ...e, revision: 0 } : e)) })))}>Clear marks</button>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="row"><h3>Production lock</h3><span className="spacer" />{lk.locked && <span className="chip accent"><Icon name="lock" size={11} />Locked {new Date(lk.lockedAt).toLocaleDateString()}</span>}</div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            {lk.locked ? 'Scene numbers and page breaks are frozen. New scenes get A-numbers (12A), overflowing pages become A-pages (34A), and deleted scenes stay as OMITTED.'
              : 'Freeze scene numbers and page breaks once the script goes into production.'}
          </p>
          {lk.locked ? (
            <div className="row">
              <button className="btn ghost sm" onClick={() => confirmAction('Unlock the script? Scenes and pages will be renumbered from 1.', 'Unlock', () => update(s => ({ ...s, extras: { ...s.extras, lock: unlocked() } }), { elementsChanged: false }))}><Icon name="unlock" size={13} />Unlock</button>
              <select className="select" style={{ width: 'auto', minHeight: 26, height: 26, padding: '0 8px', fontSize: 12 }} value="" onChange={e => {
                const id = Number(e.target.value)
                if (id) confirmAction('Omit this scene? Its number stays, marked OMITTED.', 'Omit scene', () => update(s => ({ ...s, elements: omitScene(s.elements, id) })))
              }}>
                <option value="">Omit a scene…</option>
                {scenesOf(script.elements).filter(s => s.heading !== 'OMITTED').map(s => <option key={s.elementId} value={s.elementId}>{useDoc.getState().sceneLabels.get(s.elementId)}. {s.heading}</option>)}
              </select>
            </div>
          ) : (
            <button className="btn sm" onClick={() => { update(s => ({ ...s, extras: { ...s.extras, lock: lock(s.elements, p) } }), { elementsChanged: false }); toast('Script locked — scene numbers and pages are frozen', 'lock') }}><Icon name="lock" size={13} />Lock pages & scenes</button>
          )}
        </div>
      </div>

      <div className="row" style={{ margin: '34px 0 14px' }}>
        <h2 className="display" style={{ margin: 0, fontSize: 24 }}>Reports</h2>
        <span className="spacer" />
        <div className="seg">
          {REPORTS.map(r => <button key={r} className={report === r ? 'is-on' : ''} onClick={() => setReport(r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}
        </div>
        <button className="btn ghost sm" onClick={() => exportReport(script, xs, report)}><Icon name="export" size={13} />CSV</button>
        <button className="btn ghost sm" onClick={e => openMenu([
          { label: `${TITLES[report]} report`, icon: 'page', run: () => void reportPdf(script, xs, [report]) },
          { label: 'All four reports in one PDF', icon: 'layers', run: () => void reportPdf(script, xs, REPORTS) },
        ], e.currentTarget, 'right')}><Icon name="page" size={13} />PDF</button>
        <button className="btn ghost sm" onClick={() => useModal.getState().open('sides')}><Icon name="users" size={13} />Sides…</button>
      </div>
      <ReportTable script={script} xs={xs} report={report} />
    </div>
  )
}

const REPORTS: Report[] = ['scenes', 'characters', 'locations', 'breakdown']
const TITLES: Record<Report, string> = { scenes: 'Scenes', characters: 'Characters', locations: 'Locations', breakdown: 'Breakdown' }

function reportPdf(script: Script, xs: ReturnType<typeof xray>, which: Report[]) {
  const table = (r: Report) => {
    const rows = r === 'scenes' ? scenesTable(script, xs) : r === 'characters' ? charactersTable(characterRows(script, xs))
      : r === 'locations' ? locationsTable(locationRows(xs)) : breakdownTable(script, xs)
    return { title: TITLES[r], headers: rows[0], rows: rows.slice(1) }
  }
  const pages = useDoc.getState().pagination?.pages.length ?? 0
  const sub = `${which.length === 1 ? TITLES[which[0]] + ' report' : 'Production reports'} · ${pages} pages · ${xs.length} scenes · ${todayIso()}`
  return exportReportPdf(`${script.title} — ${which.length === 1 ? TITLES[which[0]].toLowerCase() : 'production reports'}`, sub, which.map(table))
    .catch(e => toast('Could not make the PDF — ' + (e as Error).message, 'close'))
}

function exportReport(script: Script, xs: ReturnType<typeof xray>, report: Report) {
  const name = `${script.title} — ${report}`
  if (report === 'scenes') return exportCsv(name, scenesCsv(script, xs))
  if (report === 'characters') return exportCsv(name, charactersCsv(characterRows(script, xs)))
  if (report === 'locations') return exportCsv(name, locationsCsv(locationRows(xs)))
  return exportCsv(name, breakdownCsv(script, xs))
}

function ReportTable({ script, xs, report }: { script: Script; xs: ReturnType<typeof xray>; report: Report }) {
  const jump = (id: number) => useDoc.getState().jumpTo(id)
  if (report === 'scenes') return (
    <table className="table"><thead><tr><th>Sc.</th><th>Page</th><th>I/E</th><th>Location</th><th>Time</th><th>Length</th><th>Characters</th></tr></thead>
      <tbody>{xs.map(x => (
        <tr key={x.headingId} onClick={() => jump(x.headingId)} style={{ cursor: 'pointer' }}>
          <td className="tabular">{x.label}</td><td className="tabular">{x.page}</td><td>{x.intExt}</td><td className="mono">{x.location}</td><td>{x.time}</td>
          <td className="tabular">{formatEighths(x.eighths)}</td><td className="muted">{[...x.speaking, ...x.mentioned].join(', ')}</td>
        </tr>))}</tbody></table>
  )
  if (report === 'characters') return (
    <table className="table"><thead><tr><th>Character</th><th>Speeches</th><th>Words</th><th>Scenes</th><th>Pages</th><th>First – last</th></tr></thead>
      <tbody>{characterRows(script, xs).map(r => (
        <tr key={r.name}><td className="mono">{r.name}</td><td className="tabular">{r.lines}</td><td className="tabular">{r.words}</td><td className="tabular">{r.scenes.length}</td>
          <td className="tabular">{formatEighths(r.eighths)}</td><td className="tabular">p.{r.first} – {r.last}</td></tr>))}</tbody></table>
  )
  if (report === 'locations') return (
    <table className="table"><thead><tr><th>Location</th><th>Scenes</th><th>Pages</th><th>I/E</th><th>Times</th></tr></thead>
      <tbody>{locationRows(xs).map(r => (
        <tr key={r.name}><td className="mono">{r.name}</td><td className="tabular">{r.scenes.join(' ')}</td><td className="tabular">{formatEighths(r.eighths)}</td><td>{r.intExt.join('/')}</td><td>{r.times.join(', ')}</td></tr>))}</tbody></table>
  )
  return (
    <table className="table"><thead><tr><th>Sc.</th><th>Heading</th><th>Length</th><th>Cast</th><th>Props</th><th>Wardrobe</th><th>Other</th></tr></thead>
      <tbody>{xs.map(x => {
        const m = script.extras.scenes[String(x.headingId)]?.breakdown ?? {}
        const other = Object.entries(m).filter(([k]) => !['CAST', 'PROPS', 'WARDROBE'].includes(k)).flatMap(([, v]) => v ?? [])
        return (
          <tr key={x.headingId} onClick={() => jump(x.headingId)} style={{ cursor: 'pointer' }}>
            <td className="tabular">{x.label}</td><td className="mono">{x.heading}</td><td className="tabular">{formatEighths(x.eighths)}</td>
            <td>{[...new Set([...(m.CAST ?? []), ...x.speaking])].join(', ')}</td><td>{(m.PROPS ?? []).join(', ')}</td><td>{(m.WARDROBE ?? []).join(', ')}</td><td className="muted">{other.join(', ')}</td>
          </tr>
        )
      })}</tbody></table>
  )
}
