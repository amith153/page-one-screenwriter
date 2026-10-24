/** What a note can carry besides words: pictures, voice notes and web links (the phone's attachment kinds). */
import { useEffect, useRef, useState } from 'react'
import type { Attachment } from '../core/model'
import { deleteMedia, isLink, mediaUrl, openLink, pickBlobs, putImage, putMedia } from '../state/media'
import { Icon } from './Icon'
import { Lightbox, toast } from './kit'

const fmt = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

export function useMediaUrl(ref: string) {
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let live = true
    void mediaUrl(ref).then(u => { if (live) { setUrl(u); setMissing(!u) } })
    return () => { live = false }
  }, [ref])
  return { url, missing }
}

function Thumb({ a, onOpen }: { a: Attachment; onOpen: (url: string) => void }) {
  const { url, missing } = useMediaUrl(a.file)
  if (missing) return <span className="att-missing" title="This picture is on another device"><Icon name="page" size={14} />On the phone</span>
  return url ? <img className="att-img" src={url} alt={a.name} onClick={() => onOpen(url)} /> : <span className="att-img loading" />
}

function Voice({ a }: { a: Attachment }) {
  const { url, missing } = useMediaUrl(a.file)
  if (missing) return <span className="att-missing"><Icon name="mic" size={14} />Voice note on the phone{a.durationMs ? ` · ${fmt(a.durationMs)}` : ''}</span>
  return <div className="att-audio"><Icon name="mic" size={14} />{url && <audio controls preload="metadata" src={url} />}</div>
}

export function AttachmentList({ list, onRemove }: { list: Attachment[]; onRemove?: (a: Attachment) => void }) {
  const [big, setBig] = useState<string | null>(null)
  if (!list.length) return null
  const x = (a: Attachment) => onRemove && (
    <button className="icon-btn sm att-x" title="Remove" onClick={e => { e.stopPropagation(); onRemove(a) }}><Icon name="close" size={11} /></button>
  )
  return (
    <div className="att-list">
      {list.filter(a => a.kind === 'IMAGE').length > 0 && (
        <div className="att-imgs">
          {list.filter(a => a.kind === 'IMAGE').map(a => <span key={a.file} className="att-wrap"><Thumb a={a} onOpen={setBig} />{x(a)}</span>)}
        </div>
      )}
      {list.filter(a => a.kind === 'AUDIO' || a.kind === 'VIDEO').map(a => <span key={a.file} className="att-wrap row"><Voice a={a} />{x(a)}</span>)}
      {list.filter(a => a.kind === 'LINK').map(a => (
        <span key={a.file} className="att-wrap row">
          <button className="att-link" title={a.file} onClick={e => { e.stopPropagation(); openLink(a.file) }}>
            <Icon name="link" size={13} /><span className="ellipsis">{a.name || a.file.replace(/^https?:\/\/(www\.)?/, '')}</span>{a.name && <span className="faint">{hostOf(a.file)}</span>}
          </button>{x(a)}
        </span>
      ))}
      {big && <Lightbox src={big} onClose={() => setBig(null)} />}
    </div>
  )
}

/** Record from the microphone; resolves with the stored file and its length. */
function useRecorder(onDone: (file: string, ms: number) => void) {
  const rec = useRef<MediaRecorder | null>(null)
  const [since, setSince] = useState<number | null>(null)
  const [, tick] = useState(0)
  useEffect(() => {
    if (since == null) return
    const t = window.setInterval(() => tick(n => n + 1), 250)
    return () => window.clearInterval(t)
  }, [since])
  useEffect(() => () => { if (rec.current?.state === 'recording') rec.current.stop() }, [])
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) ?? ''
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      const chunks: Blob[] = []
      const t0 = Date.now()
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      r.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setSince(null)
        const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' })
        if (blob.size) onDone(await putMedia(blob, r.mimeType.includes('mp4') ? 'x.m4a' : 'x.webm'), Date.now() - t0)
      }
      r.start()
      rec.current = r
      setSince(t0)
    } catch { toast('Microphone not available — check that Page One may use it', 'close') }
  }
  const stop = () => rec.current?.stop()
  return { recording: since != null, elapsed: since ? Date.now() - since : 0, start, stop }
}

/** Buttons to add a picture, a voice note or a link. */
export function AttachBar({ onAdd }: { onAdd: (a: Attachment) => void }) {
  const [link, setLink] = useState<{ url: string; title: string } | null>(null)
  const voice = useRecorder((file, ms) => onAdd({ file, kind: 'AUDIO', name: 'Voice note', durationMs: ms }))
  const addPictures = async () => {
    for (const f of await pickBlobs('image/*', true)) onAdd({ file: await putImage(f), kind: 'IMAGE', name: f.name.replace(/\.[^.]+$/, ''), durationMs: 0 })
  }
  const addAudio = async () => {
    for (const f of await pickBlobs('audio/*')) onAdd({ file: await putMedia(f, f.name), kind: 'AUDIO', name: f.name.replace(/\.[^.]+$/, ''), durationMs: 0 })
  }
  const saveLink = () => {
    if (!link) return
    const u = link.url.trim()
    if (!u) return setLink(null)
    const url = isLink(u) ? u : 'https://' + u
    onAdd({ file: url, kind: 'LINK', name: link.title.trim(), durationMs: 0 })
    setLink(null)
  }
  return (
    <div className="attach-bar" onClick={e => e.stopPropagation()}>
      {link ? (
        <div className="col" style={{ gap: 6, width: '100%' }}>
          <input className="input sm" autoFocus placeholder="Paste a link — https://…" value={link.url}
            onChange={e => setLink({ ...link, url: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') saveLink(); if (e.key === 'Escape') setLink(null) }} />
          <div className="row">
            <input className="input sm" placeholder="Title (optional)" value={link.title} onChange={e => setLink({ ...link, title: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') saveLink() }} />
            <button className="btn sm" onClick={saveLink}>Add</button>
          </div>
        </div>
      ) : voice.recording ? (
        <button className="btn sm danger rec" onClick={voice.stop}><span className="rec-dot" />Stop · {fmt(voice.elapsed)}</button>
      ) : <>
        <button className="icon-btn sm" title="Add a picture" onClick={() => void addPictures()}><Icon name="image" size={14} /></button>
        <button className="icon-btn sm" title="Record a voice note" onClick={() => void voice.start()}><Icon name="mic" size={14} /></button>
        <button className="icon-btn sm" title="Add an audio file" onClick={() => void addAudio()}><Icon name="music" size={14} /></button>
        <button className="icon-btn sm" title="Paste a link" onClick={async () => {
          let clip = ''
          try { clip = (await navigator.clipboard.readText()).trim() } catch { /* no clipboard access */ }
          setLink({ url: isLink(clip) ? clip : '', title: '' })
        }}><Icon name="link" size={14} /></button>
      </>}
    </div>
  )
}

/** Remove an attachment and its stored file. */
export const dropAttachment = (a: Attachment) => { void deleteMedia(a.file) }
