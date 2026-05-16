import type { RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import { c, fonts } from './theme.ts'

export interface FormCardProps {
  title: string
  children?: RemixNode
}

export function FormCard() {
  return ({ title, children }: FormCardProps) => (
    <div mix={cardStyle}>
      <h1 mix={titleStyle}>{title}</h1>
      {children}
    </div>
  )
}

export interface TextFieldProps {
  name: string
  label: string
  type?: 'text' | 'password' | 'email'
  value?: string
  error?: string | null
  autoFocus?: boolean
  autoComplete?: string
}

export function TextField() {
  return ({
    name,
    label,
    type = 'text',
    value,
    error,
    autoFocus,
    autoComplete,
  }: TextFieldProps) => (
    <label mix={labelStyle}>
      <span>{label}</span>
      {type === 'password' ? (
        <input
          type="password"
          name={name}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          mix={inputStyle}
        />
      ) : type === 'email' ? (
        <input
          type="email"
          name={name}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          role="textbox"
          mix={inputStyle}
        />
      ) : (
        <input
          type="text"
          name={name}
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          role="textbox"
          mix={inputStyle}
        />
      )}
      {error ? <span mix={errorTextStyle}>{error}</span> : null}
    </label>
  )
}

export interface SubmitButtonProps {
  children?: RemixNode
}

export function SubmitButton() {
  return ({ children }: SubmitButtonProps) => (
    <button type="submit" mix={submitStyle}>
      {children}
    </button>
  )
}

const cardStyle = css({
  maxWidth: '420px',
  margin: '40px auto',
  padding: '32px',
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: '12px',
  '@media (max-width: 640px)': {
    margin: '16px auto',
    padding: '20px 16px',
  },
})

const titleStyle = css({
  fontFamily: fonts.display,
  margin: '0 0 24px',
  color: c.accent,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontSize: '28px',
  textAlign: 'center',
})

const labelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  marginBottom: '16px',
  fontSize: '14px',
  '& > span:first-child': {
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontSize: '11px',
    fontWeight: 600,
  },
})

const inputStyle = css({
  padding: '10px 12px',
  background: c.surfaceMuted,
  border: `1px solid ${c.border}`,
  borderRadius: '6px',
  color: c.text,
  fontSize: '16px',
  outline: 'none',
  '&:focus': { borderColor: c.accent, boxShadow: `0 0 0 3px ${c.accentSoft}` },
})

const errorTextStyle = css({
  color: c.danger,
  fontSize: '13px',
})

const submitStyle = css({
  width: '100%',
  padding: '12px',
  marginTop: '12px',
  background: c.accent,
  color: c.onAccent,
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: '15px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  transition: 'background 120ms ease',
  '&:hover': { background: c.accentStrong },
})
