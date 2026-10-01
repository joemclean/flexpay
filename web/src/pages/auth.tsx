import { useQuery } from '@tanstack/react-query'
import { ShieldCheckIcon, UsersIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Wordmark } from '@/components/brand'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Spinner } from '@/components/ui/spinner'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useProviders } from '@/lib/queries'
import type { InviteInfo, MfaChallenge, Session } from '@/lib/types'

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-primary lg:block" aria-hidden>
        <img src="/hero.png" alt="" className="absolute inset-0 size-full object-cover object-[62%_center]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-10 pt-24 text-white">
          <p className="font-brand text-3xl font-semibold">Money skills, together.</p>
          <p className="mt-2 max-w-md text-white/90">
            Allowance on autopilot, chores that pay, savings goals your kids can see — and you stay in control.
          </p>
        </div>
      </aside>
      <div className="flex flex-col p-6 md:p-10">
        <Wordmark sub="Family" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface GoogleId {
  accounts: {
    id: {
      initialize: (opts: { client_id: string; callback: (r: { credential: string }) => void }) => void
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
    }
  }
}

function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  callback.current = onCredential
  useEffect(() => {
    const render = () => {
      const g = (window as unknown as { google?: GoogleId }).google
      if (!g || !ref.current) return
      g.accounts.id.initialize({ client_id: clientId, callback: (r) => callback.current(r.credential) })
      g.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 384, text: 'continue_with', shape: 'pill' })
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-gsi]')
    if (existing) {
      render()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.dataset.gsi = 'true'
    script.onload = render
    document.head.appendChild(script)
  }, [clientId])
  return <div ref={ref} className="flex min-h-10 justify-center" />
}

function useFinishSignIn() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  return (session: Session) => {
    signIn(session)
    const from = (location.state as { from?: string } | null)?.from
    navigate(from && from !== '/sign-in' ? from : '/', { replace: true })
  }
}

function MfaStep({ challenge, onCancel }: { challenge: MfaChallenge; onCancel: () => void }) {
  const finish = useFinishSignIn()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const verify = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      finish(await api<Session>('/auth/mfa/verify', { body: { mfaToken: challenge.mfaToken, code: value }, auth: false }))
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (code.length === 6) void verify(code)
      }}
    >
      <FieldGroup>
        <div className="flex items-center gap-3 rounded-lg bg-brand-soft p-3 text-sm">
          <ShieldCheckIcon className="size-5 shrink-0 text-brand-text" />
          Enter the 6-digit code from your authenticator app.
        </div>
        <Field data-invalid={Boolean(error) || undefined}>
          <FieldLabel htmlFor="mfa-code">Verification code</FieldLabel>
          <InputOTP
            id="mfa-code"
            maxLength={6}
            value={code}
            onChange={(v) => {
              setCode(v)
              if (v.length === 6) void verify(v)
            }}
            autoFocus
            inputMode="numeric"
            pattern="^[0-9]*$"
            containerClassName="justify-center"
          >
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </Field>
        <Button type="submit" disabled={code.length !== 6 || busy} className="h-10">
          {busy ? <Spinner /> : null} Verify
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Use a different account
        </Button>
      </FieldGroup>
    </form>
  )
}

