import { readAttention } from '@/features/session/attention'
import { safeStorage } from '@/shared/safeStorage'

/**
 * Desktop notifications for chat messages.
 *
 * Only ever fired when the tab is not in front of the person: a notification
 * for something already on screen is noise, and noise is how people learn to
 * turn notifications off entirely.
 */
export type NotificationState = 'unsupported' | 'default' | 'granted' | 'denied'

const KEY = 'sinal.notifications'

/** Repeated messages replace each other instead of stacking into a wall. */
const TAG = 'sinal-chat'

export function notificationState(): NotificationState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

/**
 * Asks the browser for permission. Must be called from a user gesture — a
 * prompt nobody asked for is denied by default in every current browser.
 */
export async function requestNotifications(): Promise<NotificationState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return notificationState()
  }
}

export function loadNotificationsEnabled(): boolean {
  return safeStorage()?.getItem(KEY) === 'true'
}

export function saveNotificationsEnabled(enabled: boolean): void {
  safeStorage()?.setItem(KEY, String(enabled))
}

/**
 * Shows a message, or does nothing at all.
 *
 * Every reason to stay silent is checked here rather than at the call site, so
 * there is one place that decides and no way to forget one of them.
 */
export function showMessageNotification(name: string, text: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  // The one condition the whole feature exists for: they are not looking.
  if (readAttention() === 'focused') return

  try {
    const notification = new Notification(name, {
      body: text,
      tag: TAG,
      icon: `${import.meta.env.BASE_URL}favicon.svg`,
    })
    // Clicking it should bring them back to the conversation, which is the
    // only reason someone clicks a chat notification.
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Some engines throw when constructing from a non-secure or backgrounded
    // context. Losing a notification is never worth an error.
  }
}
