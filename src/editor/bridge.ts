/** The live editor view, so toolbars, menus and the command palette can act on it. */
import type { EditorView } from 'prosemirror-view'
import type { Command } from 'prosemirror-state'

let view: EditorView | null = null
const listeners = new Set<() => void>()

export const setEditorView = (v: EditorView | null) => { view = v; listeners.forEach(l => l()) }
export const getEditorView = () => view

/** Run an editor command on the live view; returns false if no editor is open. */
export function runCommand(cmd: Command): boolean {
  if (!view) return false
  const ok = cmd(view.state, view.dispatch, view)
  view.focus()
  return ok
}

/** Notified on every editor state change (for the format bar and status bar). */
export function onEditorChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }
export const notifyEditorChange = () => listeners.forEach(l => l())
