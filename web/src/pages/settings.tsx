import { CheckIcon, CopyIcon, HistoryIcon, LinkIcon, MailIcon, ShieldCheckIcon, ShieldOffIcon, UserPlusIcon, UsersIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ErrorState, ListSkeleton, PageHeader } from '@/components/common'
import { MoneyInput } from '@/components/inputs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { del, patch, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { centsToInput, initials, money, parseDollars, relativeDay } from '@/lib/format'
import { useApiMutation, useAuditEvents, useFamily, useProviders } from '@/lib/queries'
import type { Family, Invite, Parent } from '@/lib/types'

function FamilyCard({ family }: { family: Family }) {
  const [name, setName] = useState(family.name)
  const [timezone, setTimezone] = useState(family.timezone)
  const [reward, setReward] = useState(centsToInput(family.lessonRewardCents))
  const rewardCents = reward === '' ? 0 : parseDollars(reward)
  const rewardInvalid = rewardCents === null || rewardCents > 2000
  const zones = useMemo(() => {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
    return all.includes(family.timezone) ? all : [family.timezone, ...all]
  }, [family.timezone])
  const dirty = name.trim() !== family.name || timezone !== family.timezone || rewardCents !== family.lessonRewardCents
  const save = useApiMutation(() => patch('/family', { name: name.trim(), timezone, lessonRewardCents: rewardCents }), { success: 'Family settings saved' })

  return (
    <Card className="h-full">
      <form
        className="flex flex-1 flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && !rewardInvalid) save.mutate(undefined)
        }}
      >
        <CardHeader>
          <CardTitle>Family</CardTitle>
          <CardDescription>Used for allowance timing, streaks and the kids app.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="family-name">Family name</FieldLabel>
              <Input id="family-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
            </Field>
            <Field>
              <FieldLabel htmlFor="family-tz">Time zone</FieldLabel>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="family-tz" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {zones.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z.replaceAll('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Allowances are paid at the chosen hour in this time zone.</FieldDescription>
            </Field>
            <Field data-invalid={rewardInvalid || undefined}>
              <FieldLabel htmlFor="lesson-reward">Lesson reward</FieldLabel>
              <div className="max-w-40">
                <MoneyInput id="lesson-reward" value={reward} onChange={setReward} invalid={rewardInvalid} placeholder="0.50" />
              </div>
              {rewardInvalid ? (
                <FieldError>Up to $20</FieldError>
              ) : (
                <FieldDescription>Paid the first time a child passes a lesson quiz in FlexFund Kids. Set to 0 to turn off.</FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={!dirty || !name.trim() || rewardInvalid || save.isPending}>
            {save.isPending ? <Spinner /> : null} Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

const inviteUrl = (invite: Invite) => `${window.location.origin}${invite.path}`

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <Input readOnly value={url} aria-label="Invite link" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />} {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function InviteDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [created, setCreated] = useState<Invite | null>(null)
  const create = useApiMutation(() => post<Invite>('/family/invites', email.trim() ? { email: email.trim() } : {}), {
    onSuccess: setCreated,
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setCreated(null)
          setEmail('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlusIcon /> Invite a co-parent
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a co-parent</DialogTitle>
          <DialogDescription>
            They’ll get full access to manage your kids — allowances, approvals, cards and settings.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">Send them this link. It works once and expires in 7 days.</p>
            <CopyLink url={inviteUrl(created)} />
          </div>
        ) : (
          <form
            id="invite-form"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate(undefined)
            }}
          >
            <Field>
              <FieldLabel htmlFor="invite-email">Their email (optional)</FieldLabel>
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@example.com" />
              <FieldDescription>We’ll pre-fill it on their sign-up page.</FieldDescription>
            </Field>
          </form>
        )}
        <DialogFooter>
          {created ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button type="submit" form="invite-form" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : <LinkIcon />} Create invite link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ParentsCard({ parents, invites }: { parents: Parent[]; invites: Invite[] }) {
  const revoke = useApiMutation((code: string) => del(`/family/invites/${encodeURIComponent(code)}`), { success: 'Invite canceled' })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-5 text-brand-text" /> Parents
        </CardTitle>
        <CardDescription>Grown-ups who can manage this family.</CardDescription>
        <CardAction>
          <InviteDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup className="gap-2">
          {parents.map((p) => (
            <Item key={p.id} variant="outline" size="sm">
              <ItemMedia>
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(p.name)}</AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{p.name}</ItemTitle>
                <ItemDescription>{p.email}</ItemDescription>
              </ItemContent>
              <div className="flex flex-wrap gap-1">
                {p.googleLinked ? <Badge variant="outline">Google</Badge> : null}
                {p.mfaEnabled ? <Badge variant="secondary">2-step on</Badge> : null}
              </div>
            </Item>
          ))}
          {invites.map((inv) => (
            <Item key={inv.code} variant="muted" size="sm">
              <ItemMedia>
                <Avatar className="size-9">
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <MailIcon className="size-4" />
                  </AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{inv.email ?? 'Invite link'}</ItemTitle>
                <ItemDescription>Pending · expires {relativeDay(inv.expiresAt)}</ItemDescription>
              </ItemContent>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteUrl(inv))
                    toast.success('Invite link copied')
                  }}
                >
                  <CopyIcon /> Copy link
                </Button>
                <Button variant="ghost" size="sm" onClick={() => revoke.mutate(inv.code)} disabled={revoke.isPending}>
                  Cancel
                </Button>
              </div>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

function CodeInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <InputOTP id={id} maxLength={6} value={value} onChange={onChange} inputMode="numeric" pattern="^[0-9]*$">
      <InputOTPGroup>
        {Array.from({ length: 6 }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="size-10" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  )
}

function TwoStepCard() {
  const { parent } = useAuth()
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [code, setCode] = useState('')
  const start = useApiMutation(() => post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup'), {
    onSuccess: (s) => {
      setSetup(s)
      setCode('')
    },
  })
  const enable = useApiMutation(() => post('/auth/mfa/enable', { code }), {
    success: 'Two-step verification is on',
    onSuccess: () => {
      setSetup(null)
      setCode('')
    },
  })
  const disable = useApiMutation(() => post('/auth/mfa/disable', { code }), {
    success: 'Two-step verification is off',
    onSuccess: () => setCode(''),
  })
  const enabled = Boolean(parent?.mfaEnabled)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-5 text-brand-text" /> Two-step verification
          {enabled ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>}
        </CardTitle>
        <CardDescription>Ask for a code from an authenticator app (like 1Password or Google Authenticator) when you sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        {enabled ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length === 6) disable.mutate(undefined)
            }}
          >
            <Field>
              <FieldLabel htmlFor="mfa-disable">To turn it off, enter a current code</FieldLabel>
              <CodeInput id="mfa-disable" value={code} onChange={setCode} />
            </Field>
            <Button type="submit" variant="outline" className="w-fit" disabled={code.length !== 6 || disable.isPending}>
              {disable.isPending ? <Spinner /> : <ShieldOffIcon />} Turn off
            </Button>
          </form>
        ) : setup ? (
          <form
            className="flex flex-col gap-4 sm:flex-row sm:items-start"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length === 6) enable.mutate(undefined)
            }}
          >
            <div className="w-fit rounded-xl bg-white p-3 ring-1 ring-border">
              <QRCodeSVG value={setup.otpauthUrl} size={148} title="Authenticator setup QR code" />
            </div>
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-sm">1. Scan the QR code with your authenticator app.</p>
              <p className="text-sm text-muted-foreground">
                Can’t scan? Enter this key: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all" data-testid="mfa-secret">{setup.secret}</code>
              </p>
              <Field>
                <FieldLabel htmlFor="mfa-enable">2. Enter the 6-digit code it shows</FieldLabel>
                <CodeInput id="mfa-enable" value={code} onChange={setCode} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={code.length !== 6 || enable.isPending}>
                  {enable.isPending ? <Spinner /> : null} Turn on
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <Button onClick={() => start.mutate(undefined)} disabled={start.isPending}>
            {start.isPending ? <Spinner /> : <ShieldCheckIcon />} Set up two-step verification
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

