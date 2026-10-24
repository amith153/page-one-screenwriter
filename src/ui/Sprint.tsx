/** Writing sprints: a timed session with an optional word goal, a bell at the end and a history. */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useDoc } from '../state/doc'
import { useSettings } from '../state/settings'
import { Icon } from './Icon'
import { Modal, toast, useModal } from './kit'

interface SprintState {
  endsAt: number | null
  minutes: number
  goal: number
  startWords: number
  start: (minutes: number, goal: number) => void
  stop: (finished: boolean) => void
}

/** A soft two-note bell, made on the fly (no audio files to ship). */
function bell() {
  try {
    const ctx = new AudioContext()
    ;[880, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0, ctx.currentTime + i * 0.18)
      g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.18 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 1.8)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 2)
    })
  } catch { /* no audio */ }
}

export const useSprint = create<SprintState>((set, get) => ({
  endsAt: null, minutes: 25, goal: 0, startWords: 0,
  start: (minutes, goal) => set({ endsAt: Date.now() + minutes * 60_000, minutes, goal, startWords: useDoc.getState().sessionWords }),
  stop: finished => {
    const s = get()
    const words = Math.max(0, useDoc.getState().sessionWords - s.startWords)
    if (finished) {
      bell()
      useSettings.getState().addSprint({ at: Date.now(), minutes: s.minutes, words, goal: s.goal, script: useDoc.getState().script?.title ?? '' })
      toast(s.goal && words >= s.goal ? `Sprint done — ${words} words. Goal smashed.` : `Sprint done — ${words} words in ${s.minutes} minutes.`, 'timer')
    }
    set({ endsAt: null })
  },
}))

const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export function SprintPill() {
  const endsAt = useSprint(s => s.endsAt)
  const goal = useSprint(s => s.goal)
  const startWords = useSprint(s => s.startWords)
  const words = useDoc(d => d.sessionWords) - startWords
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!endsAt) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= endsAt) useSprint.getState().stop(true)
    }, 500)
    return () => window.clearInterval(t)
  }, [endsAt])
  if (!endsAt) return <button className="icon-btn" title="Writing sprint" onClick={() => useModal.getState().open('sprint')}><Icon name="timer" /></button>
  return (
    <button className="sprint-pill" title="Stop sprint" onClick={() => useSprint.getState().stop(false)}>
      <Icon name="timer" size={14} />{fmt(endsAt - now)}
      {goal > 0 && <span className="goal-mini"><i style={{ width: `${Math.min(100, (Math.max(0, words) / goal) * 100)}%` }} /></span>}
    </button>
  )
}

export function SprintModal() {
  const close = useModal(m => m.close)
  const [minutes, setMinutes] = useState(25)
  const [goal, setGoal] = useState(500)
  const sprints = useSettings(s => s.log.sprints)
  return (
    <Modal title="Writing sprint" icon="timer" onClose={close}
      foot={<><button className="btn ghost" onClick={close}>Cancel</button>
        <button className="btn" onClick={() => { useSprint.getState().start(minutes, goal); close(); toast(`Sprint started — ${minutes} minutes. Go.`, 'bolt') }}>Start sprint</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>Write without stopping. A bell rings when time is up.</p>
      <div className="field" style={{ marginBottom: 16 }}>
        <span>Length</span>
        <div className="seg">
          {[10, 15, 25, 45, 60, 90].map(m => <button key={m} className={minutes === m ? 'is-on' : ''} onClick={() => setMinutes(m)}>{m} min</button>)}
        </div>
      </div>
      <label className="field" style={{ maxWidth: 220 }}>
        <span>Word goal (optional)</span>
        <input className="input" type="number" min={0} step={50} value={goal} onChange={e => setGoal(Math.max(0, +e.target.value || 0))} />
      </label>
      {sprints.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Recent sprints</div>
          <table className="table">
            <tbody>
              {sprints.slice(0, 6).map(s => (
                <tr key={s.at}>
                  <td className="faint tabular">{new Date(s.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
                  <td>{s.script}</td>
                  <td className="tabular">{s.minutes} min</td>
                  <td className="tabular" style={{ color: s.goal && s.words >= s.goal ? 'var(--success)' : undefined }}>{s.words} words</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
