/**
 * Google Drive: sign in with Google, then save
 * scripts and exports to a "Page One" folder in your Drive and open them back. The app only asks
 * for `drive.file`, so it sees just the files it made — never the rest of your Drive.
 *
 * Google refuses to sign in inside an embedded webview, so the desktop app signs in through the
 * system browser and Google redirects back to a loopback port (REDIRECT, which must be listed under
 * the OAuth client's "Authorised redirect URIs"). In a plain browser, Identity Services' popup is used.
 */
import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'
import { isTauri } from '../platform/fs'

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER = 'Page One'
const API = 'https://www.googleapis.com/drive/v3'
const PORT = 47823
export const REDIRECT = `http://localhost:${PORT}`
const SAVED = 'pageone-drive'

/** Built in through .env.local at build time; writers never see or set it. */
export const driveClientId = () => import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''

interface TokenResponse { access_token?: string; expires_in?: number; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (o?: { prompt?: string }) => void; callback: (r: TokenResponse) => void }
declare global {
  interface Window {
    google?: { accounts: { oauth2: {
      initTokenClient: (o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }) => TokenClient
      revoke: (token: string, done?: () => void) => void
    } } }
  }
}

interface DriveState {
  token: string | null; expires: number; email: string
  /** A browser sign-in is under way (not saved), so a reopened Drive window can still offer Cancel. */
  pending: boolean
  set: (p: Partial<DriveState>) => void
}
function saved(): Pick<DriveState, 'token' | 'expires' | 'email'> {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED) ?? 'null')
    if (v?.token && Date.now() < v.expires - 60_000) return v
  } catch { /* nothing saved */ }
  return { token: null, expires: 0, email: '' }
}
// The token lasts an hour; keeping it means a restart within that hour needs no new sign-in.
export const useDrive = create<DriveState>(set => ({
  ...saved(),
  pending: false,
  set: p => set(st => {
    const next = { ...st, ...p }
    try { localStorage.setItem(SAVED, JSON.stringify({ token: next.token, expires: next.expires, email: next.email })) } catch { /* storage blocked */ }
    return p
  }),
}))

const signedIn = (token: string, expiresIn?: number) => {
  useDrive.getState().set({ token, expires: Date.now() + (expiresIn ?? 3600) * 1000 })
  void whoAmI(token)
  return token
}

/** Desktop: the system browser signs in, and Google hands the token back over the loopback port. */
async function connectViaBrowser(clientId: string): Promise<string> {
  const state = crypto.randomUUID()
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: REDIRECT, response_type: 'token', scope: SCOPE, state,
    include_granted_scopes: 'true', prompt: 'select_account',
  })
  let raw: string
  useDrive.setState({ pending: true })
  try { raw = await invoke<string>('oauth_loopback', { url, port: PORT }) } catch (e) {
    if (String(e) === 'cancelled') { const c = new Error('Sign-in cancelled.'); c.name = 'AbortError'; throw c }
    throw new Error(String(e))
  } finally { useDrive.setState({ pending: false }) }
  const back = new URLSearchParams(raw)
  if (back.get('error')) throw new Error(back.get('error') === 'access_denied' ? 'Google sign-in was cancelled or blocked (if the app is in Testing, add your Google account as a test user).' : `Google said: ${back.get('error')}`)
  if (back.get('state') !== state) throw new Error('Google sign-in came back for a different request — try again.')
  const token = back.get('access_token')
  if (!token) throw new Error('Google sign-in did not return a token.')
  return signedIn(token, Number(back.get('expires_in')) || 3600)
}

/** Stop waiting for the browser (e.g. Google showed an error page instead of coming back). */
export function cancelConnect() {
  if (isTauri) void invoke('oauth_cancel').catch(() => {})
}

