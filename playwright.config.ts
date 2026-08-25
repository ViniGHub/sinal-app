import { defineConfig, devices } from '@playwright/test'

const PORT = 5199
const BASE_URL = `http://localhost:${PORT}`

/**
 * End-to-end tests that run the real app in a real browser.
 *
 * The suite exists for one reason the unit tests structurally cannot cover:
 * this is a peer-to-peer app, and its failures are failures *between* two
 * browsers. Every bug that reached production so far — the anchor that was
 * never claimed, the config that replaced PeerJS's defaults — was correct in
 * every individual function and wrong in how they met.
 */
export default defineConfig({
  testDir: './e2e',

  // A WebRTC handshake is seconds, not milliseconds: broker round trip, offer,
  // answer, ICE. Unit-test timeouts would fail on healthy runs.
  timeout: 90_000,
  expect: { timeout: 25_000 },

  // Two peers per test share one signalling broker, and parallel tests would
  // make a timing failure impossible to attribute.
  fullyParallel: false,
  workers: 1,

  // The public PeerJS broker is a third party we do not control, so a lone
  // network hiccup should not fail the build. A test that fails twice in a row
  // is a real failure.
  retries: process.env.CI ? 2 : 0,

  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Synthetic camera and microphone: a real capture pipeline with no
            // hardware, which is what lets this run on a CI machine at all.
            '--use-fake-device-for-media-capture',
            '--use-fake-ui-for-media-stream',
            // The app plays remote audio as soon as it arrives, with no click
            // to point at; headless Chrome would otherwise block it.
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],

  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
