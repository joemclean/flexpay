import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, audit, clientIp, createSession, rateLimit, requireDevice, requireKid, revokeSessions } from '../auth.js';
import { config } from '../config.js';
import { hashSecret, newId, verifySecret } from '../lib/crypto.js';
import { open as openSecret } from '../lib/secretbox.js';
import { verifyTotp } from '../lib/totp.js';
import { badRequest, conflict, HttpError, notFound, unauthorized } from '../lib/errors.js';
import { body, cents, pin, query } from '../lib/validate.js';
import { achievements, cardForChild, challengesWithStatus, periodKey, streakWeeks, toChallenge } from '../services/children.js';
import { cardSpendToday, childBalances, potBalance, potsWithBalances, postTransaction, spendingPot, toPot } from '../services/ledger.js';
import { findLesson, gradeLesson, LESSONS, publicLesson } from '../services/lessons.js';
import type {
  ChallengeRow,
  ChildRow,
  CompletionRow,
  ContactRow,
  DeviceRow,
  FamilyRow,
  LessonCompletionRow,
  MoneyRequestRow,
  ParentRow,
  PotRow,
  ReportRow,
  TransactionRow,
} from '../types.js';
import { toCard, toContact, toMoneyRequest, toReport, toTransaction } from '../types.js';

type DbT = AppEnv['Variables']['db'];
const DAY = 86_400_000;

const kidChild = (c: ChildRow) => ({ id: c.id, name: c.name, avatar: c.avatar, hasPin: c.pin_hash !== null });

// ---- Public: pairing ---------------------------------------------------------------------

export const kidPublicRoutes = new Hono<AppEnv>();

kidPublicRoutes.post('/pair', async (c) => {
  rateLimit(`pair:${clientIp(c)}`, 10, 10 * 60_000);
  const input = await body(
    c,
    z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, 'Codes are 6 letters and numbers'),
      deviceName: z.string().trim().min(1).max(60).default('iPhone'),
      platform: z.string().trim().max(20).default('ios'),
    }),
  );
  const db = c.get('db');
  const now = new Date();
  const result = db.tx(() => {
    const row = db.get<{ code: string; child_id: string; expires_at: string; used_at: string | null }>(
      'SELECT * FROM pairing_codes WHERE code = ?',
      input.code,
    );
    if (!row || row.used_at || row.expires_at <= now.toISOString()) {
      throw new HttpError(400, 'invalid_code', 'That code didn’t work. Ask a grown-up for a new one.');
    }
    db.run('UPDATE pairing_codes SET used_at = ? WHERE code = ?', now.toISOString(), row.code);
    const child = db.get<ChildRow>('SELECT * FROM children WHERE id = ?', row.child_id)!;
    const family = db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', child.family_id)!;
    const device: DeviceRow = {
      id: newId('dev'),
      child_id: child.id,
      name: input.deviceName,
      platform: input.platform,
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      revoked_at: null,
    };
    db.insert('devices', { ...device });
    const session = createSession(db, 'device', device.id, config.deviceSessionDays * DAY);
    audit(db, family.id, `device:${device.id}`, 'device.paired', { type: 'device', id: device.id }, { child: child.name, name: device.name });
    return { session, child, family };
  });
  return c.json({
    deviceToken: result.session.token,
    expiresAt: result.session.expiresAt,
    child: kidChild(result.child),
    family: { name: result.family.name },
  }, 201);
});

// ---- Device: PIN ---------------------------------------------------------------------------

export const kidDeviceRoutes = new Hono<AppEnv>();
kidDeviceRoutes.use(requireDevice);

function kidSession(db: DbT, device: DeviceRow) {
  const { token, expiresAt } = createSession(db, 'kid', device.id, config.kidSessionHours * 3_600_000);
  return { token, expiresAt };
}

kidDeviceRoutes.get('/status', (c) => {
  const child = c.get('child');
  return c.json({
    child: kidChild(child),
    family: { name: c.get('family').name },
    lockedUntil: child.pin_locked_until && child.pin_locked_until > new Date().toISOString() ? child.pin_locked_until : null,
  });
});

