import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorState, Plugin, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { ELEMENT_TYPES, newScript, type Element } from '../core/model'
import { contd } from '../core/analysis'
import { authorsOf } from '../core/authors'
import { parseFountain, writeFountain } from '../core/fountain'
import { useDoc } from '../state/doc'
import { useSettings } from '../state/settings'
import { elementNode, elementsToDoc, nodeToElement, schema } from './schema'
import {
  backspace, docEdge, enter, hardBreak, here, indexOfId, jumpScene, metaKey, newScene, pageDecorations, posOfIndex, setType, shiftTab,
  smartTyping, tab, toggleDual, typewriterScroll, uniqueIds, type PageMeta,
} from './commands'
import { ghostFor, suggestionCache, suggestions, type Suggestion } from './suggest'
import { notifyEditorChange, setEditorView } from './bridge'
import { FindBar } from './FindBar'
import { changesKey, changesPlugin } from './changes'
import { useChanges } from '../state/changes'
import { addNoteFromSelection } from '../ui/notes'
import { useFitZoom } from '../ui/useFitZoom'
import { useFocus } from '../ui/Focus'
import { Icon } from '../ui/Icon'

const nodeCache = new WeakMap<PMNode, Element>()
function toElements(doc: PMNode): Element[] {
  const out: Element[] = []
  doc.forEach(n => {
    let e = nodeCache.get(n)
    if (!e) { e = nodeToElement(n); nodeCache.set(n, e) }
    out.push(e)
  })
  return out
}

interface Popup { items: Suggestion[]; index: number; x: number; y: number }

