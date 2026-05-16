import { test, expect } from '@playwright/test'
import { makeTestUser, signUp, createBoard } from './helpers'

test('owner generates share link and the code appears on the edit page', async ({ page }) => {
  const owner = makeTestUser('owner')
  await signUp(page, owner)

  const boardId = await createBoard(page, 'Sharing Test Board')
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))

  // Before generating, the button says "Generate share link"
  const generateBtn = page.getByRole('button', { name: 'Generate share link' })
  await expect(generateBtn).toBeVisible()

  await generateBtn.click()

  // After generation, we land back on the edit page with the share code rendered
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))

  const codeLocator = page.locator('code', { hasText: /^\/share\// })
  await expect(codeLocator).toBeVisible()
  const codeText = (await codeLocator.textContent())?.trim() ?? ''
  expect(codeText).toMatch(/^\/share\/[A-Za-z0-9]+$/)

  // Button label flips to "Reveal share link" (it now reveals the existing code on click)
  await expect(page.getByRole('button', { name: 'Reveal share link' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate share link' })).toHaveCount(0)

  // Clicking again reveals the same code (does not regenerate)
  await page.getByRole('button', { name: 'Reveal share link' }).click()
  await expect(page.locator('code', { hasText: /^\/share\// })).toHaveText(codeText)
})

test('anonymous viewer sees board on /share/:code with sign-up link and no host button', async ({
  page,
  browser,
}) => {
  // Owner sets up the board and shares it
  const owner = makeTestUser('owner-anon')
  await signUp(page, owner)
  const boardId = await createBoard(page, 'Anonymous View Board')
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))

  await page.getByRole('button', { name: 'Generate share link' }).click()
  const codeLocator = page.locator('code', { hasText: /^\/share\// })
  await expect(codeLocator).toBeVisible()
  const sharePath = ((await codeLocator.textContent()) ?? '').trim()
  expect(sharePath).toMatch(/^\/share\/[A-Za-z0-9]+$/)

  // Fresh, anonymous context
  const anonCtx = await browser.newContext()
  try {
    const anonPage = await anonCtx.newPage()
    await anonPage.goto(sharePath)

    // Board title visible
    await expect(
      anonPage.getByRole('heading', { name: /anonymous view board/i }),
    ).toBeVisible()

    // Grid renders — $values should appear (default row values include $200)
    await expect(anonPage.getByText(/^\$\d+$/).first()).toBeVisible()

    // Anonymous viewers see the "sign up to host games" link
    await expect(
      anonPage.getByRole('link', { name: /sign up to host games/i }),
    ).toBeVisible()

    // No host button
    await expect(
      anonPage.getByRole('button', { name: /host a game with this board/i }),
    ).toHaveCount(0)
  } finally {
    await anonCtx.close()
  }
})

test('different logged-in user can host a game from a shared board', async ({
  page,
  browser,
}) => {
  // Owner creates and shares the board
  const owner = makeTestUser('owner-share')
  await signUp(page, owner)
  const boardId = await createBoard(page, 'Hostable Shared Board')
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))

  await page.getByRole('button', { name: 'Generate share link' }).click()
  const codeLocator = page.locator('code', { hasText: /^\/share\// })
  await expect(codeLocator).toBeVisible()
  const sharePath = ((await codeLocator.textContent()) ?? '').trim()
  expect(sharePath).toMatch(/^\/share\/[A-Za-z0-9]+$/)

  // Different user in a fresh context
  const viewerCtx = await browser.newContext()
  try {
    const viewerPage = await viewerCtx.newPage()
    const viewer = makeTestUser('viewer')
    await signUp(viewerPage, viewer)

    await viewerPage.goto(sharePath)

    // Board title visible
    await expect(
      viewerPage.getByRole('heading', { name: /hostable shared board/i }),
    ).toBeVisible()

    // The "sign up" link should NOT appear (viewer is logged in)
    await expect(
      viewerPage.getByRole('link', { name: /sign up to host games/i }),
    ).toHaveCount(0)

    // The host button should be visible — clicking it creates a game
    const hostBtn = viewerPage.getByRole('button', {
      name: /host a game with this board/i,
    })
    await expect(hostBtn).toBeVisible()
    await hostBtn.click()

    await expect(viewerPage).toHaveURL(/\/games\/[A-Za-z0-9]+\/host$/)
  } finally {
    await viewerCtx.close()
  }
})
