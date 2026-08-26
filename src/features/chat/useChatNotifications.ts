import { useEffect, useRef } from 'react'

import type { ChatMessage } from './types'
import { showMessageNotification } from './notifications'

/**
 * Fires a notification for each message that arrives from someone else.
 *
 * Lives in the app shell rather than in the chat panel: the whole point is to
 * reach someone who is not looking, and the panel is usually closed when that
 * is true.
 */
export function useChatNotifications(messages: ChatMessage[], enabled: boolean): void {
  // Which message we have already announced. Starts at the newest so opening
  // the app never replays a backlog as a burst of notifications.
  const lastSeen = useRef<string | null>(null)

  useEffect(() => {
    const latest = messages[messages.length - 1]
    if (!latest) return

    const previous = lastSeen.current
    lastSeen.current = latest.id

    // First render only records where we are; there is nothing new yet.
    if (previous === null) return
    if (!enabled) return

    const index = messages.findIndex((message) => message.id === previous)
    // A message that fell off the end of the ring buffer leaves no index; in
    // that case announce only the newest rather than guessing how many we owe.
    const fresh = index === -1 ? [latest] : messages.slice(index + 1)

    for (const message of fresh) {
      if (message.from === 'self') continue
      showMessageNotification(message.name, message.text)
    }
  }, [messages, enabled])
}
