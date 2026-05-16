import { auth, createSessionAuthScheme } from 'remix/auth-middleware'
import {
  createCredentialsAuthProvider,
} from 'remix/auth'
import { Database } from 'remix/data-table'
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { minLength } from 'remix/data-schema/checks'

import { users, type User } from '../data/schema.ts'
import { verifyPassword } from '../data/passwords.ts'

export interface AuthSessionData {
  userId: string
}

export const loginSchema = f.object({
  username: f.field(s.defaulted(s.string(), '')),
  password: f.field(s.defaulted(s.string(), '')),
})

export const signupSchema = f.object({
  username: f.field(s.string().pipe(minLength(3))),
  password: f.field(s.string().pipe(minLength(8))),
})

export const passwordProvider = createCredentialsAuthProvider({
  parse(context) {
    return s.parse(loginSchema, context.get(FormData))
  },
  async verify({ username, password }, context) {
    const db = context.get(Database)
    const user = await db.findOne(users, {
      where: { username: username.toLowerCase().trim() },
    })
    if (!user) return null
    const ok = await verifyPassword(password, user.password_hash)
    if (!ok) return null
    return user
  },
})

export function loadAuth() {
  return auth({
    schemes: [
      createSessionAuthScheme<User, AuthSessionData>({
        read(session) {
          const data = session.get('auth') as AuthSessionData | undefined
          return data ?? null
        },
        async verify(value, context) {
          const db = context.get(Database)
          return (await db.find(users, value.userId)) ?? null
        },
        invalidate(session) {
          session.unset('auth')
        },
      }),
    ],
  })
}
