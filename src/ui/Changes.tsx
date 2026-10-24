/**
 * Track changes: compare the draft with any saved version — what was added, cut and rewritten,
 * word by word — then turn those changes into the current revision colour in one step.
 */
import { useEffect, useMemo, useState } from 'react'
import { REVISION_COLORS, TYPE_INFO, type Script } from '../core/model'
import { diffScripts, summarize, type Change } from '../core/diff'
import { todayIso } from '../core/production'
import { isBaseline, listVersions, loadVersion, type VersionInfo } from '../state/library'
import { useChanges } from '../state/changes'
import { useDoc } from '../state/doc'
import { Icon } from './Icon'
import { Switch, toast } from './kit'

const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Revision baselines first, then the newest version. */
const pickDefault = (list: VersionInfo[]) => list.find(v => isBaseline(v.name)) ?? list[0]

export function ChangesTab({ script }: { script: Script }) {
  const base = useChanges(c => c.base)
  const show = useChanges(c => c.show)
  const pages = useDoc(d => d.pagination?.pages.length ?? 0)
  const [versions, setVersions] = useState<VersionInfo[] | null>(null)

  const choose = async (v: VersionInfo | undefined) => {
    if (!v) { useChanges.getState().setBase(null); return }
    const old = await loadVersion(v)
    useChanges.getState().setBase({ elements: old.elements, name: v.name, time: v.time, pages: v.pages, path: v.path })
  }
  const refresh = async (select?: (l: VersionInfo[]) => VersionInfo | undefined) => {
    const list = await listVersions(script.id)
    setVersions(list)
    if (select) await choose(select(list))
    return list
  }
  useEffect(() => { void refresh(base ? undefined : pickDefault) }, [script.id])

  const changes = useMemo(() => (base ? diffScripts(base.elements, script.elements) : []), [base, script.elements])
  const sum = useMemo(() => (base ? summarize(changes, base.elements, script.elements) : null), [changes, base, script.elements])
  const level = script.revisionLevel || 1
  const color = REVISION_COLORS[level]

  const markBaseline = async () => {
    await useDoc.getState().snapshot(`Baseline ${todayIso()}`)
    await refresh(l => l[0])
    toast('Baseline saved — changes from here on are tracked', 'clock')
  }

  /** Changed and added lines take the current revision colour, as if revision mode had been on. */
  const markRevisions = () => {
    const ids = new Set(changes.filter(c => c.kind !== 'removed').map(c => c.id))
    useDoc.getState().update(s => ({
      ...s,
      elements: s.elements.map(e => (ids.has(e.id) && e.revision !== level ? { ...e, revision: level } : e)),
      revisionDates: { ...s.revisionDates, [String(level)]: s.revisionDates[String(level)] || todayIso() },
    }))
    toast(`${ids.size} lines marked as ${color?.label} revisions`, 'revision')
  }

  if (versions && versions.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="revision" size={22} />
        <h4>Nothing to compare yet</h4>
        <p>Save a baseline, keep writing, and every word you add, cut or rewrite shows up here.</p>
        <button className="btn sm" style={{ marginTop: 8 }} onClick={markBaseline}>Save a baseline now</button>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 10 }}>
      <label className="field">
        <span>Compare with</span>
        <select className="select" value={base?.path ?? ''} onChange={e => void choose(versions?.find(v => v.path === e.target.value))}>
          {!base && <option value="">Choose a version…</option>}
          {versions?.map(v => <option key={v.path} value={v.path}>{v.name} — {when(v.time)}</option>)}
        </select>
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <Switch on={show} label="Show changes in the script" onChange={on => useChanges.getState().setShow(on)} />
        <span style={{ fontSize: 12.5 }}>Show in the script</span>
        <span className="spacer" />
        <button className="btn quiet sm" onClick={markBaseline} title="Start tracking from the draft as it is now"><Icon name="clock" size={13} />New baseline</button>
      </div>

      {sum && base && (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 14 }}>
            <div className="stat"><b className="chg-plus">+{sum.wordsAdded.toLocaleString()}</b><span>words added</span></div>
            <div className="stat"><b className="chg-minus">−{sum.wordsRemoved.toLocaleString()}</b><span>words cut</span></div>
            <div className="stat"><b>{sum.scenesTouched}</b><span>scenes touched</span></div>
          </div>
          <p className="faint" style={{ fontSize: 12, margin: '10px 0 0' }}>
            {base.pages ? `${base.pages} → ${pages} pages · ` : ''}{sum.added} lines added, {sum.removed} cut, {sum.changed} rewritten
            {sum.scenesAdded + sum.scenesRemoved > 0 && ` · ${sum.scenesAdded} new scenes, ${sum.scenesRemoved} cut`}
          </p>
          {changes.some(c => c.kind !== 'removed') && (
            <button className="btn ghost sm" style={{ marginTop: 12, width: '100%' }} onClick={markRevisions}>
              <span className="dot" style={{ background: color?.hex }} />Mark these changes as {color?.label} revisions
            </button>
          )}
          <div className="section" style={{ paddingLeft: 0, paddingRight: 0, marginTop: 8 }}>
            {changes.length === 0 && <div className="empty-state" style={{ padding: 20 }}><Icon name="check" size={20} /><h4>No changes</h4><p>The draft matches “{base.name}”.</p></div>}
            {changes.slice(0, 300).map(c => <ChangeCard key={`${c.kind}-${c.id}`} c={c} />)}
            {changes.length > 300 && <p className="faint" style={{ fontSize: 12 }}>…and {changes.length - 300} more.</p>}
          </div>
        </>
      )}
    </div>
  )
}

function ChangeCard({ c }: { c: Change }) {
  const target = c.kind === 'removed' ? c.before : c.id
  return (
    <button className={'chg-card ' + c.kind} onClick={() => target != null && useDoc.getState().jumpTo(target)}>
      <span className="chg-card-head">
        <span className="chg-kind">{c.kind === 'added' ? 'Added' : c.kind === 'removed' ? 'Cut' : 'Rewritten'}</span>
        <span className="faint">{TYPE_INFO[c.type].label}</span>
      </span>
      <span className="chg-text">
        {c.ops.length === 0 ? <em className="faint">(empty line)</em> : c.ops.map((o, i) => (
          o.kind === 'same' ? <span key={i}>{o.text}</span> : o.kind === 'ins' ? <ins key={i}>{o.text}</ins> : <del key={i}>{o.text}</del>
        ))}
      </span>
    </button>
  )
}
