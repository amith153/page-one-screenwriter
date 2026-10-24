/**
 * Writing together, two ways. Live, Overleaf-style: share a script with a join code, see who's here
 * and where, and follow every edit in the history (the same codes work in Page One on the phone).
 * Or pass drafts: send a file, get theirs back, and merge it change by change.
 */
import { useEffect, useMemo, useState } from 'react'
import { argbHex, pretty } from '../collab/hub'
import { authorOf, TYPE_INFO, type Element } from '../core/model'
import { alignIds, applyMerge, diffWords, planMerge, type MergeOp, type Resolution } from '../core/merge'
import { scriptFromJson } from '../core/codec'
import { parseFountain } from '../core/fountain'
import { parseFdx } from '../core/fdx'
import { exportPageOne, IMPORT_FILTERS } from '../io/files'
import { pickFile } from '../platform/fs'
import { listVersions, loadVersion, saveVersion, type VersionInfo } from '../state/library'
import { useCollab } from '../state/collab'
import { useDoc } from '../state/doc'
import { useSettings } from '../state/settings'
import { useApp } from './appState'
import { Icon } from './Icon'
import { confirmAction, Modal, Switch, toast, useModal } from './kit'

const initials = (n: string) => n.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Co-writers' faces in the title bar, and the Share button. */
export function CollabButton() {
  const script = useDoc(d => d.script)
  const status = useCollab(c => c.status)
  const peers = useCollab(c => c.peers)
  const elements = useDoc(d => d.script?.elements)
  if (!script) return null
  const live = status?.kind === 'live'
  return (
    <div className="collab-pill no-drag">
      {peers.slice(0, 4).map(p => (
        <button key={p.uid} className="avatar peer" style={{ background: argbHex(p.color) }} title={`${p.name} — ${p.elementId != null ? 'writing here · click to go there' : 'online'}`}
          onClick={() => { if (p.elementId != null && elements?.some(e => e.id === p.elementId)) useDoc.getState().jumpTo(p.elementId) }}>
          {initials(p.name)}
        </button>
      ))}
      {peers.length > 4 && <span className="avatar peer more">+{peers.length - 4}</span>}
      <button className={'btn sm ' + (live ? 'live' : 'ghost')} title="Share and co-write" onClick={() => useModal.getState().open('share')}>
        <Icon name={live ? 'live' : 'share'} size={13} />{live ? 'Live' : status?.kind === 'connecting' ? 'Connecting…' : 'Share'}
      </button>
    </div>
  )
}

type ShareTab = 'live' | 'drafts'

export function ShareModal() {
  const close = useModal(m => m.close)
  const script = useDoc(d => d.script)
  const configured = useCollab(c => c.configured)()
  const name = useSettings(x => x.s.name)
  const setSettings = useSettings(x => x.set)
  const [tab, setTab] = useState<ShareTab>(configured ? 'live' : 'drafts')
  if (!script) return null
  return (
    <Modal title="Write together" icon="users" onClose={close} wide>
      <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="seg">
          <button className={tab === 'live' ? 'is-on' : ''} onClick={() => setTab('live')}><Icon name="live" size={14} />Live co-writing</button>
          <button className={tab === 'drafts' ? 'is-on' : ''} onClick={() => setTab('drafts')}><Icon name="layers" size={14} />Pass drafts</button>
        </div>
        <span className="spacer" />
        <span className="eyebrow">You appear as</span>
        <input className="input sm" style={{ maxWidth: 180 }} value={name} placeholder="Your name" onChange={e => setSettings({ name: e.target.value })} />
      </div>
      {tab === 'live' ? <LiveTab /> : <DraftsTab />}
    </Modal>
  )
}

