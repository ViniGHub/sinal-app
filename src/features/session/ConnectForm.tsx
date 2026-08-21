import { useState, type FormEvent } from 'react'

import { extractInviteId } from '@/features/identity/invite'
import { useSession } from './useMesh'
import styles from './ConnectForm.module.css'

/**
 * Takes a channel link, a personal link, or a bare id. All three end with you
 * in a channel — `enter` decides how to get there.
 */
export function ConnectForm({ disabled }: { disabled: boolean }) {
  const session = useSession()
  const [value, setValue] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const id = extractInviteId(value)
    if (!id) return
    session.enter(id)
    setValue('')
  }

  return (
    <form className={styles.row} onSubmit={submit}>
      <input
        className={styles.input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="cole um link de canal ou de um amigo"
        aria-label="Link do canal ou do amigo"
        autoComplete="off"
        spellCheck={false}
      />
      <button className={styles.button} type="submit" disabled={disabled || !value.trim()}>
        Entrar
      </button>
    </form>
  )
}
