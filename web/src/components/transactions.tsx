import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CATEGORY_EMOJI, CATEGORY_LABELS, DECLINE_LABELS, KIND_LABELS, relativeDay } from '@/lib/format'
import type { Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EmojiAvatar, Money } from './common'

function txEmoji(t: Transaction): string {
  if (t.kind === 'allowance') return '📅'
  if (t.kind === 'reward') return '⭐️'
  if (t.kind === 'lesson_reward') return '🎓'
  if (t.kind === 'transfer') return '🔁'
  if (t.kind === 'p2p_sent') return '📤'
  if (t.kind === 'p2p_received') return '📥'
  return CATEGORY_EMOJI[t.category] ?? '✨'
}

function subtitle(t: Transaction, showChild: boolean): string {
  const parts = [KIND_LABELS[t.kind]]
  if (showChild && t.childName) parts.unshift(t.childName)
  if (t.counterparty && t.kind !== 'p2p_sent' && t.kind !== 'p2p_received') parts.push(t.counterparty)
  return parts.join(' · ')
}

export function DeclinedBadge({ reason }: { reason: string | null }) {
  return (
    <Badge variant="destructive" className="font-medium">
      Declined{reason ? ` · ${DECLINE_LABELS[reason] ?? reason}` : ''}
    </Badge>
  )
}

export function TransactionList({
  items,
  showChild = false,
  className,
}: {
  items: Transaction[]
  showChild?: boolean
  className?: string
}) {
  return (
    <ul className={cn('divide-y', className)}>
      {items.map((t) => {
        const declined = t.status === 'declined'
        return (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <EmojiAvatar emoji={txEmoji(t)} className={cn('size-9 text-base', declined && 'bg-destructive/10')} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {subtitle(t, showChild)} · {relativeDay(t.createdAt)}
              </p>
              {t.memo && t.kind !== 'transfer' ? <p className="truncate text-xs text-muted-foreground italic">“{t.memo}”</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Money cents={t.amountCents} signed muted={declined} strike={declined} className="text-sm" />
              {declined ? <DeclinedBadge reason={t.declineReason} /> : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function TransactionsTable({ items, showChild = true }: { items: Transaction[]; showChild?: boolean }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Date</TableHead>
              <TableHead>Description</TableHead>
              {showChild ? <TableHead>Child</TableHead> : null}
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((t) => {
              const declined = t.status === 'declined'
              return (
                <TableRow key={t.id} className={cn(declined && 'bg-destructive/[0.03]')}>
                  <TableCell className="text-muted-foreground">{relativeDay(t.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden className="text-base">
                        {txEmoji(t)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.title}</p>
                        {t.memo || (t.counterparty && t.kind === 'fee') ? (
                          <p className="truncate text-xs text-muted-foreground">{t.memo ?? t.counterparty}</p>
                        ) : null}
                      </div>
                      {declined ? <DeclinedBadge reason={t.declineReason} /> : null}
                    </div>
                  </TableCell>
                  {showChild ? <TableCell>{t.childName}</TableCell> : null}
                  <TableCell className="text-muted-foreground">{CATEGORY_LABELS[t.category]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {KIND_LABELS[t.kind]}
                    {t.potName && !t.potName.startsWith('General') && t.kind !== 'card_purchase' ? ` · ${t.potName}` : ''}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={t.amountCents} signed muted={declined} strike={declined} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <TransactionList items={items} showChild={showChild} className="md:hidden" />
    </>
  )
}
