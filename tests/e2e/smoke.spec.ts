import { test, expect } from '@playwright/test'

test('home page renders for logged-out users', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /risk rat/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /create an account/i })).toBeVisible()
  // "Log in" appears in both the hero and the header — at least one must exist
  await expect(page.getByRole('link', { name: /log in/i }).first()).toBeVisible()
})

test('signup link goes to signup page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /create an account/i }).click()
  await expect(page).toHaveURL(/\/auth\/signup$/)
  await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible()
})
