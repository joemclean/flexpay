import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, audit } from '../auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { isValidTimeZone, localDate, zonedTimeToUtc } from '../lib/time.js';
import { body, name, optionalCents, query } from '../lib/validate.js';
import { approveCompletion, approveRequest, declineRequest, listApprovals, rejectCompletion } from '../services/approvals.js';
import { childSummary, getChildInFamily } from '../services/children.js';
import { insights } from '../services/insights.js';
import { newToken } from '../lib/crypto.js';
import type { AuditRow, ChildRow, FamilyRow, InviteRow, ParentRow, ReportRow, TransactionRow } from '../types.js';
import { CATEGORIES, toAudit, toFamily, toInvite, toParent, toReport, toTransaction } from '../types.js';

export const familyRoutes = new Hono<AppEnv>();

const actor = (c: { get(k: 'parent'): ParentRow }) => `parent:${c.get('parent').id}`;

familyRoutes.get('/family', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const parents = db.all<ParentRow>('SELECT * FROM parents WHERE family_id = ? ORDER BY created_at', family.id);
  const invites = db.all<InviteRow>(
    'SELECT * FROM family_invites WHERE family_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC',
    family.id,
    new Date().toISOString(),
  );
  return c.json({ family: toFamily(family), parents: parents.map(toParent), invites: invites.map(toInvite) });
});

/** Invite a co-parent. The invite link is single-use and expires after 7 days. */
familyRoutes.post('/family/invites', async (c) => {
  const input = await body(c, z.object({ email: z.email().max(200).optional() }));
  const db = c.get('db');
  const family = c.get('family');
  const count =
    db.get<{ n: number }>('SELECT COUNT(*) AS n FROM parents WHERE family_id = ?', family.id)?.n ?? 0;
  if (count >= 4) throw conflict('too_many_parents', 'A family can have up to 4 parents');
  const now = new Date();
  const row: InviteRow = {
    code: newToken(),
    family_id: family.id,
    email: input.email?.toLowerCase() ?? null,
    created_by: actor(c),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    used_at: null,
    used_by: null,
  };
  db.insert('family_invites', { ...row });
  audit(db, family.id, actor(c), 'parent.invited', { type: 'family', id: family.id }, { email: row.email });
  return c.json(toInvite(row), 201);
});

familyRoutes.delete('/family/invites/:code', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const changes = db.run('DELETE FROM family_invites WHERE code = ? AND family_id = ? AND used_at IS NULL', c.req.param('code'), family.id);
  if (!changes) throw notFound('Invite');
  audit(db, family.id, actor(c), 'parent.invite_revoked', { type: 'family', id: family.id });
  return c.json({ ok: true });
});

