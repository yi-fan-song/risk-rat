import type { RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import { routes } from '../routes.ts'
import { BRAND_NAME, c, fonts, themeValues } from './theme.ts'

export interface DocumentProps {
  children?: RemixNode
  title?: string
}

const DEFAULT_TITLE = BRAND_NAME

export function Document() {
  return ({ title = DEFAULT_TITLE, children }: DocumentProps) => (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap"
        />
        <title>{title === DEFAULT_TITLE ? title : `${title} · ${DEFAULT_TITLE}`}</title>
      </head>
      <body mix={bodyStyle}>
        {children}
        <script
          type="module"
          src={routes.assets.href({ path: 'app/assets/entry.ts' })}
        ></script>
      </body>
    </html>
  )
}

const bodyStyle = css({
  ...themeValues,
  margin: 0,
  minHeight: '100vh',
  background: c.bg,
  color: c.text,
  fontFamily: fonts.body,
  WebkitFontSmoothing: 'antialiased',
  '& *, & *::before, & *::after': { boxSizing: 'border-box' },
  '& a': { color: c.link },
  '& a:hover': { color: c.text },
  '& input, & textarea, & select, & button': {
    fontFamily: 'inherit',
  },
})
