/** Google Drive: connect, back up scripts, and open scripts saved there. */
import { useEffect, useState } from 'react'
import { cancelConnect, connect, consoleLink, disconnect, downloadText, driveClientId, listFiles, REDIRECT, upload, useDrive, type DriveFile } from '../io/drive'
import { isTauri } from '../platform/fs'
import { importText } from '../io/files'
import { scriptToJson } from '../core/codec'
import { listLibrary, loadScript } from '../state/library'
import { useDoc } from '../state/doc'
import { openLink } from '../state/media'
import { useApp } from './appState'
import { Icon } from './Icon'
import { Modal, toast, useModal } from './kit'

const safe = (s: string) => (s.trim() || 'Untitled').replace(/[\\/:*?"<>|]+/g, '').substring(0, 80)
const openable = (n: string) => /\.(pageone|fountain|fdx|txt|spmd)$/i.test(n)

const copy = (v: string) => { void navigator.clipboard.writeText(v).then(() => toast('Copied', 'check'), () => toast(v, 'link')) }
const Copyable = ({ v }: { v: string }) => <><code>{v}</code> <button className="btn quiet sm" style={{ minHeight: 22, height: 22, padding: '0 8px' }} onClick={() => copy(v)}>Copy</button></>

/** What the Google Cloud project needs, step by step — most failed connections are one of these. */
function DriveSetup() {
  const id = driveClientId()
  return (
    <ol className="drive-steps">
      <li>Open your OAuth client in Google Cloud{id && <> — <a href="#" onClick={e => { e.preventDefault(); openLink(consoleLink(id)) }}>open it directly</a></>}. It must be type <b>Web application</b>.</li>
      <li>Under <b>Authorised redirect URIs</b> add <Copyable v={REDIRECT} /> exactly (no slash at the end), then <b>Save</b>. Without it Google shows <i>Error 400: redirect_uri_mismatch</i>.</li>
      {!isTauri && <li>Under <b>Authorised JavaScript origins</b> add <Copyable v={location.origin} />.</li>}
      <li>APIs &amp; Services › Library: enable the <b>Google Drive API</b>.</li>
      <li>OAuth consent screen › while the app is in <b>Testing</b>, add your Google account under <b>Test users</b>.</li>
      <li>Google can take 5 minutes (sometimes longer) to apply changes — then connect again.</li>
    </ol>
  )
}

export function DriveModal() {
  const close = useModal(m => m.close)
  const token = useDrive(d => d.token)
  const email = useDrive(d => d.email)
  const pending = useDrive(d => d.pending)
  const script = useDoc(d => d.script)
  const [files, setFiles] = useState<DriveFile[] | null>(null)
  const [busy, setBusy] = useState('')
  const hasId = !!driveClientId()

  const run = async (label: string, f: () => Promise<void>) => {
    setBusy(label)
    try { await f() } catch (e) { if ((e as Error).name !== 'AbortError') toast((e as Error).message, 'close') } finally { setBusy('') }
  }
  const refresh = () => run('Loading…', async () => setFiles(await listFiles()))
  useEffect(() => { if (token && files == null) void refresh() }, [token])

  return (
    <Modal title="Google Drive" icon="cloud" onClose={close} wide>
      {!hasId ? (
        <div className="callout"><Icon name="cloud" size={15} /><span>Google Drive isn't switched on in this copy of Page One. Your scripts are still saved on this computer, and Export can save any format to a folder you sync.</span></div>
      ) : !token ? (
        <div className="drive-connect">
          <Icon name="cloud" size={30} />
          <h3>Keep your scripts in Google Drive</h3>
          <p className="muted">Save scripts and exports to a <b>Page One</b> folder in your Drive, back up the whole library, and open scripts from any computer. Page One only sees the files it creates.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn" disabled={!!busy || pending} onClick={() => run(isTauri ? 'Finish signing in in your browser…' : 'Connecting…', async () => { await connect() })}><Icon name="cloud" size={14} />{busy || (pending ? 'Finish signing in in your browser…' : 'Connect Google Drive')}</button>
            {pending && <button className="btn ghost" onClick={cancelConnect}>Cancel</button>}
          </div>
          {isTauri && <p className="faint" style={{ fontSize: 12 }}>{pending ? 'If the browser shows an error instead of “connected”, cancel and check the setup below.' : 'Your web browser opens for Google sign-in, then hands you back here.'}</p>}
          {/* The Google Cloud checklist is for whoever builds Page One, so only development builds show it. */}
          {import.meta.env.DEV && <details className="drive-help" open={pending || undefined}><summary>Not connecting? Check the setup</summary><DriveSetup /></details>}
        </div>
      ) : <>
        <div className="row" style={{ marginBottom: 14 }}>
          <span className="chip accent"><Icon name="check" size={12} />Connected{email ? ` as ${email}` : ''}</span>
          <span className="spacer" />
          <button className="btn quiet sm" onClick={() => { disconnect(); setFiles(null) }}>Disconnect</button>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {script && <button className="btn" disabled={!!busy} onClick={() => run('Saving…', async () => {
            const f = await upload(`${safe(script.title)}.pageone`, scriptToJson(script), 'application/json')
            toast(`Saved “${f.name}” to Drive`, 'cloud'); await refresh()
          })}><Icon name="export" size={14} />Save this script</button>}
          {script && <button className="btn ghost" onClick={() => useModal.getState().open('export')}><Icon name="page" size={14} />Export to Drive…</button>}
          <button className="btn ghost" disabled={!!busy} onClick={() => run('Backing up…', async () => {
            const all = await listLibrary()
            for (const m of all) { const s = await loadScript(m.id); await upload(`${safe(s.title)}.pageone`, scriptToJson(s), 'application/json') }
            toast(`Backed up ${all.length} script${all.length === 1 ? '' : 's'} to Drive`, 'cloud'); await refresh()
          })}><Icon name="layers" size={14} />Back up all scripts</button>
          <span className="spacer" />
          {busy && <span className="faint" style={{ fontSize: 12 }}>{busy}</span>}
          <button className="icon-btn" title="Refresh" onClick={() => void refresh()}><Icon name="undo" /></button>
        </div>
        <div className="section-title" style={{ marginTop: 18 }}>In Drive › Page One</div>
        {files && files.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>Nothing here yet.</div>}
        {files?.map(f => (
          <div key={f.id} className="list-row" style={{ cursor: 'default' }}>
            <Icon name={openable(f.name) ? 'script' : 'page'} />
            <span className="grow"><b style={{ fontWeight: 600 }}>{f.name}</b><span className="faint" style={{ display: 'block', fontSize: 11.5 }}>{new Date(f.modifiedTime).toLocaleString()}</span></span>
            {openable(f.name) && <button className="btn ghost sm" disabled={!!busy} onClick={() => run('Opening…', async () => {
              const id = await importText(f.name, await downloadText(f.id))
              close(); await useApp.getState().refresh(); await useApp.getState().openScript(id)
              toast(`Opened “${f.name}” from Drive`, 'cloud')
            })}>Open</button>}
            {f.webViewLink && <button className="icon-btn" title="Show in Drive" onClick={() => openLink(f.webViewLink!)}><Icon name="link" /></button>}
          </div>
        ))}
      </>}
    </Modal>
  )
}
