/**
 * Measures printed text with the fonts it actually prints in, so the paginator wraps a Kannada,
 * Arabic or Thai line at the same right margin as an English one, and gives scripts whose marks
 * stack above and below the letters a tall enough line.
 *
 * Courier runs advance exactly one column a character (as the PDF draws them); every other run is
 * measured in the page's font stack at 12 pt. A script's font downloads only when its text first
 * appears, so until it has loaded the paginator's estimate stands in, and the pages are laid out
 * again once it arrives.
 */
import { setMeasurer } from '../core/paginator'
import { fontRuns } from './scriptFonts'

const PX = 16 // 12 pt at 96 dpi
const COL_PX = PX * 0.6 // one Courier column: 7.2 pt
const PT = 0.75 // pt per px

/** Ink a 1/6" line holds without touching its neighbours, measured from the baseline (pt). */
const ROOM_ABOVE = 10
const ROOM_BELOW = 3

/** Characters Courier Prime draws itself (Latin, general punctuation, currency, letterlike symbols). */
const courier = (cp: number) =>
  cp <= 0x024F || (cp >= 0x2000 && cp <= 0x206F) || (cp >= 0x20A0 && cp <= 0x20CF) || (cp >= 0x2100 && cp <= 0x214F)

/** Splits s into runs: [text, drawn by Courier]. */
function split(s: string): [string, boolean][] {
  const out: [string, boolean][] = []
  for (const [t, sc] of fontRuns(s)) {
    if (sc) { out.push([t, false]); continue }
    let cur = ''
    let curC = true
    for (const ch of t) {
      const c = courier(ch.codePointAt(0)!)
      if (cur && c !== curC) { out.push([cur, curC]); cur = '' }
      curC = c
      cur += ch
    }
    if (cur) out.push([cur, curC])
  }
  return out
}

export function installMeasurer(onChange: () => void) {
  if (typeof document === 'undefined') return
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-script').trim() || "'Courier Prime', 'Page One Script', monospace"
  const font = `${PX}px ${family}`
  ctx.font = font

  const widths = new Map<string, number | null>()
  const heights = new Map<string, number | null>()
  const pending = new Set<string>()
  let changeTimer: number | undefined

  /** True when every face s needs has loaded; otherwise starts the download and re-lays out after. */
  const ready = (s: string) => {
    if (!document.fonts || document.fonts.check(font, s)) return true
    if (!pending.has(s)) {
      pending.add(s)
      document.fonts.load(font, s).then(() => {
        pending.delete(s)
        widths.clear(); heights.clear()
        window.clearTimeout(changeTimer)
        changeTimer = window.setTimeout(onChange, 50)
      }, () => pending.delete(s))
    }
    return false
  }
  const remember = <T>(m: Map<string, T>, k: string, v: T) => { if (m.size > 4000) m.clear(); m.set(k, v); return v }

  setMeasurer({
    cells(s) {
      const hit = widths.get(s)
      if (hit !== undefined) return hit
      const parts = split(s)
      if (parts.every(([, c]) => c)) return [...s].length
      if (!ready(s)) return null
      let n = 0
      for (const [t, c] of parts) n += c ? [...t].length : ctx.measureText(t).width / COL_PX
      // A hair of slack, for the PDF's shaper rounding differently from the browser's.
      return remember(widths, s, n * 1.01)
    },
    height(s) {
      const hit = heights.get(s)
      if (hit !== undefined) return hit
      const other = split(s).filter(([, c]) => !c).map(([t]) => t).join(' ')
      if (!other) return 1
      if (!ready(other)) return null
      const m = ctx.measureText(other)
      const over = Math.max(0, m.actualBoundingBoxAscent * PT - ROOM_ABOVE, m.actualBoundingBoxDescent * PT - ROOM_BELOW)
      // The extra space sits evenly above and below the text, in half-line steps.
      return remember(heights, s, 1 + Math.ceil((2 * over) / 6) / 2)
    },
  })
}
