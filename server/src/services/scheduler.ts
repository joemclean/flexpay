import type { Db } from '../db.js';
import { newId } from '../lib/crypto.js';
import { nextOccurrence, type ScheduleRule } from '../lib/time.js';
import type { ExecutionRow, ParentRow, PotRow, ScheduleRow } from '../types.js';
import { postTransaction } from './ledger.js';

export function ruleOf(s: Pick<ScheduleRow, 'frequency' | 'weekday' | 'day_of_month' | 'timezone' | 'run_hour' | 'start_date' | 'end_date'>): ScheduleRule {
  return {
    frequency: s.frequency,
    weekday: s.weekday,
    dayOfMonth: s.day_of_month,
    timezone: s.timezone,
    runHour: s.run_hour,
    startDate: s.start_date,
    endDate: s.end_date,
  };
}

/** Next run strictly after `after`; null + 'completed' when the schedule has ended. */
export function computeNext(s: Parameters<typeof ruleOf>[0], after: Date): { nextRunAt: string | null; ended: boolean } {
  const next = nextOccurrence(ruleOf(s), after);
  return next ? { nextRunAt: next.at.toISOString(), ended: false } : { nextRunAt: null, ended: true };
}

export function scheduleTitle(s: Pick<ScheduleRow, 'frequency' | 'memo'>): string {
  if (s.memo) return s.memo;
  const label = { daily: 'Daily', weekly: 'Weekly', biweekly: 'Fortnightly', monthly: 'Monthly' }[s.frequency];
  return `${label} allowance`;
}

interface ExecuteOptions {
  trigger: 'schedule' | 'run_now';
  scheduledFor: string | null;
  now?: Date;
}

/**
 * Execute one occurrence atomically. The idempotency key makes re-delivery safe:
 * a duplicate returns the existing execution instead of paying twice.
 */
export function executeOccurrence(db: Db, scheduleId: string, opts: ExecuteOptions): ExecutionRow {
  const now = opts.now ?? new Date();
  return db.tx(() => {
    const s = db.get<ScheduleRow>('SELECT * FROM recurring_schedules WHERE id = ?', scheduleId);
    if (!s) throw new Error(`schedule ${scheduleId} not found`);
    const key =
      opts.trigger === 'schedule' ? `${s.id}:${opts.scheduledFor}` : `${s.id}:run_now:${newId('run')}`;
    const existing = db.get<ExecutionRow>('SELECT * FROM recurring_executions WHERE idempotency_key = ?', key);
    if (existing) return existing;

    const occurrenceIndex = s.occurrence_count + 1;
    const pot = db.get<PotRow>('SELECT * FROM pots WHERE id = ?', s.pot_id);
    const payer = s.created_by.startsWith('parent:')
      ? db.get<ParentRow>('SELECT * FROM parents WHERE id = ?', s.created_by.slice('parent:'.length))
      : undefined;

    let execution: ExecutionRow;
    if (!pot || pot.archived_at) {
      execution = {
        id: newId('exe'),
        schedule_id: s.id,
        occurrence_index: occurrenceIndex,
        idempotency_key: key,
        trigger: opts.trigger,
        status: 'failed',
        transaction_id: null,
        error_message: 'Destination pot is no longer available',
        scheduled_for: opts.scheduledFor,
        executed_at: now.toISOString(),
      };
    } else {
      const tx = postTransaction(db, {
        familyId: s.family_id,
        childId: s.child_id,
        potId: pot.id,
        amountCents: s.amount_cents,
        kind: 'allowance',
        title: scheduleTitle(s),
        category: 'income',
        counterparty: payer?.name ?? null,
        relatedType: 'schedule',
        relatedId: s.id,
        createdBy: 'system',
        createdAt: now.toISOString(),
      });
      execution = {
        id: newId('exe'),
        schedule_id: s.id,
        occurrence_index: occurrenceIndex,
        idempotency_key: key,
        trigger: opts.trigger,
        status: 'completed',
        transaction_id: tx.id,
        error_message: null,
        scheduled_for: opts.scheduledFor,
        executed_at: now.toISOString(),
      };
    }
    db.insert('recurring_executions', { ...execution });

    const patch: Partial<ScheduleRow> = {
      occurrence_count: occurrenceIndex,
      last_run_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    if (opts.trigger === 'schedule' && opts.scheduledFor) {
      const next = computeNext(s, new Date(opts.scheduledFor));
      patch.next_run_at = next.nextRunAt;
      if (next.ended) patch.status = 'completed';
    }
    db.update('recurring_schedules', s.id, patch);
    return execution;
  });
}

/** Execute every active schedule whose next run is due. Returns executions created. */
export function runDueSchedules(db: Db, now = new Date()): ExecutionRow[] {
  const results: ExecutionRow[] = [];
  // Loop so a schedule that fell behind (e.g. server downtime) catches up one occurrence at a time.
  for (let guard = 0; guard < 500; guard++) {
    const due = db.all<ScheduleRow>(
      "SELECT * FROM recurring_schedules WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at LIMIT 50",
      now.toISOString(),
    );
    if (due.length === 0) break;
    for (const s of due) {
      try {
        results.push(executeOccurrence(db, s.id, { trigger: 'schedule', scheduledFor: s.next_run_at, now }));
      } catch (err) {
        console.error(`[scheduler] failed to execute ${s.id}:`, err);
        // Avoid a hot loop on a poisoned schedule: pause it for a human to look at.
        db.update('recurring_schedules', s.id, { status: 'paused', updated_at: now.toISOString() });
      }
    }
  }
  return results;
}

export function startScheduler(db: Db, intervalMs: number): () => void {
  const tick = () => {
    try {
      const executed = runDueSchedules(db);
      if (executed.length > 0) console.log(`[scheduler] executed ${executed.length} scheduled payment(s)`);
    } catch (err) {
      console.error('[scheduler] tick failed:', err);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
