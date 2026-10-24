/**
 * Pictures and voice notes used by notes and mood boards. Like the phone, a reference is a plain
 * file name in the library's media folder (<root>/media/<name>); in a browser the bytes live in
 * IndexedDB instead. Web links are stored as-is (an http(s) URL) and never copied.
 */
import { invoke } from '@tauri-apps/api/core'
import { isTauri, join, openPath, remove } from '../platform/fs'
import { libraryRoot } from './library'

export const isLink = (ref: string) => /^https?:\/\//i.test(ref)

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', webm: 'audio/webm', wav: 'audio/wav', mp4: 'video/mp4',
}
export const mimeOf = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
const extOf = (mime: string) => Object.entries(MIME).find(([, m]) => m === mime.split(';')[0])?.[0] ?? 'bin'

// ---------------------------------------------------------------- browser store

let db: Promise<IDBDatabase> | null = null
function idb(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('pageone-media', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('files')
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
  return db
}
async function idbDo<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await idb()
  return new Promise((resolve, reject) => {
    const req = f(d.transaction('files', mode).objectStore('files'))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

const mediaDir = async () => join(await libraryRoot(), 'media')

// ---------------------------------------------------------------- API

/** Store bytes and return the file name to reference them by. */
export async function putMedia(data: Blob, hint = ''): Promise<string> {
  const ext = hint.includes('.') ? hint.split('.').pop()!.toLowerCase() : extOf(data.type)
  const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`
  if (isTauri) await invoke('write_bytes', { path: join(await mediaDir(), name), contents: Array.from(new Uint8Array(await data.arrayBuffer())) })
  else await idbDo('readwrite', s => s.put(data, name))
  return name
}

/** Pictures are scaled down to 1600 px on the long side, as on the phone, so boards stay light. */
export async function putImage(file: Blob): Promise<string> {
  if (file.type === 'image/gif') return putMedia(file)
  try {
    const bmp = await createImageBitmap(file)
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    if (k >= 1 && file.size < 1_500_000) return putMedia(file)
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.88))
    return putMedia(out ?? file, 'x.jpg')
  } catch { return putMedia(file) }
}

const urls = new Map<string, Promise<string | null>>()

/** An object URL for a stored file (cached), the link itself for web links, or null if it's missing (e.g. still on the phone). */
export function mediaUrl(ref: string): Promise<string | null> {
  if (!ref) return Promise.resolve(null)
  if (isLink(ref) || ref.startsWith('data:') || ref.startsWith('blob:')) return Promise.resolve(ref)
  let p = urls.get(ref)
  if (!p) {
    p = (async () => {
      try {
        let blob: Blob | undefined
        if (isTauri) blob = new Blob([new Uint8Array(await invoke<number[]>('read_bytes', { path: join(await mediaDir(), ref) }))], { type: mimeOf(ref) })
        else blob = await idbDo<Blob | undefined>('readonly', s => s.get(ref))
        return blob ? URL.createObjectURL(blob) : null
      } catch { return null }
    })()
    urls.set(ref, p)
  }
  return p
}

export async function deleteMedia(ref: string) {
  if (!ref || isLink(ref)) return
  urls.delete(ref)
  try {
    if (isTauri) await remove(join(await mediaDir(), ref))
    else await idbDo('readwrite', s => s.delete(ref))
  } catch { /* already gone */ }
}

/** Open a web link in the system browser. */
export function openLink(url: string) {
  // Web pages only: anything else (file://, a program path) is never handed to the system.
  const u = isLink(url) ? url : 'https://' + url.replace(/^[a-z]+:\/*/i, '')
  if (isTauri) void openPath(u)
  else window.open(u, '_blank', 'noopener')
}

/** Ask for files (pictures, audio). */
export function pickBlobs(accept: string, multiple = false): Promise<File[]> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve([...(input.files ?? [])])
    input.click()
  })
}
