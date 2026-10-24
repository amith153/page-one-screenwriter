/**
 * Wi-Fi sync transport. The desktop shell (`src-tauri/src/lan.rs`) listens for requests from your phone
 * and makes plain HTTP requests to addresses on your own network; the sync logic itself is in
 * `src/state/sync.ts`. Nothing leaves your network and no server or key is involved.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { isTauri } from '../platform/fs'

export const PORT = 47831
export const lanAvailable = isTauri

export interface Incoming { id: number; method: string; path: string; auth: string; remote: string; body: string }
export type Handler = (r: Incoming) => Promise<[number, unknown]>

let unlisten: UnlistenFn | null = null

/** Start answering requests from other devices. */
export async function serve(handler: Handler) {
  if (!isTauri) return
  unlisten?.(); unlisten = null
  unlisten = await listen<Incoming>('lan-request', async e => {
    let out: [number, unknown]
    try { out = await handler(e.payload) } catch (err) { out = [500, { error: String((err as Error).message ?? err) }] }
    await invoke('lan_respond', { id: e.payload.id, status: out[0], body: JSON.stringify(out[1]) })
  })
  await invoke('lan_serve', { port: PORT })
}

export async function stopServing() {
  unlisten?.(); unlisten = null
  if (isTauri) await invoke('lan_stop')
}

export interface Reply<T = unknown> { status: number; json: T | null }

/** One request to another device. `address` is an IP address, with an optional :port. */
export async function request<T = unknown>(address: string, method: string, path: string, auth = '', body?: unknown, timeoutMs = 4000): Promise<Reply<T>> {
  const host = address.includes(':') ? address : `${address}:${PORT}`
  const [status, text] = await invoke<[number, string]>('lan_fetch', { target: host + path, method, auth, body: body === undefined ? '' : JSON.stringify(body), timeoutMs })
  let json: T | null = null
  try { json = text ? JSON.parse(text) as T : null } catch { /* not json */ }
  return { status, json }
}

export const myAddresses = (): Promise<string[]> => (isTauri ? invoke<string[]>('lan_ips') : Promise.resolve([]))

/** Look through this network's last number (192.168.1.x) for the device that answers as `id`. */
export async function findDevice(ownIp: string, id: string): Promise<string | null> {
  const p = ownIp.split('.')
  if (p.length !== 4) return null
  const hosts = Array.from({ length: 254 }, (_, i) => `${p[0]}.${p[1]}.${p[2]}.${i + 1}`).filter(h => h !== ownIp)
  for (let i = 0; i < hosts.length; i += 64) {
    const batch = await Promise.all(hosts.slice(i, i + 64).map(async h => {
      try { const r = await request<{ id?: string }>(h, 'GET', '/hello', '', undefined, 500); return r.status === 200 && r.json?.id === id ? h : null } catch { return null }
    }))
    const hit = batch.find(Boolean)
    if (hit) return hit
  }
  return null
}

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export function newCode(): string {
  const r = new Uint32Array(8)
  crypto.getRandomValues(r)
  return [...r].map(v => ALPHABET[v % ALPHABET.length]).join('')
}
export const prettyCode = (c: string) => c.slice(0, 4) + '-' + c.slice(4)
export const cleanCode = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '')
export function newSecret(): string {
  const r = new Uint8Array(24)
  crypto.getRandomValues(r)
  return [...r].map(b => b.toString(16).padStart(2, '0')).join('')
}
