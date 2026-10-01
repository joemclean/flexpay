import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { MoneyInput } from '@/components/inputs'
import { patch, post } from '@/lib/api'
import { centsToInput, FREQUENCY_LABELS, hourLabel, money, ordinal, parseDollars, scheduleSummary, WEEKDAYS } from '@/lib/format'
import { useApiMutation } from '@/lib/queries'
import type { Frequency, Pot, Schedule } from '@/lib/types'

const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function ScheduleDialog({ childId, childName, pots, schedule, trigger }: { childId: string; childName: string; pots: Pot[]; schedule?: Schedule; trigger: ReactNode }) {
  const editing = Boolean(schedule)
  const spending = pots.find((p) => p.isSpending)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('weekly')
  const [weekday, setWeekday] = useState('6')
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [runHour, setRunHour] = useState('8')
  const [potId, setPotId] = useState(spending?.id ?? '')
  const [startDate, setStartDate] = useState(todayLocal())
  const [endDate, setEndDate] = useState('')
  const [memo, setMemo] = useState('')

  const reset = () => {
    setAmount(centsToInput(schedule?.amountCents ?? 1000))
    setFrequency(schedule?.frequency ?? 'weekly')
    setWeekday(String(schedule?.weekday ?? 6))
    setDayOfMonth(String(schedule?.dayOfMonth ?? 1))
    setRunHour(String(schedule?.runHour ?? 8))
    setPotId(schedule?.potId ?? spending?.id ?? '')
    setStartDate(schedule?.startDate ?? todayLocal())
    setEndDate(schedule?.endDate ?? '')
    setMemo(schedule?.memo ?? '')
  }

  const cents = parseDollars(amount)
  const amountInvalid = amount !== '' && (cents === null || cents <= 0 || cents > 100_000)
  const datesInvalid = Boolean(endDate && startDate && endDate < startDate)
  const needsWeekday = frequency === 'weekly' || frequency === 'biweekly'

  const save = useApiMutation(
    () => {
      if (schedule) {
        return patch<Schedule>(`/schedules/${schedule.id}`, {
          amountCents: cents,
          potId,
          endDate: endDate || null,
          memo: memo.trim() || null,
          runHour: Number(runHour),
          ...(needsWeekday ? { weekday: Number(weekday) } : {}),
          ...(frequency === 'monthly' ? { dayOfMonth: Number(dayOfMonth) } : {}),
        })
      }
      return post<Schedule>(`/children/${childId}/schedules`, {
        amountCents: cents,
        frequency,
        weekday: needsWeekday ? Number(weekday) : null,
        dayOfMonth: frequency === 'monthly' ? Number(dayOfMonth) : null,
        runHour: Number(runHour),
        potId,
        startDate,
        endDate: endDate || null,
        memo: memo.trim() || null,
      })
    },
    {
      success: (s) => (editing ? 'Allowance updated' : `${money(s.amountCents)} ${FREQUENCY_LABELS[s.frequency].toLowerCase()} allowance set up for ${childName}`),
      onSuccess: () => setOpen(false),
    },
  )

  const preview = cents ? `${money(cents)} · ${scheduleSummary({ frequency, weekday: Number(weekday), dayOfMonth: Number(dayOfMonth), runHour: Number(runHour) })}` : null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) reset()
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (cents && !amountInvalid && !datesInvalid && potId) save.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit allowance' : 'Set up an allowance'}</DialogTitle>
            <DialogDescription>Recurring money for {childName}, paid automatically on schedule.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-4 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={amountInvalid || undefined}>
                <FieldLabel htmlFor="sch-amount">Amount</FieldLabel>
                <MoneyInput id="sch-amount" value={amount} onChange={setAmount} invalid={amountInvalid} autoFocus />
                {amountInvalid ? <FieldError>Enter up to $1,000</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="sch-frequency">How often</FieldLabel>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)} disabled={editing}>
                  <SelectTrigger id="sch-frequency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FREQUENCY_LABELS) as Frequency[]).map((f) => (
                      <SelectItem key={f} value={f}>
                        {FREQUENCY_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {needsWeekday ? (
                <Field>
                  <FieldLabel htmlFor="sch-weekday">Day</FieldLabel>
                  <Select value={weekday} onValueChange={setWeekday}>
                    <SelectTrigger id="sch-weekday" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : frequency === 'monthly' ? (
                <Field>
                  <FieldLabel htmlFor="sch-dom">Day of month</FieldLabel>
                  <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                    <SelectTrigger id="sch-dom" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => (
                        <SelectItem key={i} value={String(i + 1)}>
                          {ordinal(i + 1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="sch-hour">Time</FieldLabel>
                <Select value={runHour} onValueChange={setRunHour}>
                  <SelectTrigger id="sch-hour" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, h) => (
                      <SelectItem key={h} value={String(h)}>
                        {hourLabel(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="sch-pot">Paid into</FieldLabel>
              <Select value={potId} onValueChange={setPotId}>
                <SelectTrigger id="sch-pot" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pots.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.emoji} {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="sch-start">Starts</FieldLabel>
                <Input id="sch-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={editing} required />
              </Field>
              <Field data-invalid={datesInvalid || undefined}>
                <FieldLabel htmlFor="sch-end">Ends (optional)</FieldLabel>
                <Input id="sch-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} aria-invalid={datesInvalid || undefined} />
                {datesInvalid ? <FieldError>Must be after the start date</FieldError> : null}
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="sch-memo">Label (optional)</FieldLabel>
              <Input id="sch-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Weekly allowance" maxLength={60} />
              {preview ? <FieldDescription>{preview}</FieldDescription> : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!cents || amountInvalid || datesInvalid || !potId || save.isPending}>
              {save.isPending ? <Spinner /> : null} {editing ? 'Save changes' : 'Start allowance'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
