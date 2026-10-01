import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return <img src="/flexfund-mark.svg" alt="" aria-hidden className={cn('size-8 shrink-0', className)} />
}

/** The FlexFund lockup: circle-and-square mark with the italic wordmark. */
export function Wordmark({ className, sub }: { className?: string; sub?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-brand text-xl font-semibold tracking-tight">FlexFund</span>
        {sub ? <span className="mt-0.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">{sub}</span> : null}
      </span>
    </span>
  )
}
