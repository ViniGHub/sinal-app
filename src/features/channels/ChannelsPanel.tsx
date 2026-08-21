import { useEffect, useMemo, useState } from 'react'

import { shortId } from '@/features/session/protocol'
import { useMesh, useSession } from '@/features/session/useMesh'
import { useChannels } from './useChannels'
import { usePresence } from './usePresence'
import type { ChannelPresence } from './types'
import styles from './ChannelsPanel.module.css'

const PRESENCE_LABEL: Record<ChannelPresence, string> = {
  unknown: 'sem checar',
  checking: 'checando…',
  online: 'ativo',
  offline: 'fora do ar',
}

/** "há 3 min", "há 2 h", "há 4 d" — enough precision for a bookmark list. */
function timeAgo(at: number | null): string {
  if (!at) return 'nunca visto'
  const minutes = Math.floor((Date.now() - at) / 60_000)
  if (minutes < 1) return 'agora há pouco'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

export function ChannelsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession()
  const mesh = useMesh()
  const { channels, remove, rename, markSeen } = useChannels()

  const hostIds = useMemo(() => channels.map((channel) => channel.hostId), [channels])
  const { presence, refresh } = usePresence(hostIds, open, markSeen)

  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const connectedIds = new Set(mesh.peers.map((peer) => peer.id))

  const commitRename = (hostId: string) => {
    rename(hostId, draft)
    setEditing(null)
  }

  return (
    <aside className={styles.panel} aria-label="Canais salvos">
      <header className={styles.head}>
        <span>canais salvos</span>
        <div className={styles.headActions}>
          <button type="button" className={styles.ghost} onClick={refresh}>
            checar
          </button>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
      </header>

      <div className={styles.list}>
        {channels.length === 0 ? (
          <p className={styles.hint}>
            nenhum canal salvo ainda — entre em um e toque em “salvar” no participante para
            guardá-lo aqui.
          </p>
        ) : (
          channels.map((channel) => {
            const state = presence[channel.hostId] ?? 'unknown'
            const joined = connectedIds.has(channel.hostId)

            return (
              <article key={channel.hostId} className={styles.row}>
                <div className={styles.info}>
                  {editing === channel.hostId ? (
                    <input
                      className={styles.rename}
                      value={draft}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitRename(channel.hostId)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(channel.hostId)
                        if (event.key === 'Escape') setEditing(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.name}
                      onClick={() => {
                        setEditing(channel.hostId)
                        setDraft(channel.name)
                      }}
                      title="renomear"
                    >
                      {channel.name || shortId(channel.hostId)}
                    </button>
                  )}

                  <span className={styles.meta}>
                    <span className={`${styles.dot} ${styles[state]}`} aria-hidden="true" />
                    {PRESENCE_LABEL[state]}
                    {state === 'offline' && ` · ${timeAgo(channel.lastSeenAt)}`}
                  </span>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.join}
                    disabled={joined || state !== 'online'}
                    onClick={() => session.connectTo(channel.hostId)}
                  >
                    {joined ? 'na sala' : 'entrar'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => remove(channel.hostId)}
                    aria-label={`Remover ${channel.name || channel.hostId}`}
                  >
                    remover
                  </button>
                </div>
              </article>
            )
          })
        )}
      </div>
    </aside>
  )
}
