import { Peer } from 'peerjs'

import type { Occupant } from '@/features/participants/types'
import { buildPeerConfig } from '@/features/session/ice'
import { shortId } from '@/features/session/protocol'
import { diagnostics } from '@/shared/diagnostics'

/** What happened when we tried to take the channel id. */
export type AnchorOutcome =
  /** We hold it: joiners will reach us. */
  | 'anchored'
  /** Someone inside the channel already holds it. */
  | 'taken'
  /** The broker refused for some other reason. */
  | 'failed'

interface PeerJsError {
  type?: string
}

/**
 * Holds a channel's id as a peer id, so the channel exists independently of
 * whoever created it.
 *
 * The broker only knows peer ids, and it enforces that each one has a single
 * owner. That uniqueness is the whole trick: members race to register the
 * channel id, exactly one wins, and everyone else finds the winner by dialling
 * it. No election protocol, no extra infrastructure — the broker is the lock.
 *
 * The anchor is a rendezvous point, never a relay: it hands out the member list
 * and nothing else. Voice and screen still go peer to peer.
 */
export class ChannelAnchor {
  #peer: Peer | null = null
  #settled = false
  #destroyed = false

  constructor(
    readonly channelId: string,
    /** Who to advertise to joiners: us plus everyone we can currently see. */
    private readonly roster: () => Occupant[],
  ) {}

  claim(): Promise<AnchorOutcome> {
    return new Promise<AnchorOutcome>((resolve) => {
      if (this.#destroyed) {
        resolve('failed')
        return
      }

      const settle = (outcome: AnchorOutcome) => {
        if (this.#settled) return
        this.#settled = true
        if (outcome !== 'anchored') this.destroy()
        resolve(outcome)
      }

      const config = buildPeerConfig(import.meta.env)
      const peer = new Peer(this.channelId, { debug: 0, ...(config ? { config } : {}) })
      this.#peer = peer

      peer.on('open', () => settle('anchored'))

      peer.on('error', (error: PeerJsError) => {
        // 'unavailable-id' is the expected answer when the channel is already
        // live: it means someone inside it got here first.
        settle(error.type === 'unavailable-id' ? 'taken' : 'failed')
      })

      peer.on('connection', (conn) => {
        conn.on('open', () => {
          try {
            diagnostics.info('âncora', `alguém bateu na porta de ${shortId(this.channelId)}`)
            void conn.send({ t: 'members', occupants: this.roster() })
          } catch {
            // The joiner vanished mid-handshake; they will retry.
          }
        })
      })
    })
  }

  destroy(): void {
    this.#destroyed = true
    this.#peer?.destroy()
    this.#peer = null
  }
}
