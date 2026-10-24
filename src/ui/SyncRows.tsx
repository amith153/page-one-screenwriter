/** Settings › Sync: pair this computer with the Page One phone app over Wi-Fi. */
import { useEffect, useState } from 'react'
import { lanAvailable } from '../collab/lan'
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
  const [address, setAddress] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick(n => n + 1), 10000); return () => window.clearInterval(t) }, [])

  const desc = 'Your projects, daily words, streak, sprints and goal, the same on every device. Over your own Wi-Fi: no account, no server.'
  if (!lanAvailable) {
    return <><label>Wi-Fi sync<span className="desc">{desc}</span></label><div className="faint">Wi-Fi sync works in the desktop app, not in the browser.</div></>
  }

  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr('')
    try { await f() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const show = () => run(async () => { await sync.startPairing() })
  const pair = () => run(async () => {
    await sync.pairWith(address, typed)
    setAddress(''); setTyped('')
    toast('Paired. Your projects and writing stats will now follow you between devices.', 'cloud')
  })

  const status = sync.status === 'error' ? sync.message || 'Something went wrong.'
    : sync.status === 'working' ? 'Syncing…'
    : sync.status === 'waiting' ? sync.message || 'Waiting for your other device…'
    : sync.lastAt ? `Up to date · ${ago(sync.lastAt)}` : 'Up to date'

  return <>
    <label>Wi-Fi sync<span className="desc">{desc}</span></label>
    <div style={{ display: 'grid', gap: 12 }}>
      {sync.peers.length > 0 && <div style={{ display: 'grid', gap: 8 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="chip" style={{ color: sync.status === 'error' ? 'var(--danger)' : undefined }}><Icon name="cloud" size={12} />{status}</span>
          <button className="btn ghost sm" onClick={() => sync.syncNow()}>Sync now</button>
        </div>
        {sync.peers.map(p => (
          <div key={p.id} className="row" style={{ flexWrap: 'wrap' }}>
            <b>{p.name}</b><span className="faint">{p.lastAt ? `last seen ${ago(p.lastAt)}` : ''}</span>
            <button className="btn quiet sm" onClick={() => confirmAction(`Stop syncing with ${p.name}? Your projects stay on both devices; they just stop following each other.`, 'Unpair', () => sync.unpair(p.id), false)}>Unpair</button>
          </div>
        ))}
      </div>}

      <div style={{ display: 'grid', gap: 8 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={show}><Icon name="cloud" size={14} />{sync.peers.length ? 'Add another device' : 'Show a code for my phone'}</button>
          <span className="faint">then type the code and address on the phone: Settings › Sync</span>
        </div>
        {sync.pairing && <div>
          <div className="join-code" style={{ fontFamily: 'var(--font-script)', fontSize: 28, letterSpacing: '.12em', fontWeight: 700 }}>{sync.pairing.code}</div>
          <div className="faint">Address: <b>{sync.pairing.addresses.join(' or ')}</b> · keep Page One open here until it connects</div>
        </div>}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ maxWidth: 150 }} value={address} placeholder="192.168.1.5" onChange={e => setAddress(e.target.value)} aria-label="Address shown on the other device" />
          <input className="input join-input" style={{ maxWidth: 150 }} value={typed} placeholder="K7QP-X2MA" onChange={e => setTyped(e.target.value)} aria-label="Code shown on the other device"
            onKeyDown={e => { if (e.key === 'Enter' && typed.trim() && address.trim()) void pair() }} />
          <button className="btn ghost" disabled={busy || !typed.trim() || !address.trim()} onClick={pair}>Use a code from my phone</button>
        </div>
        {err && <div className="callout warn">{err}</div>}
        <div className="faint" style={{ fontSize: 12 }}>Both devices must be on the same Wi-Fi (a phone's hotspot works). The first time, Windows may ask to allow Page One on private networks: choose Allow.</div>
      </div>
    </div>
  </>
}
