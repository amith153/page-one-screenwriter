/** The script exactly as it prints: the paginator's lines, placed on real pages. Click a line to edit it. */
import { basedOnLine, boldType, contactLines, REVISION_COLORS } from '../core/model'
import { PAPER, defaultLayout, lineH, specOf, type Seg } from '../core/paginator'
import { isRtl } from '../io/scriptFonts'
import { useDoc } from '../state/doc'
import { useSettings } from '../state/settings'
import { useRef } from 'react'
import { useFitZoom } from './useFitZoom'

export function PageView() {
  const script = useDoc(d => d.script)
  const p = useDoc(d => d.pagination)
  const labels = useDoc(d => d.sceneLabels)
  const s = useSettings(x => x.s)
  const box = useRef<HTMLDivElement>(null)
  const zoom = useFitZoom(box, s.zoom, PAPER[s.paperSize].widthPt / 72)
  if (!script || !p) return null
  const paper = PAPER[s.paperSize]
  const W = paper.widthPt / 72, H = paper.heightPt / 72
  const tp = script.titlePage
  const sheet = (children: React.ReactNode, key: string | number, extra = '') => (
    <div key={key} className={'sheet' + extra + (s.paper === 'sepia' ? ' sepia' : '')} style={{ width: `calc(var(--in) * ${W})`, height: `calc(var(--in) * ${H})` }}>{children}</div>
  )
  const at = (x: number, y: number) => ({ left: `calc(var(--in) * ${x})`, top: `calc(var(--in) * ${y})` })
  /** Right-to-left lines hang from the right edge of their element's column, as the PDF draws them. */
  const segAt = (seg: Seg, y: number) => {
    const sp = specOf(seg.type, defaultLayout())
    if (!isRtl(seg.text) || sp.align !== 'LEFT' || seg.col !== sp.indent) return at(1.5 + seg.col / 10, y)
    return { right: `calc(var(--in) * ${W - 1.5 - (sp.indent + sp.width) / 10})`, top: `calc(var(--in) * ${y})`, direction: 'rtl' as const }
  }

  return (
    <div className="pages print-area" ref={box} style={{ ['--zoom' as string]: zoom }}>
      {sheet(<>
        <div className="tp-center" style={{ top: 'calc(var(--in) * 3.4)' }}>
          <span className="tp-title">{(tp.title || script.title).toUpperCase()}</span>
          {'\n\n\n'}
          {tp.credits.filter(c => c.names.trim()).map(c => `${c.role}\n\n${c.names}\n\n`).join('')}
          {basedOnLine(tp)}
        </div>
        <div className="tp-block" style={{ ...at(1, H - 1 - contactLines(tp).length / 6) }}>{contactLines(tp).join('\n')}</div>
        <div className="tp-block" style={{ right: 'calc(var(--in) * 1)', bottom: 'calc(var(--in) * 1)', textAlign: 'right' }}>
          {[tp.draft, tp.draftDate, tp.copyright, tp.registration].filter(x => x.trim()).join('\n')}
        </div>
      </>, 'title')}

      {p.pages.map((pg, pi) => {
        const label = p.labels[pi] ?? `${pi + 1}`
        const rev = Math.max(0, ...pg.lines.flatMap(l => l.segs.map(x => x.revision)))
        const seen = new Set<number>()
        // Each line's top, in lines; a tall line sits in the middle of its taller slot.
        const tops: number[] = []
        pg.lines.reduce((t, ln) => { tops.push(t + (lineH(ln) - 1) / 2); return t + lineH(ln) }, 0)
        return sheet(<>
          {rev > 0 && <div className="rev-band" style={{ background: REVISION_COLORS[rev]?.hex }} />}
          {(pi > 0 || p.lockNumbers.length > 0) && <span className="pno" style={{ right: 'calc(var(--in) * 1)' }}>{label}.</span>}
          {pg.lines.map((ln, li) => ln.segs.map((seg, si) => {
            const y = 1 + tops[li] / 6
            const first = seg.element >= 0 && !seen.has(seg.element)
            if (seg.element >= 0) seen.add(seg.element)
            const id = seg.element >= 0 ? script.elements[seg.element]?.id : undefined
            const num = seg.type === 'SCENE_HEADING' && first && s.sceneNumbers && id != null ? labels.get(id) : undefined
            return (
              <span key={`${li}-${si}`}>
                <span className={'ln' + (boldType(seg.type, s) ? ' ln-bold' : '')} style={segAt(seg, y)}
                  onClick={() => { if (id != null) useDoc.getState().jumpTo(id) }}>{seg.text}</span>
                {num && <><span className="scene-no" style={at(0.75, y)}>{num}</span><span className="scene-no" style={at(7.65, y)}>{num}</span></>}
                {seg.revision > 0 && si === 0 && <span className="rev-star" style={at(7.6 + (num ? 0.35 : 0), y)}>*</span>}
              </span>
            )
          }))}
        </>, pi)
      })}
    </div>
  )
}
