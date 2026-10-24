/** The mood board: pictures that set the look and feel of the film. Same data as the phone's board. */
import { useEffect, useRef, useState } from 'react'
import type { MoodImage } from '../core/model'
import { useDoc } from '../state/doc'
import { deleteMedia, isLink, pickBlobs, putImage } from '../state/media'
import { Icon } from './Icon'
import { Modal, toast } from './kit'
import { useMediaUrl } from './NoteAttachments'

const setBoard = (f: (b: MoodImage[]) => MoodImage[]) =>
  useDoc.getState().update(s => ({ ...s, extras: { ...s.extras, board: f(s.extras.board) } }), { elementsChanged: false })

async function addFiles(files: File[]) {
  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length) return
  const added: MoodImage[] = []
  for (const f of imgs) added.push({ file: await putImage(f), caption: '' })
  setBoard(b => [...b, ...added])
  toast(`Added ${added.length} picture${added.length === 1 ? '' : 's'}`, 'image')
}

export function Moodboard() {
  const board = useDoc(d => d.script?.extras.board ?? [])
  const [over, setOver] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const [big, setBig] = useState<number | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // Paste pictures (or a picture's web address) straight onto the board.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) { e.preventDefault(); void addFiles(files); return }
      const t = e.clipboardData?.getData('text')?.trim() ?? ''
      if (isLink(t)) { e.preventDefault(); setBoard(b => [...b, { file: t, caption: '' }]) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const move = (from: number, to: number) => setBoard(b => { const a = [...b]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a })

  return (
    <div ref={box} className={'moodboard' + (over ? ' drop-over' : '')}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setOver(false) }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]) } }}>
      <div className="mood-head">
        <div>
          <h2 className="display">Mood board</h2>
          <p className="muted">The look, light and texture of the film. Drop pictures here, paste them, or add a web image.</p>
        </div>
        <span className="spacer" />
        {link != null ? (
          <div className="row">
            <input className="input" style={{ width: 300 }} autoFocus placeholder="https://… image address" value={link} onChange={e => setLink(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setLink(null)
                if (e.key === 'Enter' && isLink(link.trim())) { setBoard(b => [...b, { file: link.trim(), caption: '' }]); setLink(null) }
              }} />
            <button className="btn ghost" onClick={() => setLink(null)}>Cancel</button>
          </div>
        ) : <>
          <button className="btn ghost" onClick={() => setLink('')}><Icon name="link" size={14} />From a link</button>
          <button className="btn" onClick={async () => addFiles(await pickBlobs('image/*', true))}><Icon name="plus" size={14} />Add pictures</button>
        </>}
      </div>

      {board.length === 0 ? (
        <div className="empty-state mood-empty"><Icon name="board" size={26} /><h4>Nothing on the board yet</h4><p>Film stills, locations, faces, colour palettes — anything that feels like your film.</p></div>
      ) : (
        <div className="mood-grid">
          {board.map((m, i) => (
            <figure key={m.file + i} className={'mood-tile' + (drag === i ? ' dragging' : '')} draggable
              onDragStart={e => { setDrag(i); e.dataTransfer.effectAllowed = 'move' }}
              onDragEnd={() => setDrag(null)}
              onDragOver={e => { if (drag != null && drag !== i) { e.preventDefault(); move(drag, i); setDrag(i) } }}>
              <Tile m={m} onOpen={() => setBig(i)} />
              <figcaption>
                <input className="mood-cap" value={m.caption} placeholder="Caption…" onChange={e => { const caption = e.target.value; setBoard(b => b.map((x, k) => (k === i ? { ...x, caption } : x))) }} />
                <button className="icon-btn sm" title="Remove" onClick={() => { setBoard(b => b.filter((_, k) => k !== i)); void deleteMedia(m.file) }}><Icon name="trash" size={13} /></button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {big != null && board[big] && (
        <Modal title={board[big].caption || 'Mood board'} icon="board" wide onClose={() => setBig(null)}>
          <BigImage file={board[big].file} />
        </Modal>
      )}
    </div>
  )
}

function Tile({ m, onOpen }: { m: MoodImage; onOpen: () => void }) {
  const { url, missing } = useMediaUrl(m.file)
  if (missing) return <div className="mood-missing"><Icon name="phone" size={18} /><span>On the phone</span></div>
  return url ? <img src={url} alt={m.caption} loading="lazy" onClick={onOpen} onError={e => { (e.currentTarget as HTMLImageElement).style.opacity = '.25' }} /> : <div className="mood-missing" />
}

function BigImage({ file }: { file: string }) {
  const { url } = useMediaUrl(file)
  return url ? <img src={url} alt="" style={{ width: '100%', borderRadius: 10 }} /> : null
}
