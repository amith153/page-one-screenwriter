import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { Icon } from './Icon'

// ---------------------------------------------------------------- toasts

interface Toast { id: number; text: string; icon?: string; action?: { label: string; run: () => void } }
interface Toasts { list: Toast[]; push: (t: Omit<Toast, 'id'>, ms?: number) => void; dismiss: (id: number) => void }

export const useToasts = create<Toasts>((set, get) => ({
  list: [],
  push: (t, ms = 3600) => {
    const id = Date.now() + Math.random()
    set({ list: [...get().list.slice(-2), { ...t, id }] })
    window.setTimeout(() => get().dismiss(id), ms)
  },
  dismiss: id => set({ list: get().list.filter(t => t.id !== id) }),
}))
export const toast = (text: string, icon = 'check', action?: Toast['action']) => useToasts.getState().push({ text, icon, action }, action ? 6000 : 3600)

export function ToastHost() {
  const list = useToasts(t => t.list)
  return (
    <div className="toasts">
      {list.map(t => (
        <div key={t.id} className="toast">
          <Icon name={t.icon ?? 'check'} />
          <span>{t.text}</span>
          {t.action && <button className="btn quiet sm" onClick={() => { t.action!.run(); useToasts.getState().dismiss(t.id) }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- menus

export interface MenuItem {
  label?: string
  icon?: string
  hint?: string
  run?: () => void
  danger?: boolean
  on?: boolean
  divider?: boolean
  heading?: string
}

interface MenuState { items: MenuItem[]; x: number; y: number }
const useMenu = create<{ m: MenuState | null; open: (m: MenuState) => void; close: () => void }>(set => ({
  m: null, open: m => set({ m }), close: () => set({ m: null }),
}))

/** Open a menu under an element (or at a point). */
export function openMenu(items: MenuItem[], at: HTMLElement | { x: number; y: number }, align: 'left' | 'right' = 'left') {
  let x: number, y: number
  if (at instanceof HTMLElement) {
    const r = at.getBoundingClientRect()
    x = align === 'right' ? r.right : r.left
    y = r.bottom + 6
  } else ({ x, y } = at)
  useMenu.getState().open({ items, x: align === 'right' ? -x : x, y })
}

export function MenuHost() {
  const m = useMenu(s => s.m)
  const close = useMenu(s => s.close)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!m || !ref.current) return setPos(null)
    const r = ref.current.getBoundingClientRect()
    let left = m.x < 0 ? -m.x - r.width : m.x
    let top = m.y
    left = Math.max(8, Math.min(left, innerWidth - r.width - 8))
    if (top + r.height > innerHeight - 8) top = Math.max(8, top - r.height - 40)
    setPos({ left, top })
  }, [m])
  useEffect(() => {
    if (!m) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown, true); window.removeEventListener('keydown', onKey) }
  }, [m, close])
  if (!m) return null
  return (
    <div ref={ref} className="menu" style={pos ?? { left: -9999, top: -9999 }}>
      {m.items.map((it, i) =>
        it.divider ? <hr key={i} /> : it.heading ? <div key={i} className="menu-label">{it.heading}</div> : (
          <button key={i} className={it.on ? 'is-on' : ''} style={it.danger ? { color: 'var(--danger)' } : undefined}
            onClick={() => { close(); it.run?.() }}>
            {it.icon && <Icon name={it.icon} />}
            <span>{it.label}</span>
            {it.on && <Icon name="check" style={{ marginLeft: it.hint ? 0 : 'auto', color: 'var(--accent)' }} />}
            {it.hint && <span className="hint">{it.hint}</span>}
          </button>
        ))}
    </div>
  )
}

// ---------------------------------------------------------------- modals

export function Modal({ title, onClose, children, foot, wide, icon }: {
  title: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean; icon?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Portalled to the body: a pane with a backdrop filter would otherwise trap the fixed scrim inside itself.
  return createPortal(
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal>
        <div className="modal-head">
          {icon && <Icon name={icon} size={20} style={{ color: 'var(--accent)' }} />}
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** A picture at full size over the whole window. Click anywhere or press Escape to close. */
export function Lightbox({ src, alt = '', onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="scrim lightbox" onMouseDown={onClose}>
      <img src={src} alt={alt} />
      <button className="icon-btn lightbox-x" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
    </div>,
    document.body,
  )
}

/** Which modal is open, app-wide. */
export type ModalId = 'settings' | 'export' | 'titlepage' | 'versions' | 'shortcuts' | 'sprint' | 'reports' | 'sides' | 'deadline' | 'share' | 'drive' | null
export const useModal = create<{ id: ModalId; open: (id: ModalId) => void; close: () => void }>(set => ({
  id: null, open: id => set({ id }), close: () => set({ id: null }),
}))

// ---------------------------------------------------------------- confirm

const useConfirm = create<{ c: { text: string; ok: string; run: () => void; danger?: boolean } | null; set: (c: { text: string; ok: string; run: () => void; danger?: boolean } | null) => void }>(set => ({
  c: null, set: c => set({ c }),
}))
export const confirmAction = (text: string, ok: string, run: () => void, danger = true) => useConfirm.getState().set({ text, ok, run, danger })

export function ConfirmHost() {
  const c = useConfirm(s => s.c)
  const set = useConfirm(s => s.set)
  if (!c) return null
  return (
    <Modal title="Are you sure?" onClose={() => set(null)}
      foot={<>
        <button className="btn ghost" onClick={() => set(null)}>Cancel</button>
        <button className={'btn' + (c.danger ? ' danger' : '')} autoFocus onClick={() => { set(null); c.run() }}>{c.ok}</button>
      </>}>
      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13.5 }}>{c.text}</p>
    </Modal>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button className={'switch' + (on ? ' is-on' : '')} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}
