import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, audit } from '../auth.js';
import { newId } from '../lib/crypto.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { isValidTimeZone, localDate } from '../lib/time.js';
import { body, cents, emoji, localDateString, name, optionalCents } from '../lib/validate.js';
import { challengesWithStatus, getChildInFamily, toChallenge } from '../services/children.js';
import { getPotForChild, spendingPot } from '../services/ledger.js';
import { computeNext, executeOccurrence } from '../services/scheduler.js';
import type { ChallengeRow, CompletionRow, ContactRow, ExecutionRow, MoneyRequestRow, ParentRow, PotRow, ScheduleRow } from '../types.js';
import { toContact, toExecution, toMoneyRequest, toSchedule } from '../types.js';

export const activityRoutes = new Hono<AppEnv>();

type DbT = AppEnv['Variables']['db'];
const actor = (c: { get(k: 'parent'): ParentRow }) => `parent:${c.get('parent').id}`;

// ---- Challenges (chores) -------------------------------------------------------------

function challengeInFamily(db: DbT, familyId: string, id: string): ChallengeRow {
  const ch = db.get<ChallengeRow>(
    'SELECT ch.* FROM challenges ch JOIN children c ON c.id = ch.child_id WHERE ch.id = ? AND c.family_id = ?',
    id,
    familyId,
  );
  if (!ch) throw notFound('Challenge');
  return ch;
}

activityRoutes.get('/children/:id/challenges', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  const withStatus = new Map(challengesWithStatus(db, child, family.timezone).map((x) => [x.challenge.id, x.status]));
  const all = db.all<ChallengeRow>('SELECT * FROM challenges WHERE child_id = ? AND active = 1 ORDER BY created_at', child.id);
  const history = db.all<CompletionRow & { title: string; emoji: string; reward_cents: number }>(
    `SELECT cc.*, ch.title, ch.emoji, ch.reward_cents FROM challenge_completions cc
       JOIN challenges ch ON ch.id = cc.challenge_id
      WHERE cc.child_id = ? ORDER BY cc.submitted_at DESC LIMIT 30`,
    child.id,
  );
  return c.json({
    items: all.map((ch) => {
      const count = db.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM challenge_completions WHERE challenge_id = ? AND status = 'approved'",
        ch.id,
      )?.n;
      return { ...toChallenge(ch, withStatus.get(ch.id) ?? 'done'), completedCount: count ?? 0 };
    }),
    history: history.map((h) => ({
      id: h.id,
      challengeId: h.challenge_id,
      title: h.title,
      emoji: h.emoji,
      rewardCents: h.reward_cents,
      status: h.status,
      submittedAt: h.submitted_at,
      reviewedAt: h.reviewed_at,
    })),
  });
});

const challengeInput = z.object({
  title: z.string().trim().min(1).max(60),
  emoji: emoji.default('⭐️'),
  rewardCents: optionalCents.max(10_000).default(0),
  recurrence: z.enum(['once', 'daily', 'weekly']).default('once'),
  potId: z.string().nullable().optional(),
});

activityRoutes.post('/children/:id/challenges', async (c) => {
  const input = await body(c, challengeInput);
  const db = c.get('db');
  const child = getChildInFamily(db, c.get('family').id, c.req.param('id'));
  if (input.potId) getPotForChild(db, child.id, input.potId);
  const row: ChallengeRow = {
    id: newId('chl'),
    child_id: child.id,
    title: input.title,
    emoji: input.emoji,
    reward_cents: input.rewardCents,
    recurrence: input.recurrence,
    pot_id: input.potId ?? null,
    active: 1,
    created_at: new Date().toISOString(),
  };
  db.insert('challenges', { ...row });
  return c.json(toChallenge(row, 'available'), 201);
});

activityRoutes.patch('/challenges/:id', async (c) => {
  const input = await body(c, challengeInput.partial());
  const db = c.get('db');
  const ch = challengeInFamily(db, c.get('family').id, c.req.param('id'));
  if (input.potId) getPotForChild(db, ch.child_id, input.potId);
  db.update('challenges', ch.id, {
    title: input.title,
    emoji: input.emoji,
    reward_cents: input.rewardCents,
    recurrence: input.recurrence,
    pot_id: input.potId === undefined ? undefined : input.potId,
  });
  return c.json(toChallenge(db.get<ChallengeRow>('SELECT * FROM challenges WHERE id = ?', ch.id)!));
});