kidDeviceRoutes.post('/pin', async (c) => {
  const input = await body(c, z.object({ pin }));
  const db = c.get('db');
  const child = c.get('child');
  if (child.pin_hash) throw conflict('pin_exists', 'A PIN is already set. Ask a grown-up to reset it.');
  if (/^(\d)\1{3}$/.test(input.pin) || ['1234', '4321', '0123'].includes(input.pin)) {
    throw badRequest('That PIN is too easy to guess. Try a different one!');
  }
  db.update('children', child.id, { pin_hash: await hashSecret(input.pin), pin_failed_attempts: 0, pin_locked_until: null });
  audit(db, child.family_id, `device:${c.get('device').id}`, 'child.pin_created', { type: 'child', id: child.id });
  return c.json({ ...kidSession(db, c.get('device')), child: { ...kidChild(child), hasPin: true } }, 201);
});

kidDeviceRoutes.post('/unlock', async (c) => {
  const input = await body(c, z.object({ pin }));
  const db = c.get('db');
  const child = db.get<ChildRow>('SELECT * FROM children WHERE id = ?', c.get('child').id)!;
  const now = new Date();
  if (!child.pin_hash) throw new HttpError(409, 'pin_not_set', 'Create a PIN first');
  if (child.pin_locked_until && child.pin_locked_until > now.toISOString()) {
    throw new HttpError(423, 'locked', 'Too many tries. Wait a few minutes and try again.', { lockedUntil: child.pin_locked_until });
  }
  if (!(await verifySecret(input.pin, child.pin_hash))) {
    const attempts = child.pin_failed_attempts + 1;
    if (attempts >= config.pinMaxAttempts) {
      const lockedUntil = new Date(now.getTime() + config.pinLockMinutes * 60_000).toISOString();
      db.update('children', child.id, { pin_failed_attempts: 0, pin_locked_until: lockedUntil });
      audit(db, child.family_id, `device:${c.get('device').id}`, 'child.pin_locked', { type: 'child', id: child.id });
      throw new HttpError(423, 'locked', 'Too many tries. Wait a few minutes and try again.', { lockedUntil });
    }
    db.update('children', child.id, { pin_failed_attempts: attempts });
    throw new HttpError(401, 'wrong_pin', 'That PIN isn’t right. Try again!', {
      attemptsRemaining: config.pinMaxAttempts - attempts,
    });
  }
  db.update('children', child.id, { pin_failed_attempts: 0, pin_locked_until: null });
  return c.json({ ...kidSession(db, c.get('device')), child: kidChild(child) });
});

/** A parent disconnects this device using their dashboard credentials ("Parent login"). */
kidDeviceRoutes.post('/unlink', async (c) => {
  rateLimit(`unlink:${clientIp(c)}`, 10, 15 * 60_000);
  const input = await body(
    c,
    z.object({ email: z.email(), password: z.string().min(1).max(200), code: z.string().trim().optional() }),
  );
  const db = c.get('db');
  const child = c.get('child');
  const device = c.get('device');
  const parent = db.get<ParentRow>('SELECT * FROM parents WHERE email = ? AND family_id = ?', input.email, child.family_id);
  if (!parent || !(await verifySecret(input.password, parent.password_hash))) {
    throw unauthorized('Those parent details aren’t right for this family');
  }
  if (parent.mfa_enabled === 1) {
    if (!input.code) throw new HttpError(401, 'mfa_required', 'Enter the 6-digit code from your authenticator app');
    const step =
      config.mfaEncryptionKey && parent.mfa_secret_enc
        ? verifyTotp(openSecret(parent.mfa_secret_enc, config.mfaEncryptionKey), input.code)
        : null;
    if (step === null || (parent.mfa_last_step !== null && step <= parent.mfa_last_step)) {
      throw new HttpError(401, 'wrong_code', 'That code isn’t right. Try the latest code from your app.');
    }
    db.run('UPDATE parents SET mfa_last_step = ? WHERE id = ?', step, parent.id);
  }
  db.run('UPDATE devices SET revoked_at = ? WHERE id = ?', new Date().toISOString(), device.id);
  revokeSessions(db, 'device', device.id);
  revokeSessions(db, 'kid', device.id);
  audit(db, child.family_id, `parent:${parent.id}`, 'device.revoked', { type: 'device', id: device.id }, { via: 'kid_app' });
  return c.json({ ok: true });
});

