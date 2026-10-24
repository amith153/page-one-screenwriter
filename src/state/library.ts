/**
 * The script library (port of the phone's `ScriptStore`): one JSON file per script in
 * <root>/scripts/<id>.json, a small _index.json so the home screen opens instantly, and
 * snapshots in <root>/versions/<id>/<time>.json. Same layout and format as the phone.
 */
import { authorOf, countWords, el, newId, newScript, titlePage, TYPE_INFO, uuid, type Deadline, type Element, type Script, type TitlePage } from '../core/model'
import { decodeScript, encodeScript, scriptFromJson } from '../core/codec'
import { dataRoot, join, listDir, readText, remove, writeText } from '../platform/fs'
import { useSettings } from './settings'

export interface ScriptMeta {
  id: string; title: string; author: string; modifiedAt: number; createdAt: number
  pages: number; scenes: number; words: number; coverColor: number; logline: string
  deadline: Deadline | null; locked: boolean
}

export interface VersionInfo { path: string; name: string; time: number; pages: number }

let root: string | null = null
async function paths() {
  root ??= await dataRoot()
  return { scripts: join(root, 'scripts'), versions: join(root, 'versions'), index: join(root, 'scripts', '_index.json'), root }
}
export const libraryRoot = async () => (await paths()).root

export function metaOf(s: Script, pages: number): ScriptMeta {
  let words = 0, scenes = 0
  for (const e of s.elements) {
    if (TYPE_INFO[e.type].printed) words += countWords(e.text)
    if (e.type === 'SCENE_HEADING') scenes++
  }
  const logline = s.elements.find(e => e.type === 'SCENE_HEADING' && e.synopsis.trim())?.synopsis
    ?? s.elements.find(e => e.type === 'ACTION' && e.text.trim() && e.text !== 'FADE IN:')?.text ?? ''
  return {
    id: s.id, title: s.title, author: authorOf(s.titlePage), modifiedAt: s.modifiedAt, createdAt: s.createdAt, pages, scenes, words,
    coverColor: s.coverColor, logline: logline.substring(0, 140), deadline: s.extras.deadline, locked: s.extras.lock.locked,
  }
}

async function readIndex(): Promise<Map<string, ScriptMeta>> {
  try {
    const arr = JSON.parse(await readText((await paths()).index)) as Record<string, unknown>[]
    return new Map(arr.map(o => {
      const dl = o.deadline as Record<string, unknown> | undefined
      const m: ScriptMeta = {
        id: String(o.id), title: String(o.title ?? ''), author: String(o.author ?? ''), modifiedAt: Number(o.modifiedAt ?? 0),
        createdAt: Number(o.createdAt ?? 0), pages: Number(o.pages ?? 0), scenes: Number(o.scenes ?? 0), words: Number(o.words ?? 0),
        coverColor: Number(o.coverColor ?? 0), logline: String(o.logline ?? ''), locked: Boolean(o.locked),
        deadline: dl ? { date: String(dl.date ?? ''), targetPages: Number(dl.pages ?? 110), startDate: String(dl.start ?? ''), startPages: Number(dl.startPages ?? 0), label: String(dl.label ?? 'First draft') } : null,
      }
      return [m.id, m]
    }))
  } catch { return new Map() }
}

async function writeIndex(list: ScriptMeta[]) {
  const arr = list.map(m => {
    const o: Record<string, unknown> = {
      id: m.id, title: m.title, author: m.author, modifiedAt: m.modifiedAt, createdAt: m.createdAt, pages: m.pages,
      scenes: m.scenes, words: m.words, coverColor: m.coverColor, logline: m.logline, locked: m.locked,
    }
    if (m.deadline) o.deadline = { date: m.deadline.date, pages: m.deadline.targetPages, start: m.deadline.startDate, startPages: m.deadline.startPages, label: m.deadline.label }
    return o
  })
  try { await writeText((await paths()).index, JSON.stringify(arr)) } catch { /* the index is only a cache */ }
}

