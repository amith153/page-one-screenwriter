/**
 * How the editor behaves as you type: Enter, Tab and Backspace move between element types the
 * way Final Draft does (rules in core/formatting.ts, shared with the phone), plus smart detection,
 * unique element ids and the on-page decorations.
 */
import { EditorState, Plugin, PluginKey, Selection, TextSelection, type Transaction, type Command } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'
import type { Credit } from '../core/authors'
import { ELEMENT_TYPES, newId, REVISION_COLORS, type Comment, type ElementType } from '../core/model'
import { demote, detectOnEnter, detectWhileTyping, nextOnEnter, nextOnTab, onEnterWhenEmpty } from '../core/formatting'
import { commentRange } from '../core/model'
import { lineHeight } from '../core/paginator'
import { nodeText, schema, typeOf } from './schema'

// ---------------------------------------------------------------- helpers

export interface Here { node: PMNode; pos: number; index: number; offset: number; text: string; type: ElementType }

/** The element the cursor is in. */
export function here(state: EditorState): Here {
  const $from = state.selection.$from
  const index = $from.index(0)
  const node = state.doc.child(Math.min(index, state.doc.childCount - 1))
  let pos = 0
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize
  return { node, pos, index, offset: $from.depth >= 1 ? $from.parentOffset : 0, text: nodeText(node), type: typeOf(node) }
}

export function posOfIndex(doc: PMNode, index: number): number {
  let pos = 0
  for (let i = 0; i < index && i < doc.childCount; i++) pos += doc.child(i).nodeSize
  return pos
}

export function indexOfId(doc: PMNode, id: number): number {
  for (let i = 0; i < doc.childCount; i++) if (doc.child(i).attrs.id === id) return i
  return -1
}

const newElement = (type: ElementType, text = '') =>
  schema.nodes.element.create({ id: newId(), type }, text ? schema.text(text) : null)

/** Change the type of the element at pos; an empty parenthetical gets its ( ) with the cursor inside. */
function retype(tr: Transaction, pos: number, type: ElementType): Transaction {
  const node = tr.doc.nodeAt(pos)!
  tr.setNodeMarkup(pos, null, { ...node.attrs, type })
  const text = nodeText(node)
  if (type === 'PARENTHETICAL' && !text.trim()) {
    tr.insertText('()', pos + 1, pos + 1 + node.content.size)
    tr.setSelection(TextSelection.create(tr.doc, pos + 2))
  } else if (typeOf(node) === 'PARENTHETICAL' && type !== 'PARENTHETICAL' && text.trim() === '()') {
    tr.delete(pos + 1, pos + 1 + node.content.size)
    tr.setSelection(TextSelection.create(tr.doc, pos + 1))
  }
  return tr
}

export const setType = (type: ElementType): Command => (state, dispatch) => {
  const h = here(state)
  if (dispatch) dispatch(retype(state.tr, h.pos, type).scrollIntoView())
  return true
}

/** Insert a new element after the current one and put the cursor in it. */
function insertAfter(tr: Transaction, h: Here, type: ElementType, text = ''): Transaction {
  const at = h.pos + h.node.nodeSize
  tr.insert(at, newElement(type, text))
  tr.setSelection(TextSelection.create(tr.doc, at + 1 + text.length))
  if (type === 'PARENTHETICAL' && !text) retype(tr, at, type)
  return tr
}

// ---------------------------------------------------------------- keys

