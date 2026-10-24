/**
 * Files and dialogs. In the desktop app these go to the Rust side (atomic writes, native dialogs);
 * in a plain browser (handy for development) they fall back to localStorage and downloads, so
 * the whole app still runs.
 */
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
// Imported up front: a lazy import made the dev server re-bundle mid-export ("Failed to fetch").
import { open, save } from '@tauri-apps/plugin-dialog'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
export const platform: 'windows' | 'mac' | 'linux' =
  /Mac/i.test(navigator.userAgent) ? 'mac' : /Win/i.test(navigator.userAgent) ? 'windows' : 'linux'

export interface Entry { name: string; path: string; is_dir: boolean; modified: number; size: number }

export const join = (...parts: string[]) => parts.join(platform === 'windows' && isTauri ? '\\' : '/')

// ---------------------------------------------------------------- browser fallback

const KEY = 'pageone-fs:'
const mem = {
  list(dir: string): Entry[] {
    const prefix = KEY + dir.replace(/[\\/]+$/, '') + '/'
    const seen = new Map<string, Entry>()
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!
      if (!k.startsWith(prefix)) continue
      const rest = k.substring(prefix.length)
      const name = rest.split('/')[0]
      const isDir = rest.includes('/')
      if (!seen.has(name)) {
        const v = isDir ? '' : localStorage.getItem(k) ?? ''
        seen.set(name, { name, path: dir + '/' + name, is_dir: isDir, modified: Date.now(), size: v.length })
      }
    }
    return [...seen.values()]
  },
}

// ---------------------------------------------------------------- API

export async function dataRoot(): Promise<string> {
  return isTauri ? invoke<string>('data_root') : 'library'
}

export async function listDir(path: string): Promise<Entry[]> {
  return isTauri ? invoke<Entry[]>('list_dir', { path }) : mem.list(path)
}

export async function readText(path: string): Promise<string> {
  if (isTauri) return invoke<string>('read_text', { path })
  const v = localStorage.getItem(KEY + path)
  if (v == null) throw new Error(`Not found: ${path}`)
  return v
}

export async function writeText(path: string, contents: string): Promise<void> {
  if (isTauri) return invoke('write_text', { path, contents })
  localStorage.setItem(KEY + path, contents)
}

export async function remove(path: string): Promise<void> {
  if (isTauri) return invoke('remove_path', { path })
  const k = KEY + path
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)!
    if (key === k || key.startsWith(k + '/')) localStorage.removeItem(key)
  }
}

export async function openPath(path: string): Promise<void> {
  if (isTauri) await invoke('open_path', { path })
}

// ---------------------------------------------------------------- dialogs

export interface Filter { name: string; extensions: string[] }

export interface PickedFile { name: string; path: string | null; read: () => Promise<string> }

/** Ask the writer for a file to open. */
export async function pickFile(filters: Filter[]): Promise<PickedFile | null> {
  if (isTauri) {
    const path = await open({ multiple: false, directory: false, filters })
    if (!path || Array.isArray(path)) return null
    const name = path.split(/[\\/]/).pop() ?? path
    return { name, path, read: () => invoke<string>('read_text', { path }) }
  }
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = filters.flatMap(f => f.extensions.map(e => '.' + e)).join(',')
    input.onchange = () => {
      const f = input.files?.[0]
      resolve(f ? { name: f.name, path: null, read: () => f.text() } : null)
    }
    input.click()
  })
}

/** Save bytes or text where the writer chooses. Returns the saved path (desktop) or null if cancelled. */
export async function saveFile(defaultName: string, filters: Filter[], data: Uint8Array | string, mime: string): Promise<string | null> {
  if (isTauri) {
    const path = await save({ defaultPath: defaultName, filters })
    if (!path) return null
    if (typeof data === 'string') await invoke('write_text', { path, contents: data })
    else await invoke('write_bytes', { path, contents: Array.from(data) })
    return path
  }
  const blob = new Blob([data as BlobPart], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = defaultName
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  return defaultName
}

// ---------------------------------------------------------------- window

export async function windowAction(action: 'minimize' | 'maximize' | 'close' | 'drag') {
  if (!isTauri) return
  const w = getCurrentWindow()
  if (action === 'minimize') await w.minimize()
  else if (action === 'maximize') await w.toggleMaximize()
  else if (action === 'close') await w.close()
  else await w.startDragging()
}
