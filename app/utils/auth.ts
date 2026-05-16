import { Auth } from 'remix/auth-middleware'

import type { User } from '../data/schema.ts'

/** Narrow shape of `auth` after the auth() middleware resolves. */
interface AuthState {
  ok: boolean
  identity?: User
}

/** Loose shape of the action context's `get` method. */
interface CtxLike {
  get(key: unknown): unknown
}

/**
 * Returns the authenticated user, or throws if the request isn't authenticated.
 * Safe to call inside any route protected by `requireAuth()`.
 */
export function getCurrentUser(ctx: CtxLike): User {
  const auth = ctx.get(Auth) as AuthState
  if (!auth.ok || !auth.identity) {
    throw new Error('Expected an authenticated user. Run requireAuth() first.')
  }
  return auth.identity
}

/** Returns the authenticated user if there is one, otherwise null. */
export function getCurrentUserOrNull(ctx: CtxLike): User | null {
  const auth = ctx.get(Auth) as AuthState
  return auth.ok && auth.identity ? auth.identity : null
}
