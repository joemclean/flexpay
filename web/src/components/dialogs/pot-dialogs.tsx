import { ArrowDownIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { EmojiPicker, MoneyInput } from '@/components/inputs'
import { patch, post } from '@/lib/api'
import { centsToInput, money, parseDollars } from '@/lib/format'
import { useApiMutation } from '@/lib/queries'
import type { Pot } from '@/lib/types'

function useDialog(initial = false) {
  const [open, setOpen] = useState(initial)
  return { open, setOpen }
}

export function PotDialog({ childId, pot, trigger }: { childId: string; pot?: Pot; trigger: ReactNode }) {
  const { open, setOpen } = useDialog()
  const [name, setName] = useState(pot?.name ?? '')
  const [emoji, setEmoji] = useState(pot?.emoji ?? '🎯')
  const [goal, setGoal] = useState(centsToInput(pot?.goalCents))
  const goalCents = goal ? parseDollars(goal) : null
  const goalInvalid = goal !== '' && (goalCents === null || goalCents <= 0)

  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), emoji, goalCents: pot?.isSpending ? undefined : goalCents }
      return pot ? patch<Pot>(`/pots/${pot.id}`, body) : post<Pot>(`/children/${childId}/pots`, body)
    },
    { success: pot ? 'Pot updated' : `${emoji} ${name.trim()} pot created`, onSuccess: () => setOpen(false) },
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName(pot?.name ?? '')
          setEmoji(pot?.emoji ?? '🎯')
          setGoal(centsToInput(pot?.goalCents))
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() && !goalInvalid) save.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>{pot ? 'Edit pot' : 'New savings pot'}</DialogTitle>
            <DialogDescription>Pots help kids save for something specific. Give it a target to show progress.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <Field>
              <FieldLabel htmlFor="pot-name">Name</FieldLabel>
              <div className="flex gap-2">
                <EmojiPicker value={emoji} onChange={setEmoji} set="goals" />
                <Input id="pot-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Bike" required maxLength={60} autoFocus />
              </div>
            </Field>
            {!pot?.isSpending ? (
              <Field data-invalid={goalInvalid || undefined}>
                <FieldLabel htmlFor="pot-goal">Goal (optional)</FieldLabel>
                <MoneyInput id="pot-goal" value={goal} onChange={setGoal} invalid={goalInvalid} placeholder="250" />
                {goalInvalid ? <FieldError>Enter a valid amount</FieldError> : <FieldDescription>Leave blank for a pot without a target.</FieldDescription>}
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || goalInvalid || save.isPending}>
              {save.isPending ? <Spinner /> : null} {pot ? 'Save' : 'Create pot'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PotSelect({ id, pots, value, onChange, exclude }: { id: string; pots: Pot[]; value: string; onChange: (v: string) => void; exclude?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a pot" />
      </SelectTrigger>
      <SelectContent>
        {pots
          .filter((p) => p.id !== exclude)
          .map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.emoji} {p.name} · {money(p.balanceCents)}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}

export function DepositDialog({ childId, childName, pots, trigger, defaultPotId }: { childId: string; childName: string; pots: Pot[]; trigger: ReactNode; defaultPotId?: string }) {
  const { open, setOpen } = useDialog()
  const spending = pots.find((p) => p.isSpending)
  const [potId, setPotId] = useState(defaultPotId ?? spending?.id ?? '')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const cents = parseDollars(amount)
  const invalid = amount !== '' && (cents === null || cents <= 0 || cents > 100_000)

  const deposit = useApiMutation(() => post(`/children/${childId}/deposits`, { potId, amountCents: cents, memo: memo.trim() || undefined }), {
    success: () => `${money(cents ?? 0)} added for ${childName}`,
    onSuccess: () => setOpen(false),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setAmount('')
          setMemo('')
          setPotId(defaultPotId ?? spending?.id ?? '')
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (cents && !invalid && potId) deposit.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>Add money</DialogTitle>
            <DialogDescription>Top up {childName}’s pots — birthday money, tooth fairy, a bonus.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-5">
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="dep-amount">Amount</FieldLabel>
              <MoneyInput id="dep-amount" value={amount} onChange={setAmount} invalid={invalid} autoFocus />
              {invalid ? <FieldError>Enter an amount up to $1,000</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="dep-pot">Into</FieldLabel>
              <PotSelect id="dep-pot" pots={pots} value={potId} onChange={setPotId} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dep-memo">Note (optional)</FieldLabel>
              <Input id="dep-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Tooth fairy 🦷" maxLength={140} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!cents || invalid || !potId || deposit.isPending}>
              {deposit.isPending ? <Spinner /> : null} Add {cents ? money(cents) : 'money'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TransferDialog({ childId, pots, trigger, defaultFrom, defaultTo }: { childId: string; pots: Pot[]; trigger: ReactNode; defaultFrom?: string; defaultTo?: string }) {
  const { open, setOpen } = useDialog()
  const spending = pots.find((p) => p.isSpending)
  const initialFrom = defaultFrom ?? spending?.id ?? ''
  const initialTo = defaultTo ?? pots.find((p) => p.id !== initialFrom)?.id ?? ''
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [amount, setAmount] = useState('')
  const cents = parseDollars(amount)
  const fromPot = pots.find((p) => p.id === from)
  const toPot = pots.find((p) => p.id === to)
  const tooMuch = Boolean(cents && fromPot && cents > fromPot.balanceCents)
  const invalid = amount !== '' && (cents === null || cents <= 0 || tooMuch)

  const transfer = useApiMutation(() => post(`/children/${childId}/transfers`, { fromPotId: from, toPotId: to, amountCents: cents }), {
    success: () => `Moved ${money(cents ?? 0)} to ${toPot?.name}`,
    onSuccess: () => setOpen(false),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setFrom(initialFrom)
          setTo(initialTo)
          setAmount('')
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (cents && !invalid && from && to && from !== to) transfer.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>Move money</DialogTitle>
            <DialogDescription>Shift money between pots — for example from General into a savings goal.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4 py-5">
            <Field>
              <FieldLabel htmlFor="xfer-from">From</FieldLabel>
              <PotSelect
                id="xfer-from"
                pots={pots}
                value={from}
                onChange={(v) => {
                  setFrom(v)
                  if (v === to) setTo(pots.find((p) => p.id !== v)?.id ?? '')
                }}
              />
            </Field>
            <div className="flex justify-center text-muted-foreground" aria-hidden>
              <ArrowDownIcon className="size-4" />
            </div>
            <Field>
              <FieldLabel htmlFor="xfer-to">To</FieldLabel>
              <PotSelect id="xfer-to" pots={pots} value={to} onChange={setTo} exclude={from} />
            </Field>
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="xfer-amount">Amount</FieldLabel>
              <MoneyInput id="xfer-amount" value={amount} onChange={setAmount} invalid={invalid} />
              {tooMuch ? (
                <FieldError>{fromPot?.name} only has {money(fromPot?.balanceCents ?? 0)}</FieldError>
              ) : fromPot ? (
                <FieldDescription>
                  Available: {money(fromPot.balanceCents)}{' '}
                  <button type="button" className="font-medium text-brand-text underline-offset-4 hover:underline" onClick={() => setAmount(centsToInput(fromPot.balanceCents))}>
                    Move all
                  </button>
                </FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!cents || invalid || !from || !to || transfer.isPending}>
              {transfer.isPending ? <Spinner /> : null} Move {cents ? money(cents) : 'money'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
