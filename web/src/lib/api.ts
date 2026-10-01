const TOKEN_KEY = 'flexfund.parentToken'
const BASE = '/api/v1'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

/** Notified when an authenticated request comes back 401 (expired/revoked session). */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const token = tokenStore.get()
  const auth = init.auth ?? true
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network', 'Can’t reach FlexFund right now. Check your connection and try again.')
  }

  const text = await res.text()
  const json = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } & Record<string, unknown> } | null)?.error
    const { code, message, ...details } = err ?? {}
    if (res.status === 401 && auth && token) {
      tokenStore.clear()
      unauthorizedListeners.forEach((l) => l())
    }
    throw new ApiError(res.status, code ?? 'error', message ?? `Request failed (${res.status})`, details)
  }
  return json as T
}

export const get = <T>(path: string) => api<T>(path)
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} })
export const patch = <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body })
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body })
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}
