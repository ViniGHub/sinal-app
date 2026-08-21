import { safeStorage } from '@/shared/safeStorage'

export interface DeviceOption {
  id: string
  label: string
}

export interface DeviceLists {
  cameras: DeviceOption[]
  microphones: DeviceOption[]
}

const MIC_KEY = 'sinal.micDevice'
const CAMERA_KEY = 'sinal.cameraDevice'

export const EMPTY_DEVICES: DeviceLists = { cameras: [], microphones: [] }

/**
 * Browsers withhold device labels until the matching permission has been
 * granted, so an unnamed entry is expected rather than an error — the camera
 * list stays generic until the camera has been switched on once.
 */
function label(device: MediaDeviceInfo, index: number, fallback: string): string {
  return device.label || `${fallback} ${index + 1}`
}

export async function listDevices(): Promise<DeviceLists> {
  if (!navigator.mediaDevices?.enumerateDevices) return EMPTY_DEVICES

  let devices: MediaDeviceInfo[]
  try {
    devices = await navigator.mediaDevices.enumerateDevices()
  } catch {
    return EMPTY_DEVICES
  }

  const pick = (kind: MediaDeviceKind, fallback: string): DeviceOption[] =>
    devices
      .filter((device) => device.kind === kind && device.deviceId)
      .map((device, index) => ({ id: device.deviceId, label: label(device, index, fallback) }))

  return {
    cameras: pick('videoinput', 'Câmera'),
    microphones: pick('audioinput', 'Microfone'),
  }
}

/**
 * The device the user last chose, so a preference survives a reload. Ids can go
 * stale when hardware is unplugged; callers treat a missing device as "use the
 * default" rather than as a failure.
 */
export function loadPreferredMic(): string | null {
  return safeStorage()?.getItem(MIC_KEY) ?? null
}

export function loadPreferredCamera(): string | null {
  return safeStorage()?.getItem(CAMERA_KEY) ?? null
}

export function savePreferredMic(deviceId: string): void {
  safeStorage()?.setItem(MIC_KEY, deviceId)
}

export function savePreferredCamera(deviceId: string): void {
  safeStorage()?.setItem(CAMERA_KEY, deviceId)
}
