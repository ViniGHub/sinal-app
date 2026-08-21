export interface ChatMessage {
  id: string
  /** Peer id of the sender, or 'self' for messages this client sent. */
  from: string
  name: string
  text: string
  at: number
}
