import { format, parseISO } from 'date-fns'
import { ArrowDownRightIcon, ArrowUpRightIcon, BadgePercentIcon, BanIcon, LightbulbIcon, ReceiptIcon, ScaleIcon, TrendingUpIcon, WalletIcon } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { CardsSkeleton, EmptyState, ErrorState, Money, PageHeader, StatCard } from '@/components/common'
import { TransactionList } from '@/components/transactions'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CATEGORY_EMOJI, CATEGORY_LABELS, KIND_LABELS, money } from '@/lib/format'
import { useChildren, useInsights } from '@/lib/queries'
import type { Insights } from '@/lib/types'

const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

const moneyTick = (v: number) => money(v, { whole: true }).replace('.00', '')

function FeesCard({ data }: { data: Insights }) {
  const { fees } = data
  const delta = fees.totalCents - fees.previousPeriodCents
  return (
    <Card className="border-brand/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ReceiptIcon className="size-5 text-brand-text" /> Fees &amp; charges
        </CardTitle>
        <CardDescription>Every fee charged to your kids’ accounts in the last {data.period.days} days.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Total fees</p>
            <p className="tabular text-3xl font-semibold tracking-tight">{money(fees.totalCents)}</p>
          </div>
          <Badge variant={delta > 0 ? 'destructive' : 'secondary'} className="w-fit gap-1">
            {delta > 0 ? <ArrowUpRightIcon /> : <ArrowDownRightIcon />}
            {delta === 0 ? 'Same as' : `${money(Math.abs(delta))} ${delta > 0 ? 'more than' : 'less than'}`} the previous {data.period.days} days
          </Badge>
          {fees.byType.length ? (
            <ul className="mt-1 flex flex-col gap-2">
              {fees.byType.map((f) => (
                <li key={f.title} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {f.title} <span className="text-muted-foreground">×{f.count}</span>
                  </span>
                  <span className="tabular font-medium">{money(f.cents)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-success">No fees in this period. 🎉</p>
          )}
        </div>
        <div className="lg:col-span-1">
          <p className="mb-1 text-sm font-medium">Recent fees</p>
          {fees.items.length ? (
            <TransactionList items={fees.items.slice(0, 5)} showChild />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing charged.</p>
          )}
        </div>
        <div className="rounded-xl bg-brand-soft p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <LightbulbIcon className="size-4 text-brand-text" /> Ways to avoid fees
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-sm text-foreground/90">
            {fees.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function SpendingChart({ data }: { data: Insights }) {
  const rows = data.spendingByCategory.map((r) => ({ ...r, label: `${CATEGORY_EMOJI[r.category]} ${CATEGORY_LABELS[r.category]}` }))
  const config: ChartConfig = { cents: { label: 'Spent', color: 'var(--chart-1)' } }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by category</CardTitle>
        <CardDescription>Card purchases and money sent to friends.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No spending in this period.</p>
        ) : (
          <ChartContainer config={config} className="aspect-auto w-full" style={{ height: Math.max(180, rows.length * 40) }}>
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" tickFormatter={moneyTick} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideIndicator formatter={(v) => money(Number(v))} />} />
              <Bar dataKey="cents" radius={6} name="Spent">
                {rows.map((r, i) => (
                  <Cell key={r.category} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

function BalanceChart({ data }: { data: Insights }) {
  const config: ChartConfig = { balanceCents: { label: 'Balance', color: 'var(--chart-1)' } }
  const rows = data.balanceTrend.map((p) => ({ ...p, label: format(parseISO(p.date), 'MMM d') }))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Balance over time</CardTitle>
        <CardDescription>Total across all pots at the end of each day.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={rows} margin={{ left: 4, right: 8 }}>
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-balanceCents)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-balanceCents)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={moneyTick} tickLine={false} axisLine={false} width={56} />
            <ChartTooltip content={<ChartTooltipContent indicator="line" formatter={(v) => money(Number(v))} />} />
            <Area dataKey="balanceCents" type="monotone" stroke="var(--color-balanceCents)" strokeWidth={2} fill="url(#balanceFill)" name="Balance" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function IncomeCard({ data }: { data: Insights }) {
  const total = data.incomeBySource.reduce((s, r) => s + r.cents, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Income by source</CardTitle>
        <CardDescription>Allowance, rewards, lessons and gifts.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.incomeBySource.length === 0 ? (
          <p className="text-sm text-muted-foreground">No income in this period.</p>
        ) : (
          <>
            <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label="Income split">
              {data.incomeBySource.map((r, i) => (
                <div key={r.kind} style={{ width: `${(r.cents / total) * 100}%`, background: PALETTE[i % PALETTE.length] }} />
              ))}
            </div>
            <ul className="flex flex-col gap-2.5">
              {data.incomeBySource.map((r, i) => (
                <li key={r.kind} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
                  <span className="flex-1">{KIND_LABELS[r.kind]}</span>
                  <span className="text-muted-foreground">{Math.round((r.cents / total) * 100)}%</span>
                  <span className="tabular w-20 text-right font-medium">{money(r.cents)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function MerchantsCard({ data }: { data: Insights }) {
  const max = Math.max(1, ...data.topMerchants.map((m) => m.cents))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top merchants</CardTitle>
        <CardDescription>Where the Purchase Cards get used most.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.topMerchants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No card purchases in this period.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.topMerchants.map((m) => (
              <li key={m.title}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{m.title}</span>
                  <span className="tabular text-muted-foreground">
                    {m.count}× · <span className="font-medium text-foreground">{money(m.cents)}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(m.cents / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function InsightsPage() {
  const [days, setDays] = useState(30)
  const [childId, setChildId] = useState('all')
  const children = useChildren()
  const insights = useInsights(days, childId === 'all' ? undefined : childId)
  const data = insights.data

  return (
    <>
      <PageHeader
        title="Insights"
        description="Where the money comes from, where it goes — and what it costs."
        actions={
          <>
            <Select value={childId} onValueChange={setChildId}>
              <SelectTrigger aria-label="Child" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kids</SelectItem>
                {children.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.avatar} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              variant="outline"
              value={String(days)}
              onValueChange={(v) => v && setDays(Number(v))}
              aria-label="Period"
            >
              <ToggleGroupItem value="7">7 days</ToggleGroupItem>
              <ToggleGroupItem value="30">30 days</ToggleGroupItem>
              <ToggleGroupItem value="90">90 days</ToggleGroupItem>
            </ToggleGroup>
          </>
        }
      />

      {insights.isError ? (
        <ErrorState error={insights.error} onRetry={() => void insights.refetch()} />
      ) : !data ? (
        <>
          <CardsSkeleton />
          <Skeleton className="h-72 rounded-xl" />
        </>
      ) : children.data?.length === 0 ? (
        <EmptyState icon={<TrendingUpIcon />} title="No data yet" description="Add a child to start seeing insights." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <StatCard label="Spent" value={money(data.totals.spentCents)} icon={<WalletIcon />} hint={`Last ${data.period.days} days`} />
            <StatCard label="Earned" value={money(data.totals.earnedCents)} icon={<TrendingUpIcon />} hint="Allowance, rewards & gifts" />
            <StatCard label="Fees" value={money(data.totals.feesCents)} icon={<BadgePercentIcon />} hint="See breakdown below" />
            <StatCard
              label="Net"
              value={<Money cents={data.totals.netCents} signed className="font-semibold" />}
              icon={<ScaleIcon />}
              hint={
                data.totals.declinedCount ? (
                  <span className="inline-flex items-center gap-1">
                    <BanIcon className="size-3" /> {data.totals.declinedCount} declined card attempts
                  </span>
                ) : (
                  'Earned minus spent and fees'
                )
              }
            />
          </div>
          <FeesCard data={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <SpendingChart data={data} />
            <BalanceChart data={data} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <IncomeCard data={data} />
            <MerchantsCard data={data} />
          </div>
        </>
      )}
    </>
  )
}
