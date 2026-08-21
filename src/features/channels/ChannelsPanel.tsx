import { useEffect, useMemo, useState } from 'react'

import { useCopy } from '@/shared/hooks/useCopy'
import { buildChannelInviteUrl } from '@/features/identity/invite'
import { shortId } from '@/features/session/protocol'
import { useMesh, useSession } from '@/features/session/useMesh'
import { generateChannelId } from './storage'
import { useChannels } from './useChannels'
import { usePresence } from './usePresence'
import type { ChannelPresence, SavedChannel } from './types'
import styles from './ChannelsPanel.module.css'

const PRESENCE_LABEL: Record<ChannelPresence, string> = {
  unknown: 'sem checar',
  checking: 'checando…',
  online: 'ativo',
  offline: 'vazio',
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
  const { channels, save, remove, rename, markSeen } = useChannels()
  const [copied, copy] = useCopy()

  const ids = useMemo(() => channels.map((channel) => channel.id), [channels])
  const { presence, refresh } = usePresence(ids, open, markSeen)

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

  const current = mesh.channel
  const connectedIds = new Set(mesh.peers.map((peer) => peer.id))

  const createChannel = () => {
    const id = generateChannelId()
    save(id, 'Novo canal', 'channel')
    session.joinChannel(id)
  }

  const enter = (channel: SavedChannel) => {
    if (channel.kind === 'channel') session.joinChannel(channel.id)
    else session.connectTo(channel.id)
  }

  const commitRename = (id: string) => {
    rename(id, draft)
    setEditing(null)
  }

  return (
    <aside className={styles.panel} aria-label="Canais">
      <header className={styles.head}>
        <span>canais</span>
        <div className={styles.headActions}>
          <button type="button" className={styles.ghost} onClick={refresh}>
            checar
          </button>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
      </header>

      {current && (
        <div className={styles.current}>
          <div>
            <span className={styles.currentLabel}>
              você está em {shortId(current.id)}
              {current.isAnchor && ' · ancorando'}
            </span>
            <span className={styles.currentHint}>
              {current.isAnchor
                ? 'você segura este canal; se sair, outro membro assume'
                : 'outro membro está segurando este canal'}
            </span>
          </div>
          <div className={styles.currentActions}>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => copy(buildChannelInviteUrl(current.id))}
            >
              {copied ? 'copiado' : 'convite'}
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => session.leaveChannel()}
            >
              sair
            </button>
          </div>
        </div>
      )}

      <button type="button" className={styles.create} onClick={createChannel}>
        + criar canal
      </button>

      <div className={styles.list}>
        {channels.length === 0 ? (
          <p className={styles.hint}>
            nenhum canal salvo — crie um acima, ou salve alguém com quem você já esteja
            conversando.
          </p>
        ) : (
          channels.map((channel) => {
            const state = presence[channel.id] ?? 'unknown'
            const here = current?.id === channel.id
            const joined = here || connectedIds.has(channel.id)

            return (
              <article key={channel.id} className={`${styles.row} ${here ? styles.rowHere : ''}`}>
                <div className={styles.info}>
                  {editing === channel.id ? (
                    <input
                      className={styles.rename}
                      value={draft}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => commitRename(channel.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') commitRename(channel.id)
                        if (event.key === 'Escape') setEditing(null)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.name}
                      onClick={() => {
                        setEditing(channel.id)
                        setDraft(channel.name)
                      }}
                      title="renomear"
                    >
                      {channel.name || shortId(channel.id)}
                    </button>
                  )}

                  <span className={styles.meta}>
                    <span className={`${styles.dot} ${styles[state]}`} aria-hidden="true" />
                    {channel.kind === 'peer' ? 'pessoa · ' : ''}
                    {PRESENCE_LABEL[state]}
                    {state === 'offline' && ` · ${timeAgo(channel.lastSeenAt)}`}
                  </span>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.join}
                    disabled={joined || (channel.kind === 'peer' && state !== 'online')}
                    onClick={() => enter(channel)}
                  >
                    {joined ? 'aqui' : 'entrar'}
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    onClick={() => remove(channel.id)}
                    aria-label={`Remover ${channel.name || channel.id}`}
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
