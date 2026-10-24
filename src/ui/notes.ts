/** Pinning notes to text (Ctrl+M), with the same shape as the phone's comments so they sync. */
import { uuid, type Comment } from '../core/model'
import { getEditorView } from '../editor/bridge'
import { here } from '../editor/commands'
import { useDoc } from '../state/doc'
import { useSettings } from '../state/settings'
import { toast } from './kit'

export const authorName = () => useSettings.getState().s.name.trim() || 'Me'

export function addNoteFromSelection() {
  const v = getEditorView()
  if (!v) return
  const { from, to, empty } = v.state.selection
  const h = here(v.state)
  const start = from - h.pos - 1
  let end = to - h.pos - 1
  if (empty || end > h.node.content.size) {
    // No selection: pin to the whole line.
    if (!h.text.trim()) { toast('Select some words to pin a note to', 'notes'); return }
    end = h.text.length
    return add(h.node.attrs.id as number, 0, end, h.text)
  }
  add(h.node.attrs.id as number, Math.max(0, start), end, h.text.substring(Math.max(0, start), end))
}

function add(elementId: number, start: number, end: number, quote: string) {
  const c: Comment = {
    id: uuid(), elementId, start, end, quote, author: authorName(), color: useSettings.getState().s.noteColor,
    text: '', at: Date.now(), resolved: false, replies: [], attachments: [],
  }
  const d = useDoc.getState()
  d.update(s => ({ ...s, extras: { ...s.extras, comments: [...s.extras.comments, c] } }), { elementsChanged: false })
  d.setActiveComment(c.id)
  if (d.panel !== 'notes') d.setPanel('notes')
}

export function updateNote(id: string, f: (c: Comment) => Comment | null) {
  useDoc.getState().update(s => ({
    ...s,
    extras: { ...s.extras, comments: s.extras.comments.flatMap(c => (c.id === id ? (f(c) ? [f(c)!] : []) : [c])) },
  }), { elementsChanged: false })
}
