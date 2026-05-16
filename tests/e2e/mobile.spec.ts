import { test, expect } from '@playwright/test'
import { makeTestUser, signUp, createBoard } from './helpers'

test.use({ viewport: { width: 375, height: 800 } })

test('home page: hero heading visible and CTAs are vertically stacked and full-width', async ({
  page,
}) => {
  await page.goto('/')

  // Hero heading is still visible at mobile width.
  const heading = page.getByRole('heading', { name: /risk rat/i })
  await expect(heading).toBeVisible()

  // The two hero CTA links.
  const createAccount = page.getByRole('link', { name: /create an account/i })
  // Restrict "Log in" to the hero (not the header) using main landmark.
  const logIn = page.getByRole('main').getByRole('link', { name: /^log in$/i })

  await expect(createAccount).toBeVisible()
  await expect(logIn).toBeVisible()

  const createBox = await createAccount.boundingBox()
  const loginBox = await logIn.boundingBox()
  expect(createBox).not.toBeNull()
  expect(loginBox).not.toBeNull()
  if (!createBox || !loginBox) throw new Error('bounding box missing')

  // Vertically stacked: second's top > first's bottom.
  expect(loginBox.y).toBeGreaterThan(createBox.y + createBox.height)

  // Full-width on mobile: each button wider than 200px.
  expect(createBox.width).toBeGreaterThan(200)
  expect(loginBox.width).toBeGreaterThan(200)
})

test('board editor: board grid overflows horizontally on mobile', async ({ page }) => {
  const user = makeTestUser('mobile')
  await signUp(page, user)
  const boardId = await createBoard(page, 'Mobile Overflow Test')
  await page.goto(`/boards/${boardId}/edit`)

  const grid = page.locator('div[style*="grid-template-columns"]').first()
  await expect(grid).toBeVisible()

  const sizes = await grid.evaluate((el) => ({
    sw: (el as HTMLElement).scrollWidth,
    cw: (el as HTMLElement).clientWidth,
  }))

  // The inner grid's natural content is wider than its rendered width when
  // constrained by the mobile viewport's overflow wrapper.
  expect(sizes.sw).toBeGreaterThan(sizes.cw)
})

test('header: brand and user nav visible on mobile after signup', async ({ page }) => {
  const user = makeTestUser('hdrmob')
  await signUp(page, user)

  const header = page.getByRole('banner')
  await expect(header).toBeVisible()

  // Brand
  await expect(header.getByRole('link', { name: /risk rat/i })).toBeVisible()

  // Authenticated nav: My boards link + Log out button
  await expect(header.getByRole('link', { name: /my boards/i })).toBeVisible()
  await expect(header.getByRole('button', { name: /log out/i })).toBeVisible()
})