activityRoutes.delete('/challenges/:id', (c) => {
  const db = c.get('db');
  const ch = challengeInFamily(db, c.get('family').id, c.req.param('id'));
  db.tx(() => {
    db.run('UPDATE challenges SET active = 0 WHERE id = ?', ch.id);
    db.run("UPDATE challenge_completions SET status = 'rejected', reviewed_at = ? WHERE challenge_id = ? AND status = 'pending'", new Date().toISOString(), ch.id);
  });
  return c.json({ ok: true });
});

// ---- Contacts -------------------------------------------------------------------------

function contactInFamily(db: DbT, familyId: string, id: string): ContactRow {
  const ct = db.get<ContactRow>(
    'SELECT ct.* FROM contacts ct JOIN children c ON c.id = ct.child_id WHERE ct.id = ? AND c.family_id = ?',
    id,
    familyId,
  );
  if (!ct) throw notFound('Contact');
  return ct;
}

activityRoutes.get('/children/:id/contacts', (c) => {
  const db = c.get('db');
  const child = getChildInFamily(db, c.get('family').id, c.req.param('id'));
  const rows = db.all<ContactRow>('SELECT * FROM contacts WHERE child_id = ? ORDER BY is_favorite DESC, name COLLATE NOCASE', child.id);
  return c.json({ items: rows.map(toContact) });
});

const contactInput = z.object({
  name,
  avatar: emoji.default('🙂'),
  relationship: z.enum(['parent', 'family', 'friend']).default('friend'),
  isFavorite: z.boolean().default(false),
});

activityRoutes.post('/children/:id/contacts', async (c) => {
  const input = await body(c, contactInput);
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  const row: ContactRow = {
    id: newId('con'),
    child_id: child.id,
    name: input.name,
    avatar: input.avatar,
    relationship: input.relationship,
    is_favorite: input.isFavorite ? 1 : 0,
    created_at: new Date().toISOString(),
  };
  db.insert('contacts', { ...row });
  audit(db, family.id, actor(c), 'contact.added', { type: 'contact', id: row.id }, { child: child.name, name: row.name });
  return c.json(toContact(row), 201);
});

activityRoutes.patch('/contacts/:id', async (c) => {
  const input = await body(c, contactInput.partial());
  const db = c.get('db');
  const ct = contactInFamily(db, c.get('family').id, c.req.param('id'));
  db.update('contacts', ct.id, {
    name: input.name,
    avatar: input.avatar,
    relationship: input.relationship,
    is_favorite: input.isFavorite,
  });
  return c.json(toContact(db.get<ContactRow>('SELECT * FROM contacts WHERE id = ?', ct.id)!));
});

activityRoutes.delete('/contacts/:id', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const ct = contactInFamily(db, family.id, c.req.param('id'));
  db.tx(() => {
    db.run("UPDATE money_requests SET status = 'canceled' WHERE contact_id = ? AND status = 'pending'", ct.id);
    db.run('DELETE FROM contacts WHERE id = ?', ct.id);
  });
  audit(db, family.id, actor(c), 'contact.removed', { type: 'contact', id: ct.id }, { name: ct.name });
  return c.json({ ok: true });
});

activityRoutes.get('/children/:id/money-requests', (c) => {
  const db = c.get('db');
  const child = getChildInFamily(db, c.get('family').id, c.req.param('id'));
  const rows = db.all<MoneyRequestRow>('SELECT * FROM money_requests WHERE child_id = ? ORDER BY created_at DESC LIMIT 50', child.id);
  const contacts = new Map(db.all<ContactRow>('SELECT * FROM contacts WHERE child_id = ?', child.id).map((ct) => [ct.id, ct]));
  return c.json({ items: rows.map((r) => toMoneyRequest(r, contacts.get(r.contact_id))) });
});

// ---- Allowance (recurring schedules) -------------------------------------------------------

