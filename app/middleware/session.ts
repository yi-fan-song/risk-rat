import { createCookie } from 'remix/cookie'
import { session } from 'remix/session-middleware'
import { createRedisSessionStorage } from 'remix/session-storage-redis'

import { redis } from '../data/redis.ts'

const secret = process.env.SESSION_SECRET
if (!secret && process.env.NODE_ENV !== 'test') {
  throw new Error('SESSION_SECRET is required')
}

export const sessionCookie = createCookie('rr_session', {
  secrets: [secret ?? 'test-only-secret'],
  httpOnly: true,
  sameSite: 'Lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 30,
  path: '/',
})

export const sessionStorage = createRedisSessionStorage(redis, {
  keyPrefix: 'rr:session:',
  ttl: 60 * 60 * 24 * 30,
})

export function sessionMiddleware() {
  return session(sessionCookie, sessionStorage)
}
