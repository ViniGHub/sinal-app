import { useSession } from '@/features/session/useMesh'
import { OptionMenu } from './OptionMenu'
import { SCREEN_QUALITIES, type ScreenQualityId } from './quality'
import { MicMeter } from './MicMeter'
import { useMediaDevices } from './useMediaDevices'
import { useControlBarHeight } from './useControlBarHeight'
import { useMicLevel } from './useMicLevel'
import styles from './ControlBar.module.css'

interface ControlBarProps {
  micStream: MediaStream | null
  micMuted: boolean
  sharing: boolean
  cameraOn: boolean
  /** Chosen capture devices, or null while the browser default is in use. */
  micDeviceId: string | null
  cameraDeviceId: string | null
  /** Which screen-sharing preset is in effect. */
  screenQuality: ScreenQualityId
  chatOpen: boolean
  channelsOpen: boolean
  unreadCount: number
  /** Whether we are in a channel, and so have something to leave. */
  inChannel: boolean
  onToggleChat: () => void
  onToggleChannels: () => void
}

export function ControlBar({
  micStream,
  micMuted,
  sharing,
  cameraOn,
  micDeviceId,
  cameraDeviceId,
  screenQuality,
  chatOpen,
  channelsOpen,
  unreadCount,
  inChannel,
  onToggleChat,
  onToggleChannels,
}: ControlBarProps) {
  const session = useSession()
  const level = useMicLevel(micStream, micMuted)
  const hasMic = micStream !== null

  // Labels only become readable once the matching device has been opened, so
  // the lists are re-read whenever a capture starts or stops.
  const devices = useMediaDevices(`${hasMic}:${cameraOn}`)
  const barRef = useControlBarHeight()

  return (
    <div className={styles.bar} ref={barRef}>
      <div className={styles.group}>
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

        <OptionMenu
          options={devices.microphones}
          selected={micDeviceId}
          label="Escolher microfone"
          onSelect={(id) => void session.switchMicrophone(id)}
        />
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.button} ${cameraOn ? styles.live : ''}`}
          onClick={() => session.toggleCamera()}
          aria-pressed={cameraOn}
        >
          {cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
        </button>

        <OptionMenu
          options={devices.cameras}
          selected={cameraDeviceId}
          label="Escolher câmera"
          onSelect={(id) => void session.switchCamera(id)}
        />
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.button} ${sharing ? styles.sharing : ''}`}
          onClick={() => session.toggleSharing()}
          aria-pressed={sharing}
        >
          {sharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
        </button>

        {/* Offered even while not sharing: the choice is remembered and
            applies to the next screen, so it can be set in advance. */}
        <OptionMenu
          options={SCREEN_QUALITIES.map(({ id, label }) => ({ id, label }))}
          selected={screenQuality}
          label="Qualidade do compartilhamento"
          onSelect={(id) => void session.setScreenQuality(id as ScreenQualityId)}
        />
      </div>

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

      {/* Everyone can always remove themselves, whatever their name is. */}
      {inChannel && (
        <button
          type="button"
          className={`${styles.button} ${styles.leave}`}
          onClick={() => session.leaveChannel()}
        >
          Sair do canal
        </button>
      )}
    </div>
  )
}
