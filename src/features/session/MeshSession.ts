import { Peer } from 'peerjs'
import type { DataConnection, MediaConnection } from 'peerjs'

import type { ChatMessage } from '@/features/chat/types'
import {
  loadDisplayName,
  loadPeerId,
  rotatePeerId,
  saveDisplayName,
} from '@/features/identity/storage'
import {
  MediaError,
  acquireMicrophone,
  acquireScreen,
  createSilentAudioStream,
  stopStream,
} from '@/features/media/capture'
import type { RemotePeer } from '@/features/participants/types'
import { buildPeerConfig } from './ice'
import {
  MAX_CHAT_LENGTH,
  isValidPeerId,
  parseWireMessage,
  sanitizeName,
  shortId,
  shouldInitiate,
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

/** An in-flight presence check. Deliberately never becomes a participant. */
interface Probe {
  promise: Promise<boolean>
  settle: (online: boolean) => void
  conn: DataConnection | null
  timer: ReturnType<typeof setTimeout>
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

  #records = new Map<string, PeerRecord>()
  #probes = new Map<string, Probe>()
  #messages: ChatMessage[] = []
  #listeners = new Set<() => void>()

  #selfId: string | null = null
  #selfName: string = loadDisplayName()
  #micMuted = false
  #sharing = false
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
      this.#mic = await acquireMicrophone()
      this.#applyMicMute()
    } catch (error) {
      // A missing microphone is not fatal: join as a listener. Silence is sent
      // in place of a real track so outgoing calls can still be established.
      this.#micMuted = true
      this.#setStatus(
        'error',
        error instanceof MediaError ? error.message : 'Microfone indisponível — modo ouvinte.',
      )
    }

    this.#openPeer(loadPeerId())
  }

  /** Releases every connection, stream and timer. Safe to call twice. */
  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true

    for (const record of this.#records.values()) this.#teardownRecord(record)
    this.#records.clear()

    // Settle rather than drop: a caller awaiting a probe would hang forever.
    for (const peerId of [...this.#probes.keys()]) this.#settleProbe(peerId, false)

    stopStream(this.#mic)
    stopStream(this.#silent)
    stopStream(this.#screen)
    this.#mic = null
    this.#silent = null
    this.#screen = null

    this.#peer?.destroy()
    this.#peer = null
    this.#listeners.clear()
  }

  #openPeer(id: string): void {
    // Omitted entirely when nothing is configured: passing `config` would
    // replace PeerJS's defaults, which include a free TURN relay, rather than
    // extend them.
    const config = buildPeerConfig(import.meta.env)
    const peer = new Peer(id, { debug: 0, ...(config ? { config } : {}) })
    this.#peer = peer

    peer.on('open', (assignedId) => {
      this.#selfId = assignedId
      this.#setStatus('ok', 'pronto — compartilhe seu link para alguém entrar.')
    })
    peer.on('connection', (conn) => this.#adoptConnection(conn))
    peer.on('call', (call) => this.#answerCall(call))
    peer.on('disconnected', () => {
      if (this.#destroyed) return
      this.#setStatus('error', 'sinalização caiu — reconectando…')
      peer.reconnect()
    })
    peer.on('error', (error: PeerJsError) => this.#handlePeerError(error))
  }

  #handlePeerError(error: PeerJsError): void {
    if (this.#destroyed) return

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
          this.#settleProbe(target, false)
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

  /** Dials a peer by id. Ignores self-dials, malformed ids and duplicates. */
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
      stream = await acquireScreen()
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

  sendChat(rawText: string): void {
    const text = rawText.trim().slice(0, MAX_CHAT_LENGTH)
    if (!text) return
    const at = Date.now()
    this.#broadcast({ t: 'chat', text, at })
    this.#pushMessage('self', this.#displayName(), text, at)
  }

  /**
   * Asks whether a host is reachable, without joining them.
   *
   * The broker has no "is this id online" endpoint, so the only honest answer
   * comes from opening a data connection and seeing whether it completes. The
   * connection is closed the instant it does: this must never turn into a call,
   * appear in the participant list, or surface an error in the status line.
   */
  probePeer(peerId: string): Promise<boolean> {
    if (!this.#peer || this.#destroyed || !isValidPeerId(peerId)) return Promise.resolve(false)
    // Our own id and anyone already connected are trivially online — spending a
    // round trip to learn that would only add latency to the panel.
    if (peerId === this.#selfId) return Promise.resolve(true)
    if (this.#records.get(peerId)?.conn?.open) return Promise.resolve(true)

    const inFlight = this.#probes.get(peerId)
    if (inFlight) return inFlight.promise

    let settle: (online: boolean) => void = () => {}
    const promise = new Promise<boolean>((resolve) => {
      settle = resolve
    })

    const timer = setTimeout(() => this.#settleProbe(peerId, false), PROBE_TIMEOUT_MS)
    const conn = this.#peer.connect(peerId, { reliable: false, metadata: { probe: true } })
    this.#probes.set(peerId, { promise, settle, conn, timer })

    conn.on('open', () => this.#settleProbe(peerId, true))
    conn.on('error', () => this.#settleProbe(peerId, false))
    conn.on('close', () => this.#settleProbe(peerId, false))

    return promise
  }

  #settleProbe(peerId: string, online: boolean): void {
    const probe = this.#probes.get(peerId)
    // Already settled: the close we trigger below re-enters here, and the
    // timeout can fire after a verdict was reached.
    if (!probe) return

    this.#probes.delete(peerId)
    clearTimeout(probe.timer)
    probe.conn?.close()
    probe.settle(online)
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

    // Someone checking whether we are online. The connection opening is itself
    // the whole answer, and they close it immediately — turning it into a
    // participant would put a phantom tile on screen for everyone in the room.
    if ((conn.metadata as { probe?: boolean } | undefined)?.probe === true) return

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
      this.#patch(peerId, { status: 'connected' })
      this.#setStatus('ok', 'conectado.')
      this.#send(conn, {
        t: 'hello',
        name: this.#displayName(),
        micMuted: this.#micMuted,
        sharing: this.#sharing,
        peers: this.#knownIds(),
      })
      this.#maybeCallAudio(peerId)
      if (this.#sharing) this.#callScreen(peerId)
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
          status: 'connected',
        })
        if (!message.sharing) this.#patch(peerId, { screenStream: null })
        this.#mergeRoster(message.peers)
        if (message.t === 'hello') {
          const conn = this.#records.get(peerId)?.conn
          if (conn) {
            this.#send(conn, {
              t: 'roster',
              name: this.#displayName(),
              micMuted: this.#micMuted,
              sharing: this.#sharing,
              peers: this.#knownIds(),
            })
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
      case 'screen':
        // The stream itself arrives on the media call; this only handles the
        // stop signal, which is more reliable than waiting for a track to end.
        if (!message.sharing) this.#patch(peerId, { screenStream: null })
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
  }

  #answerCall(call: MediaConnection): void {
    const peerId = call.peer
    if (!isValidPeerId(peerId)) return

    const record = this.#ensureRecord(peerId)
    const kind = (call.metadata as { kind?: string } | undefined)?.kind

    if (kind === 'screen') {
      call.answer()
      call.on('stream', (stream) => this.#patch(peerId, { screenStream: stream }))
      call.on('close', () => this.#patch(peerId, { screenStream: null }))
      call.on('error', () => this.#patch(peerId, { screenStream: null }))
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
      dialTimer: null,
      view: {
        id: peerId,
        name: shortId(peerId),
        status: 'connecting',
        micMuted: false,
        audioStream: null,
        screenStream: null,
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
    this.#teardownRecord(record)
    this.#records.delete(peerId)
    this.#publish()
  }

  #teardownRecord(record: PeerRecord): void {
    this.#clearDialTimer(record)
    record.audioCall?.close()
    record.screenOut?.close()
    record.conn?.close()
    record.audioCall = null
    record.screenOut = null
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
      peers: [...this.#records.values()]
        .map((record) => record.view)
        .sort((a, b) => a.id.localeCompare(b.id)),
      micMuted: this.#micMuted,
      sharing: this.#sharing,
      localScreen: this.#screen,
      localMic: this.#mic,
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
