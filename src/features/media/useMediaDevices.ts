import { useEffect, useState } from 'react'

import { EMPTY_DEVICES, listDevices, type DeviceLists } from './devices'

/**
 * The cameras and microphones currently attached.
 *
 * Re-read on `devicechange`, so plugging in a headset or unplugging a webcam
 * updates the menus without a reload. Also re-read whenever `refreshKey`
 * changes, which callers use after a permission is granted: labels only become
 * readable once the matching device has been opened at least once.
 */
export function useMediaDevices(refreshKey: unknown): DeviceLists {
  const [devices, setDevices] = useState<DeviceLists>(EMPTY_DEVICES)

  useEffect(() => {
    let cancelled = false

    const read = () => {
      void listDevices().then((next) => {
        if (!cancelled) setDevices(next)
      })
    }

    read()
    navigator.mediaDevices?.addEventListener?.('devicechange', read)
    return () => {
      cancelled = true
      navigator.mediaDevices?.removeEventListener?.('devicechange', read)
    }
  }, [refreshKey])

  return devices
}
