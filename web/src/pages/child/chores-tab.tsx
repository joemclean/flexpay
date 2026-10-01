import { ClipboardListIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { ApprovalsList } from '@/components/approvals'
import { EmojiAvatar, EmptyState, ErrorState, ListSkeleton } from '@/components/common'
import { Confirm } from '@/components/confirm'
import { ChallengeDialog } from '@/components/dialogs/activity-dialogs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { del } from '@/lib/api'
import { fromNow, money, RECURRENCE_LABELS } from '@/lib/format'
import { useApiMutation, useApprovals, useChallenges } from '@/lib/queries'
import type { Challenge, ChildDetail } from '@/lib/types'

const STATUS_LABEL = { available: 'To do', pending: 'Waiting for you', done: 'Done' } as const

function ChallengeRow({ child, challenge }: { child: ChildDetail; challenge: Challenge }) {
  const remove = useApiMutation(() => del(`/challenges/${challenge.id}`), { success: `${challenge.title} removed` })
  const period = challenge.recurrence === 'daily' ? 'today' : challenge.recurrence === 'weekly' ? 'this week' : ''
  return (
    <Item variant="outline" size="sm">
      <ItemMedia>
        <EmojiAvatar emoji={challenge.emoji} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex-wrap">
          {challenge.title}
          <Badge variant="outline">{RECURRENCE_LABELS[challenge.recurrence]}</Badge>
        </ItemTitle>
        <ItemDescription>
          {challenge.rewardCents > 0 ? `${money(challenge.rewardCents)} reward` : 'No reward'} · done {challenge.completedCount ?? 0}×
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {challenge.status ? (
          <Badge variant={challenge.status === 'pending' ? 'default' : challenge.status === 'done' ? 'secondary' : 'outline'} className="hidden sm:inline-flex">
            {STATUS_LABEL[challenge.status]} {period}
          </Badge>
        ) : null}
        <ChallengeDialog
          childId={child.id}
          pots={child.pots}
          challenge={challenge}
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${challenge.title}`}>
              <PencilIcon />
            </Button>
          }
        />
        <Confirm
          title={`Remove “${challenge.title}”?`}
          description={`${child.name} won’t see it anymore. Anything waiting for approval will be dismissed.`}
          confirmLabel="Remove"
          onConfirm={() => remove.mutate(undefined)}
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label={`Remove ${challenge.title}`}>
              <Trash2Icon />
            </Button>
          }
        />
      </ItemActions>
    </Item>
  )
}

export function ChoresTab({ child }: { child: ChildDetail }) {
  const challenges = useChallenges(child.id)
  const approvals = useApprovals()
  const mine = approvals.data?.filter((a) => a.child.id === child.id) ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="flex flex-col gap-4 lg:col-span-3">
        {mine.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Waiting for you</CardTitle>
              <CardDescription>{child.name} says these are done.</CardDescription>
            </CardHeader>
            <CardContent>
              <ApprovalsList items={mine} />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Chores &amp; challenges</CardTitle>
            <CardDescription>Finishing at least one each week keeps {child.name}’s streak going.</CardDescription>
            <CardAction>
              <ChallengeDialog
                childId={child.id}
                pots={child.pots}
                trigger={
                  <Button size="sm">
                    <PlusIcon /> New
                  </Button>
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            {challenges.isError ? (
              <ErrorState error={challenges.error} onRetry={() => void challenges.refetch()} />
            ) : challenges.isPending ? (
              <ListSkeleton rows={3} />
            ) : challenges.data.items.length === 0 ? (
              <EmptyState icon={<ClipboardListIcon />} title="No chores yet" description="Add a chore like “Tidy bedroom” with a small reward." />
            ) : (
              <ItemGroup className="gap-2">
                {challenges.data.items.map((ch) => (
                  <ChallengeRow key={ch.id} child={child} challenge={ch} />
                ))}
              </ItemGroup>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>Recent completions.</CardDescription>
        </CardHeader>
        <CardContent>
          {challenges.isPending ? (
            <ListSkeleton rows={5} />
          ) : !challenges.data?.history.length ? (
            <p className="text-sm text-muted-foreground">Nothing completed yet.</p>
          ) : (
            <ul className="divide-y">
              {challenges.data.history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <span aria-hidden className="text-lg">
                    {h.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{h.title}</p>
                    <p className="text-xs text-muted-foreground">{fromNow(h.submittedAt)}</p>
                  </div>
                  <Badge variant={h.status === 'approved' ? 'secondary' : h.status === 'pending' ? 'default' : 'outline'}>
                    {h.status === 'approved' ? `+${money(h.rewardCents)}` : h.status === 'pending' ? 'Pending' : 'Not done'}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
