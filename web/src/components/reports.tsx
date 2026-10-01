import { CheckIcon, FlagIcon, SnowflakeIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'
import { post } from '@/lib/api'
import { fromNow, money } from '@/lib/format'
import { useApiMutation } from '@/lib/queries'
import type { Report } from '@/lib/types'
import { EmojiAvatar } from './common'

export function ReportsList({ items, showResolved = false }: { items: Report[]; showResolved?: boolean }) {
  const resolve = useApiMutation(
    ({ report, freezeCard }: { report: Report; freezeCard: boolean }) =>
      post(`/reports/${report.id}/resolve`, {
        freezeCard,
        resolution: freezeCard ? 'Card frozen while we check this charge' : 'Checked by a parent',
      }),
    {
      success: (_r, { report, freezeCard }) =>
        freezeCard ? `${report.child.name}’s card is frozen and the report is resolved` : 'Marked as checked',
    },
  )
  return (
    <ItemGroup className="gap-2">
      {items.map((r) => {
        const busy = resolve.isPending && resolve.variables?.report.id === r.id
        return (
          <Item key={r.id} variant="outline" size="sm" className="flex-wrap border-warning/40 bg-warning-soft/60 sm:flex-nowrap">
            <ItemMedia>
              <EmojiAvatar emoji={r.child.avatar} label={r.child.name} className="bg-background" />
            </ItemMedia>
            <ItemContent className="min-w-[10rem]">
              <ItemTitle className="flex-wrap">
                {r.child.name} reported {r.transaction.title}{' '}
                <span className="tabular font-semibold">{money(r.transaction.amountCents)}</span>
              </ItemTitle>
              <ItemDescription>
                {r.reasonLabel}
                {r.note ? ` · “${r.note}”` : ''} · {fromNow(r.createdAt)}
              </ItemDescription>
              {r.status === 'resolved' && r.resolution ? (
                <ItemDescription className="text-success">Resolved: {r.resolution}</ItemDescription>
              ) : null}
            </ItemContent>
            {r.status === 'open' ? (
              <ItemActions className="ml-auto">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => resolve.mutate({ report: r, freezeCard: true })}>
                  <SnowflakeIcon /> Freeze card &amp; resolve
                </Button>
                <Button size="sm" disabled={busy} onClick={() => resolve.mutate({ report: r, freezeCard: false })}>
                  <CheckIcon /> Mark as checked
                </Button>
              </ItemActions>
            ) : showResolved ? (
              <ItemActions className="ml-auto">
                <Badge variant="secondary">Resolved</Badge>
              </ItemActions>
            ) : null}
          </Item>
        )
      })}
    </ItemGroup>
  )
}

export function ReportsHeading({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-2">
      <FlagIcon className="size-4 text-warning" /> Reported charges
      <Badge variant="secondary">{count}</Badge>
    </span>
  )
}
