import { expect, test, type Page } from '@playwright/test'

/**
 * The header keeps the identity card beside the brand.
 *
 * It stopped doing that when the card had no channel yet: the longer button
 * label made the card six pixels too wide, and a wrapping flex line breaks
 * before it shrinks, so the whole card dropped onto its own row. Six pixels of
 * text decided the layout — which is the part worth guarding, not the pixels.
 */
async function sideBySide(page: Page): Promise<boolean> {
  const card = await page.getByTestId('identity-card').boundingBox()
  const brand = await page.getByRole('heading', { name: 'Sinal' }).boundingBox()
  if (!card || !brand) throw new Error('cabeçalho não encontrado')
  return card.y <= brand.y + 8
}

const share = (page: Page) => page.getByRole('button', { name: /copiar|criar/ })

test.describe('cabeçalho', () => {
  for (const width of [1280, 1024, 900, 760]) {
    test(`em ${width}px o cartão fica ao lado da marca, com e sem canal`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(share(page)).toBeEnabled({ timeout: 30_000 })

      // Without a channel the button reads longer, which is what used to push
      // the card down.
      expect(await sideBySide(page), 'sem canal').toBe(true)

      await share(page).click()
      await expect(page.getByRole('button', { name: /link copiado/ })).toBeVisible()
      expect(await sideBySide(page), 'com canal').toBe(true)
    })
  }

  test('nada transborda na horizontal, em nenhuma largura', async ({ page }) => {
    for (const width of [1280, 900, 760, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await expect(share(page)).toBeEnabled({ timeout: 30_000 })

      // A page that scrolls sideways on a phone is a layout that gave up.
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflows, `${width}px`).toBe(false)
    }
  })
})
