import { useState, type FormEvent } from 'react'

import { useSession } from '../hooks/useMesh'
import styles from './ConnectForm.module.css'

/** Dials a peer by pasted id, or by an invite link pasted whole. */
export function ConnectForm({ disabled }: { disabled: boolean }) {
  const session = useSession()
  const [value, setValue] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const entry = value.trim()
    if (!entry) return
    // Accept a full invite URL as readily as a bare id — people paste both.
    const id = entry.includes('#join=') ? decodeURIComponent(entry.split('#join=')[1] ?? '') : entry
    session.connectTo(id)
    setValue('')
  }

  return (
    <form className={styles.row} onSubmit={submit}>
      <input
        className={styles.input}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="cole o ID ou o link do seu amigo"
        aria-label="ID ou link do participante"
        autoComplete="off"
        spellCheck={false}
      />
      <button className={styles.button} type="submit" disabled={disabled || !value.trim()}>
        Chamar
      </button>
    </form>
  )
}
