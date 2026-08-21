import { useEffect, useState } from 'react'

import { MAX_CHANNEL_NAME_LENGTH } from '@/features/session/protocol'
import styles from './ChannelsPanel.module.css'

interface ChannelNameFieldProps {
  /** The shared name, empty until someone sets one. */
  name: string
  /** Local timestamp after which renaming is allowed again; 0 means now. */
  cooldownUntil: number
  /** Shown when the channel has no name yet. */
  fallback: string
  onRename: (name: string) => void
}

function minutesLeft(until: number): number {
  return Math.max(0, Math.ceil((until - Date.now()) / 60_000))
}

/**
 * The channel's name, editable in place.
 *
 * The name belongs to the channel, so editing it changes it for everyone. The
 * cooldown is shown as a countdown rather than a dead control, because a
 * button that silently does nothing reads as a bug.
 */
export function ChannelNameField({
  name,
  cooldownUntil,
  fallback,
  onRename,
}: ChannelNameFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [remaining, setRemaining] = useState(() => minutesLeft(cooldownUntil))

  // Follow the shared value when someone else renames it mid-edit.
  useEffect(() => {
    if (!editing) setDraft(name)
  }, [name, editing])

  // The cooldown expires on its own, with nothing else to trigger a render, so
  // it needs its own tick. Only while one is actually running.
  useEffect(() => {
    setRemaining(minutesLeft(cooldownUntil))
    if (cooldownUntil <= Date.now()) return

    const timer = setInterval(() => {
      const left = minutesLeft(cooldownUntil)
      setRemaining(left)
      if (left === 0) clearInterval(timer)
    }, 1_000)
    return () => clearInterval(timer)
  }, [cooldownUntil])

  const locked = remaining > 0

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== name) onRename(next)
  }

  if (editing) {
    return (
      <input
        className={styles.channelNameInput}
        value={draft}
        autoFocus
        maxLength={MAX_CHANNEL_NAME_LENGTH}
        placeholder="nome do canal"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') {
            setDraft(name)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className={styles.channelName}
      disabled={locked}
      onClick={() => setEditing(true)}
      title={locked ? `renomeável em ${remaining} min` : 'renomear para todos'}
    >
      {name || fallback}
      {locked && <span className={styles.lock}> · {remaining} min</span>}
    </button>
  )
}
