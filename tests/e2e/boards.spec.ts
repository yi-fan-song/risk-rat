import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { makeTestUser, signUp, createBoard } from './helpers'

// Minimal 1x1 red PNG.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4' +
    '890000000d49444154789c63f8cfc0c0c0000003000180a1b8d70000000049454e44ae426082',
  'hex',
)

// Note: the app originally used React-style `defaultValue` / `defaultChecked`
// props, which @remix-run/ui emits verbatim as non-standard `defaultvalue=""`
// / `defaultchecked=""` attributes. Remix v3 isn't React — switched to
// plain `value` / `checked` on inputs so SSR round-trips properly.

test('creating a board lands on edit page with default categories and grid', async ({
  page,
}) => {
  const user = makeTestUser('boards1')
  await signUp(page, user)

  const title = `Board ${Date.now()}`
  const boardId = await createBoard(page, title)

  // URL has the expected shape
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))

  // Document title reflects the board title (the visible <h1> uses
  // grid.board.title indirectly via Layout/document title).
  await expect(page).toHaveTitle(new RegExp(`Edit.*${title}`))

  // Six category inputs render in the grid.
  const categoryInputs = page.locator('input[name^="category_"]')
  await expect(categoryInputs).toHaveCount(6)

  // Grid shows $200..$1000 — each row's dollar value appears six times.
  for (const value of [200, 400, 600, 800, 1000]) {
    await expect(page.getByText(`$${value}`, { exact: true })).toHaveCount(6)
  }
})

test(
  'renaming a board persists across reloads',
  async ({ page }) => {
    const user = makeTestUser('boards2')
    await signUp(page, user)

    const originalTitle = `Original ${Date.now()}`
    const boardId = await createBoard(page, originalTitle)

    const newTitle = `Renamed ${Date.now()}`
    await page.locator('input[name="title"]').fill(newTitle)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))
    await expect(page.getByText('Saved.')).toBeVisible()

    await page.reload()
    // BUG: the input renders with `defaultvalue="<newTitle>"` instead of
    //      `value="<newTitle>"`, so the DOM .value is empty even though the
    //      server persisted the rename.
    await expect(page.locator('input[name="title"]')).toHaveValue(newTitle)
  },
)

test(
  'renaming a category persists across reloads',
  async ({ page }) => {
    const user = makeTestUser('boards3')
    await signUp(page, user)

    await createBoard(page, `Cat board ${Date.now()}`)

    const firstCategory = page.locator('input[name^="category_"]').first()
    // BUG: this would be "Category 1" if defaultValue mapped to the HTML
    //      `value` attribute. As rendered, .value is "".
    await expect(firstCategory).toHaveValue('Category 1')

    const renamed = `History ${Date.now().toString(36)}`
    await firstCategory.fill(renamed)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Saved.')).toBeVisible()

    await page.reload()
    await expect(
      page.locator('input[name^="category_"]').first(),
    ).toHaveValue(renamed)
  },
)

