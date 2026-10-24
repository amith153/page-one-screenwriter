/**
 * Fonts for the world's scripts. Courier Prime only draws Latin, so every other script falls back
 * to a Noto face drawn to sit well beside it. The same table feeds the editor (as a lazily loaded
 * fallback family — a font downloads only once its script appears) and the PDF exporter (embedded
 * and subset, so a Kannada or Arabic script exports exactly like an English one).
 *
 * CJK is left to the system: its fonts are tens of megabytes, and every desktop already ships one.
 */
import devaR from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff?url'
import devaB from '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff?url'
import bengR from '@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff?url'
import bengB from '@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-700-normal.woff?url'
import guruR from '@fontsource/noto-sans-gurmukhi/files/noto-sans-gurmukhi-gurmukhi-400-normal.woff?url'
import guruB from '@fontsource/noto-sans-gurmukhi/files/noto-sans-gurmukhi-gurmukhi-700-normal.woff?url'
import gujrR from '@fontsource/noto-sans-gujarati/files/noto-sans-gujarati-gujarati-400-normal.woff?url'
import gujrB from '@fontsource/noto-sans-gujarati/files/noto-sans-gujarati-gujarati-700-normal.woff?url'
import oryaR from '@fontsource/noto-sans-oriya/files/noto-sans-oriya-oriya-400-normal.woff?url'
import oryaB from '@fontsource/noto-sans-oriya/files/noto-sans-oriya-oriya-700-normal.woff?url'
import tamlR from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff?url'
import tamlB from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-700-normal.woff?url'
import teluR from '@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff?url'
import teluB from '@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-700-normal.woff?url'
import kndaR from '@fontsource/noto-sans-kannada/files/noto-sans-kannada-kannada-400-normal.woff?url'
import kndaB from '@fontsource/noto-sans-kannada/files/noto-sans-kannada-kannada-700-normal.woff?url'
import mlymR from '@fontsource/noto-sans-malayalam/files/noto-sans-malayalam-malayalam-400-normal.woff?url'
import mlymB from '@fontsource/noto-sans-malayalam/files/noto-sans-malayalam-malayalam-700-normal.woff?url'
import sinhR from '@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-400-normal.woff?url'
import sinhB from '@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-700-normal.woff?url'
import thaiR from '@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff?url'
import thaiB from '@fontsource/noto-sans-thai/files/noto-sans-thai-thai-700-normal.woff?url'
import arabR from '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff?url'
import arabB from '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff?url'
import hebrR from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-400-normal.woff?url'
import hebrB from '@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-700-normal.woff?url'

export interface ScriptFont {
  id: string
  label: string
  /** Inclusive code point blocks that belong to this script. */
  blocks: [number, number][]
  rtl: boolean
  regular: string
  bold: string
  /** CSS unicode-range, so the browser fetches the face only when the script is on screen. */
  range: string
  /** OpenType features to switch off in the PDF, where fontkit trips over the font's tables. */
  features?: Record<string, boolean>
}

const f = (id: string, label: string, blocks: [number, number][], regular: string, bold: string, range: string, rtl = false, features?: Record<string, boolean>): ScriptFont =>
  ({ id, label, blocks, rtl, regular, bold, range, features })

export const SCRIPT_FONTS: ScriptFont[] = [
  f('deva', 'Devanagari', [[0x0900, 0x097F], [0xA8E0, 0xA8FF]], devaR, devaB, 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF'),
  f('beng', 'Bengali', [[0x0980, 0x09FF]], bengR, bengB, 'U+0980-09FE'),
  // Noto Gurmukhi's above-base mark anchors crash fontkit's positioning (conjuncts like ਸ੍ਰੀ).
  f('guru', 'Gurmukhi', [[0x0A00, 0x0A7F]], guruR, guruB, 'U+0A01-0A76', false, { abvm: false }),
  f('gujr', 'Gujarati', [[0x0A80, 0x0AFF]], gujrR, gujrB, 'U+0A80-0AFF'),
  f('orya', 'Odia', [[0x0B00, 0x0B7F]], oryaR, oryaB, 'U+0B01-0B77'),
  f('taml', 'Tamil', [[0x0B80, 0x0BFF]], tamlR, tamlB, 'U+0B82-0BFA'),
  f('telu', 'Telugu', [[0x0C00, 0x0C7F]], teluR, teluB, 'U+0C00-0C7F'),
  f('knda', 'Kannada', [[0x0C80, 0x0CFF]], kndaR, kndaB, 'U+0C80-0CF3'),
  f('mlym', 'Malayalam', [[0x0D00, 0x0D7F]], mlymR, mlymB, 'U+0D00-0D7F'),
  f('sinh', 'Sinhala', [[0x0D80, 0x0DFF]], sinhR, sinhB, 'U+0D81-0DF4'),
  f('thai', 'Thai', [[0x0E00, 0x0E7F]], thaiR, thaiB, 'U+0E01-0E5B'),
  f('arab', 'Arabic', [[0x0600, 0x06FF], [0x0750, 0x077F], [0x0870, 0x08FF], [0xFB50, 0xFDFF], [0xFE70, 0xFEFF]], arabR, arabB,
    'U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFC', true),
  f('hebr', 'Hebrew', [[0x0590, 0x05FF], [0xFB1D, 0xFB4F]], hebrR, hebrB, 'U+0590-05FF,U+FB1D-FB4F', true),
]

/** The script a code point belongs to, or null for Latin and the shared marks and punctuation. */
export function scriptOf(cp: number): ScriptFont | null {
  for (const s of SCRIPT_FONTS) for (const [a, b] of s.blocks) if (cp >= a && cp <= b) return s
  return null
}

/**
 * Characters several scripts share (dandas, Vedic signs, joiners): they take the font of the
 * letters around them rather than starting a run of their own.
 */
export const isShared = (cp: number) =>
  cp === 0x0964 || cp === 0x0965 || cp === 0x0951 || cp === 0x0952 || cp === 0x200C || cp === 0x200D || (cp >= 0x1CD0 && cp <= 0x1CFF)

/** True when the first letter with a direction reads right to left. */
export function isRtl(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    const sc = scriptOf(cp)
    if (sc) return sc.rtl
    if (/\p{L}/u.test(ch)) return false
  }
  return false
}

/** Splits text into runs that one font can draw: [text, script or null for Courier]. */
export function fontRuns(s: string): [string, ScriptFont | null][] {
  const out: [string, ScriptFont | null][] = []
  let cur = ''
  let curScript: ScriptFont | null = null
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    const sc: ScriptFont | null = isShared(cp) ? curScript : scriptOf(cp)
    if (cur && sc !== curScript) { out.push([cur, curScript]); cur = '' }
    curScript = sc
    cur += ch
  }
  if (cur) out.push([cur, curScript])
  return out
}

let registered = false
/**
 * Adds the Noto faces to the page as one fallback family, "Page One Script". Each face carries
 * its unicode-range, so nothing downloads until a line in that script is shown.
 */
export function registerScriptFonts() {
  if (registered || typeof FontFace === 'undefined') return
  registered = true
  for (const s of SCRIPT_FONTS) {
    for (const [url, weight] of [[s.regular, '400'], [s.bold, '700']] as const) {
      try { document.fonts.add(new FontFace('Page One Script', `url(${url}) format('woff')`, { weight, unicodeRange: s.range, display: 'swap' })) } catch { /* old webview */ }
    }
  }
}
