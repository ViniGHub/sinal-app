import { useEffect, useRef, useState } from 'react'

import type { DeviceOption } from './devices'
import styles from './DeviceMenu.module.css'

interface DeviceMenuProps {
  devices: DeviceOption[]
  /** Currently chosen device, or null while the browser default is in use. */
  selected: string | null
  label: string
  onSelect: (deviceId: string) => void
}

/**
 * The caret next to a capture button, listing the hardware to switch to.
 *
 * Hidden entirely when there is nothing to choose between: a menu offering a
 * single option is noise, and one offering none is a dead end.
 */
export function DeviceMenu({ devices, selected, label, onSelect }: DeviceMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (devices.length < 2) return null

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.caret}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        ▾
      </button>

      {open && (
        <ul className={styles.menu} role="menu">
          {devices.map((device) => {
            // With no explicit choice the browser picked for us, and it always
            // picks the first entry — so that is what gets the check.
            const active = selected ? device.id === selected : device === devices[0]
            return (
              <li key={device.id}>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.item} ${active ? styles.active : ''}`}
                  onClick={() => {
                    onSelect(device.id)
                    setOpen(false)
                  }}
                >
                  <span className={styles.check} aria-hidden="true">
                    {active ? '●' : ''}
                  </span>
                  {device.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