export function ScriptEditor() {
  const host = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const [popup, setPopupState] = useState<Popup | null>(null)
  const [find, setFind] = useState<{ open: boolean; query: string }>({ open: false, query: '' })
  // The "Add note" bubble over a selection.
  const [bubble, setBubble] = useState<{ x: number; y: number } | null>(null)
  const setPopup = (p: Popup | null) => { popupRef.current = p; setPopupState(p) }
  // The ghost text is drawn from popupRef, so a change of choice needs the decorations redrawn.
  const choose = (v: EditorView, p: Popup | null) => { setPopup(p); v.dispatch(v.state.tr.setMeta('ghost', true)) }

  const scriptId = useDoc(d => d.script?.id)
  const externalRev = useDoc(d => d.externalRev)
  const pagination = useDoc(d => d.pagination)
  const labels = useDoc(d => d.sceneLabels)
  const comments = useDoc(d => d.script?.extras.comments)
  const activeComment = useDoc(d => d.activeComment)
  const jump = useDoc(d => d.jump)
  const settings = useSettings(s => s.s)

  // ---- create the view (once per script)
  useEffect(() => {
    const script = useDoc.getState().script
    if (!host.current || !script) return
    let cache = suggestionCache(script.elements)
    let cacheAt = 0

    const accept = (view: EditorView, s: Suggestion) => {
      const h = here(view.state)
      const tr = view.state.tr.insertText(s.text, h.pos + 1, h.pos + 1 + h.node.content.size)
      tr.setSelection(TextSelection.create(tr.doc, h.pos + 1 + s.text.length))
      // The transaction works out what comes next (a heading's place leads on to its time of day).
      view.dispatch(tr)
    }

    const popupKeys = (view: EditorView, event: KeyboardEvent): boolean => {
      const p = popupRef.current
      if (!p || !p.items.length) return false
      if (event.key === 'ArrowDown') { choose(view, { ...p, index: (p.index + 1) % p.items.length }); return true }
      if (event.key === 'ArrowUp') { choose(view, { ...p, index: (p.index - 1 + p.items.length) % p.items.length }); return true }
      // → at the end of the line takes the inline completion, as in a code editor.
      if (event.key === 'ArrowRight' && !event.shiftKey) {
        const h = here(view.state)
        if (h.offset === h.text.length && ghostFor(h.text, p.items[p.index])) { accept(view, p.items[p.index]); return true }
        return false
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        const item = p.items[p.index]
        const h = here(view.state)
        // Enter on an exact match just moves on.
        if (event.key === 'Enter' && item.text.trim().toUpperCase() === h.text.trim().toUpperCase()) { choose(view, null); return false }
        accept(view, item)
        return true
      }
      if (event.key === 'Escape') { choose(view, null); return true }
      return false
    }

    /** The rest of the chosen suggestion, drawn faintly after the caret. */
    const ghost = new Plugin({
      props: {
        decorations: st => {
          const p = popupRef.current
          if (!p || !st.selection.empty) return null
          const h = here(st)
          const rest = h.offset === h.text.length ? ghostFor(h.text, p.items[p.index]) : ''
          if (!rest) return null
          return DecorationSet.create(st.doc, [Decoration.widget(st.selection.head, () => {
            const span = document.createElement('span')
            span.className = 'ghost'
            span.textContent = rest
            return span
          }, { side: 1, key: 'ghost-' + rest, ignoreSelection: true })])
        },
      },
    })

    const typeKeys: Record<string, ReturnType<typeof setType>> = {}
    ELEMENT_TYPES.forEach((t, i) => { typeKeys[`Mod-${(i + 1) % 10}`] = setType(t) })

    const state = EditorState.create({
      doc: elementsToDoc(script.elements),
      plugins: [
        history({ depth: 500, newGroupDelay: 600 }),
        keymap({
          'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo,
          Enter: enter, 'Shift-Enter': hardBreak, Tab: tab, 'Shift-Tab': shiftTab, Backspace: backspace,
          'Mod-Enter': newScene, 'Alt-ArrowUp': jumpScene(-1), 'Alt-ArrowDown': jumpScene(1), 'Mod-d': toggleDual,
          'Mod-Home': docEdge(false), 'Mod-End': docEdge(true),
          ...typeKeys,
        }),
        keymap(baseKeymap),
        uniqueIds, smartTyping, pageDecorations, ghost, changesPlugin,
      ],
    })

    const view = new EditorView(host.current, {
      state,
      attributes: { class: 'script-pm', spellcheck: 'true' },
      handleKeyDown: (v, e) => popupKeys(v, e),
      handleClickOn: (_v, _pos, _node, _nodePos, event) => {
        const mark = (event.target as HTMLElement).closest?.('.note-mark') as HTMLElement | null
        if (mark?.dataset.note) {
          useDoc.getState().setActiveComment(mark.dataset.note)
          if (useDoc.getState().panel !== 'notes') useDoc.getState().setPanel('notes')
        }
        return false
      },
      // Copy out as Fountain, so a scene pasted into an email or another app still reads as a script.
      clipboardTextSerializer: slice => {
        const els: Element[] = []
        slice.content.forEach(n => { if (n.type === schema.nodes.element) els.push(nodeToElement(n)) })
        if (!els.length) return slice.content.textBetween(0, slice.content.size, '\n')
        return writeFountain(newScript({ id: '', title: '', elements: els })).trim()
      },
      // Paste multi-line text as screenplay elements (Fountain rules: headings, cues, dialogue…).
      clipboardTextParser: (text) => {
        const t = text.replace(/\r\n?/g, '\n')
        if (!t.includes('\n')) return new Slice(Fragment.from(schema.text(t)), 0, 0)
        const parsed = parseFountain(t).elements
        if (!parsed.length) return Slice.empty
        return new Slice(Fragment.from(parsed.map(elementNode)), 1, 1)
      },
      dispatchTransaction(tr) {
        const v = viewRef.current!
        const next = v.state.apply(tr)
        const els = tr.docChanged && !tr.getMeta('external') ? toElements(next.doc) : null
        if (els && Date.now() - cacheAt > 4000) { cache = suggestionCache(els); cacheAt = Date.now() }
        const h = here(next)
        // Autocomplete, worked out before the view redraws so the ghost text appears with the keystroke.
        let items: Suggestion[] | null = null
        if (v.hasFocus() && (tr.docChanged || tr.selectionSet)) {
          const found = tr.docChanged || popupRef.current ? suggestions(h, els ?? useDoc.getState().script?.elements ?? [], cache) : []
          items = found.length && tr.docChanged ? found : []
          popupRef.current = items.length ? { items, index: 0, x: 0, y: 0 } : null
        }
        v.updateState(next)
        if (els) useDoc.getState().fromEditor(els)
        useDoc.getState().setCurrent(h.node.attrs.id as number)
        if (items) {
          if (items.length) {
            const c = v.coordsAtPos(next.selection.head)
            const box = scroller.current!.getBoundingClientRect()
            setPopup({ items, index: 0, x: c.left - box.left + scroller.current!.scrollLeft, y: c.bottom - box.top + scroller.current!.scrollTop + 6 })
          } else setPopup(null)
        }
        const sel = next.selection
        if (!sel.empty && sel.$from.sameParent(sel.$to) && v.hasFocus()) {
          const a = v.coordsAtPos(sel.from), b = v.coordsAtPos(sel.to)
          const box = scroller.current!.getBoundingClientRect()
          setBubble({ x: (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2 - box.left + scroller.current!.scrollLeft, y: Math.min(a.top, b.top) - box.top + scroller.current!.scrollTop - 8 })
        } else if (tr.selectionSet || tr.docChanged) setBubble(null)
        if ((useSettings.getState().s.typewriter || useFocus.getState().on) && (tr.docChanged || tr.selectionSet) && scroller.current) typewriterScroll(v, scroller.current)
        notifyEditorChange()
      },
    })
    viewRef.current = view
    setEditorView(view)
    // Start at the end of a fresh script, at the top of a long one.
    const els = script.elements
    const startIndex = els.length <= 3 ? els.length - 1 : 0
    const p = posOfIndex(view.state.doc, startIndex) + 1 + (els.length <= 3 ? view.state.doc.child(startIndex).content.size : 0)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, p)))
    view.focus()
    return () => { setEditorView(null); view.destroy(); viewRef.current = null }
  }, [scriptId])

  // ---- changes made outside the editor (cards, fixes, restores) arrive as one undoable step
  const seenRev = useRef(externalRev)
  useEffect(() => {
    const v = viewRef.current
    if (!v || externalRev === seenRev.current) return
    seenRev.current = externalRev
    const els = useDoc.getState().script?.elements
    if (!els) return
    const doc = elementsToDoc(els)
    const cur = v.state.doc
    if (doc.eq(cur)) return
    // Replace only the run of elements that differ, so the caret stays put when a co-writer edits elsewhere.
    let a = 0, b = 0
    const n = cur.childCount, m = doc.childCount
    while (a < n && a < m && cur.child(a).eq(doc.child(a))) a++
    while (b < n - a && b < m - a && cur.child(n - 1 - b).eq(doc.child(m - 1 - b))) b++
    const from = posOfIndex(cur, a), to = posOfIndex(cur, n - b)
    const nodes: PMNode[] = []
    for (let i = a; i < m - b; i++) nodes.push(doc.child(i))
    const tr = v.state.tr.replaceWith(from, to, Fragment.from(nodes)).setMeta('external', true)
    const sel = tr.mapping.map(v.state.selection.from, -1)
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(Math.max(1, sel), tr.doc.content.size - 1))))
    v.dispatch(tr)
  }, [externalRev])

  // ---- page breaks, scene numbers, (CONT'D), notes and find hits
  const contdFlags = useMemo(() => contd(useDoc.getState().script?.elements ?? []), [pagination])
  useEffect(() => {
    const v = viewRef.current
    if (!v || !pagination) return
    const meta: PageMeta = {
      elementPage: pagination.elementPage, labels: pagination.labels, sceneLabels: labels, contd: contdFlags,
      showSceneNumbers: settings.sceneNumbers, comments: comments ?? [], activeComment, focusLine: settings.focusLine,
      findQuery: find.open ? find.query : '',
      authors: settings.showAuthors ? authorsOf(useDoc.getState().script?.elements ?? []) : undefined,
    }
    v.dispatch(v.state.tr.setMeta(metaKey, meta).setMeta('addToHistory', false))
  }, [pagination, labels, contdFlags, settings.sceneNumbers, settings.focusLine, comments, activeComment, find, settings.showAuthors])

  // ---- track changes: redraw when the baseline or the toggle changes
  const changesBase = useChanges(c => c.base)
  const changesShow = useChanges(c => c.show)
  useEffect(() => {
    const v = viewRef.current
    if (v) v.dispatch(v.state.tr.setMeta(changesKey, true).setMeta('addToHistory', false))
  }, [changesBase, changesShow])

  // ---- jump to an element (navigator, cards, Script Doctor, notes)
  useEffect(() => {
    const v = viewRef.current
    if (!v || !jump) return
    const i = indexOfId(v.state.doc, jump.id)
    if (i < 0) return
    const start = posOfIndex(v.state.doc, i) + 1
    const node = v.state.doc.child(i)
    const sel = jump.select
      ? TextSelection.create(v.state.doc, start + Math.min(jump.select[0], node.content.size), start + Math.min(jump.select[1], node.content.size))
      : TextSelection.create(v.state.doc, start)
    v.dispatch(v.state.tr.setSelection(sel))
    v.focus()
    requestAnimationFrame(() => {
      const dom = v.nodeDOM(start - 1) as HTMLElement | null
      dom?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }, [jump])

  // ---- editor-level shortcuts that open UI
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'f' && !e.shiftKey) { e.preventDefault(); setFind(f => ({ ...f, open: true })) }
      if (mod && e.key.toLowerCase() === 'm') { e.preventDefault(); addNoteFromSelection() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const zoom = useFitZoom(scroller, settings.zoom)
  const paperClass = `paper paper-${settings.paper}${settings.focusLine ? ' focus-line' : ''}${settings.typewriter ? ' typewriter' : ''}`
  return (
    <div className="desk" ref={scroller} style={{ ['--zoom' as string]: zoom, ['--heading-weight' as string]: settings.boldHeadings ? 700 : 400, ['--character-weight' as string]: settings.boldCharacters ? 700 : 400 }}>
      {find.open && (
        <FindBar
          query={find.query}
          onQuery={q => setFind({ open: true, query: q })}
          onClose={() => { setFind({ open: false, query: find.query }); viewRef.current?.focus() }}
        />
      )}
      <div className={paperClass}>
        <div ref={host} className="script-host" />
      </div>
      {bubble && (
        <div className="sel-bubble" style={{ left: bubble.x, top: bubble.y }} onMouseDown={e => e.preventDefault()}>
          <button onClick={() => { setBubble(null); addNoteFromSelection() }} title="Pin a note to these words (Ctrl+M)">
            <Icon name="notes" size={13} />Add note
          </button>
        </div>
      )}
      {popup && popup.items.length > 0 && (
        <div className="suggest" style={{ left: popup.x, top: popup.y }} onMouseDown={e => e.preventDefault()}>
          {popup.items.map((s, i) => (
            <button
              key={s.label}
              className={i === popup.index ? 'is-on' : ''}
              onMouseEnter={() => { const v = viewRef.current; if (v) choose(v, { ...popup, index: i }) }}
              onClick={() => {
                const v = viewRef.current
                if (!v) return
                const h = here(v.state)
                const tr = v.state.tr.insertText(s.text, h.pos + 1, h.pos + 1 + h.node.content.size)
                tr.setSelection(TextSelection.create(tr.doc, h.pos + 1 + s.text.length))
                v.dispatch(tr)
                v.focus()
              }}
            >
              <span>{s.label}</span>
              {s.hint && <em>{s.hint}</em>}
            </button>
          ))}
          <div className="suggest-foot">Tab or → to accept · ↑↓ to choose · Esc to dismiss</div>
        </div>
      )}
    </div>
  )
}
