import { test, expect } from '@playwright/test'

import { makeTestUser, signUp } from './helpers'

test('anonymous viewer can browse the templates list and preview a board', async ({
  page,
}) => {
  await page.goto('/templates')
  await expect(page.getByRole('heading', { name: /templates/i })).toBeVisible()

  // At least one of the seeded templates is visible.
  const card = page.getByRole('link', { name: /general knowledge/i })
  await expect(card).toBeVisible()
  await card.click()

  // Preview page shows the template title + a grid with $200..$1000 cells.
  await expect(page).toHaveURL(/\/templates\/[a-f0-9-]+$/)
  await expect(page.getByRole('heading', { name: /general knowledge/i })).toBeVisible()
  for (const value of [200, 400, 600, 800, 1000]) {
    await expect(page.getByText(`$${value}`, { exact: true }).first()).toBeVisible()
  }

  // Anonymous viewer is prompted to sign up rather than host.
  await expect(page.getByRole('link', { name: /sign up to host/i })).toBeVisible()
})

test('logged-in user can host a game using a template', async ({ page }) => {
  await signUp(page, makeTestUser('tplhost'))
  await page.goto('/templates')
  await page.getByRole('link', { name: /pop culture/i }).click()

  await expect(page).toHaveURL(/\/templates\/[a-f0-9-]+$/)
  await page.getByRole('button', { name: /host a game with this template/i }).click()

  // Landed on the host view of a brand-new game.
  await expect(page).toHaveURL(/\/games\/[A-Z2-9]{6}\/host$/)
  await expect(page.getByText(/JOIN CODE:/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /pop culture/i })).toBeVisible()
})
