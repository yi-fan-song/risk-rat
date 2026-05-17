import type { Handle, RemixNode } from 'remix/ui'

import type { User } from '../data/schema.ts'

/**
 * UI auth context. Read inside any component below `<AuthProvider>` with:
 *
 *   const { user } = handle.context.get(AuthProvider)
 *
 * Wired into `Layout`, so every page already has it.
 */
export interface AuthContext {
  user: User | null
}

export interface AuthProviderProps {
  user: User | null
  children?: RemixNode
}

export function AuthProvider(handle: Handle<AuthProviderProps, AuthContext>) {
  handle.context.set({ user: handle.props.user ?? null })
  return () => <>{handle.props.children}</>
}