// ---- Kid session: data -----------------------------------------------------------------------

export const kidRoutes = new Hono<AppEnv>();
kidRoutes.use(requireKid);

function cardSummary(db: DbT, child: ChildRow, family: FamilyRow) {
  const card = cardForChild(db, child.id);
  const spent = cardSpendToday(db, child.id, family.timezone);
  return { ...toCard(card), spentTodayCents: spent, remainingTodayCents: Math.max(0, card.daily_limit_cents - spent) };
}

kidRoutes.post('/lock', (c) => {
  c.get('db').run('DELETE FROM sessions WHERE id = ?', c.get('session').id);
  return c.json({ ok: true });
});

kidRoutes.get('/home', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const family = c.get('family');
  const challenges = challengesWithStatus(db, child, family.timezone);
  const pendingRequests =
    db.get<{ n: number }>("SELECT COUNT(*) AS n FROM money_requests WHERE child_id = ? AND status = 'pending'", child.id)?.n ?? 0;
  return c.json({
    child: kidChild(child),
    ...childBalances(db, child.id),
    streakWeeks: streakWeeks(db, child.id, family.timezone),
    pots: potsWithBalances(db, child.id),
    challenges: challenges.map((x) => toChallenge(x.challenge, x.status)),
    pendingRequests,
    card: cardSummary(db, child, family),
  });
});

kidRoutes.get('/pots/:id', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const pot = db.get<PotRow>('SELECT * FROM pots WHERE id = ? AND child_id = ? AND archived_at IS NULL', c.req.param('id'), child.id);
  if (!pot) throw notFound('Pot');
  const txs = db.all<TransactionRow>(
    "SELECT * FROM transactions WHERE pot_id = ? AND status = 'posted' ORDER BY created_at DESC LIMIT 30",
    pot.id,
  );
  return c.json({ pot: toPot(pot, potBalance(db, pot.id)), transactions: txs.map((t) => toTransaction(t, { potName: pot.name })) });
});

kidRoutes.get('/wallet', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const family = c.get('family');
  const pot = spendingPot(db, child.id);
  const txs = db.all<TransactionRow>(
    "SELECT * FROM transactions WHERE child_id = ? AND kind != 'transfer' ORDER BY created_at DESC LIMIT 25",
    child.id,
  );
  return c.json({
    card: cardSummary(db, child, family),
    spendingCents: potBalance(db, pot.id),
    transactions: txs.map((t) => toTransaction(t)),
  });
});

kidRoutes.get('/transactions', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const q = query(c, z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), before: z.string().optional() }));
  const rows = db.all<TransactionRow & { pot_name: string | null }>(
    `SELECT t.*, p.name AS pot_name FROM transactions t LEFT JOIN pots p ON p.id = t.pot_id
      WHERE t.child_id = ? ${q.before ? 'AND t.created_at < ?' : ''} ORDER BY t.created_at DESC LIMIT ?`,
    ...(q.before ? [child.id, q.before, q.limit] : [child.id, q.limit]),
  );
  return c.json({ items: rows.map((t) => toTransaction(t, { potName: t.pot_name })) });
});

kidRoutes.get('/transactions/:id', (c) => {
  const db = c.get('db');
  const row = db.get<TransactionRow & { pot_name: string | null }>(
    'SELECT t.*, p.name AS pot_name FROM transactions t LEFT JOIN pots p ON p.id = t.pot_id WHERE t.id = ? AND t.child_id = ?',
    c.req.param('id'),
    c.get('child').id,
  );
  if (!row) throw notFound('Transaction');
  const report = db.get<ReportRow>(
    'SELECT * FROM transaction_reports WHERE transaction_id = ? ORDER BY created_at DESC LIMIT 1',
    row.id,
  );
  return c.json({ ...toTransaction(row, { potName: row.pot_name }), report: report ? toReport(report) : null });
});

