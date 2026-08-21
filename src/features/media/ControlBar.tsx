import { useSession } from '@/features/session/useMesh'
import { MicMeter } from './MicMeter'
import { useMicLevel } from './useMicLevel'
import styles from './ControlBar.module.css'

interface ControlBarProps {
  micStream: MediaStream | null
  micMuted: boolean
  sharing: boolean
  chatOpen: boolean
  channelsOpen: boolean
  unreadCount: number
  onToggleChat: () => void
  onToggleChannels: () => void
}

export function ControlBar({
  micStream,
  micMuted,
  sharing,
  chatOpen,
  channelsOpen,
  unreadCount,
  onToggleChat,
  onToggleChannels,
}: ControlBarProps) {
  const session = useSession()
  const level = useMicLevel(micStream, micMuted)
  const hasMic = micStream !== null

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={`${styles.button} ${micMuted ? styles.muted : styles.live}`}
        onClick={() => session.setMicMuted(!micMuted)}
        disabled={!hasMic}
        aria-pressed={micMuted}
        title={hasMic ? undefined : 'nenhum microfone disponível'}
      >
        <span>{hasMic ? (micMuted ? 'Mic mudo' : 'Mic ativo') : 'Sem microfone'}</span>
        <MicMeter level={level} muted={micMuted} />
      </button>

      <button
        type="button"
        className={`${styles.button} ${sharing ? styles.sharing : ''}`}
        onClick={() => session.toggleSharing()}
        aria-pressed={sharing}
      >
        {sharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
      </button>

      <button
        type="button"
        className={styles.button}
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        aria-label={`Mensagens${unreadCount ? `, ${unreadCount} não lidas` : ''}`}
      >
        <span>Mensagens</span>
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
      </button>

      <button
        type="button"
        className={styles.button}
        onClick={onToggleChannels}
        aria-pressed={channelsOpen}
      >
        Canais
      </button>
    </div>
  )
}
