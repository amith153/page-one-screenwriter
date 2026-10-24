/**
 * Track changes in the script: words added since the baseline are highlighted, words cut are
 * shown struck through where they were, and whole lines cut sit greyed out in place.
 */
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'
import { diffScripts } from '../core/diff'
import { useChanges } from '../state/changes'
import { docToElements } from './schema'

export const changesKey = new PluginKey<DecorationSet>('changes')

const span = (cls: string, text: string, tag = 'span') => {
  const d = document.createElement(tag)
  d.className = cls
  d.contentEditable = 'false'
  d.textContent = text
  return d
}

function build(doc: PMNode): DecorationSet {
  const { base, show } = useChanges.getState()
  if (!base || !show) return DecorationSet.empty
  const starts: number[] = []
  doc.forEach((_n, pos) => starts.push(pos))
  const decos: Decoration[] = []
  for (const c of diffScripts(base.elements, docToElements(doc))) {
    if (c.kind === 'removed') {
      const text = c.ops.map(o => o.text).join('')
      const at = c.index < starts.length ? starts[c.index] : doc.content.size
      decos.push(Decoration.widget(at, () => span(`el el-${c.type.toLowerCase()} chg-removed`, text || '—', 'p'), { side: -1, key: `rm-${c.id}`, ignoreSelection: true }))
      continue
    }
    const pos = starts[c.index]
    const node = doc.child(c.index)
    if (c.kind === 'added') { decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'chg-added' })); continue }
    // A rewritten line: walk the edits along the new text.
    let offset = 0
    const max = node.content.size
    if (c.ops.every(o => o.kind === 'same')) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'chg-retyped' }))
    for (const op of c.ops) {
      if (op.kind === 'del') {
        decos.push(Decoration.widget(pos + 1 + Math.min(offset, max), () => span('chg-del', op.text), { side: -1, key: `del-${c.id}-${offset}-${op.text}`, ignoreSelection: true }))
        continue
      }
      const end = Math.min(offset + op.text.length, max)
      if (op.kind === 'ins' && end > offset) decos.push(Decoration.inline(pos + 1 + offset, pos + 1 + end, { class: 'chg-ins' }))
      offset = end
    }
  }
  return DecorationSet.create(doc, decos)
}

export const changesPlugin = new Plugin<DecorationSet>({
  key: changesKey,
  state: {
    init: (_, state) => build(state.doc),
    apply: (tr, old) => (tr.docChanged || tr.getMeta(changesKey) ? build(tr.doc) : old.map(tr.mapping, tr.doc)),
  },
  props: { decorations: state => changesKey.getState(state) },
})
