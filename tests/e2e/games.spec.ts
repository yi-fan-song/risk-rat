import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { makeTestUser, signUp, createBoard } from './helpers'

// Minimal 1x1 red PNG, used by the file-clue gameplay test.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000d49444154789c63f8cfc0c0c0000003000180a1b8d70000000049454e44ae426082',
  'hex',
)

/**
 * Extract a join code (6 uppercase alphanumeric chars from the host code alphabet)
 * from a /games/:joinCode/host URL.
 */
function extractJoinCode(url: string): string {
  const m = url.match(/\/games\/([A-Z2-9]{6})\/host/)
  if (!m) throw new Error(`Could not extract joinCode from URL: ${url}`)
  return m[1]
}

/**
 * Live games push state via SSE — all open pages auto-reload after every state
 * change. We assert on the post-reload DOM using Playwright's auto-retrying
 * locators rather than calling .reload() ourselves, so the test actually
 * verifies the SSE notification path.
 */

test('live game happy path across host, player, and spectator contexts', async ({
  browser,
}) => {
  // --------- Step 1: owner signs up, creates a board, edits the $200 clue -------
  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  const owner = makeTestUser('host')
  await signUp(ownerPage, owner)

  const boardTitle = `Game Board ${Date.now()}`
  const boardId = await createBoard(ownerPage, boardTitle)

  // The first $200 clue is the first clue link in the grid (row 0, column 0).
  const firstCell = ownerPage.locator(`a[href*="/boards/${boardId}/clues/"]`).first()
  await firstCell.click()
  await expect(ownerPage).toHaveURL(
    new RegExp(`/boards/${boardId}/clues/[a-f0-9-]+$`),
  )

  await ownerPage.locator('input[name="payloadType"][value="question"]').check()
  await ownerPage.locator('textarea[name="prompt"]').fill('What is 2+2?')
  await ownerPage.locator('textarea[name="response"]').fill('4')
  await ownerPage.getByRole('button', { name: /save clue/i }).click()
  await expect(ownerPage).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))
  await expect(ownerPage.getByText('Clue saved.')).toBeVisible()

  // --------- Step 2: owner starts the live game ------------------------------
  await ownerPage.getByRole('button', { name: /start live game/i }).click()
  await expect(ownerPage).toHaveURL(/\/games\/[A-Z2-9]{6}\/host$/)
  const joinCode = extractJoinCode(ownerPage.url())

  // Host page should show the lobby
  await expect(ownerPage.getByRole('heading', { name: /lobby/i })).toBeVisible()
  await expect(
    ownerPage.getByRole('button', { name: /start game/i }),
  ).toBeVisible()

  // --------- Step 3: open a second context as the player ---------------------
  const playerContext = await browser.newContext()
  const playerPage = await playerContext.newPage()
  await playerPage.goto(`/games/${joinCode}/play`)

  // The join form should be visible (no display name in session yet).
  const displayNameInput = playerPage.locator('input[name="displayName"]')
  await expect(displayNameInput).toBeVisible()
  await displayNameInput.fill('PlayerOne')
  await playerPage.getByRole('button', { name: /join game/i }).click()

  // After join we redirect back to /play; should now show the player page.
  await expect(playerPage).toHaveURL(new RegExp(`/games/${joinCode}/play$`))
  await expect(playerPage.getByText(/playing as/i)).toBeVisible()
  await expect(playerPage.getByText('PlayerOne').first()).toBeVisible()
  await expect(
    playerPage.getByText(/waiting for the host to start the game/i),
  ).toBeVisible()

  // --------- Step 4: open a third context as a spectator ---------------------
  const spectatorContext = await browser.newContext()
  const spectatorPage = await spectatorContext.newPage()
  await spectatorPage.goto(`/games/${joinCode}/watch`)

  // Spectator role should be shown in the header
  await expect(spectatorPage.getByText(/SPECTATOR/)).toBeVisible()
  await expect(
    spectatorPage.getByText(/waiting for the host to start the game/i),
  ).toBeVisible()

  // SSE notifies the host page that a player joined.
  await expect(ownerPage.getByText(/players \(1\)/i)).toBeVisible()
  await expect(ownerPage.getByText('PlayerOne').first()).toBeVisible()

  // --------- Step 5: host starts the game -----------------------------------
  await ownerPage.getByRole('button', { name: /start game/i }).click()
  // Host page lands on /host after the start action (server-side redirect).
  await expect(ownerPage).toHaveURL(new RegExp(`/games/${joinCode}/host$`))
  await expect(ownerPage.getByText('Category 1')).toBeVisible()

  // SSE-driven reload propagates to player + spectator.
  await expect(playerPage.getByText('Category 1')).toBeVisible()
  await expect(spectatorPage.getByText('Category 1')).toBeVisible()

  // Host should also see an "End game" button on the grid view.
  await expect(ownerPage.getByRole('button', { name: /end game/i })).toBeVisible()

  // --------- Step 6: host opens the $200 clue in category 1 -----------------
  // On the host's board grid, the cell submit buttons live in
  // <form action="/games/.../action"> with hidden action=open_clue.
  // We filter by the visible "$200" text to pick the first $200 cell.
  const hostBoardCells = ownerPage.locator(
    `form[action="/games/${joinCode}/action"] button[type="submit"]`,
  )
  await hostBoardCells.filter({ hasText: '$200' }).first().click()

  // Host page reloads after the redirect; should show the clue view with prompt + answer.
  await expect(ownerPage.getByText('What is 2+2?')).toBeVisible()
  await expect(ownerPage.getByText(/answer:\s*4/i)).toBeVisible()
  await expect(
    ownerPage.getByRole('button', { name: /open buzzer/i }),
  ).toBeVisible()
  await expect(
    ownerPage.getByRole('button', { name: /close clue \(no answer\)/i }),
  ).toBeVisible()

  // SSE propagates the open-clue state.
  await expect(playerPage.getByText('What is 2+2?')).toBeVisible()
  await expect(spectatorPage.getByText('What is 2+2?')).toBeVisible()
  // Player should NOT yet see a BUZZ button (buzzer is closed).
  await expect(playerPage.getByText(/wait for host to open buzzer/i)).toBeVisible()

  // --------- Step 7: host opens the buzzer ----------------------------------
  await ownerPage.getByRole('button', { name: /open buzzer/i }).click()
  await expect(ownerPage.getByText(/BUZZER OPEN/)).toBeVisible()

  // SSE propagates the open-buzzer state; the player sees the BUZZ button.
  const buzzButton = playerPage.getByRole('button', { name: /^BUZZ!$/ })
  await expect(buzzButton).toBeVisible()

  // --------- Step 8: player presses BUZZ ------------------------------------
  await buzzButton.click()
  // Player page reloads via the form-submit redirect → /play; it should show
  // the "You buzzed in!" state.
  await expect(playerPage.getByText(/you buzzed in!/i)).toBeVisible()

  // SSE notifies the host of the first buzzer.
  await expect(ownerPage.getByText(/First: PlayerOne/)).toBeVisible()
  await expect(
    ownerPage.getByRole('button', { name: /correct \(\+\$200\)/i }),
  ).toBeVisible()
  await expect(
    ownerPage.getByRole('button', { name: /wrong \(-\$200\)/i }),
  ).toBeVisible()

  // --------- Step 9: host awards the points ---------------------------------
  await ownerPage.getByRole('button', { name: /correct \(\+\$200\)/i }).click()
  // After reload, clue view should be closed and the board grid is back.
  await expect(ownerPage.getByRole('button', { name: /end game/i })).toBeVisible()

  // Scoreboard shows PlayerOne with $200 on all three pages (SSE-driven).
  for (const p of [ownerPage, playerPage, spectatorPage]) {
    await expect(p.getByText('PlayerOne').first()).toBeVisible()
    await expect(p.getByText('$200').first()).toBeVisible()
  }
  // Player page's own score badge ("Score: $200").
  await expect(
    playerPage.locator('strong', { hasText: '$200' }).first(),
  ).toBeVisible()

  // --------- Step 10: host ends the game ------------------------------------
  await ownerPage.getByRole('button', { name: /end game/i }).click()
  await expect(
    ownerPage.getByRole('heading', { name: /game over!/i }),
  ).toBeVisible()
  await expect(ownerPage.getByText(/wins with \$200/i)).toBeVisible()

  // SSE pushes the finished state to all clients.
  for (const p of [playerPage, spectatorPage]) {
    await expect(p.getByRole('heading', { name: /game over!/i })).toBeVisible()
    await expect(p.getByText(/wins with \$200/i)).toBeVisible()
    await expect(p.getByText('PlayerOne').first()).toBeVisible()
  }

  // Cleanup contexts.
  await playerContext.close()
  await spectatorContext.close()
  await ownerContext.close()
})