/** "This doesn't look right" — flags a transaction for a parent to check. */
kidRoutes.post('/transactions/:id/report', async (c) => {
  const input = await body(
    c,
    z.object({ reason: z.enum(['dont_recognize', 'wrong_amount', 'other']), note: z.string().trim().max(140).optional() }),
  );
  const db = c.get('db');
  const child = c.get('child');
  const tx = db.get<TransactionRow>('SELECT * FROM transactions WHERE id = ? AND child_id = ?', c.req.param('id'), child.id);
  if (!tx) throw notFound('Transaction');
  if (db.get("SELECT 1 AS x FROM transaction_reports WHERE transaction_id = ? AND status = 'open'", tx.id)) {
    throw conflict('already_reported', 'You already told a grown-up about this one');
  }
  const row: ReportRow = {
    id: newId('rpt'),
    transaction_id: tx.id,
    child_id: child.id,
    reason: input.reason,
    note: input.note || null,
    status: 'open',
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null,
    resolution: null,
  };
  db.insert('transaction_reports', { ...row });
  audit(db, child.family_id, `device:${c.get('device').id}`, 'transaction.reported', { type: 'transaction', id: tx.id }, {
    reason: input.reason,
  });
  return c.json(toReport(row), 201);
});

kidRoutes.post('/challenges/:id/complete', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const family = c.get('family');
  const ch = db.get<ChallengeRow>('SELECT * FROM challenges WHERE id = ? AND child_id = ? AND active = 1', c.req.param('id'), child.id);
  if (!ch) throw notFound('Challenge');
  const now = new Date();
  const key = periodKey(ch.recurrence, now, family.timezone);
  const existing = db.get<CompletionRow>(
    "SELECT * FROM challenge_completions WHERE challenge_id = ? AND period_key = ? AND status != 'rejected'",
    ch.id,
    key,
  );
  if (existing) {
    throw conflict('already_completed', existing.status === 'pending' ? 'Waiting for a grown-up to check it' : 'Already done — nice work!');
  }
  db.insert('challenge_completions', {
    id: newId('cmp'),
    challenge_id: ch.id,
    child_id: child.id,
    period_key: key,
    status: 'pending',
    submitted_at: now.toISOString(),
  });
  return c.json(toChallenge(ch, 'pending'), 201);
});

// ---- Lessons ---------------------------------------------------------------------------------

kidRoutes.get('/lessons', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const done = new Map(db.all<LessonCompletionRow>('SELECT * FROM lesson_completions WHERE child_id = ?', child.id).map((l) => [l.lesson_id, l]));
  return c.json({
    rewardCents: c.get('family').lesson_reward_cents,
    items: LESSONS.map((l) => ({
      id: l.id,
      title: l.title,
      emoji: l.emoji,
      minutes: l.minutes,
      summary: l.summary,
      completed: done.has(l.id),
      score: done.get(l.id)?.score ?? null,
      total: l.quiz.length,
    })),
  });
});

kidRoutes.get('/lessons/:id', (c) => {
  const lesson = findLesson(c.req.param('id'));
  if (!lesson) throw notFound('Lesson');
  const completed = c.get('db').get('SELECT 1 AS x FROM lesson_completions WHERE child_id = ? AND lesson_id = ?', c.get('child').id, lesson.id);
  return c.json({ ...publicLesson(lesson), completed: Boolean(completed), rewardCents: c.get('family').lesson_reward_cents });
});

kidRoutes.post('/lessons/:id/complete', async (c) => {
  const lesson = findLesson(c.req.param('id'));
  if (!lesson) throw notFound('Lesson');
  const input = await body(c, z.object({ answers: z.array(z.number().int().min(0).max(9)).length(lesson.quiz.length) }));
  const db = c.get('db');
  const child = c.get('child');
  const family = c.get('family');
  const grade = gradeLesson(lesson, input.answers);
  let rewardCents = 0;
  let alreadyCompleted = false;
  if (grade.passed) {
    db.tx(() => {
      if (db.get('SELECT 1 AS x FROM lesson_completions WHERE child_id = ? AND lesson_id = ?', child.id, lesson.id)) {
        alreadyCompleted = true;
        return;
      }
      const id = newId('lsn');
      let txId: string | null = null;
      if (family.lesson_reward_cents > 0) {
        txId = postTransaction(db, {
          familyId: family.id,
          childId: child.id,
          potId: spendingPot(db, child.id).id,
          amountCents: family.lesson_reward_cents,
          kind: 'lesson_reward',
          title: `Lesson: ${lesson.title}`,
          category: 'education',
          relatedType: 'lesson_completion',
          relatedId: id,
          createdBy: `device:${c.get('device').id}`,
        }).id;
      }
      db.insert('lesson_completions', {
        id,
        child_id: child.id,
        lesson_id: lesson.id,
        score: grade.score,
        total: grade.total,
        reward_cents: family.lesson_reward_cents,
        transaction_id: txId,
        completed_at: new Date().toISOString(),
      });
      rewardCents = family.lesson_reward_cents;
    });
  }
  return c.json({ ...grade, rewardCents, alreadyCompleted });
});