function LiveTab() {
  const script = useDoc(d => d.script)!
  const c = useCollab()
  const name = useSettings(x => x.s.name)
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!c.configured()) return <LiveUnavailable />
  const live = c.isLive(script.id) && c.scriptId === script.id

  const makeCode = async () => {
    setBusy(true)
    try { setCode(await c.newCode()) } catch (e) { toast((e as Error).message, 'close') } finally { setBusy(false) }
  }
  const invite = code && `Let's write “${script.title}” together in Page One.\n\nJoin code: ${pretty(code)}\n\nOpen Page One → tap Join (the person-plus icon) → type the code.\nOr tap: pageone://join/${code}`

  return (
      <>
        <div className="share-top">
          <div className="grow">
            <div className="row"><b>Live co-writing</b>{live && <StatusChip />}</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>Everyone with the code edits this script at the same time — on desktop or in Page One on the phone. Edits merge line by line.</div>
          </div>
          <Switch on={live} onChange={v => { if (v) c.goLive(); else c.stopLive() }} label="Live co-writing" />
        </div>
        {c.status?.kind === 'error' && <div className="callout warn"><Icon name="close" size={14} />{c.status.message}</div>}

        <div className="share-grid">
          <div className="panel share-card">
            <h3>Invite a co-writer</h3>
            {code ? <>
              <div className="join-code tabular">{pretty(code)}</div>
              <div className="faint" style={{ fontSize: 11.5 }}>Works for 7 days. Each invite gets its own code.</div>
              <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={() => { void navigator.clipboard.writeText(pretty(code)); toast('Code copied', 'copy') }}><Icon name="copy" size={13} />Copy code</button>
                <button className="btn ghost sm" onClick={() => { void navigator.clipboard.writeText(invite!); toast('Invite copied — paste it into a message', 'copy') }}><Icon name="share" size={13} />Copy invite</button>
                <button className="btn quiet sm" disabled={busy} onClick={makeCode}>New code</button>
              </div>
            </> : <>
              <p className="muted" style={{ fontSize: 12.5 }}>Make a short code to send. Your co-writer types it into Page One — desktop or phone.</p>
              <button className="btn" disabled={busy} onClick={makeCode}><Icon name="plus" size={14} />{busy ? 'Making a code…' : 'Make a join code'}</button>
            </>}
          </div>
          <div className="panel share-card">
            <h3><Icon name="phone" size={13} /> Your phone</h3>
            <p className="muted" style={{ fontSize: 12.5 }}>To carry on writing this script on your phone, make a code here, then in <b>Page One</b> on the phone tap <b>Join</b> and type it. Phone and desktop then stay in sync live.</p>
          </div>
        </div>

        {live && <>
          <div className="section-title" style={{ marginTop: 18 }}>Here now</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <span className="chip"><span className="avatar mini" style={{ background: 'var(--accent)' }}>{initials(name || 'Me')}</span>You</span>
            {c.peers.map(p => <span key={p.uid} className="chip"><span className="avatar mini" style={{ background: argbHex(p.color) }}>{initials(p.name)}</span>{p.name}</span>)}
            {c.peers.length === 0 && <span className="faint" style={{ fontSize: 12 }}>Nobody else yet.</span>}
          </div>
          <History />
        </>}
      </>
  )
}

// ---------------------------------------------------------------- passing drafts back and forth

const SENT = /^Sent draft/
const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

interface Incoming { file: string; from: string; elements: Element[] }

/**
 * Line a draft from elsewhere up with the draft that was sent ([reference]); lines it doesn't know
 * get a second chance against the current draft ([local]), for drafts newer than the one sent.
 */
function lineUp(reference: readonly Element[], local: readonly Element[], incoming: readonly Element[]): Element[] {
  const first = alignIds(reference, incoming)
  const known = new Set(reference.map(e => e.id))
  const mine = new Set(local.map(e => e.id))
  const used = new Set(first.map(e => e.id))
  const second = alignIds(local, first)
  return first.map((e, i) => {
    const id = second[i].id
    if (known.has(e.id) || !mine.has(id) || used.has(id)) return e
    used.add(id)
    return { ...e, id }
  })
}

/** Read a draft file (Page One, Fountain or Final Draft) as elements that line up with [reference]. */
async function readDraft(reference: readonly Element[], local: readonly Element[]): Promise<Incoming | null> {
  const f = await pickFile(IMPORT_FILTERS)
  if (!f) return null
  const text = await f.read()
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  const base = f.name.replace(/\.[^.]+$/, '')
  if (ext === 'pageone' || ext === 'json') {
    const s = scriptFromJson(text)
    // A Page One draft keeps its line ids; one that shares few of ours is another script — line it up by text.
    const known = new Set(reference.map(e => e.id))
    const shared = s.elements.filter(e => known.has(e.id)).length
    const elements = shared >= Math.min(s.elements.length, reference.length) * 0.3 ? s.elements : lineUp(reference, local, s.elements)
    return { file: f.name, from: authorOf(s.titlePage) || base, elements }
  }
  const parsed = ext === 'fdx' ? parseFdx(text) : parseFountain(text)
  return { file: f.name, from: authorOf(parsed.titlePage) || base, elements: lineUp(reference, local, parsed.elements) }
}

