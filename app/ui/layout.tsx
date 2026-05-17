import type { RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import type { User } from '../data/schema.ts'
import { routes } from '../routes.ts'
import { AuthProvider } from './auth-context.tsx'
import { Document } from './document.tsx'
import { BRAND_UPPER, c, fonts } from './theme.ts'

export interface LayoutProps {
  children?: RemixNode
  title?: string
  user?: User | null
  flash?: string | null
}

export function Layout() {
  return ({ title, children, user, flash }: LayoutProps) => (
    <Document title={title}>
      <AuthProvider user={user ?? null}>
        <header mix={headerStyle}>
          <a href={routes.home.href()} mix={brandStyle}>
            {BRAND_UPPER}
          </a>
          <nav mix={navStyle}>
            {user ? (
              <>
                <a href={routes.boards.index.href()}>My boards</a>
                <span mix={css({ opacity: 0.6 })}>·</span>
                <span>{user.username}</span>
                <form method="post" action={routes.auth.logout.href()} mix={inlineFormStyle}>
                  <button type="submit" mix={linkButtonStyle}>
                    Log out
                  </button>
                </form>
              </>
            ) : (
              <>
                <a href={routes.auth.login.index.href()}>Log in</a>
                <a href={routes.auth.signup.index.href()}>Sign up</a>
              </>
            )}
          </nav>
        </header>
        {flash ? <div mix={flashStyle}>{flash}</div> : null}
        <main mix={mainStyle}>{children}</main>
      </AuthProvider>
    </Document>
  )
}

const headerStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '20px 32px',
  background: c.surface,
  borderBottom: `3px solid ${c.accent}`,
  flexWrap: 'wrap',
  gap: '12px',
  '@media (max-width: 640px)': {
    padding: '12px 16px',
    borderBottomWidth: '2px',
  },
})

const brandStyle = css({
  fontFamily: fonts.display,
  fontSize: '28px',
  fontWeight: 400,
  letterSpacing: '0.06em',
  color: c.accent,
  textDecoration: 'none',
  '&:hover': { color: c.text },
  '@media (max-width: 640px)': { fontSize: '22px', letterSpacing: '0.04em' },
})

const navStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
  fontSize: '15px',
  flexWrap: 'wrap',
  '& a': { textDecoration: 'none' },
  '& a:hover': { textDecoration: 'underline' },
  '@media (max-width: 640px)': {
    gap: '12px',
    fontSize: '14px',
    width: '100%',
    justifyContent: 'flex-end',
  },
})

const inlineFormStyle = css({ display: 'inline' })

const linkButtonStyle = css({
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  cursor: 'pointer',
  color: c.link,
  font: 'inherit',
  textDecoration: 'none',
  '&:hover': { color: c.text },
})

const flashStyle = css({
  margin: '16px auto',
  padding: '12px 16px',
  maxWidth: '760px',
  background: c.accentSoft,
  color: c.accent,
  borderRadius: '6px',
  textAlign: 'center',
  '@media (max-width: 640px)': {
    margin: '12px',
    fontSize: '14px',
    padding: '10px 12px',
  },
})

const mainStyle = css({
  padding: '32px 24px 64px',
  maxWidth: '1100px',
  margin: '0 auto',
  '@media (max-width: 640px)': { padding: '20px 12px 48px' },
})