// ---- Friends & requests -------------------------------------------------------------------------

kidRoutes.get('/contacts', (c) => {
  const db = c.get('db');
  const rows = db.all<ContactRow>('SELECT * FROM contacts WHERE child_id = ? ORDER BY name COLLATE NOCASE', c.get('child').id);
  return c.json({ items: rows.map(toContact) });
});

kidRoutes.get('/contacts/:id', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const contact = db.get<ContactRow>('SELECT * FROM contacts WHERE id = ? AND child_id = ?', c.req.param('id'), child.id);
  if (!contact) throw notFound('Friend');
  const requests = db.all<MoneyRequestRow>(
    'SELECT * FROM money_requests WHERE contact_id = ? ORDER BY created_at DESC LIMIT 30',
    contact.id,
  );
  return c.json({
    contact: toContact(contact),
    canRequest: contact.relationship === 'parent',
    requests: requests.map((r) => toMoneyRequest(r, contact)),
  });
});

kidRoutes.get('/money-requests', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const rows = db.all<MoneyRequestRow>('SELECT * FROM money_requests WHERE child_id = ? ORDER BY created_at DESC LIMIT 50', child.id);
  const contacts = new Map(db.all<ContactRow>('SELECT * FROM contacts WHERE child_id = ?', child.id).map((ct) => [ct.id, ct]));
  return c.json({ items: rows.map((r) => toMoneyRequest(r, contacts.get(r.contact_id))) });
});

kidRoutes.post('/money-requests', async (c) => {
  const input = await body(
    c,
    z.object({
      contactId: z.string(),
      direction: z.enum(['send', 'request']),
      amountCents: cents.max(10_000),
      note: z.string().trim().max(80).optional(),
    }),
  );
  const db = c.get('db');
  const child = c.get('child');
  const contact = db.get<ContactRow>('SELECT * FROM contacts WHERE id = ? AND child_id = ?', input.contactId, child.id);
  if (!contact) throw notFound('Friend');
  if (input.direction === 'request' && contact.relationship !== 'parent') {
    throw badRequest('You can only ask a parent for money');
  }
  if (input.direction === 'send') {
    const available = potBalance(db, spendingPot(db, child.id).id);
    if (available < input.amountCents) {
      throw conflict('insufficient_funds', 'You don’t have enough in your spending pot for that', { availableCents: available });
    }
  }
  const openCount =
    db.get<{ n: number }>("SELECT COUNT(*) AS n FROM money_requests WHERE child_id = ? AND status = 'pending'", child.id)?.n ?? 0;
  if (openCount >= 5) throw conflict('too_many_pending', 'Wait for a grown-up to answer your other requests first');
  const row: MoneyRequestRow = {
    id: newId('req'),
    child_id: child.id,
    contact_id: contact.id,
    direction: input.direction,
    amount_cents: input.amountCents,
    note: input.note || null,
    status: 'pending',
    created_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    transaction_id: null,
  };
  db.insert('money_requests', { ...row });
  return c.json(toMoneyRequest(row, contact), 201);
});

kidRoutes.post('/money-requests/:id/cancel', (c) => {
  const db = c.get('db');
  const child = c.get('child');
  const r = db.get<MoneyRequestRow>('SELECT * FROM money_requests WHERE id = ? AND child_id = ?', c.req.param('id'), child.id);
  if (!r) throw notFound('Request');
  if (r.status !== 'pending') throw conflict('already_reviewed', 'A grown-up already answered this one');
  db.update('money_requests', r.id, { status: 'canceled' });
  return c.json({ ...toMoneyRequest({ ...r, status: 'canceled' }) });
});

kidRoutes.get('/achievements', (c) => c.json({ items: achievements(c.get('db'), c.get('child'), c.get('family')) }));