function DraftsTab() {
  const script = useDoc(d => d.script)!
  const pages = useDoc(d => d.pagination?.pages.length ?? 0)
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [incoming, setIncoming] = useState<Incoming | null>(null)
  const refresh = () => listVersions(script.id).then(l => { setVersions(l); return l })
  useEffect(() => { void listVersions(script.id).then(setVersions) }, [script.id])
  const lastSent = versions.find(v => SENT.test(v.name))

  const send = async () => {
    await saveVersion(script, `Sent draft · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, pages)
    await refresh()
    await exportPageOne(script)
  }
  const receive = async () => {
    try {
      const list = await refresh()
      const base = list.find(v => SENT.test(v.name)) ?? list[0]
      const got = await readDraft(base ? (await loadVersion(base)).elements : script.elements, script.elements)
      if (got) setIncoming(got)
    } catch (e) { toast('Could not read that draft — ' + (e as Error).message, 'close') }
  }

  if (incoming) return <MergeReview incoming={incoming} versions={versions} onBack={() => setIncoming(null)} />
  return <>
    <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>No connection needed. Send your draft as a file; your co-writer works on it in Page One (or Final Draft, Fade In, Highland…); then merge their draft back in, choosing what to keep change by change.</p>
    <div className="share-grid">
      <div className="panel share-card">
        <h3><Icon name="export" size={13} /> Send this draft</h3>
        <p className="muted" style={{ fontSize: 12.5 }}>Saves a <b>.pageone</b> file to send by email or chat, and keeps a copy of the draft as it left — so when it comes back, Page One can tell what <i>they</i> changed from what <i>you</i> changed since.</p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => void send()}><Icon name="export" size={14} />Save draft to send</button>
          <button className="btn quiet sm" onClick={() => useModal.getState().open('export')}>Other formats…</button>
        </div>
        {lastSent && <div className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>Last sent {when(lastSent.time)}</div>}
      </div>
      <div className="panel share-card">
        <h3><Icon name="import" size={13} /> Merge a draft back in</h3>
        <p className="muted" style={{ fontSize: 12.5 }}>Open the draft they sent back — <b>.pageone</b>, Fountain or Final Draft. Every change is listed before anything happens: accept it, turn it down, or where you both changed a line, keep yours, take theirs or keep both.</p>
        <button className="btn" onClick={() => void receive()}><Icon name="import" size={14} />Open their draft…</button>
      </div>
    </div>
  </>
}

const Words = ({ before, after }: { before: string; after: string }) => (
  <>{diffWords(before, after).map((p, i) => (p.op === 'SAME' ? <span key={i}>{p.text}</span> : p.op === 'ADDED' ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>))}</>
)
const KIND: Record<MergeOp['kind'], string> = { change: 'Changed', add: 'Added', delete: 'Cut', conflict: 'You both changed' }

function MergeReview({ incoming, versions, onBack }: { incoming: Incoming; versions: VersionInfo[]; onBack: () => void }) {
  const script = useDoc(d => d.script)!
  const [basePath, setBasePath] = useState(() => (versions.find(v => SENT.test(v.name)) ?? versions[0])?.path ?? '')
  const [base, setBase] = useState<{ path: string; elements: Element[] | null } | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())
  const [resolutions, setResolutions] = useState<Map<number, Resolution>>(new Map())
  useEffect(() => {
    const v = versions.find(x => x.path === basePath)
    void (v ? loadVersion(v).then(s => s.elements) : Promise.resolve(null)).then(elements => setBase({ path: basePath, elements }))
  }, [basePath, versions])
  const ready = base?.path === basePath
  const ops = useMemo(() => (ready ? planMerge(base!.elements, script.elements, incoming.elements) : []), [ready, base, script.elements, incoming.elements])
  // Their changes start accepted; lines you both changed start as "keep both".
  useEffect(() => { setAccepted(new Set(ops.filter(o => o.kind !== 'conflict').map(o => o.id))); setResolutions(new Map()) }, [ops])
  const count = (k: MergeOp['kind']) => ops.filter(o => o.kind === k).length
  const toggle = (id: number) => { const s = new Set(accepted); if (s.has(id)) s.delete(id); else s.add(id); setAccepted(s) }
  const taking = ops.filter(o => o.kind === 'conflict' || accepted.has(o.id)).length

  const apply = async (whole: boolean) => {
    await useDoc.getState().snapshot(`Before merging ${incoming.from}'s draft`)
    const elements = whole ? incoming.elements : applyMerge(base?.elements ?? null, script.elements, incoming.elements, ops, accepted, resolutions, incoming.from).elements
    useDoc.getState().update(s => ({ ...s, elements }))
    toast(`${whole ? 'Replaced with' : 'Merged'} ${incoming.from}'s draft — your own is saved under Versions`, 'check')
    useModal.getState().close()
  }

  return <>
    <div className="row" style={{ alignItems: 'flex-end', marginBottom: 14, gap: 14 }}>
      <div className="grow">
        <b>{incoming.from}'s draft</b> <span className="faint">· {incoming.file}</span>
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {(['change', 'add', 'delete', 'conflict'] as const).map(k => <span key={k} className={'chip' + (k === 'conflict' && count(k) ? ' accent' : '')}>{count(k)} {KIND[k].toLowerCase()}</span>)}
        </div>
      </div>
      <label className="field" style={{ width: 280 }}><span>Compared with the draft you sent</span>
        <select className="select" value={basePath} onChange={e => setBasePath(e.target.value)}>
          {versions.map(v => <option key={v.path} value={v.path}>{v.name} — {when(v.time)}</option>)}
          <option value="">None — every difference is a choice</option>
        </select>
      </label>
    </div>
    {ready && ops.length === 0 && <div className="empty-state"><Icon name="check" size={22} /><h4>Nothing new in this draft</h4><p>Their draft has nothing you don't already have.</p></div>}
    {ops.length > 0 && <>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="section-title" style={{ margin: 0 }}>Their changes</span><span className="spacer" />
        <button className="btn quiet sm" onClick={() => setAccepted(new Set(ops.filter(o => o.kind !== 'conflict').map(o => o.id)))}>Accept all</button>
        <button className="btn quiet sm" onClick={() => setAccepted(new Set())}>Turn all down</button>
      </div>
      <div className="merge-list">
        {ops.map(o => (
          <div key={o.kind + o.id} className={'merge-row ' + o.kind + (o.kind !== 'conflict' && !accepted.has(o.id) ? ' is-off' : '')}>
            {o.kind === 'conflict' ? (
              <div className="seg merge-pick">
                {(['mine', 'theirs', 'both'] as Resolution[]).map(r => (
                  <button key={r} className={(resolutions.get(o.id) ?? 'both') === r ? 'is-on' : ''} onClick={() => setResolutions(new Map(resolutions).set(o.id, r))}>
                    {r === 'mine' ? 'Mine' : r === 'theirs' ? 'Theirs' : 'Both'}
                  </button>
                ))}
              </div>
            ) : <Switch on={accepted.has(o.id)} onChange={() => toggle(o.id)} label="Accept this change" />}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="merge-kind">{KIND[o.kind]} · {TYPE_INFO[(o.kind === 'delete' ? o.mine : o.theirs).type].label}</div>
              {o.kind === 'change' && <div className="merge-diff"><Words before={o.mine.text} after={o.theirs.text} /></div>}
              {o.kind === 'add' && <div className="merge-diff"><ins>{o.theirs.text || '(blank line)'}</ins></div>}
              {o.kind === 'delete' && <div className="merge-diff"><del>{o.mine.text || '(blank line)'}</del></div>}
              {o.kind === 'conflict' && <>
                <div className="merge-diff"><span className="merge-who">Yours</span>{o.mine.text}</div>
                <div className="merge-diff"><span className="merge-who">Theirs</span>{o.theirs.text}</div>
              </>}
            </div>
          </div>
        ))}
      </div>
    </>}
    <div className="row" style={{ marginTop: 16, flexWrap: 'wrap' }}>
      <button className="btn quiet" onClick={onBack}>Back</button>
      <span className="spacer" />
      <button className="btn ghost" onClick={() => confirmAction(`Replace your draft with ${incoming.from}'s? Yours is saved as a version first.`, 'Replace', () => apply(true), false)}>Take their whole draft</button>
      <button className="btn" disabled={!ready || ops.length === 0} onClick={() => void apply(false)}><Icon name="check" size={14} />Merge {taking} of {ops.length}</button>
    </div>
    <p className="faint" style={{ fontSize: 11.5, marginBottom: 0 }}>“Both” keeps your line with theirs in a note right under it. Before anything changes, your draft is saved under Versions.</p>
  </>
}

function StatusChip() {
  const st = useCollab(c => c.status)
  if (!st) return null
  return <span className={'chip live-chip ' + st.kind}>{st.kind === 'live' ? <><span className="live-dot" />Live</> : st.kind === 'connecting' ? 'Connecting…' : 'Offline'}</span>
}

function History() {
  const changes = useCollab(c => c.changes)
  const me = useCollab(c => c.uid)
  const elements = useDoc(d => d.script?.elements ?? [])
  const [mine, setMine] = useState(false)
  const list = changes.filter(c => mine || c.uid !== me).slice(0, 80)
  return <>
    <div className="row" style={{ marginTop: 18 }}>
      <div className="section-title" style={{ margin: 0 }}>History</div>
      <span className="spacer" />
      <button className={'chip' + (mine ? ' accent' : '')} onClick={() => setMine(!mine)}>Include mine</button>
    </div>
    {list.length === 0 && <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Edits by co-writers show up here.</div>}
    <div className="history">
      {list.map(h => {
        const exists = elements.some(e => e.id === h.elementId)
        return (
          <div key={h.id} className="hist-row" onClick={() => { if (exists) { useDoc.getState().jumpTo(h.elementId); useModal.getState().close() } }} style={{ cursor: exists ? 'pointer' : 'default' }}>
            <span className="avatar mini" style={{ background: argbHex(h.color) }}>{initials(h.name)}</span>
            <div className="grow">
              <div style={{ fontSize: 12 }}><b>{h.name}</b> <span className="faint">{h.kind === 'add' ? 'added' : h.kind === 'delete' ? 'deleted' : h.kind === 'format' ? 'changed a line to' : 'edited'} · {ago(h.at)}</span></div>
              {h.kind === 'edit' ? <div className="hist-diff"><del>{h.before}</del> <ins>{h.after}</ins></div>
                : <div className="hist-diff">{h.kind === 'delete' ? <del>{h.before}</del> : h.kind === 'format' ? `${h.before} → ${h.after}` : <ins>{h.after}</ins>}</div>}
            </div>
            {h.kind === 'edit' && exists && h.uid !== me && (
              <button className="btn quiet sm" title="Put this line back as it was" onClick={e => {
                e.stopPropagation()
                useDoc.getState().update(s => ({ ...s, elements: s.elements.map(x => (x.id === h.elementId ? { ...x, text: h.before, orig: null } : x)) }))
                toast('Line restored', 'undo')
              }}>Revert</button>
            )}
          </div>
        )
      })}
    </div>
  </>
}

/** A copy of Page One built without a live-sync server (built from source without keys, say). */
export function LiveUnavailable() {
  return (
    <div className="callout"><Icon name="cloud" size={15} />
      <span>Live co-writing isn't switched on in this copy of Page One. You can still write together by passing drafts back and forth.</span>
    </div>
  )
}

/** "Join a script" — from the library. */
export function JoinModal() {
  const close = useModal(m => m.close)
  const join = useCollab(c => c.join)
  const configured = useCollab(c => c.configured)()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try {
      const id = await join(text)
      close()
      await useApp.getState().refresh()
      await useApp.getState().openScript(id)
      toast('Joined — you\'re writing together', 'users')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Join a script" icon="users" onClose={close}
      foot={configured ? <><button className="btn ghost" onClick={close}>Cancel</button><button className="btn" disabled={busy || !text.trim()} onClick={go}>{busy ? 'Joining…' : 'Join'}</button></> : undefined}>
      {configured ? <>
        <p className="muted" style={{ marginTop: 0 }}>Type the code your co-writer sent — or the one you made on your phone (Share › Join code). A whole message with the code in it works too.</p>
        <input className="input join-input" autoFocus value={text} placeholder="K7QP-X2MA" onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && text.trim()) void go() }} />
        {err && <div className="callout warn" style={{ marginTop: 10 }}>{err}</div>}
      </> : <LiveUnavailable />}
    </Modal>
  )
}