export const enter: Command = (state, dispatch) => {
  let tr = state.tr
  if (!state.selection.empty) tr = tr.deleteSelection()
  const s2 = state.apply(tr)
  const h = here(s2)
  const size = h.node.content.size
  if (!dispatch) return true

  // An empty element changes type instead of adding a row.
  if (!h.text.trim() || (h.type === 'PARENTHETICAL' && h.text.trim() === '()')) {
    const t = onEnterWhenEmpty(h.type)
    if (t) { dispatch(retype(tr, h.pos, t).scrollIntoView()); return true }
  }
  // In a parenthetical, only the closing ")" after the caret still counts as "at the end".
  const atEnd = h.offset >= size || (h.type === 'PARENTHETICAL' && h.text.substring(h.offset).trim() === ')')
  if (atEnd) {
    // At the end: a transition typed as action becomes one; then move to the natural next element.
    const detected = detectOnEnter(h.type, h.text)
    if (detected) tr.setNodeMarkup(h.pos, null, { ...h.node.attrs, type: detected })
    dispatch(insertAfter(tr, h, nextOnEnter(detected ?? h.type)).scrollIntoView())
    return true
  }
  if (h.offset === 0) {
    // At the start: push this element down, keeping its type.
    tr.insert(h.pos, newElement(h.type))
    tr.setSelection(TextSelection.create(tr.doc, h.pos + 2 + 1))
    dispatch(tr.scrollIntoView())
    return true
  }
  // In the middle: split into two elements of the same type.
  tr.split(tr.selection.from, 1, [{ type: schema.nodes.element, attrs: { ...h.node.attrs, id: newId(), synopsis: '', color: 0, dual: false } }])
  dispatch(tr.scrollIntoView())
  return true
}

export const tab: Command = (state, dispatch) => {
  const h = here(state)
  if (dispatch) dispatch(retype(state.tr, h.pos, nextOnTab(h.type)).scrollIntoView())
  return true
}

/** Shift+Tab: back through the Tab cycle. */
export const shiftTab: Command = (state, dispatch) => {
  const h = here(state)
  const prev = ELEMENT_TYPES.find(t => nextOnTab(t) === h.type) ?? demote(h.type) ?? 'ACTION'
  if (dispatch) dispatch(retype(state.tr, h.pos, prev).scrollIntoView())
  return true
}

export const backspace: Command = (state, dispatch) => {
  if (!state.selection.empty) return false
  const h = here(state)
  const empty = !h.text || (h.type === 'PARENTHETICAL' && h.text.trim() === '()' && h.offset <= 1)
  if (h.offset !== 0 && !empty) return false
  if (!empty) return false // let ProseMirror join with the element above
  if (!dispatch) return true
  // Empty: demote first (Final Draft–style), then delete.
  const d = demote(h.type)
  if (d) { dispatch(retype(state.tr, h.pos, d).scrollIntoView()); return true }
  if (h.index === 0) return true
  const tr = state.tr.delete(h.pos, h.pos + h.node.nodeSize)
  const prevEnd = h.pos - 1
  tr.setSelection(TextSelection.create(tr.doc, Math.max(1, prevEnd)))
  dispatch(tr.scrollIntoView())
  return true
}

/** Ctrl+Enter: a new scene heading after the current element. */
export const newScene: Command = (state, dispatch) => {
  const h = here(state)
  if (dispatch) dispatch(insertAfter(state.tr, h, 'SCENE_HEADING').scrollIntoView())
  return true
}

/** Alt+↑ / Alt+↓: previous / next scene heading. */
export const jumpScene = (dir: -1 | 1): Command => (state, dispatch) => {
  const h = here(state)
  for (let i = h.index + dir; i >= 0 && i < state.doc.childCount; i += dir) {
    if (typeOf(state.doc.child(i)) === 'SCENE_HEADING') {
      if (dispatch) {
        const p = posOfIndex(state.doc, i) + 1
        dispatch(state.tr.setSelection(TextSelection.create(state.doc, p)).scrollIntoView())
      }
      return true
    }
  }
  return true
}

/** Ctrl+D: make the current speech the right-hand half of dual dialogue (or undo it). */
export const toggleDual: Command = (state, dispatch) => {
  const h = here(state)
  for (let i = h.index; i >= 0; i--) {
    const n = state.doc.child(i)
    const t = typeOf(n)
    if (t === 'CHARACTER') {
      if (dispatch) dispatch(state.tr.setNodeMarkup(posOfIndex(state.doc, i), null, { ...n.attrs, dual: !n.attrs.dual }))
      return true
    }
    if (t !== 'DIALOGUE' && t !== 'PARENTHETICAL' && t !== 'LYRICS') break
  }
  return false
}