/** The OAuth client's page in Google Cloud Console (the project number is the client ID's prefix). */
export function consoleLink(clientId = driveClientId()): string {
  const project = clientId.split('-')[0]
  return /^\d+$/.test(project)
    ? `https://console.cloud.google.com/apis/credentials/oauthclient/${clientId}?project=${project}`
    : 'https://console.cloud.google.com/apis/credentials'
}

let gis: Promise<void> | null = null
function loadGis(): Promise<void> {
  gis ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { gis = null; reject(new Error("Couldn't reach Google — check your connection.")) }
    document.head.appendChild(s)
  })
  return gis
}

/** Sign in (or reuse a still-valid token). */
export async function connect(interactive = true): Promise<string> {
  const d = useDrive.getState()
  if (d.token && Date.now() < d.expires - 60_000) return d.token
  const clientId = driveClientId()
  if (!clientId) throw new Error('Add a Google OAuth client ID first (Settings › Google Drive).')
  if (isTauri) {
    if (!interactive) throw new Error('Your Google sign-in expired — connect again.')
    return connectViaBrowser(clientId)
  }
  await loadGis()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: SCOPE,
      callback: r => {
        if (!r.access_token) return reject(new Error(r.error_description || r.error || 'Google sign-in was cancelled.'))
        resolve(signedIn(r.access_token, r.expires_in))
      },
      error_callback: e => reject(new Error(e.type === 'popup_closed' ? 'Google sign-in was closed.' : e.message || 'Google sign-in failed.')),
    })
    client.requestAccessToken({ prompt: interactive && !d.token ? 'consent' : '' })
  })
}

export function disconnect() {
  const t = useDrive.getState().token
  if (t) void fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => {})
  useDrive.getState().set({ token: null, expires: 0, email: '' })
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await connect()
  const r = await fetch(path.startsWith('http') ? path : API + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } })
  if (r.status === 401) { useDrive.getState().set({ token: null }); throw new Error('Your Google sign-in expired — connect again.') }
  if (!r.ok) throw new Error(`Google Drive said ${r.status}: ${(await r.text()).slice(0, 160)}`)
  return r
}

async function whoAmI(token: string) {
  try {
    const r = await fetch(`${API}/about?fields=user(emailAddress)`, { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) useDrive.getState().set({ email: (await r.json()).user?.emailAddress ?? '' })
  } catch { /* only for display */ }
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

let folderId: string | null = null
async function folder(): Promise<string> {
  if (folderId) return folderId
  const found = await (await call(`/files?q=${encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)`)).json()
  if (found.files?.[0]?.id) return (folderId = found.files[0].id as string)
  const made = await (await call('/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  })).json()
  return (folderId = made.id as string)
}

export interface DriveFile { id: string; name: string; modifiedTime: string; size?: string; webViewLink?: string }

/** Save a file into the Page One folder, replacing one of the same name. */
export async function upload(name: string, data: Uint8Array | string, mime: string): Promise<DriveFile> {
  const parent = await folder()
  const existing = await (await call(`/files?q=${encodeURIComponent(`name='${q(name)}' and '${parent}' in parents and trashed=false`)}&fields=files(id)`)).json()
  const id = existing.files?.[0]?.id as string | undefined
  const boundary = 'pageone' + crypto.randomUUID().replace(/-/g, '')
  const meta = id ? { name } : { name, parents: [parent] }
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    data as BlobPart, `\r\n--${boundary}--`,
  ])
  const url = `https://www.googleapis.com/upload/drive/v3/files${id ? '/' + id : ''}?uploadType=multipart&fields=id,name,modifiedTime,webViewLink`
  return (await call(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body })).json()
}

export async function listFiles(): Promise<DriveFile[]> {
  const parent = await folder()
  const r = await (await call(`/files?q=${encodeURIComponent(`'${parent}' in parents and trashed=false`)}&orderBy=modifiedTime desc&pageSize=200&fields=files(id,name,modifiedTime,size,webViewLink)`)).json()
  return r.files ?? []
}

export async function downloadText(id: string): Promise<string> {
  return (await call(`/files/${id}?alt=media`)).text()
}
