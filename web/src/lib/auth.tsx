import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { get, onUnauthorized, post, tokenStore } from './api'
import type { Family, Parent, Session } from './types'

interface AuthContextValue {
  token: string | null
  parent: Parent | undefined
  family: Family | undefined
  isLoading: boolean
  signIn: (session: Session) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(() => tokenStore.get())

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ parent: Parent; family: Family }>('/auth/me'),
    enabled: Boolean(token),
    staleTime: 60_000,
  })

  useEffect(
    () =>
      onUnauthorized(() => {
        setToken(null)
        queryClient.clear()
      }),
    [queryClient],
  )

  const signIn = useCallback(
    (session: Session) => {
      tokenStore.set(session.token)
      queryClient.clear()
      queryClient.setQueryData(['me'], { parent: session.parent, family: session.family })
      setToken(session.token)
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    try {
      await post('/auth/logout')
    } catch {
      // Session may already be gone; sign out locally regardless.
    }
    tokenStore.clear()
    queryClient.clear()
    setToken(null)
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      parent: me.data?.parent,
      family: me.data?.family,
      isLoading: Boolean(token) && me.isPending,
      signIn,
      signOut,
    }),
    [token, me.data, me.isPending, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
