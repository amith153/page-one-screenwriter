/** Settings › Sync: link this computer with the Page One phone app. */
import { useEffect, useState } from 'react'
import { currentServer, isValid } from '../collab/hub'
import { useSync } from '../state/sync'
import { Icon } from './Icon'
import { confirmAction, toast } from './kit'

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s} s ago`
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function SyncRows() {
  const sync = useSync()
  const [code, setCode] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 15000); return () => window.clearInterval(t) }, [])

  if (!isValid(currentServer())) {
    return <><label>Phone sync<span className="desc">Projects, daily words and streak on every device.</span></label>
      <div style={{ display: 'grid', gap: 6 }}>
        <b>Sync is switched off in this download.</b>
        <span className="faint">Syncing needs a small server that you set up yourself (a free Firebase project), and this download doesn't include one. Everything else works without it, and your scripts stay on this computer. To turn sync on, build the app with your own server details; the steps are in the README on GitHub.</span>
      </div></>
  }

  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr('')
    try { await f() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const showCode = () => run(async () => setCode(await useSync.getState().link()))
  const enter = () => run(async () => {
    const { useCollab } = await import('../state/collab')
    await useCollab.getState().join(typed)
    setTyped('')
    toast('Linked — your projects and writing stats now follow you between devices', 'cloud')
  })

  if (!sync.space) {
    return <>
      <label>Phone sync<span className="desc">Your projects, daily words, streak, sprints and goal — the same on your phone and here.</span></label>
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={showCode}><Icon name="cloud" size={14} />Show a code for my phone</button>
          <span className="faint">then type it on the phone: Settings › Sync</span>
        </div>
        {code && <div className="join-code" style={{ fontFamily: 'var(--font-script)', fontSize: 28, letterSpacing: '.12em', fontWeight: 700 }}>{code}</div>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input className="input join-input" style={{ maxWidth: 170 }} value={typed} placeholder="K7QP-X2MA" onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && typed.trim()) void enter() }} />
          <button className="btn ghost" disabled={busy || !typed.trim()} onClick={enter}>Use a code from my phone</button>
        </div>
        {err && <div className="callout warn">{err}</div>}
      </div>
    </>
  }

  const state = sync.status === 'error' ? sync.message || 'Could not reach the sync server.'
    : sync.status === 'working' ? sync.message || 'Syncing…'
    : sync.status === 'connecting' ? 'Connecting…'
    : sync.lastAt ? `Up to date · ${ago(sync.lastAt)}` : 'Up to date'
  return <>
    <label>Phone sync<span className="desc">Your projects, daily words, streak, sprints and goal — the same on your phone and here.</span></label>
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="chip" style={{ color: sync.status === 'error' ? 'var(--danger)' : undefined }}><Icon name="cloud" size={12} />{state}</span>
        <button className="btn ghost sm" disabled={busy} onClick={() => useSync.getState().syncNow()}>Sync now</button>
        <button className="btn ghost sm" disabled={busy} onClick={showCode}>Code for another device</button>
        <button className="btn quiet sm" onClick={() => confirmAction('Stop syncing with your phone? Your projects stay on both devices; they just stop following each other.', 'Unlink', () => useSync.getState().unlink(), false)}>Unlink</button>
      </div>
      {code && <div className="join-code" style={{ fontFamily: 'var(--font-script)', fontSize: 28, letterSpacing: '.12em', fontWeight: 700 }}>{code}</div>}
      {err && <div className="callout warn">{err}</div>}
    </div>
  </>
}
