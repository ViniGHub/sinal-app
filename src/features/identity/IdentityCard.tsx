import { useEffect, useState } from 'react'

import { MAX_NAME_LENGTH } from '@/features/session/protocol'
import { useSession } from '@/features/session/useMesh'
import { useCopy } from '@/shared/hooks/useCopy'
import { buildInviteUrl } from './invite'
import styles from './IdentityCard.module.css'

interface IdentityCardProps {
  selfId: string | null
  selfName: string
}

/**
 * Who you are in the room: an editable display name, your stable id, and a
 * one-click invite link that carries the id in the URL fragment.
 */
export function IdentityCard({ selfId, selfName }: IdentityCardProps) {
  const session = useSession()
  const [draft, setDraft] = useState(selfName)
  const [copied, copy] = useCopy()

  // Keep the field in step when the name changes from outside this component
  // (restored from storage on boot, for instance).
  useEffect(() => setDraft(selfName), [selfName])

  const commit = () => session.setName(draft)

  return (
    <div className={styles.card}>
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
        <span className={styles.label}>seu link pessoal</span>
        <code className={styles.id}>{selfId ?? 'gerando…'}</code>
        {/* It never changes, so it can be shared once and reused forever —
            each person who opens it lands in a channel with you. */}
        <span className={styles.hint}>quem abrir entra num canal com você</span>
      </div>

      <button
        type="button"
        className={styles.copy}
        disabled={!selfId}
        onClick={() => selfId && copy(buildInviteUrl(selfId))}
      >
        {copied ? 'link copiado' : 'copiar link'}
      </button>
    </div>
  )
}
