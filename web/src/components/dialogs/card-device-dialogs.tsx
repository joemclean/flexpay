import { CheckCircle2Icon, CopyIcon, RefreshCwIcon, SmartphoneIcon, XCircleIcon } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { MoneyInput } from '@/components/inputs'
import { post, put } from '@/lib/api'
import { CATEGORY_LABELS, money, parseDollars } from '@/lib/format'
import { useApiMutation } from '@/lib/queries'
import { CATEGORIES, type Category, type PairingCode, type PurchaseResult } from '@/lib/types'
import { cn } from '@/lib/utils'

const PRESETS: { merchant: string; cents: number; category: Category; foreign?: boolean }[] = [
  { merchant: 'Pizza Papi', cents: 450, category: 'food' },
  { merchant: 'DT Theatre', cents: 1000, category: 'entertainment' },
  { merchant: 'Bus', cents: 200, category: 'transport' },
  { merchant: 'Steam', cents: 499, category: 'games', foreign: true },
]

export function SimulatePurchaseDialog({ childId, childName, trigger }: { childId: string; childName: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<Category>('shopping')
  const [foreign, setForeign] = useState(false)
  const [result, setResult] = useState<PurchaseResult | null>(null)
  const cents = parseDollars(amount)
  const invalid = amount !== '' && (cents === null || cents <= 0 || cents > 100_000)

  const buy = useApiMutation(
    () => post<PurchaseResult>(`/children/${childId}/card/simulate-purchase`, { merchant: merchant.trim(), amountCents: cents, category, foreign }),
    { onSuccess: (r) => setResult(r) },
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setResult(null)
          setMerchant('')
          setAmount('')
          setCategory('shopping')
          setForeign(false)
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (merchant.trim() && cents && !invalid) buy.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>Simulate a card purchase</DialogTitle>
            <DialogDescription>
              Test {childName}’s Purchase Card the way a shop would charge it — limits, freezes and fees all apply.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5 pt-4" aria-label="Quick examples">
            {PRESETS.map((p) => (
              <Button
                key={p.merchant}
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => {
                  setMerchant(p.merchant)
                  setAmount((p.cents / 100).toFixed(2))
                  setCategory(p.category)
                  setForeign(Boolean(p.foreign))
                  setResult(null)
                }}
              >
                {p.merchant} {money(p.cents)}
              </Button>
            ))}
          </div>
          <FieldGroup className="gap-4 py-4">
            <Field>
              <FieldLabel htmlFor="sp-merchant">Merchant</FieldLabel>
              <Input id="sp-merchant" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Toy Planet" required maxLength={60} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="sp-amount">Amount</FieldLabel>
                <MoneyInput id="sp-amount" value={amount} onChange={setAmount} invalid={invalid} />
                {invalid ? <FieldError>Enter a valid amount</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="sp-category">Category</FieldLabel>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger id="sp-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => !['income', 'savings', 'fees'].includes(c)).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field orientation="horizontal">
              <Switch id="sp-foreign" checked={foreign} onCheckedChange={setForeign} />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="sp-foreign" className="font-normal">
                  Shop is in another country
                </FieldLabel>
                <FieldDescription>Adds a 2.5% foreign transaction fee.</FieldDescription>
              </div>
            </Field>
          </FieldGroup>
          {result ? (
            <Alert variant={result.approved ? 'default' : 'destructive'} className={cn('mb-4', result.approved && 'border-success/40 text-success')} role="status">
              {result.approved ? <CheckCircle2Icon /> : <XCircleIcon />}
              <AlertTitle>{result.approved ? 'Approved' : 'Declined'}</AlertTitle>
              <AlertDescription>
                {result.message.replace(/^(Approved|Declined): /, '')}
                {result.fee ? ` · plus ${money(-result.fee.amountCents)} foreign transaction fee` : ''}. Remaining today:{' '}
                {money(result.card.remainingTodayCents)}.
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
            <Button type="submit" disabled={!merchant.trim() || !cents || invalid || buy.isPending}>
              {buy.isPending ? <Spinner /> : null} Charge card
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function useCountdown(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  if (!expiresAt) return { remaining: 0, label: '' }
  const remaining = Math.max(0, Date.parse(expiresAt) - now)
  const m = Math.floor(remaining / 60000)
  const s = Math.floor((remaining % 60000) / 1000)
  return { remaining, label: `${m}:${String(s).padStart(2, '0')}` }
}

export function PairingDialog({ childId, childName, trigger }: { childId: string; childName: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState<PairingCode | null>(null)
  const { remaining, label } = useCountdown(code?.expiresAt)
  const generate = useApiMutation(() => post<PairingCode>(`/children/${childId}/pairing-codes`), { onSuccess: (c) => setCode(c) })
  const expired = Boolean(code) && remaining === 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setCode(null)
          generate.mutate(undefined)
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SmartphoneIcon className="size-5 text-brand-text" /> Connect {childName}’s iPhone
          </DialogTitle>
          <DialogDescription>
            Open <strong>FlexFund Kids</strong>, tap <em>Get started</em> and type this code — or scan the QR code with the iPhone camera.
          </DialogDescription>
        </DialogHeader>
        {code ? (
          <div className="flex flex-col items-center gap-5 py-2">
            <p
              className={cn('font-mono text-5xl font-semibold tracking-[0.25em] tabular', expired && 'text-muted-foreground line-through')}
              aria-label={`Pairing code ${code.code.split('').join(' ')}`}
              data-testid="pairing-code"
            >
              {code.code}
            </p>
            <div className={cn('rounded-2xl bg-white p-3 shadow-sm ring-1 ring-border', expired && 'opacity-30')}>
              <QRCodeSVG value={code.deepLink} size={168} fgColor="#1a1523" level="M" title={`QR code for ${code.deepLink}`} />
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {expired ? 'This code has expired.' : `Expires in ${label} · works once`}
            </p>
          </div>
        ) : (
          <div className="flex h-72 items-center justify-center">
            <Spinner className="size-6" />
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            disabled={!code || expired}
            onClick={() => {
              if (!code) return
              void navigator.clipboard?.writeText(code.code).then(() => toast.success('Code copied'))
            }}
          >
            <CopyIcon /> Copy code
          </Button>
          <Button variant={expired ? 'default' : 'secondary'} onClick={() => generate.mutate(undefined)} disabled={generate.isPending}>
            {generate.isPending ? <Spinner /> : <RefreshCwIcon />} New code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PinDialog({ childId, childName, hasPin, trigger }: { childId: string; childName: string; hasPin: boolean; trigger: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length === 4 && pin !== confirm
  const save = useApiMutation(() => put(`/children/${childId}/pin`, { pin }), {
    success: `${childName}’s PIN ${hasPin ? 'changed' : 'set'}. They’ll need it next time they open the app.`,
    onSuccess: () => setOpen(false),
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        setPin('')
        setConfirm('')
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (pin.length === 4 && pin === confirm) save.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>{hasPin ? 'Change PIN' : 'Set a PIN'}</DialogTitle>
            <DialogDescription>{childName} uses this 4-digit PIN to open FlexFund Kids. Any open sessions are signed out.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="items-center py-5">
            <Field className="items-center">
              <FieldLabel htmlFor="pin-new">New PIN</FieldLabel>
              <InputOTP id="pin-new" maxLength={4} value={pin} onChange={setPin} inputMode="numeric" pattern="^[0-9]*$" autoFocus>
                <InputOTPGroup>
                  {[0, 1, 2, 3].map((i) => (
                    <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </Field>
            <Field className="items-center" data-invalid={mismatch || undefined}>
              <FieldLabel htmlFor="pin-confirm">Confirm PIN</FieldLabel>
              <InputOTP id="pin-confirm" maxLength={4} value={confirm} onChange={setConfirm} inputMode="numeric" pattern="^[0-9]*$">
                <InputOTPGroup>
                  {[0, 1, 2, 3].map((i) => (
                    <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {mismatch ? <FieldError>PINs don’t match</FieldError> : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pin.length !== 4 || pin !== confirm || save.isPending}>
              {save.isPending ? <Spinner /> : null} Save PIN
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
