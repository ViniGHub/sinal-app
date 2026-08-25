import { useEffect, useRef, useState } from 'react'

import styles from './OptionMenu.module.css'

export interface MenuOption {
  id: string
  label: string
}

interface OptionMenuProps {
  options: MenuOption[]
  /** Currently chosen option, or null while a default is in effect. */
  selected: string | null
  label: string
  onSelect: (id: string) => void
}

/**
 * The caret next to a capture button, listing what it can be switched to.
 *
 * Hidden entirely when there is nothing to choose between: a menu offering a
 * single option is noise, and one offering none is a dead end.
 */
export function OptionMenu({ options, selected, label, onSelect }: OptionMenuProps) {
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

  if (options.length < 2) return null

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
          {options.map((option) => {
            // With no explicit choice something else picked for us, and it
            // always picks the first entry — so that is what gets the mark.
            const active = selected ? option.id === selected : option === options[0]
            return (
              <li key={option.id}>
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.item} ${active ? styles.active : ''}`}
                  onClick={() => {
                    onSelect(option.id)
                    setOpen(false)
                  }}
                >
                  <span className={styles.check} aria-hidden="true">
                    {active ? '●' : ''}
                  </span>
                  {option.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
