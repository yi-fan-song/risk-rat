import { test, expect } from '@playwright/test'
import { makeTestUser, signUp, logIn, logOut } from './helpers'

test('signup happy path lands on /boards with username in header', async ({ page }) => {
  const user = makeTestUser('signup')
  await signUp(page, user)
  await expect(page).toHaveURL(/\/boards$/)
  // Header shows the username
  await expect(page.getByRole('banner').getByText(user.username)).toBeVisible()
  // Log out button only appears when authenticated
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()
})

test('logout returns to / and shows the public hero', async ({ page }) => {
  const user = makeTestUser('logout')
  await signUp(page, user)
  await logOut(page)
  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('heading', { name: /risk rat/i }),
  ).toBeVisible()
  // Logged-out header: signup/login links present, log out button absent
  await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0)
})

test('login with existing credentials reaches /boards', async ({ page }) => {
  const user = makeTestUser('relogin')
  await signUp(page, user)
  await logOut(page)
  await logIn(page, user)
  await expect(page).toHaveURL(/\/boards$/)
  await expect(page.getByRole('banner').getByText(user.username)).toBeVisible()
})

test('bad password rejected with error, stays on login page', async ({ page }) => {
  const user = makeTestUser('badpw')
  await signUp(page, user)
  await logOut(page)

  await page.goto('/auth/login')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill('wrong-password-xyz')
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page).toHaveURL(/\/auth\/login$/)
  await expect(page.getByText(/invalid username or password/i)).toBeVisible()
})

test('signup with password < 8 chars rejected with error', async ({ page }) => {
  const user = makeTestUser('shortpw')

  await page.goto('/auth/signup')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill('short') // 5 chars
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/auth\/signup$/)
  await expect(
    page.getByText(/username must be 3\+ characters and password 8\+ characters/i),
  ).toBeVisible()
})

test('signup with duplicate username rejected with error', async ({ page }) => {
  const user = makeTestUser('dupe')
  await signUp(page, user)
  await logOut(page)

  // Attempt to sign up again with the same username
  await page.goto('/auth/signup')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/auth\/signup$/)
  await expect(page.getByText(/already taken/i)).toBeVisible()
})