const ACTION_LABELS: Record<string, string> = {
  'family.created': 'Created the family',
  'family.updated': 'Updated family settings',
  'parent.signed_in': 'Signed in',
  'parent.mfa_enabled': 'Turned on two-step verification',
  'parent.mfa_disabled': 'Turned off two-step verification',
  'child.created': 'Added a child',
  'child.pin_set': 'Set a child’s PIN',
  'child.pin_reset': 'Cleared a child’s PIN',
  'child.pin_created': 'Child created their PIN',
  'child.pin_locked': 'PIN locked after too many tries',
  'device.pairing_code_created': 'Created a pairing code',
  'device.paired': 'Connected a device',
  'device.revoked': 'Disconnected a device',
  'card.frozen': 'Froze a card',
  'card.unfrozen': 'Unfroze a card',
  'card.limit_changed': 'Changed a card limit',
  'deposit.created': 'Added money',
  'pot.archived': 'Closed a pot',
  'schedule.created': 'Created an allowance',
  'schedule.updated': 'Edited an allowance',
  'schedule.paused': 'Paused an allowance',
  'schedule.resumed': 'Resumed an allowance',
  'schedule.canceled': 'Canceled an allowance',
  'schedule.run_now': 'Paid an allowance early',
  'money_request.approved': 'Approved a money request',
  'money_request.declined': 'Declined a money request',
  'contact.added': 'Added a contact',
  'contact.removed': 'Removed a contact',
  'parent.invited': 'Invited a co-parent',
  'parent.invite_revoked': 'Canceled a co-parent invite',
  'parent.joined': 'Joined the family',
  'transaction.reported': 'Child reported a charge',
  'transaction.report_resolved': 'Resolved a reported charge',
}

