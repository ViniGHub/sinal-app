/**
 * The control bar's glyphs.
 *
 * Inline SVG rather than emoji: these inherit `currentColor`, so the state
 * colours the bar already uses — green for live, red for muted, amber for
 * sharing — apply to the icon itself. Emoji would render in their own fixed
 * colours and differently on every platform.
 *
 * Every icon is decorative: the buttons carry the accessible name, so these are
 * hidden from assistive technology rather than described twice.
 */

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

/** A line through the glyph, the universal "this is off". */
function Slash() {
  return <line x1="3" y1="21" x2="21" y2="3" />
}

export function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg {...base}>
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      {muted && <Slash />}
    </svg>
  )
}

export function CameraIcon({ on }: { on: boolean }) {
  return (
    <svg {...base}>
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="M15 11l7-4v10l-7-4z" />
      {!on && <Slash />}
    </svg>
  )
}

export function ScreenIcon({ on }: { on: boolean }) {
  return (
    <svg {...base}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      {on ? <path d="M12 8v5M9.5 10.5L12 8l2.5 2.5" /> : <Slash />}
    </svg>
  )
}
