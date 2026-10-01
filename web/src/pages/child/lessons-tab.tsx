import { CheckCircle2Icon, CircleDashedIcon, GraduationCapIcon } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorState, ListSkeleton } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { money, shortDate } from '@/lib/format'
import { useLessons } from '@/lib/queries'
import type { ChildDetail } from '@/lib/types'
import { cn } from '@/lib/utils'

export function LessonsTab({ child }: { child: ChildDetail }) {
  const lessons = useLessons(child.id)
  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => void lessons.refetch()} />
  const items = lessons.data?.items ?? []
  const done = items.filter((l) => l.completed).length
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCapIcon className="size-5 text-brand-text" /> Money lessons
          </CardTitle>
          <CardDescription>
            {child.name} earns {lessons.data ? money(lessons.data.rewardCents) : '…'} for passing each lesson quiz the first time.{' '}
            <Link to="/settings" className="font-medium text-brand-text underline-offset-4 hover:underline">
              Change reward
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-1.5 flex justify-between text-sm">
            <span className="font-medium">
              {done} of {items.length} complete
            </span>
            <span className="text-muted-foreground">{items.length ? Math.round((done / items.length) * 100) : 0}%</span>
          </div>
          <Progress value={items.length ? (done / items.length) * 100 : 0} aria-label="Lessons complete" />
        </CardContent>
      </Card>
      {lessons.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((l) => (
            <li key={l.id}>
              <Card className={cn('h-full gap-3 py-4', l.completed && 'border-success/30')}>
                <CardContent className="flex gap-3 px-4">
                  <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-2xl">
                    {l.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {l.title}
                      {l.completed ? (
                        <CheckCircle2Icon className="size-4 text-success" aria-label="Completed" />
                      ) : (
                        <CircleDashedIcon className="size-4 text-muted-foreground" aria-label="Not started" />
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{l.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{l.minutes} min</Badge>
                      {l.completed ? (
                        <>
                          <Badge variant="secondary">
                            Score {l.score}/{l.total}
                          </Badge>
                          {l.rewardCents ? <Badge variant="secondary">+{money(l.rewardCents)}</Badge> : null}
                          {l.completedAt ? <Badge variant="outline">{shortDate(l.completedAt)}</Badge> : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