const REASON_LABELS: Record<string, string> = {
  dont_recognize: 'didn’t recognize it',
  wrong_amount: 'wrong amount',
  other: 'other reason',
}

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const text = action.replace(/[._]/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function detailText(details: Record<string, unknown> | null): string {
  if (!details) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined || typeof v === 'object' || typeof v === 'boolean') continue
    if (typeof v === 'string' && REASON_LABELS[v]) {
      parts.push(REASON_LABELS[v])
      continue
    }
    if (k.toLowerCase().endsWith('cents') && typeof v === 'number') parts.push(money(v))
    else if (k === 'from' || k === 'to') parts.push(`${k} ${typeof v === 'number' ? money(v) : v}`)
    else if (!k.toLowerCase().endsWith('id')) parts.push(String(v))
  }
  return parts.join(' · ')
}

function AuditCard({ parents }: { parents: Parent[] }) {
  const events = useAuditEvents()
  const names = new Map(parents.map((p) => [`parent:${p.id}`, p.name]))
  const actor = (a: string) => names.get(a) ?? (a.startsWith('device:') ? 'Kid’s device' : a === 'system' ? 'FlexFund' : a)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HistoryIcon className="size-5 text-brand-text" /> Security &amp; audit log
        </CardTitle>
        <CardDescription>Sensitive changes to your family account — the last 100 events.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.isError ? (
          <ErrorState error={events.error} onRetry={() => void events.refetch()} />
        ) : events.isPending ? (
          <ListSkeleton rows={6} />
        ) : (
          <div className="max-h-[28rem] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{relativeDay(e.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{actor(e.actor)}</TableCell>
                    <TableCell>
                      <span className="font-medium">{actionLabel(e.action)}</span>
                      {detailText(e.details) ? <span className="text-muted-foreground"> · {detailText(e.details)}</span> : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const family = useFamily()
  const providers = useProviders()
  if (family.isError) return <ErrorState error={family.error} onRetry={() => void family.refetch()} />
  return (
    <>
      <PageHeader title="Settings" description="Family details, security and your audit log." />
      {family.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <FamilyCard key={family.data.family.timezone + family.data.family.name + family.data.family.lessonRewardCents} family={family.data.family} />
            <div className="flex flex-col gap-4">
              <ParentsCard parents={family.data.parents} invites={family.data.invites ?? []} />
              {providers.data?.mfa ? <TwoStepCard /> : null}
            </div>
          </div>
          <AuditCard parents={family.data.parents} />
        </>
      )}
    </>
  )
}
