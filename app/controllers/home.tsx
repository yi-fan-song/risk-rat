import { Session } from 'remix/session'
import { redirect } from 'remix/response/redirect'
import type { BuildAction } from 'remix/fetch-router'
import { css } from 'remix/ui'

import type { User } from '../data/schema.ts'
import type { routes as routesType } from '../routes.ts'
import { routes } from '../routes.ts'
import { Layout } from '../ui/layout.tsx'
import { BRAND_NAME, c, fonts } from '../ui/theme.ts'
import { getCurrentUserOrNull } from '../utils/auth.ts'
import { render } from '../utils/render.tsx'

export const home: BuildAction<'ANY', typeof routesType.home> = {
  handler({ request, get }) {
    if (getCurrentUserOrNull({ get })) {
      return redirect(routes.boards.index.href())
    }
    const session = get(Session)
    const flash = (session.get('message') as string | null) ?? null
    return render(<HomePage flash={flash} />, request)
  },
}

interface HomePageProps {
  user?: User | null
  flash?: string | null
}

function HomePage() {
  return ({ user, flash }: HomePageProps) => (
    <Layout title={BRAND_NAME} user={user ?? null} flash={flash ?? null}>
      <section mix={heroStyle}>
        <p mix={eyebrowStyle}>Run your own trivia show</p>
        <h1 mix={titleStyle}>
          BUILD A <span mix={titleAccentStyle}>RISK RAT</span> BOARD.
          <br /> HOST A LIVE GAME.
        </h1>
        <p mix={subtitleStyle}>
          Design category-by-value boards, share with a code, and play together — host,
          players, and spectators each get their own view.
        </p>
        <div mix={ctaStyle}>
          <a href={routes.auth.signup.index.href()} mix={primaryButtonStyle}>
            Create an account
          </a>
          <a href={routes.auth.login.index.href()} mix={secondaryButtonStyle}>
            Log in
          </a>
        </div>
      </section>
    </Layout>
  )
}

const heroStyle = css({
  textAlign: 'center',
  padding: '80px 24px',
  '@media (max-width: 640px)': { padding: '40px 8px' },
})

const eyebrowStyle = css({
  textTransform: 'uppercase',
  letterSpacing: '0.2em',
  fontSize: '12px',
  fontWeight: 700,
  color: c.accent,
  margin: '0 0 18px',
})

const titleStyle = css({
  fontFamily: fonts.display,
  fontSize: '64px',
  letterSpacing: '0.02em',
  color: c.text,
  margin: '0 0 18px',
  lineHeight: 1.05,
  fontWeight: 400,
  '@media (max-width: 640px)': { fontSize: '40px' },
})

const titleAccentStyle = css({
  color: c.accent,
})

const subtitleStyle = css({
  fontSize: '18px',
  margin: '0 auto 36px',
  maxWidth: '560px',
  color: c.textMuted,
  lineHeight: 1.55,
  '@media (max-width: 640px)': { fontSize: '15px', margin: '0 auto 24px' },
})

const ctaStyle = css({
  display: 'flex',
  gap: '14px',
  justifyContent: 'center',
  flexWrap: 'wrap',
  '@media (max-width: 640px)': { flexDirection: 'column', alignItems: 'stretch' },
})

const primaryButtonStyle = css({
  display: 'inline-block',
  padding: '14px 28px',
  background: c.accent,
  color: c.onAccent,
  fontWeight: 700,
  textDecoration: 'none',
  borderRadius: '6px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  textAlign: 'center',
  fontSize: '14px',
  transition: 'background 120ms ease',
  '&:hover': { background: c.accentStrong, color: c.onAccent },
  '@media (max-width: 640px)': { padding: '14px 20px', fontSize: '16px' },
})

const secondaryButtonStyle = css({
  display: 'inline-block',
  padding: '14px 28px',
  border: `1px solid ${c.borderStrong}`,
  color: c.accent,
  textDecoration: 'none',
  borderRadius: '6px',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  fontWeight: 700,
  textAlign: 'center',
  fontSize: '14px',
  transition: 'background 120ms ease, color 120ms ease',
  '&:hover': { background: c.accentSoft, color: c.text },
  '@media (max-width: 640px)': { padding: '14px 20px', fontSize: '16px' },
})
