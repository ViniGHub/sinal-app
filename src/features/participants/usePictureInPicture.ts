import { useCallback, useEffect, useState, type RefObject } from 'react'

interface PictureInPicture {
  /** False where the browser has no API for it — Firefox, notably. */
  supported: boolean
  active: boolean
  toggle: () => void
}

/**
 * Floats a video in a window that survives switching tabs.
 *
 * This is the one way to keep seeing someone while working somewhere else: the
 * page itself gets throttled and hidden, but a picture-in-picture window is
 * drawn by the browser chrome and stays on top of everything.
 */
export function usePictureInPicture(ref: RefObject<HTMLVideoElement | null>): PictureInPicture {
  const [active, setActive] = useState(false)

  const supported =
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    document.pictureInPictureEnabled

  useEffect(() => {
    const video = ref.current
    if (!video) return

    // The window has its own close button, and the browser can dismiss it on
    // its own, so the flag has to follow the element rather than our clicks.
    const onEnter = () => setActive(true)
    const onLeave = () => setActive(false)

    video.addEventListener('enterpictureinpicture', onEnter)
    video.addEventListener('leavepictureinpicture', onLeave)
    setActive(document.pictureInPictureElement === video)

    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter)
      video.removeEventListener('leavepictureinpicture', onLeave)
    }
  }, [ref])

  // Closing on unmount matters more than usual here: the window outlives the
  // page's own layout, so a tile that disappears would otherwise leave a
  // floating video of someone who already left.
  useEffect(() => {
    const video = ref.current
    return () => {
      if (video && document.pictureInPictureElement === video) {
        void document.exitPictureInPicture().catch(() => {})
      }
    }
  }, [ref])

  const toggle = useCallback(() => {
    const video = ref.current
    if (!video || !supported) return

    if (document.pictureInPictureElement === video) {
      void document.exitPictureInPicture().catch(() => {})
      return
    }
    // Requires a user gesture, which the button click provides. Rejections are
    // routine — no track yet, or the element is not ready — and not worth an
    // error the viewer cannot act on.
    void video.requestPictureInPicture().catch(() => {})
  }, [ref, supported])

  return { supported, active, toggle }
}
