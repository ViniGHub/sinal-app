import { expect, test } from '@playwright/test'

/**
 * Reachability on a phone screen.
 *
 * The control bar is fixed to the bottom and the page reserves space for it
 * through a CSS variable. That variable used to be a constant that only held
 * on a wide screen — on a phone the bar wrapped onto several rows, so the
 * footer ended up underneath it and the chat panel covered the very button
 * that opens it. Both were unreachable by tapping, which is the only input a
 * phone has.
 *
 * These assert tappability rather than pixel values: Playwright refuses to
 * click an element another one is covering, which is exactly the failure.
 */
// A phone-sized viewport rather than Playwright's iPhone descriptor, which
// would switch the engine to WebKit. What is being tested is layout at this
// width, and the media flags the suite relies on are Chromium's.
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
})

test.describe('em tela de celular', () => {
  test('o link de diagnóstico no rodapé é alcançável', async ({ page }) => {
    await page.goto('/')

    const link = page.getByRole('button', { name: /diagn/i })
    await link.scrollIntoViewIfNeeded()
    // Fails if the control bar is drawn over it.
    await link.click()

    await expect(page.getByRole('complementary', { name: /Diagn/i })).toBeVisible()
  })

  test('o botão Mensagens continua clicável com o painel aberto', async ({ page }) => {
    await page.goto('/')

    // Chat needs a channel, so create one first — the button is disabled
    // outside of one.
    await page.getByRole('button', { name: /copiar|criar/ }).click()

    const button = page.getByRole('button', { name: /Mensagens/ })
    await expect(button).toBeEnabled({ timeout: 30_000 })
    await button.click()
    await expect(page.getByRole('complementary', { name: 'Mensagens' })).toBeVisible()

    // Closing by the same button is the gesture people reach for first, and it
    // only works if the panel stops short of the bar.
    await button.click()
    await expect(page.getByRole('complementary', { name: 'Mensagens' })).toBeHidden()
  })

  test('a barra de controles não engole a tela', async ({ page }) => {
    await page.goto('/')

    const bar = page.getByTestId('control-bar')
    const box = await bar.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()

    // A wrapped bar took three or four rows and left almost nothing for the
    // call itself. One scrollable row is the point of the mobile layout.
    expect(box!.height).toBeLessThan(viewport!.height * 0.25)
  })
})
