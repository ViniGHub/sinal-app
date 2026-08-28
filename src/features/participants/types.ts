export type PeerStatus = 'connecting' | 'connected' | 'closed'

/** What to fill the page with when a participant's video is expanded. */
export type VideoSource =
  /** The shared screen alone. */
  | 'screen'
  /** The camera alone. */
  | 'camera'
  /** The screen, with the camera floating over it. */
  | 'both'

export interface SpotlightTarget {
  /** Peer id, or 'self' for our own capture. */
  id: string
  source: VideoSource
}

/** Where the floating camera sits. Corners only, so it can never be lost. */
export type CameraCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

/**
 * Someone inside a channel, as announced by its anchor.
 *
 * Thinner than `RemotePeer` on purpose: this describes people we are *not*
 * connected to, so there are no streams and no live state — just who is there.
 */
export interface Occupant {
  id: string
  /** Empty when they have not announced a name. */
  name: string
}

/**
 * How present someone is at their browser.
 *
 * Reliable in one direction only: 'hidden' proves they are *not* seeing a
 * shared screen, while 'focused' only means they could be. Nothing here can
 * tell whether a person is actually looking at their monitor, so the UI should
 * report what the browser reports and claim no more than that.
 *
 * 'unknown' covers peers we have not heard from yet — guessing 'focused' would
 * be an assertion we cannot back.
 */
export type AttentionState = 'unknown' | 'focused' | 'visible' | 'hidden'

/** A remote participant, as far as the local session can tell. */
export interface RemotePeer {
  id: string
  /** Display name they announced, or a short form of their id until they do. */
  name: string
  status: PeerStatus
  /** Whether they told us their microphone is muted. */
  micMuted: boolean
  /** Whether their microphone is picking up speech right now. */
  speaking: boolean
  /**
   * How loudly we play them, from 0 to 1. Local only — nobody else is told,
   * because it says nothing about them and everything about our own room.
   */
  volume: number
  /** Whether their tab is in front of them, as far as their browser can tell. */
  attention: AttentionState
  /** Their voice, or null while the audio call is still being set up. */
  audioStream: MediaStream | null
  /** Their screen, or null when they are not sharing. */
  screenStream: MediaStream | null
  /**
   * Their camera, or null when it is off. Independent of the screen: someone
   * can show both at once, and the tile lays them out accordingly.
   */
  cameraStream: MediaStream | null
}
