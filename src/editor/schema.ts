/**
 * The editor's document: a flat list of `element` blocks, one per screenplay element, exactly
 * like the phone's element list. Text is kept in the writer's own casing; capitals for scene
 * headings, cues and transitions are applied by CSS on screen and by `docToElements` on save
 * (remembering the original casing in `orig`, as the phone does).
 */
import { Schema, type Node as PMNode } from 'prosemirror-model'
import { el, plainText, TYPE_INFO, typeFromName, type Element, type ElementType } from '../core/model'

export const schema = new Schema({
  nodes: {
    doc: { content: 'element+' },
    element: {
      content: 'inline*',
      group: 'block',
      attrs: {
        id: { default: 0 },
        type: { default: 'ACTION' },
        dual: { default: false },
        revision: { default: 0 },
        color: { default: 0 },
        synopsis: { default: '' },
      },
      // dir=auto: each line reads in its own direction, so Arabic and Hebrew mirror their indents.
      toDOM: n => ['p', { class: `el el-${(n.attrs.type as string).toLowerCase()}`, 'data-id': String(n.attrs.id), dir: 'auto' }, 0],
      parseDOM: [{
        tag: 'p',
        getAttrs: dom => {
          const d = dom as HTMLElement
          const cls = [...d.classList].find(c => c.startsWith('el-'))
          return { type: cls ? typeFromName(cls.substring(3).toUpperCase()) : 'ACTION', id: 0 }
        },
      }],
    },
    text: { group: 'inline' },
    hard_break: {
      inline: true, group: 'inline', selectable: false,
      toDOM: () => ['br'], parseDOM: [{ tag: 'br' }],
    },
  },
  marks: {},
})

export const typeOf = (n: PMNode) => n.attrs.type as ElementType

/** Element text with line breaks as "\n". */
export function nodeText(n: PMNode): string {
  let s = ''
  n.forEach(c => { s += c.isText ? c.text! : c.type.name === 'hard_break' ? '\n' : '' })
  return s
}

function inline(text: string): PMNode[] {
  const out: PMNode[] = []
  text.split('\n').forEach((part, i) => {
    if (i > 0) out.push(schema.nodes.hard_break.create())
    if (part) out.push(schema.text(part))
  })
  return out
}

export function elementNode(e: Element): PMNode {
  return schema.nodes.element.create(
    { id: e.id, type: e.type, dual: e.dual, revision: e.revision, color: e.color, synopsis: e.synopsis },
    inline(plainText(e)),
  )
}

export const elementsToDoc = (els: readonly Element[]) =>
  schema.nodes.doc.create(null, (els.length ? els : [el(1, 'ACTION', '')]).map(elementNode))

export function nodeToElement(n: PMNode): Element {
  const type = typeOf(n)
  const typed = nodeText(n)
  let text = typed
  let orig: string | null = null
  if (TYPE_INFO[type].allCaps) {
    text = typed.toUpperCase()
    if (text !== typed) orig = typed
  }
  return {
    id: n.attrs.id as number, type, text, orig, by: null, byName: null, at: 0,
    dual: n.attrs.dual as boolean, revision: n.attrs.revision as number, color: n.attrs.color as number, synopsis: n.attrs.synopsis as string,
  }
}

export function docToElements(doc: PMNode): Element[] {
  const out: Element[] = []
  doc.forEach(n => out.push(nodeToElement(n)))
  return out
}
