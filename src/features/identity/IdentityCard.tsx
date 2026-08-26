import { useEffect, useState } from 'react'

import type { ChannelMembership } from '@/features/session/types'
import { MAX_NAME_LENGTH, shortId } from '@/features/session/protocol'
import { useSession } from '@/features/session/useMesh'
import { useCopy } from '@/shared/hooks/useCopy'
import { buildChannelInviteUrl } from './invite'
import styles from './IdentityCard.module.css'

interface IdentityCardProps {
  selfName: string
  /** Null until we are in a channel; the button creates one on demand. */
  channel: ChannelMembership | null
  /** False until the broker has answered, so nothing can be shared yet. */
  ready: boolean
}

/**
 * Who you are, and the link that brings someone to you.
 *
 * The link is always a channel's, never a person's. A link that pointed at a
 * browser session was a link that expired the moment that session did, and it
 * made "where are we talking" two different answers depending on how you got
 * there. There is one door now.
 */
export function IdentityCard({ selfName, channel, ready }: IdentityCardProps) {
  const session = useSession()
  const [draft, setDraft] = useState(selfName)
  const [copied, copy] = useCopy()

  // Keep the field in step when the name changes from outside this component
  // (restored from storage on boot, for instance).
  useEffect(() => setDraft(selfName), [selfName])

  const commit = () => session.setName(draft)

  const share = () => {
    // Creates a channel when there is none: asking for a link to share has to
    // produce something shareable, and an empty channel is one you enter.
    const id = session.ensureChannel()
    if (id) copy(buildChannelInviteUrl(id))
  }

  return (
    <div className={styles.card} data-testid="identity-card">
      <label className={styles.field}>
        <span className={styles.label}>seu nome</span>
        <input
          className={styles.nameInput}
          value={draft}
          maxLength={MAX_NAME_LENGTH}
          placeholder="como te chamar?"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
        />
      </label>

      <div className={styles.field}>
        <span className={styles.label}>canal</span>
        <code className={styles.id} data-testid="channel-id">
          {channel ? channel.name || shortId(channel.id) : 'nenhum ainda'}
        </code>
        <span className={styles.hint}>
          {channel ? 'quem abrir o link entra aqui' : 'o link cria um canal na hora'}
        </span>
      </div>

      <button type="button" className={styles.copy} disabled={!ready} onClick={share}>
        {/* Short enough that swapping between the two never changes the card's
            width by much — the field above already says this is about a channel. */}
        {copied ? 'link copiado' : channel ? 'copiar link' : 'criar e copiar'}
      </button>
    </div>
  )
}
