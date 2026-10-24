/** App preferences and the writing log (goals, streaks, sprints). Kept in the webview's own storage. */
import { create } from 'zustand'
import type { PaperSize } from '../core/paginator'
import { todayIso } from '../core/production'

export type ThemeMode = 'system' | 'dark' | 'light' | 'black'
export type PaperLook = 'white' | 'theme' | 'sepia'

/** The phone app's twelve accents. */
export const ACCENTS: { id: string; label: string; hex: string }[] = [
  { id: 'champagne', label: 'Champagne', hex: '#C8A96A' },
  { id: 'pewter', label: 'Pewter', hex: '#8E949C' },
  { id: 'taupe', label: 'Taupe', hex: '#A08F7D' },
  { id: 'terracotta', label: 'Terracotta', hex: '#B86A4B' },
  { id: 'blush', label: 'Blush', hex: '#C79A98' },
  { id: 'bordeaux', label: 'Bordeaux', hex: '#8E2F45' },
  { id: 'mauve', label: 'Mauve', hex: '#94809E' },
  { id: 'slate', label: 'Slate', hex: '#6E7F99' },
  { id: 'navy', label: 'Navy', hex: '#33507A' },
  { id: 'sage', label: 'Sage', hex: '#8DA38A' },
  { id: 'emerald', label: 'Emerald', hex: '#2F6F5B' },
  { id: 'bronze', label: 'Bronze', hex: '#9C7A4D' },
]

export interface Settings {
  name: string
  theme: ThemeMode
  accent: string
  paper: PaperLook
  paperSize: PaperSize
  zoom: number
  dailyGoal: number
  typewriter: boolean
  focusLine: boolean
  sceneNumbers: boolean
  autoContd: boolean
  moreContd: boolean
  sceneSpacing: number
  spellcheck: boolean
  onboarded: boolean
  noteColor: number
  /** Scene headings in bold, on screen and in exports (on by default). */
  boldHeadings: boolean
  /** Character names over dialogue in bold. */
  boldCharacters: boolean
  /** A watermark on every exported PDF page (a reader's name, CONFIDENTIAL…). */
  watermarkOn: boolean
  watermark: string
  watermarkOpacity: number
  /** A film still behind the home screen's daily line. */
  dailyStill: boolean
}

const DEFAULTS: Settings = {
  name: '', theme: 'dark', accent: 'champagne', paper: 'white', paperSize: 'LETTER', zoom: 1, dailyGoal: 500,
  typewriter: false, focusLine: false, sceneNumbers: true, autoContd: true, moreContd: true, sceneSpacing: 1,
  spellcheck: true, onboarded: false, noteColor: 0xFFE7B35A, boldHeadings: true, boldCharacters: false, watermarkOn: false, watermark: 'CONFIDENTIAL',
  watermarkOpacity: 0.12, dailyStill: true,
}

export interface Sprint { at: number; minutes: number; words: number; goal: number; script: string }

export interface WritingLog {
  /** yyyy-MM-dd → words written that day (net words added while typing). */
  days: Record<string, number>
  sprints: Sprint[]
}

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback } catch { return fallback }
}
const persist = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage full or blocked */ } }

interface SettingsStore {
  s: Settings
  log: WritingLog
  set: (p: Partial<Settings>) => void
  addWords: (n: number) => void
  addSprint: (sp: Sprint) => void
}

/** Keys and servers that older builds let writers type in; they come only from the build now. */
const RETIRED = ['tmdbKey', 'googleClientId', 'serverProjectId', 'serverApiKey', 'serverAppId']

/** Scene headings are bold by default again (version 3); character names stay regular unless the writer asks. */
function migrate(s: Settings): Settings {
  const old = RETIRED.some(k => k in s)
  if (((s as Settings & { v?: number }).v ?? 0) >= 3 && !old) return s
  const next: Settings & { v?: number } = { ...s }
  for (const k of RETIRED) delete (next as unknown as Record<string, unknown>)[k]
  if ((next.v ?? 0) < 3) Object.assign(next, { boldHeadings: true, v: 3 })
  persist('pageone-settings', next)
  return next
}

export const useSettings = create<SettingsStore>((set, get) => ({
  s: migrate(load('pageone-settings', DEFAULTS)),
  log: load<WritingLog>('pageone-log', { days: {}, sprints: [] }),
  set: p => { const s = { ...get().s, ...p }; persist('pageone-settings', s); set({ s }) },
  addWords: n => {
    if (n === 0) return
    const day = todayIso()
    const log = get().log
    const days = { ...log.days, [day]: Math.max(0, (log.days[day] ?? 0) + n) }
    const next = { ...log, days }
    persist('pageone-log', next)
    set({ log: next })
  },
  addSprint: sp => {
    const next = { ...get().log, sprints: [sp, ...get().log.sprints].slice(0, 200) }
    persist('pageone-log', next)
    set({ log: next })
  },
}))

/** Consecutive days (ending today, or yesterday if today has no words yet) with at least one word. */
export function streak(days: Record<string, number>): number {
  let n = 0
  const d = new Date()
  if (!(days[todayIso(d)] > 0)) d.setDate(d.getDate() - 1)
  while (days[todayIso(d)] > 0) { n++; d.setDate(d.getDate() - 1) }
  return n
}

export function lastDays(days: Record<string, number>, count: number): { day: string; words: number }[] {
  const out: { day: string; words: number }[] = []
  const d = new Date()
  d.setDate(d.getDate() - (count - 1))
  for (let i = 0; i < count; i++) { const k = todayIso(d); out.push({ day: k, words: days[k] ?? 0 }); d.setDate(d.getDate() + 1) }
  return out
}