function scheduleInFamily(db: DbT, familyId: string, id: string): ScheduleRow {
  const s = db.get<ScheduleRow>('SELECT * FROM recurring_schedules WHERE id = ? AND family_id = ?', id, familyId);
  if (!s) throw notFound('Schedule');
  return s;
}

function scheduleView(db: DbT, s: ScheduleRow) {
  const pot = db.get<PotRow>('SELECT * FROM pots WHERE id = ?', s.pot_id);
  return toSchedule(s, pot?.name);
}

const scheduleInput = z
  .object({
    amountCents: cents.max(100_000),
    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    potId: z.string().optional(),
    startDate: localDateString.optional(),
    endDate: localDateString.nullable().optional(),
    runHour: z.number().int().min(0).max(23).default(8),
    timezone: z.string().refine(isValidTimeZone, 'Unknown timezone').optional(),
    memo: z.string().trim().max(60).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.frequency === 'weekly' || v.frequency === 'biweekly') && (v.weekday === null || v.weekday === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['weekday'], message: 'Choose a day of the week' });
    }
    if (v.frequency === 'monthly' && !v.dayOfMonth) {
      ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Choose a day of the month' });
    }
    if (v.endDate && v.startDate && v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after the start date' });
    }
  });

activityRoutes.get('/children/:id/schedules', (c) => {
  const db = c.get('db');
  const child = getChildInFamily(db, c.get('family').id, c.req.param('id'));
  const rows = db.all<ScheduleRow>(
    "SELECT * FROM recurring_schedules WHERE child_id = ? AND status != 'canceled' ORDER BY created_at",
    child.id,
  );
  return c.json({ items: rows.map((s) => scheduleView(db, s)) });
});

