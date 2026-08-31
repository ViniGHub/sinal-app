import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Two people meeting in a channel.
 *
 * Each participant gets its own browser context, not just its own tab: they
 * need separate localStorage, because that is where the peer id and the saved
 * channels live. Two tabs would share an identity and prove nothing.
 */
async function openParticipant(browser: Browser): Promise<Page> {
  // Granting up front avoids the permission prompt that would otherwise stall
  // the very first getUserMedia call.
  const context = await browser.newContext({
    // Clipboard access because sharing a channel goes through it, which is the
    // path a person actually takes.
    permissions: ['microphone', 'clipboard-read', 'clipboard-write'],
  })
  return context.newPage()
}

/** Waits until this browser is registered and able to produce a link. */
async function waitForReady(page: Page): Promise<void> {
  await expect(page.getByTestId('channel-id')).toBeVisible({ timeout: 30_000 })
  // The share button stays disabled until the broker has answered, so this is
  // the point from which a link can actually be produced.
  await expect(page.getByRole('button', { name: /copiar|criar/ })).toBeEnabled({
    timeout: 30_000,
  })
}

/**
 * Presses the share button and returns the link it put on the clipboard,
 * creating the channel if there was none.
 *
 * Read from the clipboard rather than from internals, because copying and
 * pasting *is* the feature — a link that never reaches the clipboard is not
 * shareable no matter what the app believes it did.
 */
async function copyChannelLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: /copiar|criar/ }).click()
  await expect(page.getByRole('button', { name: /link copiado/ })).toBeVisible()
  return page.evaluate(() => navigator.clipboard.readText())
}

function headcount(page: Page) {
  return page.getByTestId('headcount')
}

