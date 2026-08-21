/**
 * Who may remove other people from a channel.
 *
 * IMPORTANT: this is a convention, not access control. Display names are
 * self-declared and travel over the data channel unverified, so anyone can
 * type this name and gain the button. It keeps an agreed rule visible among
 * people who already trust each other; it stops nobody who does not.
 *
 * Real enforcement would need something a participant cannot simply claim —
 * see "Moderação" in the README.
 */
const ADMIN_NAME = 'pohway'

/** Case-insensitive so the rule does not hinge on how someone typed it. */
export function isAdminName(name: string): boolean {
  return name.trim().toLowerCase() === ADMIN_NAME
}
