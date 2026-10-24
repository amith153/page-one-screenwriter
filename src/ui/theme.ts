/** Applies theme + accent the way the phone does: a muted partner hue, contrast-safe on ink and on ivory. */
import { useEffect } from 'react'
import { ACCENTS, useSettings } from '../state/settings'

type RGB = [number, number, number]
const toRgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.substring(i, i + 2), 16) / 255) as RGB
const toHex = (c: RGB) => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')
const lerp = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t) as RGB
const lum = ([r, g, b]: RGB) => {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function rotateHue([r, g, b]: RGB, deg: number): RGB {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  h = (h + deg / 360) % 1
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]
}

export function resolvedTheme(mode: string): 'dark' | 'light' | 'black' {
  if (mode === 'system') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  return mode as 'dark' | 'light' | 'black'
}

export function applyTheme() {
  const { theme, accent } = useSettings.getState().s
  const mode = resolvedTheme(theme)
  const dark = mode !== 'light'
  const base = toRgb(ACCENTS.find(a => a.id === accent)?.hex ?? ACCENTS[0].hex)
  let a = base
  if (dark && lum(base) < 0.2) a = lerp(base, [1, 1, 1], 0.38)
  if (!dark && lum(base) > 0.3) a = lerp(base, [0, 0, 0], 0.22)
  const a2 = lerp(rotateHue(a, 28), a, 0.45)
  const second = lerp(rotateHue(a, 155), [0.56, 0.56, 0.56], 0.5)
  const root = document.documentElement
  root.dataset.theme = mode
  root.style.setProperty('--accent', toHex(a))
  root.style.setProperty('--accent-2', toHex(lerp(a2, second, 0.35)))
  root.style.setProperty('--on-accent', lum(a) > 0.42 ? '#16120C' : '#FFFFFF')
}

export function useTheme() {
  const theme = useSettings(s => s.s.theme)
  const accent = useSettings(s => s.s.accent)
  useEffect(() => {
    applyTheme()
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: light)')
    const f = () => applyTheme()
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [theme, accent])
}
