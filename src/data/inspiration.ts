/**
 * The home screen's "one a day" card. Same catalogue (assets/cinema/films.tsv) and the same
 * date-seeded pick as the phone — java.util.Random reproduced exactly — so phone and desktop
 * show the same film and the same line on the same day, offline.
 */
import { QUOTES } from './quotes'

export interface Film { title: string; year: number; director: string; line: string; by: string }
export interface Line { text: string; by: string; film?: Film }

/** java.util.Random, bit for bit. */
class JavaRandom {
  private seed: bigint
  private static readonly MULT = 0x5DEECE66Dn
  private static readonly MASK = (1n << 48n) - 1n
  constructor(seed: bigint) { this.seed = (seed ^ JavaRandom.MULT) & JavaRandom.MASK }
  private next(bits: number): number {
    this.seed = (this.seed * JavaRandom.MULT + 0xBn) & JavaRandom.MASK
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)))
  }
  nextInt(bound: number): number {
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n)
    let bits: number, val: number
    do { bits = this.next(31); val = bits % bound } while (bits - val + (bound - 1) > 0x7FFFFFFF || bits - val + (bound - 1) < 0)
    return val
  }
}

/** Kotlin's `(0 until n).shuffled(java.util.Random(seed))`. */
function shuffled(n: number, seed: bigint): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  const r = new JavaRandom(seed)
  for (let i = n - 1; i > 0; i--) { const j = r.nextInt(i + 1); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

const floorDiv = (a: number, b: number) => Math.floor(a / b)
const floorMod = (a: number, b: number) => ((a % b) + b) % b

/** A stable shuffle of 0 until n, then the slot for day. */
export function pick(n: number, day: number, salt: number): number {
  if (n <= 0) return 0
  const cycle = floorDiv(day, n)
  return shuffled(n, BigInt(cycle) * 31n + BigInt(salt))[floorMod(day, n)]
}

export function epochDay(d = new Date()) {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

let films: Promise<Film[]> | null = null
export function loadFilms(): Promise<Film[]> {
  films ??= fetch('/films.tsv').then(r => r.text()).then(t => t.split(/\r?\n/).flatMap(ln => {
    const p = ln.split('\t')
    if (!p[0]?.trim()) return []
    return [{ title: p[0], year: parseInt(p[1] ?? '', 10) || 0, director: p[2] ?? '', line: p[3] ?? '', by: p[4] ?? '' }]
  })).catch(() => [])
  return films
}

const caption = (f: Film) => [f.by, f.year > 0 ? `${f.title} (${f.year})` : f.title].filter(Boolean).join(', ')

export const quoteFor = (day: number): Line => { const q = QUOTES[pick(QUOTES.length, day, 7)]; return { text: q[0], by: q[1] } }

/** Alternates between a writing quote and a famous line from a film, as on the phone. */
export async function lineFor(day = epochDay()): Promise<Line> {
  const all = await loadFilms()
  const lines = all.filter(f => f.line.trim())
  if (floorMod(day, 2) === 0 || !lines.length) return quoteFor(day)
  const f = lines[pick(lines.length, day, 41)]
  return { text: f.line, by: caption(f), film: f }
}

export async function filmFor(day = epochDay()): Promise<Film | null> {
  const all = await loadFilms()
  return all.length ? all[pick(all.length, day, 13)] : null
}
