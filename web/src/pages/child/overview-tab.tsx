import { CreditCardIcon, PiggyBankIcon, SnowflakeIcon, WalletIcon, ZapIcon } from 'lucide-react'
import { Link } from 'react-router'
import { StatCard } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { money } from '@/lib/format'
import { useCard } from '@/lib/queries'
import type { Achievement, ChildDetail, Pot } from '@/lib/types'
import { cn } from '@/lib/utils'

export function PotCardBody({ pot }: { pot: Pot }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-2xl">
          {pot.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{pot.name}</p>
          <p className="text-xs text-muted-foreground">{pot.isSpending ? 'Spending pot · used by the card' : pot.goalCents ? `Goal ${money(pot.goalCents)}` : 'No goal'}</p>
        </div>
        {pot.goalReached ? <Badge className="bg-success text-white">Goal reached 🎉</Badge> : null}
      </div>
      <p className="tabular mt-4 text-2xl font-semibold tracking-tight">{money(pot.balanceCents)}</p>
      {pot.goalCents ? (
        <div className="mt-2">
          <Progress value={(pot.progress ?? 0) * 100} aria-label={`${Math.round((pot.progress ?? 0) * 100)}% of goal`} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            {Math.round((pot.progress ?? 0) * 100)}% · {pot.goalReached ? 'Done!' : `${money(Math.max(0, pot.goalCents - pot.balanceCents))} to go`}
          </p>
        </div>
      ) : null}
    </>
  )
}

function AchievementTile({ a }: { a: Achievement }) {
  return (
    <li
      className={cn('flex gap-3 rounded-xl border p-3', a.earned ? 'border-brand/30 bg-brand-soft/60' : 'bg-muted/30')}
      aria-label={`${a.title}: ${a.earned ? 'earned' : 'not yet earned'}`}
    >
      <span aria-hidden className={cn('text-2xl leading-none', !a.earned && 'opacity-40 grayscale')}>
        {a.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {a.title}
          {a.earned ? <Badge variant="secondary">Earned</Badge> : null}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
        {!a.earned && a.target > 1 ? (
          <Progress value={(a.current / a.target) * 100} className="mt-2 h-1.5" aria-label={`${a.current} of ${a.target}`} />
        ) : null}
      </div>
    </li>
  )
}

export function ChildOverviewTab({ child }: { child: ChildDetail }) {
  const earned = child.achievements.filter((a) => a.earned).length
  const card = useCard(child.id)
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard tone="brand" label="Total balance" value={money(child.totalCents)} icon={<WalletIcon />} hint={`${child.pots.length} pots`} />
        <StatCard label="Saved" value={money(child.savedCents)} icon={<PiggyBankIcon />} hint="In savings goals" />
        <StatCard
          label="Purchase Card"
          value={child.card.status === 'frozen' ? 'Frozen' : `•••• ${child.card.last4}`}
          icon={child.card.status === 'frozen' ? <SnowflakeIcon /> : <CreditCardIcon />}
          hint={
            card.data
              ? `${money(card.data.remainingTodayCents)} left today of ${money(card.data.dailyLimitCents)}`
              : `Daily limit ${money(child.card.dailyLimitCents)}`
          }
        />
        <StatCard
          label="Streak"
          value={child.streakWeeks ? `${child.streakWeeks} week${child.streakWeeks === 1 ? '' : 's'}` : 'None yet'}
          icon={<ZapIcon />}
          hint="Weeks in a row with a chore or lesson"
        />
      </div>

      <section aria-labelledby="pots-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="pots-heading" className="text-lg font-semibold">
            Pots
          </h2>
          <Link to={`/children/${child.id}/pots`} className="text-sm font-medium text-brand-text underline-offset-4 hover:underline">
            Manage pots
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {child.pots.map((p) => (
            <Card key={p.id} className="gap-0 py-5">
              <CardContent className="px-5">
                <PotCardBody pot={p} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Achievements</CardTitle>
          <CardDescription>
            {earned} of {child.achievements.length} earned — badges are based on real progress, so {child.name} always knows how to get the next one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {child.achievements.map((a) => (
              <AchievementTile key={a.id} a={a} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