test.describe('encontro entre dois participantes', () => {
  test('o link copiado cria um canal e coloca os dois nele', async ({ browser }) => {
    const alice = await openParticipant(browser)
    const bob = await openParticipant(browser)

    await alice.goto('/')
    await waitForReady(alice)

    // Alice is in no channel yet, so pressing share is what brings one into
    // existence — the app never hands out anything but a channel link.
    const link = await copyChannelLink(alice)
    expect(link).toContain('#channel=sinal-c-')

    await bob.goto(link)

    // Both sides count themselves plus the other. The assertion is deliberately
    // made on both: a mesh where only one side sees the other is the exact
    // half-connected state that looked fine in manual testing.
    await expect(headcount(alice)).toHaveText('2')
    await expect(headcount(bob)).toHaveText('2')

    await alice.close()
    await bob.close()
  })

  test('quem abre um link de canal encontra quem já está dentro', async ({
    browser,
    baseURL,
  }) => {
    const alice = await openParticipant(browser)
    const bob = await openParticipant(browser)

    await alice.goto('/')
    await waitForReady(alice)

    // Alice creates a channel and becomes its anchor.
    await alice.getByRole('button', { name: 'Canais' }).click()
    await alice.getByRole('button', { name: '+ criar canal' }).click()
    // Asserted on the control that only exists while in a channel, rather than
    // on wording: prose moves, and this is tied to the state itself.
    await expect(alice.getByRole('button', { name: 'Sair do canal' })).toBeVisible()

    const channelId = await alice.evaluate(() => localStorage.getItem('sinal.channels'))
    const parsed = JSON.parse(channelId ?? '[]') as Array<{ id: string }>
    const id = parsed[0]?.id
    expect(id, 'o canal criado deveria estar salvo').toBeTruthy()

    await bob.goto(`${baseURL}/#channel=${id}`)

    await expect(headcount(alice)).toHaveText('2')
    await expect(headcount(bob)).toHaveText('2')

    await alice.close()
    await bob.close()
  })

  test('fechar a aba remove a pessoa depressa, sem esperar o timeout', async ({ browser }) => {
    const alice = await openParticipant(browser)
    const bob = await openParticipant(browser)

    await alice.goto('/')
    await waitForReady(alice)
    await bob.goto(await copyChannelLink(alice))
    await expect(headcount(alice)).toHaveText('2')

    // Navigating away rather than killing the context: this is the path a real
    // tab close takes through `pagehide`, and it is the one the app hooks.
    // Playwright's context.close() tears the target down without running it.
    await bob.goto('about:blank')

    // Without a goodbye on unload this waits for the ICE transport to give up,
    // which is tens of seconds — long enough that people assume it is broken.
    await expect(headcount(alice)).toHaveText('1', { timeout: 15_000 })

    await alice.context().close()
    await bob.context().close()
  })

  test('quando a âncora sai, quem fica continua se falando', async ({ browser, baseURL }) => {
    const alice = await openParticipant(browser)
    const bob = await openParticipant(browser)
    const carol = await openParticipant(browser)

    // Alice creates the channel, so she is the one holding its id. Created
    // from the panel rather than through an invite, because that is the path
    // that also saves it — which is how the test learns the id.
    await alice.goto('/')
    await waitForReady(alice)
    await alice.getByRole('button', { name: 'Canais' }).click()
    await alice.getByRole('button', { name: '+ criar canal' }).click()
    await expect(alice.getByRole('button', { name: 'Sair do canal' })).toBeVisible()

    const saved = await alice.evaluate(() => localStorage.getItem('sinal.channels'))
    const id = (JSON.parse(saved ?? '[]') as Array<{ id: string }>)[0]?.id
    expect(id, 'o canal criado deveria estar salvo').toBeTruthy()

    await bob.goto(`${baseURL}/#channel=${id}`)
    await carol.goto(`${baseURL}/#channel=${id}`)
    await expect(headcount(bob)).toHaveText('3', { timeout: 30_000 })
    await expect(headcount(carol)).toHaveText('3', { timeout: 30_000 })

    await alice.goto('about:blank')

    // The anchor is a rendezvous point, never a relay: Bob and Carol talk to
    // each other directly, so losing Alice must cost them only Alice.
    await expect(headcount(bob)).toHaveText('2', { timeout: 20_000 })
    await expect(headcount(carol)).toHaveText('2', { timeout: 20_000 })

    // And the channel itself has to survive: one of them takes the vacant id,
    // otherwise the room would quietly stop accepting anyone new.
    await bob.getByRole('button', { name: 'Canais' }).click()
    await expect(bob.getByRole('button', { name: 'Sair do canal' })).toBeVisible()

    await bob.getByRole('button', { name: /Mensagens/ }).click()
    await bob.getByLabel('Mensagem').fill('ainda aqui')
    await bob.getByRole('button', { name: 'enviar', exact: true }).click()

    await carol.getByRole('button', { name: /Mensagens/ }).click()
    await expect(carol.getByText('ainda aqui')).toBeVisible()

    for (const page of [alice, bob, carol]) await page.context().close()
  })

  test('um arquivo vai de um navegador ao outro, sem servidor no meio', async ({ browser }) => {
    const alice = await openParticipant(browser)
    const bob = await openParticipant(browser)

    await alice.goto('/')
    await waitForReady(alice)
    await bob.goto(await copyChannelLink(alice))
    await expect(headcount(bob)).toHaveText('2')

    await bob.getByRole('button', { name: /Mensagens/ }).click()
    // Deliberately past PeerJS's ~16 KB chunking threshold. Below it a payload
    // rides in a single datagram and arrives as an ArrayBuffer; above it, it is
    // reassembled into a Uint8Array instead. A small fixture exercises only the
    // first path and passed happily while every real file was being dropped.
    const payload = 'combinado para sexta\n'.repeat(3000)
    await bob.setInputFiles('input[type=file]', {
      name: 'anotacoes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(payload),
    })

    // The link on the other side has to be a real download, pointing at bytes
    // that crossed the data channel — not a name someone typed.
    await alice.getByRole('button', { name: /Mensagens/ }).click()
    const link = alice.getByRole('link', { name: /anotacoes.txt/ })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('download', 'anotacoes.txt')

    const href = (await link.getAttribute('href')) ?? ''
    expect(href).toMatch(/^blob:/)
    const received = await alice.evaluate((url) => fetch(url).then((r) => r.text()), href)
    expect(received).toBe(payload)

    await alice.close()
    await bob.close()
  })

  test('a mensagem de um chega ao outro', async ({ browser }) => {
    const alice = await openParticipant(browser)
    const bob = await openParticipant(browser)

    await alice.goto('/')
    await waitForReady(alice)
    await bob.goto(await copyChannelLink(alice))

    await expect(headcount(bob)).toHaveText('2')

    await bob.getByRole('button', { name: /Mensagens/ }).click()
    await bob.getByLabel('Mensagem').fill('cheguei')
    await bob.getByRole('button', { name: 'enviar', exact: true }).click()

    // Proves the data channel carries payload, not just the handshake — the
    // roster could gossip correctly while messages went nowhere.
    await alice.getByRole('button', { name: /Mensagens/ }).click()
    await expect(alice.getByText('cheguei')).toBeVisible()

    await alice.close()
    await bob.close()
  })
})
