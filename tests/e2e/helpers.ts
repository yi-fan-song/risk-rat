import { expect, type Page, type BrowserContext } from '@playwright/test'

export function uniqueId(prefix = 'u'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

export interface TestUser {
  username: string
  password: string
}

export function makeTestUser(prefix = 'alice'): TestUser {
  return {
    username: uniqueId(prefix).toLowerCase(),
    password: 'password12345',
  }
}

export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto('/auth/signup')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/boards$/)
}

export async function logIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/auth/login')
  await page.getByLabel('Username').fill(user.username)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/boards$/)
}

export async function logOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/')
}

/** Create a fresh board and return its boardId (extracted from the edit URL). */
export async function createBoard(page: Page, title: string): Promise<string> {
  await page.goto('/boards')
  await page.getByRole('link', { name: /new board/i }).click()
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: /create board/i }).click()
  await expect(page).toHaveURL(/\/boards\/[a-f0-9-]+\/edit$/)
  const url = page.url()
  const m = url.match(/\/boards\/([a-f0-9-]+)\/edit/)
  if (!m) throw new Error(`Could not extract boardId from URL: ${url}`)
  return m[1]
}

/** Use the asset server to compose absolute URLs in tests. */
export function fullUrl(base: string, path: string): string {
  return new URL(path, base).toString()
}

export async function newContext(
  context: BrowserContext,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const page = await context.newPage()
  return { page, close: () => page.close() }
}
