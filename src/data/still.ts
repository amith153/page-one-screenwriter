/**
 * A frame from a film, every day, behind the home screen's line — the desktop side of the phone's
 * daily card. The film is the day's line's film (or the day's pick from the same catalogue), and the
 * frame comes from the same sources in the same order: TMDB backdrops (with a key), then Wikimedia
 * Commons, then the film's Wikipedia article (only when its picture is a wide frame, not a poster).
 */
import { epochDay, filmFor, lineFor, loadFilms, pick, type Film } from './inspiration'

export interface Still { url: string; film: string; year: number; via: string }

const tmdbKey = () => import.meta.env.VITE_TMDB_KEY?.trim() || ''

async function json(url: string, bearer?: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined)
    return r.ok ? await r.json() : null
  } catch { return null }
}
type J = Record<string, unknown>

async function tmdb(key: string, f: Film, day: number): Promise<string | null> {
  const bearer = key.startsWith('eyJ') ? key : undefined
  const get = (path: string) => json(`https://api.themoviedb.org/3${path}${bearer ? '' : (path.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(key)}`, bearer)
  const res = (await get(`/search/movie?query=${encodeURIComponent(f.title)}${f.year ? `&year=${f.year}` : ''}&include_adult=false`))?.results as J[] | undefined
  const id = res?.[0]?.id
  if (!id) return null
  const all = ((await get(`/movie/${id}/images?include_image_language=null,en`))?.backdrops as J[] | undefined) ?? []
  const clean = (all.filter(b => b.iso_639_1 == null).length ? all.filter(b => b.iso_639_1 == null) : all)
    .sort((a, b) => Number(b.vote_count ?? 0) - Number(a.vote_count ?? 0)).slice(0, 12)
  if (!clean.length) return null
  const path = clean[pick(clean.length, day, 5)].file_path
  return path ? `https://image.tmdb.org/t/p/w1280${path}` : null
}

const SKIP = /poster|logo|cover|dvd|blu-?ray|vhs|signature|\.svg|\.pdf|map/i

async function commons(f: Film, day: number): Promise<string | null> {
  const queries = [
    ...(f.year ? [`incategory:"${f.title} (${f.year} film)" filetype:bitmap`] : []),
    `"${f.title}" ${f.year || ''} film screenshot filetype:bitmap`,
    `"${f.title}" trailer filetype:bitmap`,
  ]
  for (const q of queries) {
    const o = await json('https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*' +
      '&generator=search&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=1600&gsrsearch=' + encodeURIComponent(q))
    const pages = ((o?.query as J | undefined)?.pages as J[] | undefined) ?? []
    const urls = pages.flatMap(p => {
      if (SKIP.test(String(p.title ?? ''))) return []
      const info = (p.imageinfo as J[] | undefined)?.[0]
      if (!info) return []
      const w = Number(info.width), h = Number(info.height)
      if (h <= 0 || w < 640 || w / h < 1.25 || !/image\/(jpeg|png)/.test(String(info.mime))) return []
      return [String(info.thumburl || info.url)]
    }).sort()
    if (urls.length) return urls[pick(urls.length, day, 3)]
  }
  return null
}

async function wikipedia(f: Film): Promise<string | null> {
  for (const n of [...(f.year ? [`${f.title} (${f.year} film)`] : []), `${f.title} (film)`, f.title]) {
    const o = await json(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(n.replace(/ /g, '_'))}`)
    if (!o || !/film/i.test(String(o.description ?? ''))) continue
    const im = o.originalimage as J | undefined
    if (!im) return null
    const w = Number(im.width), h = Number(im.height)
    return h > 0 && w / h >= 1.3 && w >= 640 ? String(im.source) : null
  }
  return null
}

/** Load an image fully before showing it, so the card never paints half a frame. */
const preload = (url: string) => new Promise<boolean>(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = url })

const CACHE = 'pageone-still'

/** Today's still, or null when there's no picture to be had (offline, nothing found). */
export async function stillFor(day = epochDay()): Promise<Still | null> {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? 'null') as (Still & { day: number }) | null
    if (c?.day === day && c.url && await preload(c.url)) return c
  } catch { /* no cache */ }
  const line = await lineFor(day)
  const today = line.film ?? await filmFor(day)
  // The day's film first. Without TMDB, free sources rarely have frames of recent films, so fall
  // back to classics (whose trailers are public domain and well covered on Commons).
  const classics = (await loadFilms()).filter(f => f.year > 0 && f.year < 1965)
  const films = [today, ...[0, 1, 2, 3, 4, 5].map(k => classics[pick(classics.length, day + k * 977, 23)])].filter((f): f is Film => !!f)
  const key = tmdbKey()
  for (const f of films) {
    const tries: [string, () => Promise<string | null>][] = [
      ...(key ? [['TMDB', () => tmdb(key, f, day)] as [string, () => Promise<string | null>]] : []),
      ['Wikimedia Commons', () => commons(f, day)],
      ['Wikipedia', () => wikipedia(f)],
    ]
    for (const [via, get] of tries) {
      const url = await get()
      if (url && await preload(url)) {
        const s: Still = { url, film: f.title, year: f.year, via }
        try { localStorage.setItem(CACHE, JSON.stringify({ ...s, day })) } catch { /* storage blocked */ }
        return s
      }
    }
  }
  return null
}
