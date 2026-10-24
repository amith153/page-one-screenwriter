/** First run: a short welcome, your name and daily goal, a look, and an optional sample screenplay. */
import { useState } from 'react'
import { ACCENTS, useSettings, type ThemeMode } from '../state/settings'
import { createSample } from '../data/sample'
import { Icon } from './Icon'
import { Logo } from './Logo'
import { useApp } from './appState'

const FEATURES: [string, string, string][] = [
  ['script', 'Industry format, automatically', 'Enter and Tab do the right thing. Pages break exactly as they print.'],
  ['cards', 'Plan on cards and beats', 'Drag scenes to restructure. Check every beat against its target page.'],
  ['doctor', 'Script Doctor', '21 checks a script coordinator would make — with one-click fixes.'],
  ['flame', 'Keep writing', 'Daily goals, streaks, sprints and a line from a great film every day.'],
]

export function Onboarding() {
  const s = useSettings(x => x.s)
  const set = useSettings(x => x.set)
  const [step, setStep] = useState(0)
  const finish = async (sample: boolean) => {
    set({ onboarded: true })
    if (sample) {
      const id = await createSample()
      await useApp.getState().refresh()
      await useApp.getState().openScript(id)
    }
  }
  return (
    <div className="onboard">
      <div className="onboard-card" key={step}>
        <Logo size={72} className="onboard-mark" />
        {step === 0 && <>
          <h1 className="display">Welcome to <em style={{ color: 'var(--accent)' }}>Page One</em></h1>
          <p>A screenwriting studio that writes industry-format screenplays, helps you plan the story, and keeps you writing.</p>
          <div className="feature-list">
            {FEATURES.map(([icon, t, d]) => <div key={t} className="feature"><Icon name={icon} size={18} /><div><b>{t}</b><span>{d}</span></div></div>)}
          </div>
          <button className="btn lg" style={{ marginTop: 22 }} onClick={() => setStep(1)}>Get started <Icon name="arrow" size={15} /></button>
        </>}
        {step === 1 && <>
          <h1 className="display">What should we call you?</h1>
          <p>For your title pages and notes. Then set a daily goal — small and steady wins.</p>
          <div className="col" style={{ maxWidth: 360, margin: '26px auto 0', textAlign: 'left', gap: 14 }}>
            <label className="field"><span>Your name</span><input className="input" autoFocus value={s.name} placeholder="Your name" onChange={e => set({ name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') setStep(2) }} /></label>
            <div className="field"><span>Daily goal</span>
              <div className="seg">{[250, 500, 1000, 1500].map(n => <button key={n} className={s.dailyGoal === n ? 'is-on' : ''} onClick={() => set({ dailyGoal: n })}>{n} words</button>)}</div>
            </div>
          </div>
          <button className="btn lg" style={{ marginTop: 26 }} onClick={() => setStep(2)}>Continue <Icon name="arrow" size={15} /></button>
        </>}
        {step === 2 && <>
          <h1 className="display">Make it yours</h1>
          <p>Choose a look. You can change it any time in Settings.</p>
          <div className="seg" style={{ marginTop: 24 }}>
            {(['dark', 'black', 'light', 'system'] as ThemeMode[]).map(t => <button key={t} className={s.theme === t ? 'is-on' : ''} onClick={() => set({ theme: t })}>{t === 'black' ? 'Pure black' : t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            {ACCENTS.map(a => <button key={a.id} className={'accent-swatch' + (s.accent === a.id ? ' is-on' : '')} style={{ ['--sw' as string]: a.hex }} title={a.label} onClick={() => set({ accent: a.id })} />)}
          </div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 30 }}>
            <button className="btn ghost lg" onClick={() => void finish(false)}>Start with a blank page</button>
            <button className="btn lg" onClick={() => void finish(true)}><Icon name="sparkle" size={15} />Open a sample screenplay</button>
          </div>
        </>}
        <div className="onboard-steps">{[0, 1, 2].map(i => <i key={i} className={i === step ? 'is-on' : ''} />)}</div>
      </div>
    </div>
  )
}