/** Ctrl+Home / Ctrl+End: top or bottom of the script. */
export const docEdge = (end: boolean): Command => (state, dispatch) => {
  if (dispatch) dispatch(state.tr.setSelection(end ? Selection.atEnd(state.doc) : Selection.atStart(state.doc)).scrollIntoView())
  return true
}

export const hardBreak: Command = (state, dispatch) => {
  if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView())
  return true
}

// ---------------------------------------------------------------- plugins

/** Every element keeps a unique id (splits and pastes copy attributes, ids included). */
export const uniqueIds = new Plugin({
  appendTransaction(trs, _old, state) {
    if (!trs.some(t => t.docChanged)) return null
    const seen = new Set<number>()
    let tr: Transaction | null = null
    state.doc.forEach((n, pos) => {
      const id = n.attrs.id as number
      if (!id || seen.has(id)) {
        tr ??= state.tr
        tr.setNodeMarkup(pos, null, { ...n.attrs, id: newId(), synopsis: '', color: 0 })
      } else seen.add(id)
    })
    return tr
  },
})

/** "int. " typed in an action line becomes a scene heading; "(" on an empty speech line a parenthetical. */
export const smartTyping = new Plugin({
  props: {
    handleTextInput(view, from, to, text) {
      const h = here(view.state)
      if (text === '(' && !h.text && (h.type === 'DIALOGUE' || h.type === 'CHARACTER')) {
        const tr = view.state.tr
        tr.setNodeMarkup(h.pos, null, { ...h.node.attrs, type: 'PARENTHETICAL' })
        tr.insertText('()', h.pos + 1)
        tr.setSelection(TextSelection.create(tr.doc, h.pos + 2))
        view.dispatch(tr)
        return true
      }
      if (text === ')' && h.type === 'PARENTHETICAL' && h.text.substring(h.offset) === ')') {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1)))
        return true
      }
      const next = h.text.substring(0, h.offset) + text + h.text.substring(h.offset + (to - from))
      // Typed a letter at a time the short-prefix rule catches it; pasted or dictated in one go onto an
      // empty action line, a whole heading counts too.
      const detected = detectWhileTyping(h.type, next) ??
        (h.type === 'ACTION' && !h.text ? detectWhileTyping('ACTION', next.substring(0, 12)) : null)
      if (detected) {
        const tr = view.state.tr.insertText(text, from, to)
        tr.setNodeMarkup(h.pos, null, { ...h.node.attrs, type: detected })
        view.dispatch(tr)
        return true
      }
      return false
    },
  },
})

// ---------------------------------------------------------------- decorations

export interface PageMeta {
  /** Per element index: the page it starts on (0-based). */
  elementPage: number[]
  labels: string[]
  /** Scene-heading id → printed scene number. */
  sceneLabels: Map<number, string>
  /** Per element index: show an automatic (CONT'D). */
  contd: boolean[]
  showSceneNumbers: boolean
  comments: Comment[]
  activeComment: string | null
  focusLine: boolean
  findQuery: string
  /** Who last wrote each line, when the writer asked to see it. */
  authors?: Map<number, Credit>
}

export const metaKey = new PluginKey<PageMeta | null>('pageMeta')

const emptyLabel: Partial<Record<ElementType, string>> = {
  SCENE_HEADING: 'INT. LOCATION – DAY', ACTION: 'Action…', CHARACTER: 'CHARACTER', PARENTHETICAL: '', DIALOGUE: 'Dialogue…',
  TRANSITION: 'CUT TO:', SHOT: 'ANGLE ON…', LYRICS: 'Lyrics…', CENTERED: 'Centered…', NOTE: 'A note to yourself (never prints)…',
}

const hex = (argb: number) => '#' + (argb >>> 0).toString(16).padStart(8, '0').substring(2)

