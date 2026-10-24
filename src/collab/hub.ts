/**
 * Shared Firebase plumbing (port of the phone's `collab/Hub.kt`): one app per server, anonymous
 * sign-in and join codes. Desktop and phone talk to the same server with the same layout, so a
 * join code made on either opens the script live on the other.
 */
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { doc, getDoc, initializeFirestore, getFirestore, persistentLocalCache, serverTimestamp, setDoc, type Firestore, type Timestamp } from 'firebase/firestore'

export interface ServerConfig { projectId: string; apiKey: string; appId: string }
export const isValid = (c: ServerConfig) => !!(c.projectId.trim() && c.apiKey.trim())

/** The server built in through .env.local at build time — the same one the phone app is built with. Writers never see or set it. */
export const builtInServer = (): ServerConfig => ({
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() ?? '',
})

export const currentServer = builtInServer

export function app(c: ServerConfig): FirebaseApp {
  const name = 'pageone-' + c.projectId
  return getApps().find(a => a.name === name) ?? initializeApp({
    projectId: c.projectId, apiKey: c.apiKey, ...(c.appId ? { appId: c.appId } : {}), authDomain: `${c.projectId}.firebaseapp.com`,
  }, name)
}

const stores = new Map<string, Firestore>()
export function firestore(c: ServerConfig): Firestore {
  let f = stores.get(c.projectId)
  if (!f) {
    const a = app(c)
    // An offline cache, like the phone's: edits made without a connection sync later.
    try { f = initializeFirestore(a, { localCache: persistentLocalCache() }) } catch { f = getFirestore(a) }
    stores.set(c.projectId, f)
  }
  return f
}

/** Signs in anonymously if needed and returns this device's user id. */
export async function uid(c: ServerConfig): Promise<string> {
  const auth = getAuth(app(c))
  if (auth.currentUser) return auth.currentUser.uid
  await auth.authStateReady()
  if (auth.currentUser) return (auth.currentUser as { uid: string }).uid
  return (await signInAnonymously(auth)).user.uid
}

// ---------------------------------------------------------------- join codes

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // no 0/O, 1/I/L
const CODE_RE = /\b([2-9A-HJ-NP-Z]{4})-?([2-9A-HJ-NP-Z]{4})\b/
const CODE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

export function newCode(): string {
  const r = new Uint32Array(8)
  crypto.getRandomValues(r)
  return [...r].map(v => ALPHABET[v % ALPHABET.length]).join('')
}

/** "k7qp x2ma", "K7QP-X2MA", a pageone:// link or a whole message → "K7QPX2MA". */
export function findCode(text: string): string | null {
  const m = CODE_RE.exec(text.toUpperCase())
  return m ? m[1] + m[2] : null
}

export const pretty = (code: string) => code.slice(0, 4) + '-' + code.slice(4)

/** A brand-new join code for a shared script — every invite gets its own. */
export async function codeFor(c: ServerConfig, scriptId: string, title: string, from: string): Promise<string> {
  const db = firestore(c)
  await uid(c)
  for (let i = 0; i < 5; i++) {
    const code = newCode()
    try {
      await setDoc(doc(db, 'invites', code), { s: scriptId, t: title, n: from, at: serverTimestamp() })
      return code
    } catch { /* a clash with an existing code is refused by the rules — try another */ }
  }
  throw new Error("Couldn't reach the live-sync server")
}

export interface Invite { scriptId: string; title: string; from: string }

export async function resolve(c: ServerConfig, code: string): Promise<Invite | null> {
  const db = firestore(c)
  await uid(c)
  const d = await getDoc(doc(db, 'invites', code))
  if (!d.exists()) return null
  const at = (d.get('at') as Timestamp | undefined)?.toMillis()
  if (at != null && Date.now() - at > CODE_LIFETIME_MS) return null
  const sid = d.get('s') as string | undefined
  if (!sid) return null
  return { scriptId: sid, title: (d.get('t') as string) || 'Shared script', from: (d.get('n') as string) || 'your co-writer' }
}

export const PEER_COLORS = [0xFF4D9DFF, 0xFF3FBF7F, 0xFFB388FF, 0xFFFF5C8A, 0xFFFFB74D, 0xFF26C6DA, 0xFFE0B040]

/** Java's String.hashCode, so a name gets the same colour here as on the phone. */
function javaHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}
export const colorFor = (id: string) => PEER_COLORS[(javaHash(id) & 0x7fffffff) % PEER_COLORS.length]
export const argbHex = (argb: number) => '#' + (argb >>> 0).toString(16).padStart(8, '0').substring(2)