familyRoutes.patch('/family', async (c) => {
  const input = await body(
    c,
    z.object({
      name: name.optional(),
      lessonRewardCents: optionalCents.max(2000).optional(),
      timezone: z.string().refine(isValidTimeZone, 'Unknown timezone').optional(),
    }),
  );
  const db = c.get('db');
  const family = c.get('family');
  db.update('families', family.id, {
    name: input.name,
    lesson_reward_cents: input.lessonRewardCents,
    timezone: input.timezone,
  });
  audit(db, family.id, actor(c), 'family.updated', { type: 'family', id: family.id }, input);
  return c.json({ family: toFamily(db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', family.id)!) });
});

familyRoutes.get('/overview', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const children = db.all<ChildRow>('SELECT * FROM children WHERE family_id = ? ORDER BY created_at', family.id);
  const summaries = children.map((ch) => childSummary(db, ch, family));
  const monthStart = zonedTimeToUtc(`${localDate(new Date(), family.timezone).slice(0, 7)}-01`, 0, family.timezone).toISOString();
  const month = db.get<{ spent: number | null; earned: number | null; fees: number | null }>(
    `SELECT
       -SUM(CASE WHEN kind IN ('card_purchase','p2p_sent') THEN amount_cents ELSE 0 END) AS spent,
        SUM(CASE WHEN kind IN ('allowance','reward','lesson_reward','deposit','p2p_received') THEN amount_cents ELSE 0 END) AS earned,
       -SUM(CASE WHEN kind = 'fee' THEN amount_cents ELSE 0 END) AS fees
     FROM transactions WHERE family_id = ? AND status = 'posted' AND created_at >= ?`,
    family.id,
    monthStart,
  );
  const recent = db.all<TransactionRow & { child_name: string; pot_name: string | null }>(
    `SELECT t.*, c.name AS child_name, p.name AS pot_name FROM transactions t
       JOIN children c ON c.id = t.child_id LEFT JOIN pots p ON p.id = t.pot_id
      WHERE t.family_id = ? AND t.kind != 'transfer'
      ORDER BY t.created_at DESC LIMIT 8`,
    family.id,
  );
  return c.json({
    family: toFamily(family),
    totals: {
      balanceCents: summaries.reduce((s, ch) => s + ch.totalCents, 0),
      savedCents: summaries.reduce((s, ch) => s + ch.savedCents, 0),
      spentThisMonthCents: month?.spent ?? 0,
      earnedThisMonthCents: month?.earned ?? 0,
      feesThisMonthCents: month?.fees ?? 0,
    },
    children: summaries,
    approvals: listApprovals(db, family.id),
    openReports: listReports(db, family.id, 'open'),
    recentActivity: recent.map((t) => toTransaction(t, { childName: t.child_name, potName: t.pot_name })),
  });
});

// ---- Approvals ----------------------------------------------------------------

familyRoutes.get('/approvals', (c) => c.json({ items: listApprovals(c.get('db'), c.get('family').id) }));

familyRoutes.post('/approvals/challenge-completions/:id/approve', (c) => {
  const db = c.get('db');
  const result = approveCompletion(db, c.get('family'), c.req.param('id'), actor(c));
  return c.json({ id: result.id, status: result.status, transactionId: result.transaction_id });
});

familyRoutes.post('/approvals/challenge-completions/:id/reject', (c) => {
  const result = rejectCompletion(c.get('db'), c.get('family'), c.req.param('id'), actor(c));
  return c.json({ id: result.id, status: result.status });
});

familyRoutes.post('/approvals/money-requests/:id/approve', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const result = approveRequest(db, family, c.req.param('id'), actor(c));
  audit(db, family.id, actor(c), 'money_request.approved', { type: 'money_request', id: result.id }, {
    amountCents: result.amount_cents,
    direction: result.direction,
  });
  return c.json({ id: result.id, status: result.status, transactionId: result.transaction_id });
});

familyRoutes.post('/approvals/money-requests/:id/decline', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const result = declineRequest(db, family, c.req.param('id'), actor(c));
  audit(db, family.id, actor(c), 'money_request.declined', { type: 'money_request', id: result.id });
  return c.json({ id: result.id, status: result.status });
});

// ---- Reported transactions ------------------------------------------------------

function listReports(db: AppEnv['Variables']['db'], familyId: string, status: 'open' | 'resolved' | 'all') {
  const rows = db.all<ReportRow & { child_name: string; child_avatar: string }>(
    `SELECT r.*, c.name AS child_name, c.avatar AS child_avatar
       FROM transaction_reports r JOIN children c ON c.id = r.child_id
      WHERE c.family_id = ? ${status === 'all' ? '' : 'AND r.status = ?'}
      ORDER BY r.created_at DESC LIMIT 100`,
    ...(status === 'all' ? [familyId] : [familyId, status]),
  );
  return rows.map((r) => {
    const tx = db.get<TransactionRow>('SELECT * FROM transactions WHERE id = ?', r.transaction_id)!;
    return {
      ...toReport(r),
      child: { id: r.child_id, name: r.child_name, avatar: r.child_avatar },
      transaction: toTransaction(tx, { childName: r.child_name }),
    };
  });
}

familyRoutes.get('/reports', (c) => {
  const q = query(c, z.object({ status: z.enum(['open', 'resolved', 'all']).default('open') }));
  return c.json({ items: listReports(c.get('db'), c.get('family').id, q.status) });
});