test('anonymous player can join a game with a custom display name', async ({
  browser,
}) => {
  // Set up: owner signs up, makes a board, starts a game.
  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  const owner = makeTestUser('anonhost')
  await signUp(ownerPage, owner)
  await createBoard(ownerPage, `Anon Game ${Date.now()}`)
  await ownerPage.getByRole('button', { name: /start live game/i }).click()
  await expect(ownerPage).toHaveURL(/\/games\/[A-Z2-9]{6}\/host$/)
  const joinCode = extractJoinCode(ownerPage.url())

  // Anonymous player (fresh context, no auth cookie) joins.
  const anonContext = await browser.newContext()
  const anonPage = await anonContext.newPage()
  await anonPage.goto(`/games/${joinCode}/play`)

  // The Display name input should be empty (no user.username default).
  const nameInput = anonPage.locator('input[name="displayName"]')
  await expect(nameInput).toBeVisible()
  await expect(nameInput).toHaveValue('')

  await nameInput.fill('AnonHero')
  await anonPage.getByRole('button', { name: /join game/i }).click()

  await expect(anonPage).toHaveURL(new RegExp(`/games/${joinCode}/play$`))
  await expect(anonPage.getByText(/playing as/i)).toBeVisible()
  await expect(anonPage.getByText('AnonHero').first()).toBeVisible()

  // SSE updates the host roster with the anonymous player.
  await expect(ownerPage.getByText('AnonHero').first()).toBeVisible()

  // Reload the player page — the guest session cookie should keep them joined.
  await anonPage.reload()
  await expect(anonPage.getByText(/playing as/i)).toBeVisible()
  await expect(anonPage.getByText('AnonHero').first()).toBeVisible()

  await anonContext.close()
  await ownerContext.close()
})