export function SignInPage() {
  const { token } = useAuth()
  const providers = useProviders()
  const finish = useFinishSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mfa, setMfa] = useState<MfaChallenge | null>(null)

  if (token) return <Navigate to="/" replace />

  const handle = (result: Session | MfaChallenge) => {
    if ('mfaRequired' in result) setMfa(result)
    else finish(result)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      handle(await api<Session | MfaChallenge>('/auth/login', { body: { email, password }, auth: false }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const google = async (credential: string) => {
    try {
      handle(await api<Session | MfaChallenge>('/auth/google', { body: { credential, timezone: browserTimezone() }, auth: false }))
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (mfa) {
    return (
      <AuthLayout title="Two-step verification" subtitle="One more step to keep your family’s money safe.">
        <MfaStep challenge={mfa} onCancel={() => setMfa(null)} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New to FlexFund Family?{' '}
          <Link to="/sign-up" className="font-medium text-brand-text underline-offset-4 hover:underline">
            Create a family account
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <FieldGroup>
          {providers.data?.google ? (
            <>
              <GoogleButton clientId={providers.data.google.clientId} onCredential={google} />
              <FieldSeparator>or</FieldSeparator>
            </>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" className="h-10" disabled={busy}>
            {busy ? <Spinner /> : null} Sign in
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}

export function SignUpPage() {
  const { token } = useAuth()
  const providers = useProviders()
  const finish = useFinishSignIn()
  const [params] = useSearchParams()
  const inviteCode = params.get('invite')
  const invite = useQuery({
    queryKey: ['invite', inviteCode],
    queryFn: () => api<InviteInfo>(`/auth/invites/${encodeURIComponent(inviteCode!)}`, { auth: false }),
    enabled: Boolean(inviteCode),
    retry: false,
  })
  const [form, setForm] = useState({ familyName: '', name: '', email: '', password: '' })
  const [sample, setSample] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const invitedEmail = invite.data?.email
    if (invitedEmail) setForm((f) => (f.email ? f : { ...f, email: invitedEmail }))
  }, [invite.data?.email])

  if (token) return <Navigate to="/" replace />

  const joining = Boolean(inviteCode && invite.data)
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const session = await api<Session>('/auth/signup', {
        body: joining
          ? { name: form.name, email: form.email, password: form.password, inviteCode, timezone: browserTimezone() }
          : { ...form, timezone: browserTimezone(), includeSampleData: sample },
        auth: false,
      })
      finish(session)
      toast.success(
        joining
          ? `Welcome to ${session.family.name}!`
          : sample
            ? 'Welcome! We added Finn and Emma so you can explore.'
            : 'Welcome to FlexFund Family!',
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const google = async (credential: string) => {
    try {
      const result = await api<Session | MfaChallenge>('/auth/google', { body: { credential, timezone: browserTimezone() }, auth: false })
      if ('mfaRequired' in result) toast.info('This account uses two-step verification — please sign in.')
      else finish(result)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (inviteCode && invite.isPending) {
    return (
      <AuthLayout title="Joining a family…" subtitle="Checking your invite link.">
        <Spinner className="size-6" />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={joining ? `Join ${invite.data!.familyName}` : 'Create your family account'}
      subtitle={
        joining ? (
          <>
            {invite.data!.invitedBy ?? 'A parent'} invited you to help manage the family on FlexFund.
          </>
        ) : (
          <>
            Already have one?{' '}
            <Link to="/sign-in" className="font-medium text-brand-text underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        )
      }
    >
      <form onSubmit={submit}>
        <FieldGroup>
          {inviteCode && invite.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(invite.error)} You can still create your own family below.</AlertDescription>
            </Alert>
          ) : null}
          {joining ? (
            <div className="flex items-center gap-3 rounded-lg bg-brand-soft p-3 text-sm">
              <UsersIcon className="size-5 shrink-0 text-brand-text" />
              You’ll see the same kids, approvals and activity as {invite.data!.invitedBy ?? 'the other parent'}.
            </div>
          ) : null}
          {providers.data?.google && !joining ? (
            <>
              <GoogleButton clientId={providers.data.google.clientId} onCredential={google} />
              <FieldSeparator>or</FieldSeparator>
            </>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {joining ? null : (
            <Field>
              <FieldLabel htmlFor="familyName">Family name</FieldLabel>
              <Input id="familyName" placeholder="The Taylors" required maxLength={60} value={form.familyName} onChange={set('familyName')} />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="name">Your name</FieldLabel>
            <Input id="name" autoComplete="name" required maxLength={60} value={form.name} onChange={set('name')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={set('password')}
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>
          {joining ? null : (
            <Field orientation="horizontal">
              <Checkbox id="sample" checked={sample} onCheckedChange={(v) => setSample(v === true)} />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="sample" className="font-normal">
                  Include sample kids &amp; activity
                </FieldLabel>
                <FieldDescription>Adds Finn and Emma with a few weeks of history — great for exploring.</FieldDescription>
              </div>
            </Field>
          )}
          <Button type="submit" className="h-10" disabled={busy}>
            {busy ? <Spinner /> : null} {joining ? 'Join family' : 'Create account'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
