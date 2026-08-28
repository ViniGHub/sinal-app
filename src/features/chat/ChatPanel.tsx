import { useEffect, useRef, useState, type FormEvent } from 'react'

import { MAX_CHAT_LENGTH, MAX_FILE_BYTES } from '@/features/session/protocol'
import { useSession } from '@/features/session/useMesh'
import type { NotificationState } from './notifications'
import type { ChatMessage } from './types'
import styles from './ChatPanel.module.css'

interface ChatPanelProps {
  messages: ChatMessage[]
  open: boolean
  onClose: () => void
  notificationsEnabled: boolean
  /** Browser-level permission, owned by the app shell so it can be refreshed. */
  notificationPermission: NotificationState
  onToggleNotifications: () => void
}

/** "1,4 MB" — enough to tell a photo from a video before downloading it. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/**
 * Text alongside the call, carried on the same data channel that already
 * gossips the roster — so it costs no extra connection.
 */
export function ChatPanel({
  messages,
  open,
  onClose,
  notificationsEnabled,
  notificationPermission,
  onToggleNotifications,
}: ChatPanelProps) {
  const session = useSession()
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    session.sendChat(draft)
    setDraft('')
  }

  return (
    <aside className={styles.panel} aria-label="Mensagens">
      <header className={styles.head}>
        <span>mensagens</span>
        <div className={styles.headActions}>
          {/* Labelled rather than a bare icon: whether you will be interrupted
              is not something to leave people guessing about. */}
          <button
            type="button"
            className={`${styles.notify} ${notificationsEnabled ? styles.notifyOn : ''}`}
            onClick={onToggleNotifications}
            aria-pressed={notificationsEnabled}
            disabled={notificationPermission === 'unsupported' || notificationPermission === 'denied'}
            title={
              notificationPermission === 'denied'
                ? 'as notificações foram bloqueadas nas permissões do navegador'
                : 'avisar quando chegar mensagem e você estiver em outra aba'
            }
          >
            {notificationsEnabled ? '🔔' : '🔕'}{' '}
            {notificationPermission === 'denied' ? 'bloqueadas' : 'notificações'}
          </button>

          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
      </header>

      <div className={styles.log}>
        {messages.length === 0 ? (
          <p className={styles.hint}>nada por aqui ainda.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`${styles.message} ${message.from === 'self' ? styles.mine : ''}`}
            >
              <div className={styles.byline}>
                <span className={styles.author}>
                  {message.from === 'self' ? 'você' : message.name}
                </span>
                <time dateTime={new Date(message.at).toISOString()}>
                  {time.format(message.at)}
                </time>
              </div>
              {message.file ? (
                <a
                  className={styles.file}
                  href={message.file.url}
                  download={message.file.name}
                >
                  <span className={styles.fileName}>{message.file.name}</span>
                  <span className={styles.fileSize}>{formatBytes(message.file.size)}</span>
                </a>
              ) : (
                <p className={styles.text}>{message.text}</p>
              )}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form className={styles.compose} onSubmit={submit}>
        {/* The input itself stays hidden: browsers will not let it be styled,
            and a button is what the rest of the panel looks like. */}
        <input
          ref={fileRef}
          type="file"
          className="srOnly"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void session.sendFile(file)
            // Cleared so choosing the same file twice fires again.
            event.target.value = ''
          }}
        />
        <button
          type="button"
          className={styles.attach}
          onClick={() => fileRef.current?.click()}
          title={`enviar arquivo (até ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)`}
          aria-label="Enviar arquivo"
        >
          📎
        </button>

        <input
          className={styles.input}
          value={draft}
          maxLength={MAX_CHAT_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="escreva algo…"
          aria-label="Mensagem"
        />
        <button className={styles.send} type="submit" disabled={!draft.trim()}>
          enviar
        </button>
      </form>
    </aside>
  )
}