test('multiple-choice clue renders options in the game (host sees correct, player does not)', async ({
  browser,
}) => {
  // Owner builds a board with an MC clue, starts the game, opens that clue.
  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await signUp(ownerPage, makeTestUser('host_mc'))
  const boardId = await createBoard(ownerPage, `MC Game ${Date.now()}`)

  const firstCell = ownerPage.locator(`a[href*="/boards/${boardId}/clues/"]`).first()
  await firstCell.click()
  await ownerPage.locator('input[name="payloadType"][value="multiple_choice"]').check()
  await ownerPage.locator('input[name="value"]').fill('200')
  await ownerPage.locator('textarea[name="prompt"]').fill('Closest planet to the sun?')
  await ownerPage.locator('input[name="option_0"]').fill('Mercury')
  await ownerPage.locator('input[name="option_1"]').fill('Venus')
  await ownerPage.locator('input[name="option_2"]').fill('Earth')
  await ownerPage.locator('input[name="option_3"]').fill('Mars')
  await ownerPage.locator('input[name="correct"][value="0"]').check()
  await ownerPage.getByRole('button', { name: /save clue/i }).click()
  await expect(ownerPage.getByText('Clue saved.')).toBeVisible()

  await ownerPage.getByRole('button', { name: /start live game/i }).click()
  await expect(ownerPage).toHaveURL(/\/games\/[A-Z2-9]{6}\/host$/)
  const joinCode = extractJoinCode(ownerPage.url())

  // Open a spectator context so we can verify the non-host view too.
  const spectatorPage = await (await browser.newContext()).newPage()
  await spectatorPage.goto(`/games/${joinCode}/watch`)

  await ownerPage.getByRole('button', { name: /start game/i }).click()
  await expect(ownerPage.getByText('Category 1')).toBeVisible()
  // Wait for spectator's SSE-driven reload to settle on the in-progress state
  // before triggering the next event (otherwise the next event can fire while
  // the spectator's EventSource is still reconnecting from the prior reload).
  await expect(spectatorPage.getByText('Category 1')).toBeVisible()

  // Host opens the MC clue (the only $200 cell on the board so far).
  await ownerPage
    .locator(`form[action="/games/${joinCode}/action"] button[type="submit"]`)
    .filter({ hasText: '$200' })
    .first()
    .click()

  // Host sees prompt + all 4 options + the "correct" tag on Mercury.
  await expect(ownerPage.getByText('Closest planet to the sun?')).toBeVisible()
  for (const opt of ['Mercury', 'Venus', 'Earth', 'Mars']) {
    await expect(ownerPage.getByText(opt)).toBeVisible()
  }
  await expect(ownerPage.getByText(/^correct$/i)).toBeVisible()

  // Spectator sees the options but NOT the correct mark.
  await expect(spectatorPage.getByText('Closest planet to the sun?')).toBeVisible()
  for (const opt of ['Mercury', 'Venus', 'Earth', 'Mars']) {
    await expect(spectatorPage.getByText(opt)).toBeVisible()
  }
  await expect(spectatorPage.getByText(/^correct$/i)).toHaveCount(0)
})