familyRoutes.post('/reports/:id/resolve', async (c) => {
  const input = await body(c, z.object({ resolution: z.string().trim().max(200).optional(), freezeCard: z.boolean().default(false) }));
  const db = c.get('db');
  const family = c.get('family');
  const report = db.get<ReportRow>(
    'SELECT r.* FROM transaction_reports r JOIN children c ON c.id = r.child_id WHERE r.id = ? AND c.family_id = ?',
    c.req.param('id'),
    family.id,
  );
  if (!report) throw notFound('Report');
  if (report.status !== 'open') throw conflict('already_resolved', 'This report has already been resolved');
  db.tx(() => {
    db.update('transaction_reports', report.id, {
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: actor(c),
      resolution: input.resolution ?? (input.freezeCard ? 'Card frozen' : 'Checked by a parent'),
    });
    if (input.freezeCard) db.run("UPDATE cards SET status = 'frozen' WHERE child_id = ?", report.child_id);
  });
  audit(db, family.id, actor(c), 'transaction.report_resolved', { type: 'transaction', id: report.transaction_id }, {
    freezeCard: input.freezeCard,
  });
  if (input.freezeCard) audit(db, family.id, actor(c), 'card.frozen', { type: 'child', id: report.child_id }, { via: 'report' });
  const updated = listReports(db, family.id, 'all').find((r) => r.id === report.id);
  return c.json(updated);
});

// ---- Transactions ---------------------------------------------------------------

const KINDS = ['allowance', 'reward', 'lesson_reward', 'deposit', 'transfer', 'card_purchase', 'fee', 'p2p_sent', 'p2p_received'] as const;

const txQuery = z.object({
  childId: z.string().optional(),
  kind: z.enum(KINDS).optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(['posted', 'declined']).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  includeTransfers: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

function decodeCursor(cursor: string): [string, string] {
  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!createdAt || !id) throw badRequest('Invalid cursor');
  return [createdAt, id];
}

familyRoutes.get('/transactions', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const q = query(c, txQuery);
  const where: string[] = ['t.family_id = ?'];
  const params: (string | number)[] = [family.id];
  if (q.childId) {
    getChildInFamily(db, family.id, q.childId);
    where.push('t.child_id = ?');
    params.push(q.childId);
  }
  if (q.kind) {
    where.push('t.kind = ?');
    params.push(q.kind);
  } else if (q.includeTransfers !== 'true') {
    where.push("t.kind != 'transfer'");
  }
  if (q.category) {
    where.push('t.category = ?');
    params.push(q.category);
  }
  if (q.status) {
    where.push('t.status = ?');
    params.push(q.status);
  }
  if (q.q) {
    where.push('(t.title LIKE ? OR t.counterparty LIKE ? OR t.memo LIKE ?)');
    const like = `%${q.q.replace(/[%_]/g, '')}%`;
    params.push(like, like, like);
  }
  if (q.from) {
    where.push('t.created_at >= ?');
    params.push(zonedTimeToUtc(q.from, 0, family.timezone).toISOString());
  }
  if (q.to) {
    where.push('t.created_at < ?');
    params.push(new Date(zonedTimeToUtc(q.to, 0, family.timezone).getTime() + 86_400_000).toISOString());
  }
  if (q.cursor) {
    const [createdAt, id] = decodeCursor(q.cursor);
    where.push('(t.created_at < ? OR (t.created_at = ? AND t.id < ?))');
    params.push(createdAt, createdAt, id);
  }
  const rows = db.all<TransactionRow & { child_name: string; pot_name: string | null }>(
    `SELECT t.*, c.name AS child_name, p.name AS pot_name FROM transactions t
       JOIN children c ON c.id = t.child_id LEFT JOIN pots p ON p.id = t.pot_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.created_at DESC, t.id DESC LIMIT ?`,
    ...params,
    q.limit + 1,
  );
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return c.json({
    items: page.map((t) => toTransaction(t, { childName: t.child_name, potName: t.pot_name })),
    nextCursor: rows.length > q.limit && last ? Buffer.from(`${last.created_at}|${last.id}`).toString('base64url') : null,
  });
});

// ---- Insights & audit -----------------------------------------------------------

familyRoutes.get('/insights', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const q = query(c, z.object({ childId: z.string().optional(), days: z.coerce.number().int().min(7).max(365).default(30) }));
  if (q.childId) getChildInFamily(db, family.id, q.childId);
  return c.json(insights(db, family, { childId: q.childId, days: q.days }));
});

familyRoutes.get('/audit-events', (c) => {
  const db = c.get('db');
  const rows = db.all<AuditRow>(
    'SELECT * FROM audit_events WHERE family_id = ? ORDER BY created_at DESC LIMIT 100',
    c.get('family').id,
  );
  return c.json({ items: rows.map(toAudit) });
});
