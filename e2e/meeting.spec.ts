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
  const context = await browser.newContext({ permissions: ['microphone'] })
  return context.newPage()
}

/** Waits for the broker to hand this browser an id, and returns it. */
async function selfId(page: Page): Promise<string> {
  const id = page.getByTestId('self-id')
  await expect(id).not.toHaveText('gerando…', { timeout: 30_000 })
  return (await id.innerText()).trim()
}

function headcount(page: Page) {
  return page.getByTestId('headcount')
}

test.describe('encontro entre dois participantes', () => {
  test('o link pessoal cria um canal e coloca os dois nele', async ({ browser, baseURL }) => {
    const alice = await openParticipant(browser)
    const bob = await openParticipant(browser)

    await alice.goto('/')
    const aliceId = await selfId(alice)

    // Opening someone's personal link is one of the two doors into a channel:
    // Alice has none yet, so answering Bob is what brings one into existence.
    await bob.goto(`${baseURL}/#join=${aliceId}`)

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
    await selfId(alice)

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

  test('a mensagem de um chega ao outro', async ({ browser, baseURL }) => {
    const alice = await openParticipant(browser)
    const bob = await openParticipant(browser)

    await alice.goto('/')
    const aliceId = await selfId(alice)
    await bob.goto(`${baseURL}/#join=${aliceId}`)

    await expect(headcount(bob)).toHaveText('2')

    await bob.getByRole('button', { name: /Mensagens/ }).click()
    await bob.getByLabel('Mensagem').fill('cheguei')
    await bob.getByRole('button', { name: 'enviar' }).click()

    // Proves the data channel carries payload, not just the handshake — the
    // roster could gossip correctly while messages went nowhere.
    await alice.getByRole('button', { name: /Mensagens/ }).click()
    await expect(alice.getByText('cheguei')).toBeVisible()

    await alice.close()
    await bob.close()
  })
})