test(
  'editing a clue as a question round-trips prompt and response',
  async ({ page }) => {
    const user = makeTestUser('boards4')
    await signUp(page, user)

    const boardId = await createBoard(page, `Q board ${Date.now()}`)

    // Open the first clue cell (top-left, $200 in column 1).
    const firstCell = page
      .locator(`a[href*="/boards/${boardId}/clues/"]`)
      .first()
    const cellHref = await firstCell.getAttribute('href')
    await firstCell.click()
    await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/clues/[a-f0-9-]+$`))

    const prompt = 'The capital of France'
    const response = 'What is Paris?'

    await page.locator('input[name="payloadType"][value="question"]').check()
    // Dollar value field needs to be filled because SSR doesn't populate it
    // from defaultValue — otherwise the form would post value="" and the
    // server would fall back to the existing 200 anyway, but be explicit.
    await page.locator('input[name="value"]').fill('200')
    await page.locator('textarea[name="prompt"]').fill(prompt)
    await page.locator('textarea[name="response"]').fill(response)
    await page.getByRole('button', { name: /save clue/i }).click()

    await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))
    await expect(page.getByText('Clue saved.')).toBeVisible()

    // Reopen — BUG: the textareas render empty because defaultValue doesn't
    //               serialize to HTML, and the question radio isn't preselected
    //               because defaultChecked doesn't serialize either.
    await page.goto(cellHref!)
    await expect(page.locator('textarea[name="prompt"]')).toHaveValue(prompt)
    await expect(page.locator('textarea[name="response"]')).toHaveValue(response)
    await expect(
      page.locator('input[name="payloadType"][value="question"]'),
    ).toBeChecked()
  },
)

test(
  'editing a clue as multiple choice round-trips options and correct answer',
  async ({ page }) => {
    const user = makeTestUser('boards5')
    await signUp(page, user)

    const boardId = await createBoard(page, `MC board ${Date.now()}`)

    const firstCell = page
      .locator(`a[href*="/boards/${boardId}/clues/"]`)
      .first()
    const cellHref = await firstCell.getAttribute('href')
    await firstCell.click()
    await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/clues/[a-f0-9-]+$`))

    await page.locator('input[name="payloadType"][value="multiple_choice"]').check()
    await page.locator('input[name="value"]').fill('200')

    const options = ['Alpha', 'Bravo', 'Charlie', 'Delta']
    for (let i = 0; i < options.length; i++) {
      await page.locator(`input[name="option_${i}"]`).fill(options[i])
    }
    await page.locator('input[name="correct"][value="2"]').check()

    await page.getByRole('button', { name: /save clue/i }).click()
    await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))
    await expect(page.getByText('Clue saved.')).toBeVisible()

    // Reopen — BUG: option inputs render empty, neither payloadType nor
    //               correct radios are preselected.
    await page.goto(cellHref!)
    await expect(
      page.locator('input[name="payloadType"][value="multiple_choice"]'),
    ).toBeChecked()
    for (let i = 0; i < options.length; i++) {
      await expect(page.locator(`input[name="option_${i}"]`)).toHaveValue(options[i])
    }
    await expect(page.locator('input[name="correct"][value="2"]')).toBeChecked()
  },
)

test('editing a clue as a file uploads an image and shows the current-file panel on reopen', async ({
  page,
}) => {
  const user = makeTestUser('boards6')
  await signUp(page, user)

  const boardId = await createBoard(page, `File board ${Date.now()}`)

  const tmpPath = `/tmp/boards-test-${Date.now()}.png`
  writeFileSync(tmpPath, TINY_PNG)

  const firstCell = page.locator(`a[href*="/boards/${boardId}/clues/"]`).first()
  const cellHref = await firstCell.getAttribute('href')
  await firstCell.click()
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/clues/[a-f0-9-]+$`))

  await page.locator('input[name="payloadType"][value="file"]').check()
  // The value field has no usable default thanks to the SSR bug; explicitly fill.
  await page.locator('input[name="value"]').fill('200')
  await page.setInputFiles('input[name="file"]', tmpPath)

  await page.getByRole('button', { name: /save clue/i }).click()
  await expect(page).toHaveURL(new RegExp(`/boards/${boardId}/edit$`))
  await expect(page.getByText('Clue saved.')).toBeVisible()

  // Reopen — the "Current: image · image/png" line uses plain text rendering
  // (<code> children, no defaultValue), so it survives the SSR bug.
  await page.goto(cellHref!)
  await expect(page.getByText(/Current:/)).toBeVisible()
  await expect(page.locator('code').filter({ hasText: /^image$/ })).toBeVisible()
  await expect(page.locator('code').filter({ hasText: 'image/png' })).toBeVisible()
  await expect(page.getByRole('link', { name: /preview/i })).toBeVisible()
})

test('deleting a board removes it from the index list', async ({ page }) => {
  const user = makeTestUser('boards7')
  await signUp(page, user)

  const title = `To delete ${Date.now()}`
  await createBoard(page, title)

  await page.goto('/boards')
  await expect(page.getByRole('link', { name: title })).toBeVisible()

  // Find the row with this title and click its Delete button.
  const row = page.locator('li', { hasText: title })
  await row.getByRole('button', { name: /delete/i }).click()

  await expect(page).toHaveURL(/\/boards$/)
  await expect(page.getByRole('link', { name: title })).toHaveCount(0)
})
