import { useSession } from '@/features/session/useMesh'
import { CameraIcon, MicIcon, ScreenIcon } from './icons'
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
    <div className={styles.bar} ref={barRef} data-testid="control-bar">
      {/*
       * What you transmit. Icons rather than labels: these three are toggled
       * constantly and their state is what matters, not their name — and the
       * words took more room than the whole rest of the bar.
       */}
      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.icon} ${micMuted ? styles.muted : styles.live}`}
          onClick={() => session.setMicMuted(!micMuted)}
          disabled={!hasMic}
          aria-pressed={micMuted}
          aria-label={hasMic ? (micMuted ? 'Ativar microfone' : 'Silenciar microfone') : 'Sem microfone'}
          title={hasMic ? (micMuted ? 'Mic mudo' : 'Mic ativo') : 'nenhum microfone disponível'}
        >
          <MicIcon muted={micMuted} />
          <MicMeter level={level} muted={micMuted} />
        </button>

        {/* Always offered: switching microphones is worth doing even muted. */}
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
          className={`${styles.icon} ${cameraOn ? styles.live : ''}`}
          onClick={() => session.toggleCamera()}
          aria-pressed={cameraOn}
          aria-label={cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
          title={cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
        >
          <CameraIcon on={cameraOn} />
        </button>

        {/* Only while the camera is on: choosing between lenses you are not
            using is a decision with nothing to show for it. */}
        {cameraOn && (
          <OptionMenu
            options={devices.cameras}
            selected={cameraDeviceId}
            label="Escolher câmera"
            onSelect={(id) => void session.switchCamera(id)}
          />
        )}
      </div>

      <div className={styles.group}>
        <button
          type="button"
          className={`${styles.icon} ${sharing ? styles.sharing : ''}`}
          onClick={() => session.toggleSharing()}
          aria-pressed={sharing}
          aria-label={sharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
          title={sharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
        >
          <ScreenIcon on={sharing} />
        </button>

        {/* Only while sharing: quality is a change you make while watching its
            effect, and it applies live. */}
        {sharing && (
          <OptionMenu
            options={SCREEN_QUALITIES.map(({ id, label }) => ({ id, label }))}
            selected={screenQuality}
            label="Qualidade do compartilhamento"
            onSelect={(id) => void session.setScreenQuality(id as ScreenQualityId)}
          />
        )}
      </div>

      {/* Where you are, and what you open. Kept as words: these are places to
          go rather than states to flip, and a glyph would not name them. */}
      <span className={styles.divider} aria-hidden="true" />

      <button
        type="button"
        className={styles.button}
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        disabled={!inChannel}
        aria-label={`Mensagens${unreadCount ? `, ${unreadCount} não lidas` : ''}`}
        title={inChannel ? undefined : 'entre num canal para conversar'}
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