/** Every script in the library, newest first. Scripts copied in from the phone are picked up here. */
export async function listLibrary(): Promise<ScriptMeta[]> {
  const p = await paths()
  const index = await readIndex()
  const files = (await listDir(p.scripts)).filter(f => !f.is_dir && f.name.endsWith('.json') && f.name !== '_index.json')
  const metas: ScriptMeta[] = []
  for (const f of files) {
    const id = f.name.replace(/\.json$/, '')
    const cached = index.get(id)
    if (cached && (f.modified === 0 || cached.modifiedAt >= f.modified - 2000 || !isFinite(f.modified))) { metas.push(cached); continue }
    try { metas.push(metaOf(scriptFromJson(await readText(f.path)), cached?.pages ?? 0)) } catch { /* skip unreadable files */ }
  }
  await writeIndex(metas)
  return metas.sort((a, b) => b.modifiedAt - a.modifiedAt)
}

export async function loadScript(id: string): Promise<Script> {
  return scriptFromJson(await readText(join((await paths()).scripts, `${id}.json`)))
}

export async function saveScript(s: Script, pages: number): Promise<ScriptMeta> {
  const p = await paths()
  await writeText(join(p.scripts, `${s.id}.json`), JSON.stringify(encodeScript(s)))
  const meta = metaOf(s, pages)
  const index = await readIndex()
  index.set(s.id, meta)
  await writeIndex([...index.values()])
  return meta
}

export async function createScript(title: string, elements?: Element[], tp?: TitlePage): Promise<Script> {
  const s = newScript({
    id: uuid(), title,
    elements: elements ?? [el(newId(), 'ACTION', 'FADE IN:'), el(newId(), 'SCENE_HEADING', '')],
    // A new script is credited to the writer named during onboarding (Settings › Your name).
    titlePage: tp ?? titlePage({ title, credits: [{ role: 'Written by', names: useSettings.getState().s.name.trim() }] }),
    coverColor: 1 + Math.floor(Math.random() * 9),
  })
  await saveScript(s, 1)
  return s
}

export async function deleteScript(id: string) {
  const p = await paths()
  await remove(join(p.scripts, `${id}.json`))
  await remove(join(p.versions, id))
  const index = await readIndex()
  index.delete(id)
  await writeIndex([...index.values()])
}

export async function duplicateScript(id: string): Promise<Script> {
  const s = await loadScript(id)
  const now = Date.now()
  const copy: Script = { ...s, id: uuid(), title: s.title + ' (copy)', titlePage: { ...s.titlePage, title: s.titlePage.title + ' (copy)' }, createdAt: now, modifiedAt: now }
  await saveScript(copy, 0)
  return copy
}

// ---------------------------------------------------------------- versions

export async function saveVersion(s: Script, name: string, pages: number, keep = 40) {
  const dir = join((await paths()).versions, s.id)
  const o = { ...encodeScript(s), versionName: name, versionPages: pages }
  await writeText(join(dir, `${Date.now()}.json`), JSON.stringify(o))
  const all = (await listDir(dir)).filter(f => f.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name))
  // Revision baselines ("Before Blue revisions", "Baseline …") and drafts sent to a co-writer outlive the rolling auto-saves.
  for (const f of all.slice(Math.max(1, keep))) {
    try { const n = String(JSON.parse(await readText(f.path)).versionName ?? ''); if (isBaseline(n) || n.startsWith('Sent draft')) continue } catch { /* unreadable: prune */ }
    await remove(f.path)
  }
}

/** Versions that mark the start of a revision set, which Track Changes compares against. */
export const isBaseline = (name: string) => /^(Before .+ revisions|Baseline)/.test(name)

export async function listVersions(id: string): Promise<VersionInfo[]> {
  const dir = join((await paths()).versions, id)
  const files = (await listDir(dir)).filter(f => f.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name))
  const out: VersionInfo[] = []
  for (const f of files) {
    try {
      const o = JSON.parse(await readText(f.path)) as Record<string, unknown>
      out.push({ path: f.path, name: String(o.versionName ?? 'Snapshot'), time: Number(f.name.replace(/\.json$/, '')), pages: Number(o.versionPages ?? 0) })
    } catch { /* skip */ }
  }
  return out
}

export async function loadVersion(v: VersionInfo): Promise<Script> {
  return decodeScript(JSON.parse(await readText(v.path)))
}

export const deleteVersion = (v: VersionInfo) => remove(v.path)
