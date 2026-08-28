/** A file that arrived over the data channel, held as an object URL. */
export interface ChatFile {
  name: string
  size: number
  /** Blob URL, valid only while this session lives. */
  url: string
}

export interface ChatMessage {
  id: string
  /** Peer id of the sender, or 'self' for messages this client sent. */
  from: string
  name: string
  text: string
  at: number
  /** Present when the message carries a file rather than only words. */
  file?: ChatFile
}
