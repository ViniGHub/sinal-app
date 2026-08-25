import { Peer } from 'peerjs'
import type { DataConnection, MediaConnection } from 'peerjs'

import { ChannelAnchor } from '@/features/channels/ChannelAnchor'
import { generateChannelId, isChannelId } from '@/features/channels/storage'
import type { ChatMessage } from '@/features/chat/types'
import {
  loadDisplayName,
  loadPeerId,
  rotatePeerId,
  saveDisplayName,
} from '@/features/identity/storage'
import {
  MediaError,
  acquireCamera,
  acquireMicrophone,
  acquireScreen,
  applyContentHint,
  createSilentAudioStream,
  stopStream,
} from '@/features/media/capture'
import {
  loadPreferredCamera,
  loadPreferredMic,
  savePreferredCamera,
  savePreferredMic,
} from '@/features/media/devices'
import {
  findScreenQuality,
  loadScreenQuality,
  saveScreenQuality,
  type ScreenQuality,
  type ScreenQualityId,
} from '@/features/media/quality'
import type { AttentionState, Occupant, RemotePeer } from '@/features/participants/types'
import { diagnostics } from '@/shared/diagnostics'
import { readAttention, watchAttention } from './attention'
import { isAdminName } from './moderation'
import { resolveIceConfig } from './ice'
import {
  MAX_CHAT_LENGTH,
  isValidPeerId,
  parseWireMessage,
  sanitizeChannelName,
  sanitizeName,
  shortId,
  shouldInitiate,
  supersedesChannelName,
  type WireMessage,
} from './protocol'
import type { MeshSnapshot, SessionStatus } from './types'

/** Everything we hold for one remote participant. Never leaves this module. */
interface PeerRecord {
  id: string
  conn: DataConnection | null
  audioCall: MediaConnection | null
  /** Our screen, being pushed to them. */
  screenOut: MediaConnection | null
  /** Our camera, being pushed to them. Separate call, separate lifecycle. */
  cameraOut: MediaConnection | null
  /** Fires if the peer we are waiting on never dials us. */
  dialTimer: ReturnType<typeof setTimeout> | null
  /** The shape the UI sees. Replaced wholesale so React can diff by identity. */
  view: RemotePeer
}

/** Chat is a convenience, not an archive; old messages are dropped. */
const MAX_MESSAGES = 200

/**
 * How long to wait for the peer that "should" dial us before dialing anyway.
 * Covers the case where they are running an older build that has no gossip.
 */
const DIAL_FALLBACK_MS = 8_000

/**
 * How long a presence probe waits before calling a host offline. The broker
 * answers an unknown id quickly; this only covers the case where it answers
 * nothing at all.
 */
const PROBE_TIMEOUT_MS = 6_000

/**
 * How long to wait before racing for a vacated anchor. The broker holds a
 * disconnected id for a moment, and the jitter keeps every remaining member
 * from stampeding the same instant.
 */
const RECLAIM_BASE_MS = 1_500
const RECLAIM_JITTER_MS = 2_000

/** Our participation in a channel. Null when connected peer-to-peer only. */
interface ChannelRuntime {
  id: string
  /** Our link to whoever holds the anchor, when that is not us. */
  conn: DataConnection | null
  /** Set once we are the one holding the channel id. */
  anchor: ChannelAnchor | null
  reclaimTimer: ReturnType<typeof setTimeout> | null
  /** Detects an id that answers but is a person, not a channel. */
  knockTimer: ReturnType<typeof setTimeout> | null
}

/** How long an answering id has to identify itself as a channel. */
const KNOCK_TIMEOUT_MS = 5_000

/** How long a person has to answer a personal invite with their channel. */
const INVITE_TIMEOUT_MS = 6_000

/** Minimum gap between changes to a channel's name. */
export const RENAME_COOLDOWN_MS = 3 * 60_000

/** A media call needs a moment before its sender exists to be configured. */
const ENCODING_SETTLE_MS = 800

/** How long to hold a one-shot removal notice open so the message flushes. */
const KICK_FLUSH_MS = 1_000

/** An in-flight personal invite: we asked someone where to meet. */
interface InviteRuntime {
  id: string
  conn: DataConnection | null
  timer: ReturnType<typeof setTimeout> | null
}

/** What a presence check found. Occupants are empty unless an anchor answered. */
export interface ProbeResult {
  online: boolean
  occupants: Occupant[]
}

/** How long an opened probe waits for an occupant list before giving up on one. */
const PROBE_GRACE_MS = 1_200

/** An in-flight presence check. Deliberately never becomes a participant. */
interface Probe {
  promise: Promise<ProbeResult>
  settle: (result: ProbeResult) => void
  conn: DataConnection | null
  timer: ReturnType<typeof setTimeout>
  /** Whether the connection ever opened, which is the online verdict itself. */
  opened: boolean
  graceTimer: ReturnType<typeof setTimeout> | null
}

interface PeerJsError {
  type?: string
  message?: string
}

/**
 * Owns every peer connection, media stream and piece of session state.
 *
 * This class knows nothing about React. It exposes a `subscribe`/`getSnapshot`
 * pair so any view layer can observe it, which is what keeps the transport
 * logic testable and the components free of connection bookkeeping.
 */
export class MeshSession {
  #peer: Peer | null = null
  #mic: MediaStream | null = null
  #silent: MediaStream | null = null
  #screen: MediaStream | null = null
  #camera: MediaStream | null = null

  #records = new Map<string, PeerRecord>()
  #probes = new Map<string, Probe>()
  #channel: ChannelRuntime | null = null
  #invite: InviteRuntime | null = null
  #messages: ChatMessage[] = []
  #listeners = new Set<() => void>()

  #selfId: string | null = null
  #selfName: string = loadDisplayName()
  #micMuted = false
  #sharing = false
  #attention: AttentionState = 'focused'
  #stopAttention: (() => void) | null = null

  /** How this session reaches the network. Resolved once, in `start`. */
  #iceConfig: RTCConfiguration | undefined

  /** Remembered device choices, applied whenever a capture is (re)started. */
  #screenQuality: ScreenQualityId = loadScreenQuality()
  #micDeviceId: string | null = loadPreferredMic()
  #cameraDeviceId: string | null = loadPreferredCamera()

