import { useEffect, useState, type RefObject } from 'react'

/** The chosen zoom, shrunk just enough that an 8.5" page plus a margin fits the visible width. */
export function useFitZoom(ref: RefObject<HTMLElement | null>, zoom: number, pageInches = 8.5, margin = 56): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  if (!width) return zoom
  return Math.max(0.5, Math.min(zoom, (width - margin) / (96 * pageInches)))
}
