// Central theme. To recolor the entire site, edit `themeValues` below.
// All other files reference `c.*` (CSS var) rather than hex literals.

/** Concrete color values, attached to <body> as CSS custom properties. */
export const themeValues = {
  '--rr-bg': '#1d1b2e',
  '--rr-surface': '#2a2640',
  '--rr-surface-alt': '#34304d',
  '--rr-surface-muted': '#161425',
  '--rr-accent': '#ff5d8f',
  '--rr-accent-strong': '#ff3d75',
  '--rr-accent-soft': 'rgba(255, 93, 143, 0.18)',
  '--rr-accent-shadow': '#8b1d4a',
  '--rr-on-accent': '#1d1b2e',
  '--rr-text': '#f3eee5',
  '--rr-text-muted': 'rgba(243, 238, 229, 0.65)',
  '--rr-text-subtle': 'rgba(243, 238, 229, 0.4)',
  '--rr-border': 'rgba(255, 93, 143, 0.4)',
  '--rr-border-strong': '#ff5d8f',
  '--rr-danger': '#ff7a7a',
  '--rr-danger-soft': 'rgba(255, 122, 122, 0.18)',
  '--rr-success': '#7dffb5',
  '--rr-link': '#ff8fb0',
  '--rr-shadow': 'rgba(0, 0, 0, 0.4)',
} as const

/** `var(...)` references used everywhere else in the app. */
export const c = {
  bg: 'var(--rr-bg)',
  surface: 'var(--rr-surface)',
  surfaceAlt: 'var(--rr-surface-alt)',
  surfaceMuted: 'var(--rr-surface-muted)',
  accent: 'var(--rr-accent)',
  accentStrong: 'var(--rr-accent-strong)',
  accentSoft: 'var(--rr-accent-soft)',
  accentShadow: 'var(--rr-accent-shadow)',
  onAccent: 'var(--rr-on-accent)',
  text: 'var(--rr-text)',
  textMuted: 'var(--rr-text-muted)',
  textSubtle: 'var(--rr-text-subtle)',
  border: 'var(--rr-border)',
  borderStrong: 'var(--rr-border-strong)',
  danger: 'var(--rr-danger)',
  dangerSoft: 'var(--rr-danger-soft)',
  success: 'var(--rr-success)',
  link: 'var(--rr-link)',
  shadow: 'var(--rr-shadow)',
} as const

/** Font stack used app-wide. */
export const fonts = {
  body: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  display: "'Bebas Neue', 'Inter', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const

export const BRAND_NAME = 'Risk Rat'
export const BRAND_UPPER = 'RISK RAT'
