import { CalendarClockIcon, CalendarSyncIcon, HistoryIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, XIcon, ZapIcon } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/common'
import { Confirm } from '@/components/confirm'
import { ScheduleDialog } from '@/components/dialogs/schedule-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { post } from '@/lib/api'
import { dateTime, money, relativeDay, scheduleSummary, shortDate } from '@/lib/format'
import { useApiMutation, useExecutions, useSchedule, useSchedules } from '@/lib/queries'
import type { ChildDetail, Schedule } from '@/lib/types'

const STATUS_VARIANT = { active: 'default', paused: 'outline', canceled: 'outline', completed: 'secondary' } as const

const scheduleLabel = (s: Schedule) =>
  s.memo ?? `${{ daily: 'Daily', weekly: 'Weekly', biweekly: 'Fortnightly', monthly: 'Monthly' }[s.frequency]} allowance`

function ScheduleDetails({ schedule, onClose }: { schedule: Schedule | null; onClose: () => void }) {
  const detail = useSchedule(schedule?.id ?? null)
  const executions = useExecutions(schedule?.id ?? null)
  return (
    <Sheet open={Boolean(schedule)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{schedule ? `${money(schedule.amountCents)} · ${scheduleLabel(schedule)}` : 'Allowance'}</SheetTitle>
          <SheetDescription>{schedule ? scheduleSummary(schedule) : null}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4 pb-6">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CalendarClockIcon className="size-4 text-brand-text" /> Coming up
            </h3>
            {detail.isPending ? (
              <ListSkeleton rows={3} />
            ) : detail.data?.upcoming?.length ? (
              <ol className="flex flex-col gap-1.5">
                {detail.data.upcoming.map((u, i) => (
                  <li key={u} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>{dateTime(u)}</span>
                    <span className="tabular font-medium">{i === 0 ? 'Next · ' : ''}{money(detail.data!.amountCents)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming payments — this allowance is {detail.data?.status}.</p>
            )}
          </section>
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <HistoryIcon className="size-4 text-brand-text" /> Payment log
            </h3>
            {executions.isPending ? (
              <ListSkeleton rows={4} />
            ) : !executions.data?.length ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executions.data.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="tabular text-muted-foreground">{e.occurrenceIndex}</TableCell>
                      <TableCell>{relativeDay(e.executedAt)}</TableCell>
                      <TableCell>{e.trigger === 'run_now' ? 'Paid now' : 'Scheduled'}</TableCell>
                      <TableCell className="text-right">
                        {e.status === 'completed' ? (
                          <Badge variant="secondary">Paid</Badge>
                        ) : (
                          <Badge variant="destructive" title={e.errorMessage ?? undefined}>
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Each payment has a unique idempotency key, so a retry can never pay twice.</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ScheduleCard({ child, schedule, onDetails }: { child: ChildDetail; schedule: Schedule; onDetails: () => void }) {
  const action = useApiMutation((a: 'pause' | 'resume' | 'cancel' | 'run-now') => post(`/schedules/${schedule.id}/${a}`), {
    success: (_r, a) =>
      ({
        pause: 'Allowance paused',
        resume: 'Allowance resumed',
        cancel: 'Allowance canceled',
        'run-now': `${money(schedule.amountCents)} paid to ${child.name}`,
      })[a],
  })
  const closed = schedule.status === 'canceled' || schedule.status === 'completed'
  return (
    <Card className="gap-4">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="tabular text-2xl">{money(schedule.amountCents)}</CardTitle>
            <CardDescription className="mt-1">{scheduleLabel(schedule)}</CardDescription>
          </div>
          <Badge variant={STATUS_VARIANT[schedule.status]} className="capitalize">
            {schedule.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="flex items-center gap-2">
          <CalendarSyncIcon className="size-4 text-muted-foreground" /> {scheduleSummary(schedule)}
        </p>
        <p className="text-muted-foreground">
          Into <span className="text-foreground">{schedule.potName ?? 'General'}</span> · since {shortDate(schedule.startDate)}
          {schedule.endDate ? ` · until ${shortDate(schedule.endDate)}` : ''}
        </p>
        <p className="text-muted-foreground">
          {schedule.status === 'active' && schedule.nextRunAt ? (
            <>
              Next payment <span className="font-medium text-foreground">{relativeDay(schedule.nextRunAt)}</span>
            </>
          ) : schedule.status === 'paused' ? (
            'Paused — no payments until you resume.'
          ) : (
            'This allowance has ended.'
          )}
          {' · '}
          {schedule.occurrenceCount} paid so far
        </p>
      </CardContent>
      <CardFooter className="flex-wrap gap-2">
        {!closed ? (
          <>
            <Button size="sm" onClick={() => action.mutate('run-now')} disabled={action.isPending}>
              <ZapIcon /> Pay now
            </Button>
            {schedule.status === 'active' ? (
              <Button size="sm" variant="outline" onClick={() => action.mutate('pause')} disabled={action.isPending}>
                <PauseIcon /> Pause
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => action.mutate('resume')} disabled={action.isPending}>
                <PlayIcon /> Resume
              </Button>
            )}
            <ScheduleDialog
              childId={child.id}
              childName={child.name}
              pots={child.pots}
              schedule={schedule}
              trigger={
                <Button size="sm" variant="outline">
                  <PencilIcon /> Edit
                </Button>
              }
            />
          </>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDetails}>
          <HistoryIcon /> Details
        </Button>
        {!closed ? (
          <Confirm
            title="Cancel this allowance?"
            description={`${child.name} won’t receive any more ${money(schedule.amountCents)} payments. Past payments stay in their history.`}
            confirmLabel="Cancel allowance"
            onConfirm={() => action.mutate('cancel')}
            trigger={
              <Button size="sm" variant="ghost" className="ml-auto text-destructive">
                <XIcon /> Cancel
              </Button>
            }
          />
        ) : null}
      </CardFooter>
    </Card>
  )
}

export function AllowanceTab({ child }: { child: ChildDetail }) {
  const schedules = useSchedules(child.id)
  const [selected, setSelected] = useState<Schedule | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-sm text-muted-foreground">
          Allowances are paid automatically on schedule. Pause anytime, or pay early with “Pay now”.
        </p>
        <ScheduleDialog
          childId={child.id}
          childName={child.name}
          pots={child.pots}
          trigger={
            <Button>
              <PlusIcon /> New allowance
            </Button>
          }
        />
      </div>
      {schedules.isError ? (
        <ErrorState error={schedules.error} onRetry={() => void schedules.refetch()} />
      ) : schedules.isPending ? (
        <ListSkeleton rows={3} />
      ) : schedules.data.length === 0 ? (
        <EmptyState icon={<CalendarSyncIcon />} title="No allowance yet" description={`Set up a weekly allowance and ${child.name} gets paid automatically.`} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {schedules.data.map((s) => (
            <ScheduleCard key={s.id} child={child} schedule={s} onDetails={() => setSelected(s)} />
          ))}
        </div>
      )}
      <ScheduleDetails schedule={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
