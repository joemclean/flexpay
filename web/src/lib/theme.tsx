import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const STORAGE_KEY = 'theme'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: string) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

function readTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'dark' || stored === 'system' || stored === 'light' ? stored : 'light'
}

/** Class-based theming (`.dark` on <html>); index.html applies it before first paint. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const [systemDark, setSystemDark] = useState(prefersDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolvedTheme === 'dark')
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = useCallback((next: string) => {
    const value: Theme = next === 'dark' || next === 'system' ? next : 'light'
    localStorage.setItem(STORAGE_KEY, value)
    setThemeState(value)
  }, [])

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
