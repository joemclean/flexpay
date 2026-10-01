import { ArrowRightIcon, BadgePercentIcon, PiggyBankIcon, PlusIcon, ReceiptIcon, SnowflakeIcon, UsersIcon, WalletIcon, ZapIcon } from 'lucide-react'
import { Link } from 'react-router'
import { ApprovalsList } from '@/components/approvals'
import { CardsSkeleton, EmojiAvatar, EmptyState, ErrorState, ListSkeleton, Money, PageHeader, StatCard } from '@/components/common'
import { AddChildDialog } from '@/components/dialogs/add-child-dialog'
import { ReportsHeading, ReportsList } from '@/components/reports'
import { TransactionList } from '@/components/transactions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/lib/auth'
import { money } from '@/lib/format'
import { useChild, useOverview } from '@/lib/queries'
import type { ChildSummary } from '@/lib/types'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function ChildPots({ childId }: { childId: string }) {
  const child = useChild(childId)
  const goals = child.data?.pots.filter((p) => !p.isSpending && p.goalCents).slice(0, 3) ?? []
  if (child.isPending) return <ListSkeleton rows={2} />
  if (goals.length === 0) return <p className="text-sm text-muted-foreground">No savings goals yet.</p>
  return (
    <ul className="flex flex-col gap-3">
      {goals.map((p) => (
        <li key={p.id}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
            <span className="truncate">
              <span aria-hidden>{p.emoji}</span> {p.name}
            </span>
            <span className="tabular shrink-0 text-muted-foreground">
              {money(p.balanceCents, { whole: true })} / {money(p.goalCents!, { whole: true })}
            </span>
          </div>
          <Progress value={(p.progress ?? 0) * 100} aria-label={`${p.name} ${Math.round((p.progress ?? 0) * 100)}% of goal`} />
        </li>
      ))}
    </ul>
  )
}

function ChildCard({ child }: { child: ChildSummary }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-center gap-3">
          <EmojiAvatar emoji={child.avatar} className="size-12 text-2xl" />
          <div className="min-w-0">
            <CardTitle className="text-lg">{child.name}</CardTitle>
            <CardDescription>{child.age ? `${child.age} years old` : 'FlexFund Kids'}</CardDescription>
          </div>
        </div>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/children/${child.id}`} aria-label={`Open ${child.name}`}>
              Open <ArrowRightIcon />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <Money cents={child.totalCents} className="text-lg font-semibold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Spending</p>
            <Money cents={child.spendingCents} className="text-lg font-semibold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saved</p>
            <Money cents={child.savedCents} className="text-lg font-semibold" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {child.streakWeeks > 0 ? (
            <Badge variant="secondary" className="gap-1">
              <ZapIcon className="text-warning" /> {child.streakWeeks}-week streak
            </Badge>
          ) : null}
          {child.card?.status === 'frozen' ? (
            <Badge variant="destructive" className="gap-1">
              <SnowflakeIcon /> Card frozen
            </Badge>
          ) : child.card ? (
            <Badge variant="outline">Card •••• {child.card.last4}</Badge>
          ) : null}
          {child.pendingApprovals > 0 ? <Badge>{child.pendingApprovals} to approve</Badge> : null}
          {child.deviceCount === 0 ? (
            <Badge variant="outline" className="text-muted-foreground">
              No device connected
            </Badge>
          ) : null}
        </div>
        <ChildPots childId={child.id} />
      </CardContent>
    </Card>
  )
}

export function OverviewPage() {
  const { parent } = useAuth()
  const overview = useOverview()

  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />

  const data = overview.data
  return (
    <>
      <PageHeader
        title={`${greeting()}${parent ? `, ${parent.name.split(' ')[0]}` : ''}`}
        description={data ? `Here’s how ${data.family.name} is doing.` : 'Loading your family…'}
        actions={
          <AddChildDialog
            trigger={
              <Button variant="outline">
                <PlusIcon /> Add child
              </Button>
            }
          />
        }
      />

      {data ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard tone="brand" label="Family balance" value={money(data.totals.balanceCents)} hint={`${data.children.length} kids`} icon={<WalletIcon />} />
          <StatCard label="Saved in goals" value={money(data.totals.savedCents)} hint="Across all savings pots" icon={<PiggyBankIcon />} />
          <StatCard
            label="Spent this month"
            value={money(data.totals.spentThisMonthCents)}
            hint={`${money(data.totals.earnedThisMonthCents)} earned`}
            icon={<ReceiptIcon />}
          />
          <StatCard
            label="Fees this month"
            value={money(data.totals.feesThisMonthCents)}
            hint={
              <Link to="/insights" className="underline-offset-4 hover:underline">
                See fees &amp; charges
              </Link>
            }
            icon={<BadgePercentIcon />}
          />
        </div>
      ) : (
        <CardsSkeleton />
      )}

      {data && data.children.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="Add your first child"
          description="Each child gets a spending pot, savings goals and a Purchase Card you control."
          action={
            <AddChildDialog
              trigger={
                <Button>
                  <PlusIcon /> Add child
                </Button>
              }
            />
          }
        />
      ) : (
        <section aria-label="Kids" className="grid gap-4 lg:grid-cols-2">
          {data ? data.children.map((c) => <ChildCard key={c.id} child={c} />) : <CardsSkeleton count={2} className="lg:col-span-2 sm:grid-cols-2 xl:grid-cols-2" />}
        </section>
      )}

      {data?.openReports?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <ReportsHeading count={data.openReports.length} />
            </CardTitle>
            <CardDescription>Your kids flagged these charges as ones they don’t recognize.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReportsList items={data.openReports} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Needs your approval</CardTitle>
            <CardDescription>Finished chores and money your kids want to send or ask for.</CardDescription>
          </CardHeader>
          <CardContent>{data ? <ApprovalsList items={data.approvals} /> : <ListSkeleton rows={3} />}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link to="/activity">
                  View all <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data ? (
              data.recentActivity.length ? (
                <TransactionList items={data.recentActivity} showChild className="-my-3" />
              ) : (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              )
            ) : (
              <ListSkeleton rows={5} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
