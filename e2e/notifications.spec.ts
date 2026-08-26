import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * The notification toggle is a preference people set once and then trust. What
 * matters is that it is findable, that it says which state it is in, and that
 * the choice survives a reload.
 *
 * Permission is stubbed rather than granted: headless Chromium reports
 * `denied` no matter what the context grants, and the thing under test is our
 * toggle, not the browser's permission system. The denied path gets its own
 * test, because it is a state real users land in.
 */
async function openWithPermission(
  browser: Browser,
  permission: NotificationPermission,
): Promise<Page> {
  const context = await browser.newContext({ permissions: ['microphone'] })
  const page = await context.newPage()
  await page.addInitScript((value) => {
    Object.defineProperty(Notification, 'permission', { get: () => value })
  }, permission)
  return page
}

function toggleOf(page: Page) {
  return page.getByRole('button', { name: /notificações|bloqueadas/ })
}

test.describe('notificações de mensagem', () => {
  test('o botão aparece nas mensagens e alterna de estado', async ({ browser }) => {
    const page = await openWithPermission(browser, 'granted')
    await page.goto('/')
    await page.getByRole('button', { name: /Mensagens/ }).click()

    const toggle = toggleOf(page)
    await expect(toggle).toBeVisible()
    await expect(toggle).toBeEnabled()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await page.context().close()
  })

  test('a escolha sobrevive a um recarregamento', async ({ browser }) => {
    const page = await openWithPermission(browser, 'granted')
    await page.goto('/')
    await page.getByRole('button', { name: /Mensagens/ }).click()
    await toggleOf(page).click()

    await page.reload()
    await page.getByRole('button', { name: /Mensagens/ }).click()

    // A preference that resets on reload is worse than none: people set it
    // once and assume it held.
    await expect(toggleOf(page)).toHaveAttribute('aria-pressed', 'true')

    await page.context().close()
  })

  test('quando o navegador bloqueia, diz isso em vez de fingir que funciona', async ({
    browser,
  }) => {
    const page = await openWithPermission(browser, 'denied')
    await page.goto('/')
    await page.getByRole('button', { name: /Mensagens/ }).click()

    const toggle = toggleOf(page)
    await expect(toggle).toBeVisible()
    // Offering a switch that cannot do anything is worse than showing why.
    await expect(toggle).toBeDisabled()
    await expect(toggle).toContainText('bloqueadas')

    await page.context().close()
  })
})