export const pageDecorations = new Plugin<PageMeta | null>({
  key: metaKey,
  state: {
    init: () => null,
    apply: (tr, prev) => (tr.getMeta(metaKey) as PageMeta | undefined) ?? prev,
  },
  props: {
    decorations(state) {
      const meta = metaKey.getState(state)
      const decos: Decoration[] = []
      const cur = here(state).index
      let lastPage = 0
      let i = 0
      state.doc.forEach((n, pos) => {
        const type = typeOf(n)
        const attrs: Record<string, string> = {}
        const cls: string[] = []
        if (n.content.size === 0) { cls.push('is-empty'); attrs['data-ph'] = emptyLabel[type] ?? '' }
        if (i === cur) cls.push('is-current')
        if (n.attrs.dual) cls.push('is-dual')
        if (meta) {
          const page = meta.elementPage[i] ?? lastPage
          if (page > lastPage && i > 0) {
            const label = meta.labels[page] ?? `${page + 1}`
            decos.push(Decoration.widget(pos, () => {
              const d = document.createElement('div')
              d.className = 'page-break'
              d.contentEditable = 'false'
              d.innerHTML = `<span class="pb-gap"></span><span class="pb-num">${label}.</span>`
              return d
            }, { side: -1, key: `pb-${page}-${label}`, ignoreSelection: true }))
          }
          lastPage = Math.max(lastPage, page)
          if (type === 'SCENE_HEADING' && meta.showSceneNumbers && n.content.size > 0) {
            const label = meta.sceneLabels.get(n.attrs.id as number) ?? ''
            for (const side of ['left', 'right']) {
              decos.push(Decoration.widget(pos + 1, () => {
                const s = document.createElement('span')
                s.className = 'scene-no ' + side
                s.contentEditable = 'false'
                s.textContent = label
                return s
              }, { side: -1, key: `sn-${side}-${label}`, ignoreSelection: true }))
            }
          }
          if (type === 'CHARACTER' && meta.contd[i] && n.content.size > 0) {
            decos.push(Decoration.widget(pos + n.nodeSize - 1, () => {
              const s = document.createElement('span')
              s.className = 'contd'
              s.contentEditable = 'false'
              s.textContent = " (CONT'D)"
              return s
            }, { side: 1, key: 'contd', ignoreSelection: true }))
          }
        }
        const rev = n.attrs.revision as number
        if (rev > 0) { cls.push('is-revised'); attrs.style = `--rev:${REVISION_COLORS[rev]?.hex ?? '#888'}` }
        const by = meta?.authors?.get(n.attrs.id as number)
        if (by) {
          cls.push('by-author')
          attrs.style = (attrs.style ? attrs.style + ';' : '') + `--by:${hex(by.color)}`
          attrs.title = by.at ? `${by.name} · ${new Date(by.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : by.name
        }
        // Scripts whose marks stack above and below the letters get the taller lines they print with.
        const h = n.content.size ? lineHeight(n.textContent) : 1
        if (h > 1) { cls.push('is-tall'); attrs.style = (attrs.style ? attrs.style + ';' : '') + `--lh:${h}` }
        if (cls.length) attrs.class = cls.join(' ')
        decos.push(Decoration.node(pos, pos + n.nodeSize, attrs))

        if (meta) {
          const text = nodeText(n)
          for (const c of meta.comments) {
            if (c.resolved || c.elementId !== n.attrs.id) continue
            const r = commentRange(c, text)
            if (!r) continue
            decos.push(Decoration.inline(pos + 1 + r[0], pos + 1 + r[1], {
              class: 'note-mark' + (c.id === meta.activeComment ? ' is-active' : ''),
              style: `--note:${hex(c.color)}`, 'data-note': c.id,
            }))
          }
          const q = meta.findQuery.toLowerCase()
          if (q) {
            const lower = text.toLowerCase()
            for (let k = lower.indexOf(q); k >= 0; k = lower.indexOf(q, k + q.length)) {
              decos.push(Decoration.inline(pos + 1 + k, pos + 1 + k + q.length, { class: 'find-hit' }))
            }
          }
        }
        i++
      })
      return DecorationSet.create(state.doc, decos)
    },
  },
})

/** Scroll so the caret sits at a fixed height (typewriter scrolling). */
export function typewriterScroll(view: EditorView, scroller: HTMLElement) {
  const { head } = view.state.selection
  const c = view.coordsAtPos(head)
  const box = scroller.getBoundingClientRect()
  const target = box.top + box.height * 0.42
  scroller.scrollBy({ top: c.top - target, behavior: 'smooth' })
}
