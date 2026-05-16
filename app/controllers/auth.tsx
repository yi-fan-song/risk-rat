import {
  completeAuth,
  verifyCredentials,
} from 'remix/auth'
import { Database } from 'remix/data-table'
import * as s from 'remix/data-schema'
import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import type { Controller } from 'remix/fetch-router'
import { css } from 'remix/ui'

import { hashPassword } from '../data/passwords.ts'
import { users } from '../data/schema.ts'
import type { AppContext } from '../router.ts'
import { passwordProvider, signupSchema } from '../middleware/auth.ts'
import { routes } from '../routes.ts'
import { FormCard, SubmitButton, TextField } from '../ui/form.tsx'
import { Layout } from '../ui/layout.tsx'
import { c } from '../ui/theme.ts'
import { render } from '../utils/render.tsx'

export const auth = {
  actions: {
    login: {
      actions: {
        index({ request, get }) {
          const session = get(Session)
          const error = (session.get('error') as string | null) ?? null
          return render(<LoginPage error={error} />, request)
        },
        async action(context) {
          const user = await verifyCredentials(passwordProvider, context)
          const session = context.get(Session)

          if (user == null) {
            session.flash('error', 'Invalid username or password.')
            return redirect(routes.auth.login.index.href())
          }

          const completed = completeAuth(context)
          completed.set('auth', { userId: user.id })
          return redirect(routes.boards.index.href())
        },
      },
    },

    signup: {
      actions: {
        index({ request, get }) {
          const session = get(Session)
          const error = (session.get('error') as string | null) ?? null
          return render(<SignupPage error={error} />, request)
        },
        async action({ get }) {
          const parsed = s.parseSafe(signupSchema, get(FormData))
          const session = get(Session)
          if (!parsed.success) {
            session.flash(
              'error',
              'Username must be 3+ characters and password 8+ characters.',
            )
            return redirect(routes.auth.signup.index.href())
          }

          const db = get(Database)
          const username = parsed.value.username.toLowerCase().trim()

          const existing = await db.findOne(users, { where: { username } })
          if (existing) {
            session.flash('error', 'That username is already taken.')
            return redirect(routes.auth.signup.index.href())
          }

          const password_hash = await hashPassword(parsed.value.password)
          const created = await db.create(
            users,
            { username, password_hash },
            { returnRow: true },
          )

          session.regenerateId(true)
          session.set('auth', { userId: created.id })
          return redirect(routes.boards.index.href())
        },
      },
    },

    logout({ get }) {
      const session = get(Session)
      session.unset('auth')
      session.regenerateId(true)
      return redirect(routes.home.href())
    },
  },
} satisfies Controller<typeof routes.auth>

interface AuthPageProps {
  error: string | null
}

function LoginPage() {
  return ({ error }: AuthPageProps) => (
    <Layout title="Log in">
      <FormCard title="Log in">
        {error ? <p mix={errorStyle}>{error}</p> : null}
        <form method="post" action={routes.auth.login.action.href()}>
          <TextField name="username" label="Username" autoFocus autoComplete="username" />
          <TextField
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
          />
          <SubmitButton>Log in</SubmitButton>
        </form>
        <p mix={altLinkStyle}>
          New here? <a href={routes.auth.signup.index.href()}>Create an account</a>.
        </p>
      </FormCard>
    </Layout>
  )
}

function SignupPage() {
  return ({ error }: AuthPageProps) => (
    <Layout title="Sign up">
      <FormCard title="Sign up">
        {error ? <p mix={errorStyle}>{error}</p> : null}
        <form method="post" action={routes.auth.signup.action.href()}>
          <TextField name="username" label="Username" autoFocus autoComplete="username" />
          <TextField
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
          />
          <SubmitButton>Create account</SubmitButton>
        </form>
        <p mix={altLinkStyle}>
          Have an account? <a href={routes.auth.login.index.href()}>Log in</a>.
        </p>
      </FormCard>
    </Layout>
  )
}

const errorStyle = css({
  background: c.dangerSoft,
  color: c.danger,
  padding: '10px 12px',
  borderRadius: '6px',
  marginBottom: '16px',
  textAlign: 'center',
  fontSize: '14px',
})

const altLinkStyle = css({
  textAlign: 'center',
  marginTop: '20px',
  fontSize: '14px',
  opacity: 0.85,
})