activityRoutes.post('/children/:id/schedules', async (c) => {
  const input = await body(c, scheduleInput);
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  const pot = input.potId ? getPotForChild(db, child.id, input.potId) : spendingPot(db, child.id);
  const timezone = input.timezone ?? family.timezone;
  const now = new Date();
  const base = {
    frequency: input.frequency,
    weekday: input.frequency === 'weekly' || input.frequency === 'biweekly' ? (input.weekday ?? null) : null,
    day_of_month: input.frequency === 'monthly' ? (input.dayOfMonth ?? null) : null,
    timezone,
    run_hour: input.runHour,
    start_date: input.startDate ?? localDate(now, timezone),
    end_date: input.endDate ?? null,
  };
  const next = computeNext(base, now);
  if (next.ended) throw badRequest('This schedule would never run — check the dates');
  const row: ScheduleRow = {
    id: newId('sch'),
    family_id: family.id,
    child_id: child.id,
    pot_id: pot.id,
    amount_cents: input.amountCents,
    ...base,
    memo: input.memo ?? null,
    status: 'active',
    next_run_at: next.nextRunAt,
    last_run_at: null,
    occurrence_count: 0,
    created_by: actor(c),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  db.insert('recurring_schedules', { ...row });
  audit(db, family.id, actor(c), 'schedule.created', { type: 'schedule', id: row.id }, {
    child: child.name,
    amountCents: row.amount_cents,
    frequency: row.frequency,
  });
  return c.json(scheduleView(db, row), 201);
});

activityRoutes.get('/schedules/:id', (c) => {
  const db = c.get('db');
  const s = scheduleInFamily(db, c.get('family').id, c.req.param('id'));
  // Preview of the next few occurrences.
  const upcoming: string[] = [];
  if (s.status === 'active' && s.next_run_at) {
    let cursor = s.next_run_at;
    upcoming.push(cursor);
    for (let i = 0; i < 4; i++) {
      const n = computeNext(s, new Date(cursor));
      if (!n.nextRunAt) break;
      upcoming.push(n.nextRunAt);
      cursor = n.nextRunAt;
    }
  }
  return c.json({ ...scheduleView(db, s), upcoming });
});

activityRoutes.patch('/schedules/:id', async (c) => {
  const input = await body(
    c,
    z.object({
      amountCents: cents.max(100_000).optional(),
      potId: z.string().optional(),
      endDate: localDateString.nullable().optional(),
      memo: z.string().trim().max(60).nullable().optional(),
      weekday: z.number().int().min(0).max(6).optional(),
      dayOfMonth: z.number().int().min(1).max(31).optional(),
      runHour: z.number().int().min(0).max(23).optional(),
    }),
  );
  const db = c.get('db');
  const family = c.get('family');
  const s = scheduleInFamily(db, family.id, c.req.param('id'));
  if (s.status === 'canceled' || s.status === 'completed') throw conflict('schedule_closed', 'This schedule has ended');
  if (input.potId) getPotForChild(db, s.child_id, input.potId);
  const merged: ScheduleRow = {
    ...s,
    amount_cents: input.amountCents ?? s.amount_cents,
    pot_id: input.potId ?? s.pot_id,
    end_date: input.endDate === undefined ? s.end_date : input.endDate,
    memo: input.memo === undefined ? s.memo : input.memo,
    weekday: input.weekday !== undefined && (s.frequency === 'weekly' || s.frequency === 'biweekly') ? input.weekday : s.weekday,
    day_of_month: input.dayOfMonth !== undefined && s.frequency === 'monthly' ? input.dayOfMonth : s.day_of_month,
    run_hour: input.runHour ?? s.run_hour,
  };
  // Timing changes recompute the next run safely from now.
  const next = s.status === 'active' ? computeNext(merged, new Date()) : { nextRunAt: s.next_run_at, ended: false };
  db.update('recurring_schedules', s.id, {
    amount_cents: merged.amount_cents,
    pot_id: merged.pot_id,
    end_date: merged.end_date,
    memo: merged.memo,
    weekday: merged.weekday,
    day_of_month: merged.day_of_month,
    run_hour: merged.run_hour,
    next_run_at: next.nextRunAt,
    status: next.ended ? 'completed' : s.status,
    updated_at: new Date().toISOString(),
  });
  audit(db, family.id, actor(c), 'schedule.updated', { type: 'schedule', id: s.id }, input);
  return c.json(scheduleView(db, scheduleInFamily(db, family.id, s.id)));
});

activityRoutes.post('/schedules/:id/:action{pause|resume|cancel}', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const s = scheduleInFamily(db, family.id, c.req.param('id'));
  const action = c.req.param('action') as 'pause' | 'resume' | 'cancel';
  const now = new Date();
  if (s.status === 'canceled' || s.status === 'completed') throw conflict('schedule_closed', 'This schedule has ended');
  if (action === 'pause') {
    db.update('recurring_schedules', s.id, { status: 'paused', updated_at: now.toISOString() });
  } else if (action === 'resume') {
    const next = computeNext(s, now);
    db.update('recurring_schedules', s.id, {
      status: next.ended ? 'completed' : 'active',
      next_run_at: next.nextRunAt,
      updated_at: now.toISOString(),
    });
  } else {
    db.update('recurring_schedules', s.id, { status: 'canceled', next_run_at: null, updated_at: now.toISOString() });
  }
  const auditAction = { pause: 'schedule.paused', resume: 'schedule.resumed', cancel: 'schedule.canceled' }[action];
  audit(db, family.id, actor(c), auditAction, { type: 'schedule', id: s.id });
  return c.json(scheduleView(db, scheduleInFamily(db, family.id, s.id)));
});

activityRoutes.post('/schedules/:id/run-now', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const s = scheduleInFamily(db, family.id, c.req.param('id'));
  if (s.status === 'canceled' || s.status === 'completed') throw conflict('schedule_closed', 'This schedule has ended');
  const execution = executeOccurrence(db, s.id, { trigger: 'run_now', scheduledFor: null });
  audit(db, family.id, actor(c), 'schedule.run_now', { type: 'schedule', id: s.id });
  return c.json({ execution: toExecution(execution), schedule: scheduleView(db, scheduleInFamily(db, family.id, s.id)) }, 201);
});

activityRoutes.get('/schedules/:id/executions', (c) => {
  const db = c.get('db');
  const s = scheduleInFamily(db, c.get('family').id, c.req.param('id'));
  const rows = db.all<ExecutionRow>('SELECT * FROM recurring_executions WHERE schedule_id = ? ORDER BY executed_at DESC LIMIT 50', s.id);
  return c.json({ items: rows.map(toExecution) });
});
