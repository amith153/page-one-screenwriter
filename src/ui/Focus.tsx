/**
 * Focus mode: the page alone on a dark desk. The chrome goes, typewriter scrolling comes on, and a
 * bar at the bottom (words this session, time, page, ambient sound) stays in view — bright when the
 * mouse moves, dimmed while you type. Esc or F11 leaves.
 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { todayIso } from '../core/production'
import { useDoc } from '../state/doc'
import { useSettings, wordsOn } from '../state/settings'
import { Icon } from './Icon'

export type Ambience = 'off' | 'rain' | 'brown'

interface FocusState {
  on: boolean
  ambience: Ambience
  startedAt: number
  startWords: number
  toggle: () => void
  setAmbience: (a: Ambience) => void
}

export const useFocus = create<FocusState>((set, get) => ({
  on: false,
  ambience: 'off',
  startedAt: 0,
  startWords: 0,
  toggle: () => {
    const on = !get().on
    if (on) {
      useDoc.getState().setView('script')
      set({ on, startedAt: Date.now(), startWords: useDoc.getState().sessionWords })
      play(get().ambience)
    } else {
      set({ on })
      play('off')
    }
  },
  setAmbience: ambience => { set({ ambience }); if (get().on) play(ambience) },
}))

// ---------------------------------------------------------------- ambient sound (generated, nothing to ship)

let audio: { ctx: AudioContext; gain: GainNode } | null = null

function play(kind: Ambience) {
  if (audio) {
    const { ctx, gain } = audio
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3)
    window.setTimeout(() => void ctx.close(), 1500)
    audio = null
  }
  if (kind === 'off') return
  try {
    const ctx = new AudioContext()
    const len = ctx.sampleRate * 6
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      let last = 0
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1
        if (kind === 'brown') { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.5 } else d[i] = white
      }
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const gain = ctx.createGain()
    gain.gain.value = 0
    let node: AudioNode = src
    if (kind === 'rain') {
      // Rain: noise with the rumble and hiss filtered off, swelling slowly like gusts on a window.
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000
      const lfo = ctx.createOscillator(), depth = ctx.createGain()
      lfo.frequency.value = 0.12; depth.gain.value = 0.015
      lfo.connect(depth).connect(gain.gain)
      lfo.start()
      node = node.connect(hp).connect(lp)
    } else {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
      node = node.connect(lp)
    }
    node.connect(gain).connect(ctx.destination)
    src.start()
    gain.gain.setTargetAtTime(kind === 'rain' ? 0.06 : 0.18, ctx.currentTime, 1.2)
    audio = { ctx, gain }
  } catch { /* no audio device */ }
}

// ---------------------------------------------------------------- HUD

const clock = (ms: number) => {
  const m = Math.floor(ms / 60000)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`
}

const SOUNDS: { id: Ambience; label: string }[] = [{ id: 'off', label: 'Silence' }, { id: 'rain', label: 'Rain' }, { id: 'brown', label: 'Brown noise' }]

export function FocusHud() {
  const on = useFocus(f => f.on)
  const ambience = useFocus(f => f.ambience)
  const startedAt = useFocus(f => f.startedAt)
  const startWords = useFocus(f => f.startWords)
  const words = useDoc(d => d.sessionWords) - startWords
  const pagination = useDoc(d => d.pagination)
  const currentId = useDoc(d => d.currentId)
  const script = useDoc(d => d.script)
  const goal = useSettings(s => s.s.dailyGoal)
  const today = useSettings(s => wordsOn(s.log, todayIso()))
  const focusLine = useSettings(s => s.s.focusLine)
  const [shown, setShown] = useState(true)
  const [, tick] = useState(0)

  useEffect(() => {
    if (!on) return
    let hide = window.setTimeout(() => setShown(false), 2500)
    const wake = () => { setShown(true); window.clearTimeout(hide); hide = window.setTimeout(() => setShown(false), 2500) }
    const typing = (e: KeyboardEvent) => { if (!e.ctrlKey && !e.metaKey && e.key.length === 1) { window.clearTimeout(hide); setShown(false) } }
    const t = window.setInterval(() => tick(n => n + 1), 30_000)
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', typing)
    return () => { window.clearTimeout(hide); window.clearInterval(t); window.removeEventListener('mousemove', wake); window.removeEventListener('keydown', typing) }
  }, [on])

  if (!on || !script) return null
  const index = script.elements.findIndex(e => e.id === currentId)
  const page = pagination && index >= 0 ? pagination.elementPage[index] ?? 0 : 0
  const pct = goal ? Math.min(1, today / goal) : 0

  return (
    <div className={'focus-hud' + (shown ? '' : ' is-hidden')}>
      <span className="hud-stat" title={`${today} of ${goal} words today`}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <circle cx="9" cy="9" r="7" fill="none" stroke="var(--line-3)" strokeWidth="2.5" />
          <circle cx="9" cy="9" r="7" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={`${pct * 44} 44`} transform="rotate(-90 9 9)" />
        </svg>
        <b className="tabular">{words > 0 ? `+${words.toLocaleString()}` : '0'}</b> words
      </span>
      <span className="hud-sep" />
      <span className="hud-stat"><Icon name="timer" size={13} />{clock(Date.now() - startedAt)}</span>
      <span className="hud-sep" />
      <span className="hud-stat tabular">Page {pagination?.labels[page] ?? page + 1} of {pagination?.pages.length ?? 1}</span>
      <span className="hud-sep" />
      <span className="seg hud-seg">
        {SOUNDS.map(s => <button key={s.id} className={ambience === s.id ? 'is-on' : ''} onClick={() => useFocus.getState().setAmbience(s.id)}>{s.label}</button>)}
      </span>
      <button className={'hud-toggle' + (focusLine ? ' is-on' : '')} title="Dim all but the current line" aria-pressed={focusLine} onClick={() => useSettings.getState().set({ focusLine: !focusLine })}>
        <Icon name="focus" size={14} />Focus line<span className="hud-switch" />
      </button>
      <button className="btn ghost sm" onClick={() => useFocus.getState().toggle()}>Leave <span className="kbd">Esc</span></button>
    </div>
  )
}
