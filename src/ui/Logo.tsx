/**
 * Page One's mark: a geometric robin — the first bird of spring, for first pages — whose wing is the
 * folded corner of a page. Ink, gold and paper, the phone's brand colours. The same drawing is the
 * app icon (src-tauri/icons/app-icon.svg) and the phone's launcher icon.
 */
import { useId } from 'react'

export function Bird({ clip }: { clip: string }) {
  return <>
    <defs><clipPath id={clip}><circle cx="46" cy="52" r="30" /></clipPath></defs>
    <path fill="#E7B35A" d="M23 70 L9 86 L33 79 Z" />
    <circle cx="46" cy="52" r="30" fill="#F4EBDD" />
    <circle cx="68" cy="68" r="25" fill="#E7B35A" clipPath={`url(#${clip})`} />
    <path fill="#CDB797" d="M50 48 V74 A26 26 0 0 1 24 48 Z" />
    <path fill="#B98235" d="M50 74 L43 74 L50 67 Z" />
    <path fill="#E7B35A" d="M73.6 36 L87 41 L74.4 46 Z" />
    <circle cx="61" cy="39" r="4.2" fill="#12141B" />
    <circle cx="62.3" cy="37.7" r="1.3" fill="#F4EBDD" />
  </>
}

/** The mark on its ink tile, at any size. */
export function Logo({ size = 22, className = '' }: { size?: number; className?: string }) {
  const clip = 'po-' + useId().replace(/:/g, '')
  return (
    <svg className={'logo ' + className} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Page One">
      <rect width="100" height="100" rx="23" fill="#12141B" />
      <g transform="translate(50 50) scale(.8) translate(-48 -54)"><Bird clip={clip} /></g>
    </svg>
  )
}
