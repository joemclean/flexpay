import { CheckIcon, PartyPopperIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { post } from '@/lib/api'
import { fromNow, money } from '@/lib/format'
import { useApiMutation } from '@/lib/queries'
import type { Approval } from '@/lib/types'
import { EmojiAvatar, EmptyState } from './common'

type Decision = { approval: Approval; approve: boolean }

function actionPath({ approval, approve }: Decision): string {
  if (approval.type === 'challenge') {
    return `/approvals/challenge-completions/${approval.id}/${approve ? 'approve' : 'reject'}`
  }
  return `/approvals/money-requests/${approval.id}/${approve ? 'approve' : 'decline'}`
}

export function useDecideApproval() {
  return useApiMutation((d: Decision) => post(actionPath(d)), {
    success: (_r, { approval, approve }) => {
      if (!approve) return approval.type === 'challenge' ? 'Marked as not done' : 'Request declined'
      if (approval.type === 'challenge') {
        return approval.amountCents > 0 ? `${money(approval.amountCents)} reward paid to ${approval.child.name}` : 'Approved'
      }
      return approval.direction === 'send' ? `Sent ${money(approval.amountCents)}` : `${money(approval.amountCents)} added for ${approval.child.name}`
    },
  })
}

export function ApprovalsList({ items, compact = false }: { items: Approval[]; compact?: boolean }) {
  const decide = useDecideApproval()
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PartyPopperIcon />}
        title="All caught up"
        description="Chores your kids finish and money they ask to send or receive will show up here."
        className={compact ? 'py-6' : undefined}
      />
    )
  }
  return (
    <ItemGroup className="gap-2">
      {items.map((a) => {
        const busy = decide.isPending && decide.variables?.approval.id === a.id
        return (
          <Item key={`${a.type}-${a.id}`} variant="outline" size="sm" className="flex-wrap sm:flex-nowrap">
            <ItemMedia>
              <EmojiAvatar emoji={a.emoji} label={a.title} />
            </ItemMedia>
            <ItemContent className="min-w-[10rem]">
              <ItemTitle className="flex-wrap">
                {a.description}
              </ItemTitle>
              <ItemDescription>
                {a.child.avatar} {a.child.name} · {fromNow(a.createdAt)}
                {a.note ? ` · “${a.note}”` : ''}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="ml-auto">
              {a.amountCents > 0 ? (
                <span className="tabular mr-1 text-sm font-semibold">{money(a.amountCents)}</span>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                aria-label={`Reject: ${a.description}`}
                disabled={busy}
                onClick={() => decide.mutate({ approval: a, approve: false })}
              >
                <XIcon />
                <span className={compact ? 'sr-only' : 'hidden sm:inline'}>{a.type === 'challenge' ? 'Not done' : 'Decline'}</span>
              </Button>
              <Button
                size="sm"
                aria-label={`Approve: ${a.description}`}
                disabled={busy}
                onClick={() => decide.mutate({ approval: a, approve: true })}
              >
                <CheckIcon />
                <span className={compact ? 'sr-only' : undefined}>Approve</span>
              </Button>
            </ItemActions>
          </Item>
        )
      })}
    </ItemGroup>
  )
}