test('file clue renders an inline image to host and spectator', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await signUp(ownerPage, makeTestUser('host_file'))
  const boardId = await createBoard(ownerPage, `File Game ${Date.now()}`)

  // Upload a tiny PNG to a clue.
  const tmpPath = `/tmp/game-test-${Date.now()}.png`
  writeFileSync(tmpPath, TINY_PNG)

  const firstCell = ownerPage.locator(`a[href*="/boards/${boardId}/clues/"]`).first()
  await firstCell.click()
  await ownerPage.locator('input[name="payloadType"][value="file"]').check()
  await ownerPage.locator('input[name="value"]').fill('200')
  await ownerPage.locator('textarea[name="prompt"]').fill('Identify this:')
  await ownerPage.setInputFiles('input[name="file"]', tmpPath)
  await ownerPage.getByRole('button', { name: /save clue/i }).click()
  await expect(ownerPage.getByText('Clue saved.')).toBeVisible()

  await ownerPage.getByRole('button', { name: /start live game/i }).click()
  const joinCode = extractJoinCode(ownerPage.url())

  const spectatorPage = await (await browser.newContext()).newPage()
  await spectatorPage.goto(`/games/${joinCode}/watch`)

  await ownerPage.getByRole('button', { name: /start game/i }).click()
  await expect(ownerPage.getByText('Category 1')).toBeVisible()
  await expect(spectatorPage.getByText('Category 1')).toBeVisible()
  await ownerPage
    .locator(`form[action="/games/${joinCode}/action"] button[type="submit"]`)
    .filter({ hasText: '$200' })
    .first()
    .click()

  // Host sees the image, sourced from /files/:key
  const hostImg = ownerPage.locator('img[src^="/files/"]')
  await expect(hostImg).toBeVisible()

  // The file route serves real bytes — verify the image actually loads.
  const naturalWidth = await hostImg.evaluate(
    (el) => (el as HTMLImageElement).naturalWidth,
  )
  expect(naturalWidth).toBeGreaterThan(0)

  // Spectator sees it too.
  await expect(spectatorPage.locator('img[src^="/files/"]')).toBeVisible()
})
