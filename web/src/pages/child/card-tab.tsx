import { useQuery } from '@tanstack/react-query'
import { ShoppingCartIcon, SnowflakeIcon } from 'lucide-react'
import { useState } from 'react'
import { ErrorState, ListSkeleton } from '@/components/common'
import { Skeleton } from '@/components/ui/skeleton'
import { SimulatePurchaseDialog } from '@/components/dialogs/card-device-dialogs'
import { MoneyInput } from '@/components/inputs'
import { ReportsList } from '@/components/reports'
import { TransactionList } from '@/components/transactions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { get, patch } from '@/lib/api'
import { centsToInput, money, parseDollars } from '@/lib/format'
import { useApiMutation, useCard, useReports } from '@/lib/queries'
import type { Card as CardT, ChildDetail, Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'

function PurchaseCardVisual({ child, card }: { child: ChildDetail; card: CardT }) {
  const frozen = card.status === 'frozen'
  return (
    <div
      className={cn(
        'relative aspect-[1.586] w-full max-w-sm overflow-hidden rounded-2xl p-5 text-white shadow-lg transition',
        'bg-[linear-gradient(135deg,#9542ff_0%,#6b21d9_55%,#2a0d5c_100%)]',
        frozen && 'saturate-0',
      )}
      role="img"
      aria-label={`${child.name}'s Purchase Card ending in ${card.last4}${frozen ? ', frozen' : ''}`}
    >
      <div className="absolute -top-12 -right-10 size-44 rounded-full bg-white/10" aria-hidden />
      <div className="absolute -bottom-16 -left-8 size-40 rounded-full bg-white/5" aria-hidden />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="font-brand text-lg font-semibold">FlexFund</span>
          <img src="/flexfund-mark.svg" alt="" className="size-8" />
        </div>
        <div>
          <p className="font-mono text-lg tracking-[0.2em]">•••• •••• •••• {card.last4}</p>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <p className="text-[0.65rem] tracking-wider text-white/70 uppercase">Purchase Card</p>
              <p className="font-medium">{child.name}</p>
            </div>
            <p className="tabular text-sm text-white/85">{money(card.spendingBalanceCents ?? 0)}</p>
          </div>
        </div>
      </div>
      {frozen ? (
        <div className="absolute inset-0 flex items-center justify-center bg-sky-950/40 backdrop-blur-[1px]">
          <span className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-sky-900">
            <SnowflakeIcon className="size-4" /> Frozen
          </span>
        </div>
      ) : null}
    </div>
  )
}

function LimitForm({ child, card }: { child: ChildDetail; card: CardT }) {
  const [value, setValue] = useState(centsToInput(card.dailyLimitCents))
  const cents = parseDollars(value)
  const invalid = cents === null || cents < 100 || cents > 50_000
  const save = useApiMutation(() => patch(`/children/${child.id}/card`, { dailyLimitCents: cents }), {
    success: () => `Daily limit set to ${money(cents ?? 0)}`,
  })
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid) save.mutate(undefined)
      }}
    >
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor="daily-limit">Daily spending limit</FieldLabel>
        <div className="flex gap-2">
          <MoneyInput id="daily-limit" value={value} onChange={setValue} invalid={invalid} />
          <Button type="submit" variant="outline" disabled={invalid || cents === card.dailyLimitCents || save.isPending}>
            {save.isPending ? <Spinner /> : null} Save
          </Button>
        </div>
        {invalid ? <FieldError>Between $1 and $500</FieldError> : <FieldDescription>Purchases over this in a day are declined.</FieldDescription>}
      </Field>
    </form>
  )
}

export function CardTab({ child }: { child: ChildDetail }) {
  const card = useCard(child.id)
  const reports = useReports('all')
  const mine = reports.data?.filter((r) => r.childId === child.id) ?? []
  const recent = useQuery({
    queryKey: ['transactions', `card-${child.id}`],
    queryFn: () => get<{ items: Transaction[] }>(`/transactions?childId=${child.id}&kind=card_purchase&limit=8`),
  })
  const toggle = useApiMutation((frozen: boolean) => patch(`/children/${child.id}/card`, { status: frozen ? 'frozen' : 'active' }), {
    success: (_r, frozen) => (frozen ? `${child.name}’s card is frozen — all purchases will be declined` : `${child.name}’s card is active again`),
  })
  const c = card.data
  if (card.isError) return <ErrorState error={card.error} onRetry={() => void card.refetch()} />
  if (!c) return <Skeleton className="h-96 rounded-xl" />

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <PurchaseCardVisual child={child} card={c} />
        <Card>
          <CardContent className="flex flex-col gap-5">
            <Field orientation="horizontal" className="justify-between">
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="freeze" className="flex items-center gap-2">
                  <SnowflakeIcon className="size-4 text-sky-600" /> Freeze card
                </FieldLabel>
                <FieldDescription>Instantly decline every purchase. Unfreeze anytime.</FieldDescription>
              </div>
              <Switch id="freeze" checked={c.status === 'frozen'} onCheckedChange={(v) => toggle.mutate(v)} disabled={toggle.isPending} />
            </Field>
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium">Spent today</span>
                <span className="tabular text-muted-foreground">
                  {money(c.spentTodayCents)} of {money(c.dailyLimitCents)}
                </span>
              </div>
              <Progress value={Math.min(100, (c.spentTodayCents / c.dailyLimitCents) * 100)} aria-label="Spent today" />
              <p className="mt-1.5 text-xs text-muted-foreground">{money(c.remainingTodayCents)} left today</p>
            </div>
            <LimitForm key={c.dailyLimitCents} child={child} card={c} />
            <SimulatePurchaseDialog
              childId={child.id}
              childName={child.name}
              trigger={
                <Button variant="secondary">
                  <ShoppingCartIcon /> Simulate a purchase
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-4 lg:col-span-3">
        {mine.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Reported charges</CardTitle>
              <CardDescription>{child.name} flagged these in the app.</CardDescription>
            </CardHeader>
            <CardContent>
              <ReportsList items={mine} showResolved />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Recent card activity</CardTitle>
            <CardDescription>Including declined attempts.</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.isPending ? (
              <ListSkeleton rows={5} />
            ) : recent.data?.items.length ? (
              <TransactionList items={recent.data.items} className="-my-3" />
            ) : (
              <p className="text-sm text-muted-foreground">No card purchases yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
