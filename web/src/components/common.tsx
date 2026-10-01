import { AlertCircleIcon, RotateCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

export function Money({
  cents,
  signed,
  className,
  muted,
  strike,
}: {
  cents: number
  signed?: boolean
  className?: string
  muted?: boolean
  strike?: boolean
}) {
  return (
    <span
      className={cn(
        'tabular font-medium',
        signed && cents > 0 && !muted && 'text-success',
        muted && 'text-muted-foreground',
        strike && 'line-through decoration-1',
        className,
      )}
    >
      {money(cents, { signed })}
    </span>
  )
}

export function EmojiAvatar({ emoji, className, label }: { emoji: string; className?: string; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xl leading-none', className)}
    >
      {emoji}
    </span>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  leading,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  leading?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'brand'
}) {
  return (
    <Card className={cn('gap-0 py-4 sm:py-5', tone === 'brand' && 'border-transparent bg-primary text-primary-foreground')}>
      <CardContent className="flex items-start justify-between gap-3 px-4 sm:px-5">
        <div className="min-w-0">
          <p className={cn('text-sm font-medium', tone === 'brand' ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{label}</p>
          <p className="tabular mt-1.5 truncate text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
          {hint ? (
            <p className={cn('mt-1 text-xs', tone === 'brand' ? 'text-primary-foreground/85' : 'text-muted-foreground')}>{hint}</p>
          ) : null}
        </div>
        {icon ? (
          <span
            className={cn(
              'hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex [&_svg]:size-4.5',
              tone === 'brand' ? 'bg-white/15' : 'bg-brand-soft text-brand-text',
            )}
          >
            {icon}
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircleIcon />
        </EmptyMedia>
        <EmptyTitle>Couldn’t load this</EmptyTitle>
        <EmptyDescription>{errorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCwIcon /> Try again
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <Empty className={cn('border border-dashed py-10', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}