  /** The channel's shared name, plus what is needed to order claims about it. */
  #channelName = ''
  #channelNameAt = 0
  #channelNameFrom = ''
  /**
   * When *this* node last saw the name change, on its own clock. Kept apart
   * from `#channelNameAt` on purpose: that one is the author's clock and is
   * only fit for comparing claims, never for measuring elapsed time here.
   */
  #channelNameSeenAt = 0
  #status: SessionStatus = { kind: 'busy', message: 'iniciando…' }

  #snapshot: MeshSnapshot
  #destroyed = false
  #rotatedId = false
  #messageSeq = 0

  constructor() {
    this.#snapshot = this.#buildSnapshot()
  }

  // ---------------------------------------------------------------- store

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getSnapshot = (): MeshSnapshot => this.#snapshot

  // ------------------------------------------------------------ lifecycle

  /** Acquires the microphone, then registers with the signalling broker. */
  async start(): Promise<void> {
    if (this.#peer || this.#destroyed) return

    try {
      this.#mic = await acquireMicrophone(this.#micDeviceId)
      this.#applyMicMute()
      diagnostics.info('mídia', 'microfone capturado')
    } catch (error) {
      // A missing microphone is not fatal: join as a listener. Silence is sent
      // in place of a real track so outgoing calls can still be established.
      diagnostics.warn('mídia', 'sem microfone; entrando como ouvinte')
      this.#micMuted = true
      this.#setStatus(
        'error',
        error instanceof MediaError ? error.message : 'Microfone indisponível — modo ouvinte.',
      )
    }

    // Resolved once and reused for every Peer we create, including channel
    // anchors: minting credentials per connection would be wasteful, and the
    // whole session should agree on how it reaches the network.
    this.#iceConfig = await resolveIceConfig(import.meta.env)

    this.#attention = readAttention()
    this.#stopAttention = watchAttention((state) => {
      this.#attention = state
      this.#broadcast({ t: 'attention', attention: state })
    })

    this.#openPeer(loadPeerId())
  }

  /** Releases every connection, stream and timer. Safe to call twice. */
  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true

    this.#stopAttention?.()
    this.#stopAttention = null
    this.#clearInvite()

    for (const record of this.#records.values()) this.#teardownRecord(record)
    this.#records.clear()

    // Settle rather than drop: a caller awaiting a probe would hang forever.
    for (const peerId of [...this.#probes.keys()]) {
      this.#settleProbe(peerId, { online: false, occupants: [] })
    }

    const channel = this.#channel
    this.#channel = null
    if (channel) {
      if (channel.reclaimTimer) clearTimeout(channel.reclaimTimer)
      if (channel.knockTimer) clearTimeout(channel.knockTimer)
      channel.conn?.close()
      channel.anchor?.destroy()
    }

    stopStream(this.#mic)
    stopStream(this.#silent)
    stopStream(this.#screen)
    stopStream(this.#camera)
    this.#mic = null
    this.#silent = null
    this.#screen = null
    this.#camera = null

    this.#peer?.destroy()
    this.#peer = null
    this.#listeners.clear()
  }

  #openPeer(id: string): void {
    // Omitted entirely when nothing is configured: passing `config` would
    // replace PeerJS's defaults, which include a free TURN relay, rather than
    // extend them.
    const config = this.#iceConfig
    const peer = new Peer(id, { debug: 0, ...(config ? { config } : {}) })
    this.#peer = peer

    diagnostics.info('peer', `registrando id ${shortId(id)}`)

    peer.on('open', (assignedId) => {
      this.#selfId = assignedId
      diagnostics.info('peer', `registrado como ${shortId(assignedId)}`)
      this.#setStatus('ok', 'pronto — compartilhe seu link para alguém entrar.')
    })
    peer.on('connection', (conn) => this.#adoptConnection(conn))
    peer.on('call', (call) => this.#answerCall(call))
    peer.on('disconnected', () => {
      if (this.#destroyed) return
      diagnostics.warn('peer', 'sinalização caiu; reconectando')
      this.#setStatus('error', 'sinalização caiu — reconectando…')
      peer.reconnect()
    })
    peer.on('error', (error: PeerJsError) => this.#handlePeerError(error))
  }

  #handlePeerError(error: PeerJsError): void {
    if (this.#destroyed) return

    diagnostics.warn('peer', `erro do broker: ${error.type ?? 'desconhecido'}`)

    switch (error.type) {
      case 'unavailable-id': {
        // The broker still holds our saved id from a session that has not timed
        // out yet. Take a fresh one rather than leaving the user stranded.
        if (this.#rotatedId) {
          this.#setStatus('error', 'não foi possível registrar um ID. Recarregue a página.')
          return
        }
        this.#rotatedId = true
        this.#peer?.destroy()
        this.#peer = null
        this.#openPeer(rotatePeerId())
        return
      }
      case 'peer-unavailable': {
        const target = error.message?.match(/peer\s+(\S+)/i)?.[1]
        // A probe reaching an offline host is an expected answer, not a fault:
        // settle it quietly instead of flashing an error the user never asked
        // for. This is the only signal the broker gives us for "not online".
        if (target && this.#probes.has(target)) {
          this.#settleProbe(target, { online: false, occupants: [] })
          return
        }
        // The person behind a personal link is not online. Nothing to create
        // here: claiming their id as a channel would collide with their own
        // registration the moment they came back.
        if (target && this.#invite?.id === target) {
          this.#clearInvite()
          this.#setStatus('error', 'essa pessoa não está online agora.')
          return
        }
        // The anchor we were knocking on is gone. Race for the vacant id
        // instead of reporting a failure — the channel outlives its holder.
        if (target && this.#channel?.id === target && !this.#channel.anchor) {
          this.#scheduleReclaim()
          return
        }
        if (target && this.#records.has(target)) this.#dropPeer(target)
        this.#setStatus('error', 'esse ID não está online agora.')
        return
      }
      case 'browser-incompatible':
        this.#setStatus('error', 'este navegador não suporta as chamadas do Sinal.')
        return
      case 'network':
        this.#setStatus('error', 'sem rede — verifique sua conexão.')
        return
      default:
        this.#setStatus('error', `erro de conexão (${error.type ?? 'desconhecido'}).`)
    }
  }

  // ------------------------------------------------------------- commands

  /**
   * The single way in. Every route ends with both people in a channel.
   *
   * A channel id is entered directly — taken over if empty, joined if live. A
   * person's id goes through them instead: they answer with the channel they
   * are in, minting one first if they have none. So "invite a friend" and
   * "open a channel link" converge, and there is no such thing as a connection
   * that exists outside a channel.
   */
  enter(rawId: string): void {
    const id = rawId.trim()
    if (!this.#peer || this.#destroyed) return
    if (!isValidPeerId(id)) {
      this.#setStatus('error', 'esse link não parece válido.')
      return
    }
    if (id === this.#selfId) {
      this.#setStatus('error', 'esse é o seu próprio link.')
      return
    }

    if (isChannelId(id)) {
      diagnostics.info('entrada', `${shortId(id)} é um canal; entrando direto`)
      this.joinChannel(id)
    } else {
      diagnostics.info('entrada', `${shortId(id)} é uma pessoa; pedindo o canal dela`)
      this.#inviteVia(id)
    }
  }

  /**
   * Reaches a channel through a person.
   *
   * Their id is never claimed as a channel — doing so would collide with their
   * own registration and force their identity to rotate. We only ask.
   */
  #inviteVia(personId: string): void {
    if (!this.#peer) return
    this.#setStatus('busy', `procurando ${shortId(personId)}…`)

    const conn = this.#peer.connect(personId, { reliable: true, metadata: { invite: true } })
    this.#invite = { id: personId, conn, timer: null }

    const invite = this.#invite
    invite.timer = setTimeout(() => {
      if (this.#invite !== invite) return
      diagnostics.error('convite', `${shortId(personId)} não respondeu em ${INVITE_TIMEOUT_MS}ms`)
      this.#clearInvite()
      this.#setStatus('error', 'essa pessoa não respondeu ao convite.')
    }, INVITE_TIMEOUT_MS)

    conn.on('data', (raw) => {
      const message = parseWireMessage(raw)
      if (message?.t !== 'channel' || this.#invite !== invite) return
      diagnostics.info('convite', `${shortId(personId)} indicou o canal ${shortId(message.id)}`)
      this.#clearInvite()
      this.joinChannel(message.id)
    })
  }

  #clearInvite(): void {
    const invite = this.#invite
    if (!invite) return
    this.#invite = null
    if (invite.timer) clearTimeout(invite.timer)
    invite.conn?.close()
  }

  /**
   * The channel we are in, creating one if we are not in any yet. This is what
   * makes a personal link able to conjure a room out of nothing.
   */
  #ensureChannel(): string | null {
    if (this.#channel) return this.#channel.id
    if (!this.#peer || this.#destroyed) return null
    const id = generateChannelId()
    this.joinChannel(id)
    return id
  }

  /** Dials a peer by id. Internal to the mesh: users always go through `enter`. */
  connectTo(rawId: string): void {
    const peerId = rawId.trim()
    if (!this.#peer || this.#destroyed) return
    if (!isValidPeerId(peerId)) {
      this.#setStatus('error', 'esse ID não parece válido.')
      return
    }
    if (peerId === this.#selfId) {
      this.#setStatus('error', 'esse é o seu próprio ID.')
      return
    }

    const existing = this.#records.get(peerId)
    if (existing?.conn) {
      this.#setStatus('ok', 'você já está conectado a essa pessoa.')
      return
    }

    this.#ensureRecord(peerId)
    this.#setStatus('busy', `chamando ${shortId(peerId)}…`)
    this.#dial(peerId)
  }

  disconnect(peerId: string): void {
    this.#dropPeer(peerId)
  }

  /**
   * Removes someone from the channel.
   *
   * Enforced by convention only: we ask them to leave and stop talking to them.
   * A participant running a modified client can ignore the request, and anyone
   * can adopt the admin name to send one. See `moderation.ts`.
   */
  kick(peerId: string): void {
    if (!this.#isAdmin() || !this.#peer || peerId === this.#selfId) return

    const conn = this.#records.get(peerId)?.conn
    if (conn) {
      this.#send(conn, { t: 'kick', by: this.#displayName() })
      this.#dropPeer(peerId)
      return
    }

    // They are not someone we are talking to — this is a removal from a channel
    // we are only looking at from the panel. Open a connection whose only
    // purpose is to deliver the notice, marked so it never becomes a
    // participant on their side.
    const notice = this.#peer.connect(peerId, { reliable: true, metadata: { kick: true } })
    notice.on('open', () => {
      this.#send(notice, { t: 'kick', by: this.#displayName() })
      // Give the message a moment to flush before tearing the channel down.
      setTimeout(() => notice.close(), KICK_FLUSH_MS)
    })
  }

  /**
   * Acts on a removal request.
   *
   * Honoured only from someone announcing the admin name. That check is
   * spoofable — the name is self-declared — but it keeps the rule consistent
   * rather than letting any peer eject anyone.
   */
  #handleKick(by: string): void {
    if (!isAdminName(by)) return
    if (this.#channel) this.leaveChannel()
    this.#setStatus('error', 'você foi removido do canal.')
  }

  #isAdmin(): boolean {
    return isAdminName(this.#selfName)
  }

  setMicMuted(muted: boolean): void {
    this.#micMuted = muted
    this.#applyMicMute()
    this.#broadcast({ t: 'mic', micMuted: muted })
    this.#publish()
  }

  setName(rawName: string): void {
    const name = sanitizeName(rawName)
    if (name === this.#selfName) return
    this.#selfName = name
    saveDisplayName(name)
    this.#broadcast({ t: 'name', name: this.#displayName() })
    this.#publish()
  }

  async startSharing(): Promise<void> {
    if (this.#sharing || this.#destroyed) return

    let stream: MediaStream
    try {
      stream = await acquireScreen(findScreenQuality(this.#screenQuality))
    } catch (error) {
      if (error instanceof MediaError && !error.cancelled) this.#setStatus('error', error.message)
      return
    }

    this.#screen = stream
    this.#sharing = true

    // Fires when the user stops sharing from the browser's own banner rather
    // than from our button, so both paths converge on the same cleanup.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stopSharing())

    for (const peerId of this.#records.keys()) this.#callScreen(peerId)
    this.#broadcast({ t: 'screen', sharing: true })
    this.#publish()
  }

  stopSharing(): void {
    if (!this.#sharing) return
    this.#sharing = false

    for (const record of this.#records.values()) {
      record.screenOut?.close()
      record.screenOut = null
    }
    stopStream(this.#screen)
    this.#screen = null

    this.#broadcast({ t: 'screen', sharing: false })
    this.#publish()
  }

  toggleSharing(): void {
    if (this.#sharing) this.stopSharing()
    else void this.startSharing()
  }

  /**
   * Swaps the microphone without dropping a single call.
   *
   * `replaceTrack` changes what a sender is transmitting in place, so no
   * renegotiation happens and nobody hears a gap. Re-calling every peer with a
   * new stream would tear each conversation down and build it back up.
   */
  async switchMicrophone(deviceId: string): Promise<void> {
    if (this.#destroyed) return

    let stream: MediaStream
    try {
      stream = await acquireMicrophone(deviceId)
    } catch (error) {
      if (error instanceof MediaError && !error.cancelled) this.#setStatus('error', error.message)
      return
    }
    if (this.#destroyed) {
      stopStream(stream)
      return
    }

    const previous = this.#mic
    this.#mic = stream
    this.#micDeviceId = deviceId
    savePreferredMic(deviceId)
    // The new track arrives enabled; carry the mute state across so switching
    // devices never un-mutes someone by surprise.
    this.#applyMicMute()

    const track = stream.getAudioTracks()[0] ?? null
    for (const record of this.#records.values()) {
      this.#replaceTrack(record.audioCall, 'audio', track)
    }
    diagnostics.info('mídia', `microfone trocado em ${this.#records.size} chamada(s)`)

    // Released only after the swap, so the old device stays live until the new
    // one is actually carrying the call.
    stopStream(previous)
    this.#publish()
  }

  /** Swaps the camera in place. Remembers the choice even while it is off. */
  async switchCamera(deviceId: string): Promise<void> {
    if (this.#destroyed) return

    this.#cameraDeviceId = deviceId
    savePreferredCamera(deviceId)
    if (!this.#camera) {
      // Nothing to swap; the preference applies the next time it is switched on.
      this.#publish()
      return
    }

    let stream: MediaStream
    try {
      stream = await acquireCamera(deviceId)
    } catch (error) {
      if (error instanceof MediaError && !error.cancelled) this.#setStatus('error', error.message)
      return
    }
    if (this.#destroyed || !this.#camera) {
      stopStream(stream)
      return
    }

    const previous = this.#camera
    this.#camera = stream
    stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stopCamera())

    const track = stream.getVideoTracks()[0] ?? null
    for (const record of this.#records.values()) {
      this.#replaceTrack(record.cameraOut, 'video', track)
    }
    diagnostics.info('mídia', `câmera trocada em ${this.#records.size} chamada(s)`)

    stopStream(previous)
    this.#publish()
  }

  #replaceTrack(call: MediaConnection | null, kind: 'audio' | 'video', track: MediaStreamTrack | null): void {
    if (!call || !track) return
    const sender = call.peerConnection?.getSenders().find((candidate) => candidate.track?.kind === kind)
    // Fails when the connection is already closing; the peer will get the new
    // track from a fresh call if they reconnect, so there is nothing to do.
    void sender?.replaceTrack(track).catch(() => {})
  }

  /**
   * Changes how the screen is encoded, taking effect immediately when already
   * sharing and remembered for next time when not.
   *
   * Nothing is renegotiated: the frame rate is re-applied to the capture and
   * the ceiling to each sender, both in place. Re-calling every peer to change
   * a bitrate would interrupt what the viewers are watching.
   */
  async setScreenQuality(id: ScreenQualityId): Promise<void> {
    const quality = findScreenQuality(id)
    this.#screenQuality = quality.id
    saveScreenQuality(quality.id)
    this.#publish()

    const stream = this.#screen
    if (!stream) return

    applyContentHint(stream, quality)
    const track = stream.getVideoTracks()[0]
    // Best-effort: a source may refuse a frame rate it cannot produce, and
    // that is not a reason to abandon the rest of the change.
    if (track) await track.applyConstraints({ frameRate: { ideal: quality.frameRate } }).catch(() => {})

    for (const record of this.#records.values()) {
      this.#applyScreenEncoding(record.screenOut, quality)
    }
    diagnostics.info('mídia', `qualidade da tela: ${quality.id}`)
  }

  #applyScreenEncoding(call: MediaConnection | null, quality: ScreenQuality): void {
    const sender = call?.peerConnection
      ?.getSenders()
      .find((candidate) => candidate.track?.kind === 'video')
    if (!sender) return

    try {
      const parameters = sender.getParameters()
      // Chrome hands back an empty list before the first negotiation settles;
      // assigning one entry is how the spec says to start from nothing.
      if (!parameters.encodings || parameters.encodings.length === 0) {
        parameters.encodings = [{}]
      }
      for (const encoding of parameters.encodings) {
        encoding.maxBitrate = quality.maxBitrate
        encoding.maxFramerate = quality.frameRate
        encoding.scaleResolutionDownBy = quality.scaleDownBy
      }
      void sender.setParameters(parameters).catch(() => {})
    } catch {
      // Older engines reject parameters they do not model; the call keeps
      // running at whatever the browser chose on its own.
    }
  }

  async startCamera(): Promise<void> {
    if (this.#camera || this.#destroyed) return

    let stream: MediaStream
    try {
      stream = await acquireCamera(this.#cameraDeviceId)
    } catch (error) {
      if (error instanceof MediaError && !error.cancelled) this.#setStatus('error', error.message)
      return
    }

    this.#camera = stream

    // Fires if the device is revoked or taken by another app, so both that and
    // our own button converge on the same cleanup.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stopCamera())

    for (const peerId of this.#records.keys()) this.#callCamera(peerId)
    this.#broadcast({ t: 'camera', on: true })
    this.#publish()
  }

  stopCamera(): void {
    if (!this.#camera) return

    for (const record of this.#records.values()) {
      record.cameraOut?.close()
      record.cameraOut = null
    }
    stopStream(this.#camera)
    this.#camera = null

    this.#broadcast({ t: 'camera', on: false })
    this.#publish()
  }

  toggleCamera(): void {
    if (this.#camera) this.stopCamera()
    else void this.startCamera()
  }

  sendChat(rawText: string): void {
    const text = rawText.trim().slice(0, MAX_CHAT_LENGTH)
    if (!text) return
    const at = Date.now()
    this.#broadcast({ t: 'chat', text, at })
    this.#pushMessage('self', this.#displayName(), text, at)
  }

  // -------------------------------------------------------------- channels

  /**
   * Enters a channel by its id.
   *
   * We try to claim the id first, and only knock if the broker says it is
   * taken. That order matters: registration answers immediately either way
   * (ID-TAKEN comes straight back), whereas dialling a *vacant* id gives no
   * answer at all until the server expires the queued message seconds later.
   * Knocking first therefore meant an empty channel appeared to be dead, and
   * nobody ever became its anchor.
   */
  joinChannel(channelId: string): void {
    if (!this.#peer || this.#destroyed || !isValidPeerId(channelId)) {
      this.#setStatus('error', 'esse ID de canal não parece válido.')
      return
    }
    if (channelId === this.#selfId) {
      this.#setStatus('error', 'esse é o seu próprio ID.')
      return
    }
    if (this.#channel?.id === channelId) return

    this.leaveChannel()
    this.#resetChannelName()
    this.#channel = {
      id: channelId,
      conn: null,
      anchor: null,
      reclaimTimer: null,
      knockTimer: null,
    }
    this.#setStatus('busy', `entrando no canal ${shortId(channelId)}…`)
    void this.#claimAnchor()
    this.#publish()
  }

  /** Leaves the channel and everyone met through it. */
  leaveChannel(): void {
    const channel = this.#channel
    if (!channel) return
    this.#channel = null

    if (channel.reclaimTimer) clearTimeout(channel.reclaimTimer)
    if (channel.knockTimer) clearTimeout(channel.knockTimer)
    channel.conn?.close()
    channel.anchor?.destroy()

    for (const peerId of [...this.#records.keys()]) this.#dropPeer(peerId)
    this.#setStatus('idle', 'você saiu do canal.')
    this.#publish()
  }

  /** Knocks on the channel id to ask who is inside. */
  #knockAnchor(): void {
    const channel = this.#channel
    if (!channel || !this.#peer) return

    const conn = this.#peer.connect(channel.id, { reliable: true, metadata: { channel: true } })
    channel.conn = conn

    // We only knock on an id the broker said was taken, so silence here means
    // the holder is not an anchor — most likely it died between our claim
    // attempt and this knock. Race for it rather than sitting on "entrando…".
    channel.knockTimer = setTimeout(() => {
      channel.knockTimer = null
      if (this.#channel !== channel || channel.anchor) return
      diagnostics.warn('canal', `âncora de ${shortId(channel.id)} não respondeu; disputando`)
      this.#scheduleReclaim()
    }, KNOCK_TIMEOUT_MS)

    conn.on('data', (raw) => {
      const message = parseWireMessage(raw)
      if (message?.t !== 'members') return

      if (channel.knockTimer) {
        clearTimeout(channel.knockTimer)
        channel.knockTimer = null
      }
      diagnostics.info('canal', `âncora listou ${message.occupants.length} ocupante(s)`)
      // Only the joiner knows the full list, so the joiner dials everyone.
      // Applying the usual initiator rule here would leave us waiting on peers
      // that have no idea we exist yet.
      for (const occupant of message.occupants) {
        if (occupant.id === this.#selfId || this.#records.has(occupant.id)) continue
        this.#ensureRecord(occupant.id)
        // Seed the name the anchor gave us so the tile is labelled from the
        // first frame, instead of showing a raw id until the handshake lands.
        if (occupant.name) this.#patch(occupant.id, { name: occupant.name })
        this.#dial(occupant.id)
      }
      this.#setStatus('ok', `no canal ${shortId(channel.id)}.`)
    })

    // Losing the anchor means whoever held the channel id left. The id falls
    // vacant and the remaining members race for it, so the room survives.
    conn.on('close', () => this.#scheduleReclaim())
    conn.on('error', () => this.#scheduleReclaim())
  }

  #scheduleReclaim(): void {
    const channel = this.#channel
    if (!channel || channel.anchor || channel.reclaimTimer || this.#destroyed) return

    const delay = RECLAIM_BASE_MS + Math.random() * RECLAIM_JITTER_MS
    diagnostics.info('canal', `disputando ${shortId(channel.id)} em ${Math.round(delay)}ms`)
    channel.reclaimTimer = setTimeout(() => {
      channel.reclaimTimer = null
      void this.#claimAnchor()
    }, delay)
  }

  async #claimAnchor(): Promise<void> {
    const channel = this.#channel
    if (!channel || channel.anchor) return

    const anchor = new ChannelAnchor(channel.id, () => this.#channelOccupants(), this.#iceConfig)
    channel.anchor = anchor
    const outcome = await anchor.claim()

    // The user may have left, or joined elsewhere, while the broker answered.
    if (this.#destroyed || this.#channel !== channel) {
      anchor.destroy()
      return
    }

    if (outcome === 'anchored') {
      diagnostics.info('canal', `${shortId(channel.id)} estava vago; você é a âncora`)
      this.#setStatus('ok', `no canal ${shortId(channel.id)} — você está ancorando.`)
      this.#publish()
      return
    }

    channel.anchor = null
    if (outcome === 'taken') {
      // The channel is live and someone else holds it. Ask them who is inside.
      diagnostics.info('canal', `${shortId(channel.id)} já tem âncora; batendo na porta`)
      this.#knockAnchor()
    } else {
      diagnostics.error('canal', `broker recusou ${shortId(channel.id)}`)
      this.#setStatus('error', 'não foi possível entrar no canal.')
    }
    this.#publish()
  }

  /**
   * Renames the channel for everyone.
   *
   * The cooldown is per channel, not per person: once anyone renames it, the
   * name is settled for three minutes. Enforcement is local and cooperative,
   * like moderation — it prevents flapping among people acting in good faith,
   * not a modified client.
   */
  renameChannel(rawName: string): void {
    const channel = this.#channel
    const selfId = this.#selfId
    if (!channel || !selfId) return

    const name = sanitizeChannelName(rawName)
    if (!name || name === this.#channelName) return

    const remaining = this.renameCooldownRemaining()
    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60_000)
      this.#setStatus('error', `aguarde ${minutes} min para renomear o canal de novo.`)
      return
    }

    const at = Date.now()
    this.#applyChannelName(name, at, selfId, true)
    this.#broadcast({ t: 'channel-name', name, at, from: selfId })
  }

  /** Milliseconds until the channel may be renamed again, or 0 if it may now. */
  renameCooldownRemaining(): number {
    if (!this.#channelNameSeenAt) return 0
    return Math.max(0, this.#channelNameSeenAt + RENAME_COOLDOWN_MS - Date.now())
  }

  #applyChannelName(name: string, at: number, from: string, isChange: boolean): void {
    this.#channelName = name
    this.#channelNameAt = at
    this.#channelNameFrom = from
    // Learning a name we never had is not a change, so it must not start a
    // cooldown — otherwise joining a room would lock its name for three
    // minutes for no reason.
    if (isChange) this.#channelNameSeenAt = Date.now()
    this.#publish()
  }

  #resetChannelName(): void {
    this.#channelName = ''
    this.#channelNameAt = 0
    this.#channelNameFrom = ''
    this.#channelNameSeenAt = 0
  }

  /** Tells one peer the name we hold, so joiners learn it without asking. */
  #sendChannelName(conn: DataConnection): void {
    if (!this.#channel || !this.#channelName) return
    this.#send(conn, {
      t: 'channel-name',
      name: this.#channelName,
      at: this.#channelNameAt,
      from: this.#channelNameFrom,
    })
  }

  /** Who to advertise to a joiner: us plus everyone we can currently see. */
  #channelOccupants(): Occupant[] {
    const occupants: Occupant[] = []
    if (this.#selfId) occupants.push({ id: this.#selfId, name: this.#displayName() })
    for (const record of this.#records.values()) {
      occupants.push({ id: record.id, name: record.view.name })
    }
    return occupants
  }

  /**
   * Asks whether a host is reachable, without joining them.
   *
   * The broker has no "is this id online" endpoint, so the only honest answer
   * comes from opening a data connection and seeing whether it completes. The
   * connection is closed the instant it does: this must never turn into a call,
   * appear in the participant list, or surface an error in the status line.
   */
  probeChannel(peerId: string): Promise<ProbeResult> {
    const offline: ProbeResult = { online: false, occupants: [] }
    if (!this.#peer || this.#destroyed || !isValidPeerId(peerId)) return Promise.resolve(offline)

    // Things we already know first-hand, answered without a round trip.
    if (peerId === this.#selfId) return Promise.resolve({ online: true, occupants: [] })
    if (this.#channel?.id === peerId) {
      return Promise.resolve({ online: true, occupants: this.#channelOccupants() })
    }
    if (this.#records.get(peerId)?.conn?.open) {
      return Promise.resolve({ online: true, occupants: [] })
    }

    const inFlight = this.#probes.get(peerId)
    if (inFlight) return inFlight.promise

    let settle: (result: ProbeResult) => void = () => {}
    const promise = new Promise<ProbeResult>((resolve) => {
      settle = resolve
    })

    const timer = setTimeout(() => this.#settleProbe(peerId, offline), PROBE_TIMEOUT_MS)
    // Reliable now: we are waiting for an answer, not just for the socket.
    const conn = this.#peer.connect(peerId, { reliable: true, metadata: { probe: true } })
    const probe: Probe = { promise, settle, conn, timer, opened: false, graceTimer: null }
    this.#probes.set(peerId, probe)

    conn.on('open', () => {
      probe.opened = true
      // An anchor answers with its occupants; a person's id answers nothing at
      // all. Wait briefly for the list, then report plain "online" rather than
      // holding the whole probe timeout hostage to an answer that never comes.
      probe.graceTimer = setTimeout(
        () => this.#settleProbe(peerId, { online: true, occupants: [] }),
        PROBE_GRACE_MS,
      )
    })

    conn.on('data', (raw) => {
      const message = parseWireMessage(raw)
      if (message?.t !== 'members') return
      this.#settleProbe(peerId, { online: true, occupants: message.occupants })
    })

    conn.on('error', () => this.#settleProbe(peerId, offline))
    // Closing after a successful open still means it was reachable.
    conn.on('close', () =>
      this.#settleProbe(peerId, probe.opened ? { online: true, occupants: [] } : offline),
    )

    return promise
  }

  #settleProbe(peerId: string, result: ProbeResult): void {
    const probe = this.#probes.get(peerId)
    // Already settled: the close we trigger below re-enters here, and the
    // timeout can fire after a verdict was reached.
    if (!probe) return

    this.#probes.delete(peerId)
    clearTimeout(probe.timer)
    if (probe.graceTimer) clearTimeout(probe.graceTimer)
    probe.conn?.close()
    diagnostics.info(
      'sondagem',
      `${shortId(peerId)}: ${result.online ? 'ativo' : 'sem resposta'}` +
        (result.occupants.length ? ` (${result.occupants.length} dentro)` : ''),
    )
    probe.settle(result)
  }

  // -------------------------------------------------------- data channel

  #dial(peerId: string): void {
    if (!this.#peer) return
    const conn = this.#peer.connect(peerId, { reliable: true })
    this.#adoptConnection(conn)
  }

  #adoptConnection(conn: DataConnection): void {
    const peerId = conn.peer
    if (!isValidPeerId(peerId) || peerId === this.#selfId) {
      conn.close()
      return
    }

    const metadata = conn.metadata as
      | { probe?: boolean; invite?: boolean; kick?: boolean }
      | undefined

    // A removal from someone who is not in the channel with us. It carries a
    // single message and nothing else, so it must not become a participant —
    // otherwise being removed would first put the remover on our screen.
    if (metadata?.kick === true) {
      conn.on('data', (raw) => {
        const message = parseWireMessage(raw)
        if (message?.t === 'kick') this.#handleKick(message.by)
      })
      return
    }

    // Someone checking whether we are online. The connection opening is itself
    // the whole answer, and they close it immediately — turning it into a
    // participant would put a phantom tile on screen for everyone in the room.
    if (metadata?.probe === true) return

    // Someone opened our personal link. Answer with where to meet, creating a
    // channel if we are not in one — this is the moment a personal invite turns
    // into a room. They join it and we meet there as ordinary members, so this
    // connection never becomes a participant either.
    if (metadata?.invite === true) {
      conn.on('open', () => {
        const channelId = this.#ensureChannel()
        if (!channelId) return
        this.#send(conn, { t: 'channel', id: channelId })
      })
      return
    }

    const record = this.#ensureRecord(peerId)

    // Both sides can dial in the same tick. Whoever established first wins;
    // the late arrival is dropped so we never hold two channels to one peer.
    if (record.conn && record.conn.open && record.conn !== conn) {
      conn.close()
      return
    }
    record.conn = conn
    this.#clearDialTimer(record)

    conn.on('open', () => {
      diagnostics.info('peer', `canal de dados aberto com ${shortId(peerId)}`)
      this.#patch(peerId, { status: 'connected' })
      this.#setStatus('ok', 'conectado.')
      this.#send(conn, {
        t: 'hello',
        name: this.#displayName(),
        micMuted: this.#micMuted,
        sharing: this.#sharing,
        camera: this.#camera !== null,
        attention: this.#attention,
        peers: this.#knownIds(),
      })
      this.#sendChannelName(conn)
      this.#maybeCallAudio(peerId)
      // Push whatever video we already have, so someone joining late sees it
      // instead of waiting for us to toggle it off and on again.
      if (this.#sharing) this.#callScreen(peerId)
      if (this.#camera) this.#callCamera(peerId)
    })
    conn.on('data', (raw) => this.#onData(peerId, raw))
    conn.on('close', () => this.#dropPeer(peerId))
    conn.on('error', () => this.#dropPeer(peerId))
  }

  #onData(peerId: string, raw: unknown): void {
    const message = parseWireMessage(raw)
    if (!message) return

    switch (message.t) {
      case 'hello':
      case 'roster': {
        this.#patch(peerId, {
          name: message.name || shortId(peerId),
          micMuted: message.micMuted,
          attention: message.attention,
          status: 'connected',
        })
        if (!message.sharing) this.#patch(peerId, { screenStream: null })
        if (!message.camera) this.#patch(peerId, { cameraStream: null })
        this.#mergeRoster(message.peers)
        if (message.t === 'hello') {
          const conn = this.#records.get(peerId)?.conn
          if (conn) {
            this.#send(conn, {
              t: 'roster',
              name: this.#displayName(),
              micMuted: this.#micMuted,
              sharing: this.#sharing,
              camera: this.#camera !== null,
              attention: this.#attention,
              peers: this.#knownIds(),
            })
            this.#sendChannelName(conn)
          }
        }
        return
      }
      case 'name':
        this.#patch(peerId, { name: message.name || shortId(peerId) })
        return
      case 'mic':
        this.#patch(peerId, { micMuted: message.micMuted })
        return
      case 'attention':
        this.#patch(peerId, { attention: message.attention })
        return
      case 'channel-name': {
        if (!this.#channel) return
        const claim = { at: message.at, from: message.from }
        const held = { at: this.#channelNameAt, from: this.#channelNameFrom }
        if (!supersedesChannelName(claim, held)) return
        this.#applyChannelName(message.name, message.at, message.from, this.#channelName !== '')
        return
      }
      case 'kick': {
        // Fall back to the name we hold for them when the message predates the
        // `by` field.
        const claimed = message.by || (this.#records.get(peerId)?.view.name ?? '')
        if (!isAdminName(claimed)) return
        if (!this.#channel) this.#dropPeer(peerId)
        this.#handleKick(claimed)
        return
      }
      case 'screen':
        // The stream itself arrives on the media call; this only handles the
        // stop signal, which is more reliable than waiting for a track to end.
        if (!message.sharing) this.#patch(peerId, { screenStream: null })
        return
      case 'camera':
        if (!message.on) this.#patch(peerId, { cameraStream: null })
        return
      case 'chat': {
        const name = this.#records.get(peerId)?.view.name ?? shortId(peerId)
        this.#pushMessage(peerId, name, message.text, message.at || Date.now())
        return
      }
    }
  }

  /**
   * Turns the star topology into a real mesh: every peer forwards the ids it
   * knows, so someone who joins through one person ends up connected to
   * everyone in the room.
   */
  #mergeRoster(peerIds: string[]): void {
    const selfId = this.#selfId
    if (!selfId) return

    for (const otherId of peerIds) {
      if (otherId === selfId || this.#records.has(otherId)) continue

      const record = this.#ensureRecord(otherId)
      if (shouldInitiate(selfId, otherId)) {
        this.#dial(otherId)
      } else {
        // They dial us. If they never do, fall back to dialing them ourselves
        // rather than leaving a tile stuck on "conectando".
        record.dialTimer = setTimeout(() => {
          record.dialTimer = null
          if (!record.conn) this.#dial(otherId)
        }, DIAL_FALLBACK_MS)
      }
    }
  }

  // --------------------------------------------------------- media calls

  /** The stream we send out: the real microphone, or silence for listeners. */
  #outgoingAudio(): MediaStream {
    if (this.#mic) return this.#mic
    this.#silent ??= createSilentAudioStream()
    return this.#silent
  }

  #maybeCallAudio(peerId: string): void {
    const selfId = this.#selfId
    const record = this.#records.get(peerId)
    if (!this.#peer || !selfId || !record || record.audioCall) return
    // Only one side dials; the other answers. Otherwise both would place a
    // call and each peer would hear the other twice.
    if (!shouldInitiate(selfId, peerId)) return

    const call = this.#peer.call(peerId, this.#outgoingAudio(), { metadata: { kind: 'audio' } })
    this.#bindAudioCall(record, call)
  }

  #bindAudioCall(record: PeerRecord, call: MediaConnection): void {
    record.audioCall = call
    call.on('stream', (stream) => {
      this.#patch(record.id, { audioStream: stream, status: 'connected' })
    })
    call.on('close', () => {
      record.audioCall = null
      // Losing audio does not mean losing the peer — the data channel is what
      // decides presence, so the tile stays until that closes too.
      this.#patch(record.id, { audioStream: null })
    })
    call.on('error', () => {
      record.audioCall = null
      this.#patch(record.id, { audioStream: null })
    })
  }

  #callScreen(peerId: string): void {
    const record = this.#records.get(peerId)
    if (!this.#peer || !this.#screen || !record) return
    record.screenOut?.close()
    record.screenOut = this.#peer.call(peerId, this.#screen, { metadata: { kind: 'screen' } })

    // The sender only exists once the call has negotiated, so the ceiling is
    // applied on the next tick rather than now. A late joiner must not get an
    // uncapped stream just because they arrived after the setting was chosen.
    const quality = findScreenQuality(this.#screenQuality)
    const call = record.screenOut
    setTimeout(() => this.#applyScreenEncoding(call, quality), ENCODING_SETTLE_MS)
  }

  #callCamera(peerId: string): void {
    const record = this.#records.get(peerId)
    if (!this.#peer || !this.#camera || !record) return
    record.cameraOut?.close()
    record.cameraOut = this.#peer.call(peerId, this.#camera, { metadata: { kind: 'camera' } })
  }

  #answerCall(call: MediaConnection): void {
    const peerId = call.peer
    if (!isValidPeerId(peerId)) return

    const record = this.#ensureRecord(peerId)
    const kind = (call.metadata as { kind?: string } | undefined)?.kind

    // Video arrives receive-only: answering with a stream would push ours back
    // down the same call, and each direction has its own call by design.
    if (kind === 'screen' || kind === 'camera') {
      const field = kind === 'screen' ? 'screenStream' : 'cameraStream'
      call.answer()
      call.on('stream', (stream) => this.#patch(peerId, { [field]: stream }))
      call.on('close', () => this.#patch(peerId, { [field]: null }))
      call.on('error', () => this.#patch(peerId, { [field]: null }))
      return
    }

    record.audioCall?.close()
    call.answer(this.#outgoingAudio())
    this.#bindAudioCall(record, call)
  }

  // ------------------------------------------------------------- records

  #ensureRecord(peerId: string): PeerRecord {
    const existing = this.#records.get(peerId)
    if (existing) return existing

    const record: PeerRecord = {
      id: peerId,
      conn: null,
      audioCall: null,
      screenOut: null,
      cameraOut: null,
      dialTimer: null,
      view: {
        id: peerId,
        name: shortId(peerId),
        status: 'connecting',
        micMuted: false,
        // Not 'focused': we have not heard from them yet, and claiming they
        // are watching would be worse than admitting we do not know.
        attention: 'unknown',
        audioStream: null,
        screenStream: null,
        cameraStream: null,
      },
    }
    this.#records.set(peerId, record)
    this.#publish()
    return record
  }

  #patch(peerId: string, partial: Partial<RemotePeer>): void {
    const record = this.#records.get(peerId)
    if (!record) return
    record.view = { ...record.view, ...partial }
    this.#publish()
  }

  #dropPeer(peerId: string): void {
    const record = this.#records.get(peerId)
    if (!record) return
    diagnostics.info('peer', `${shortId(peerId)} saiu`)
    this.#teardownRecord(record)
    this.#records.delete(peerId)
    this.#publish()
  }

  #teardownRecord(record: PeerRecord): void {
    this.#clearDialTimer(record)
    record.audioCall?.close()
    record.screenOut?.close()
    record.cameraOut?.close()
    record.conn?.close()
    record.audioCall = null
    record.screenOut = null
    record.cameraOut = null
    record.conn = null
  }

  #clearDialTimer(record: PeerRecord): void {
    if (record.dialTimer === null) return
    clearTimeout(record.dialTimer)
    record.dialTimer = null
  }

  #knownIds(): string[] {
    return [...this.#records.keys()]
  }

  // -------------------------------------------------------------- output

  #send(conn: DataConnection, message: WireMessage): void {
    if (!conn.open) return
    try {
      void conn.send(message)
    } catch {
      // A channel can close between the check and the send; presence is
      // handled by the 'close' handler, so there is nothing to do here.
    }
  }

  #broadcast(message: WireMessage): void {
    for (const record of this.#records.values()) {
      if (record.conn) this.#send(record.conn, message)
    }
  }

  #applyMicMute(): void {
    this.#mic?.getAudioTracks().forEach((track) => {
      track.enabled = !this.#micMuted
    })
  }

  #displayName(): string {
    return this.#selfName || shortId(this.#selfId ?? 'você')
  }

  #pushMessage(from: string, name: string, text: string, at: number): void {
    this.#messageSeq += 1
    const message: ChatMessage = { id: `${from}-${this.#messageSeq}`, from, name, text, at }
    this.#messages = [...this.#messages, message].slice(-MAX_MESSAGES)
    this.#publish()
  }

  #setStatus(kind: SessionStatus['kind'], message: string): void {
    this.#status = { kind, message }
    this.#publish()
  }

  #buildSnapshot(): MeshSnapshot {
    return {
      selfId: this.#selfId,
      selfName: this.#selfName,
      status: this.#status,
      channel: this.#channel
        ? {
            id: this.#channel.id,
            isAnchor: this.#channel.anchor !== null,
            name: this.#channelName,
            cooldownUntil: this.#channelNameSeenAt
              ? this.#channelNameSeenAt + RENAME_COOLDOWN_MS
              : 0,
          }
        : null,
      isAdmin: this.#isAdmin(),
      peers: [...this.#records.values()]
        .map((record) => record.view)
        .sort((a, b) => a.id.localeCompare(b.id)),
      micMuted: this.#micMuted,
      sharing: this.#sharing,
      screenQuality: this.#screenQuality,
      localScreen: this.#screen,
      localCamera: this.#camera,
      localMic: this.#mic,
      micDeviceId: this.#micDeviceId,
      cameraDeviceId: this.#cameraDeviceId,
      messages: this.#messages,
    }
  }

  /** Rebuilds the immutable snapshot and wakes every subscriber. */
  #publish(): void {
    if (this.#destroyed) return
    this.#snapshot = this.#buildSnapshot()
    for (const listener of this.#listeners) listener()
  }
}
