import type { Db } from '../db.js';
import { addDays, localDate, zonedTimeToUtc } from '../lib/time.js';
import type { FamilyRow, TransactionRow } from '../types.js';
import { toTransaction } from '../types.js';

const SPEND_KINDS = "('card_purchase','p2p_sent')";

export function insights(db: Db, family: FamilyRow, opts: { childId?: string; days: number }, now = new Date()) {
  const tz = family.timezone;
  const today = localDate(now, tz);
  const startDate = addDays(today, -(opts.days - 1));
  const start = zonedTimeToUtc(startDate, 0, tz).toISOString();
  const prevStart = zonedTimeToUtc(addDays(startDate, -opts.days), 0, tz).toISOString();

  const scope = opts.childId ? 'family_id = ? AND child_id = ?' : 'family_id = ?';
  const scopeParams = opts.childId ? [family.id, opts.childId] : [family.id];

  const spendingByCategory = db
    .all<{ category: string; cents: number; count: number }>(
      `SELECT category, -SUM(amount_cents) AS cents, COUNT(*) AS count FROM transactions
        WHERE ${scope} AND status = 'posted' AND kind IN ${SPEND_KINDS} AND created_at >= ?
        GROUP BY category ORDER BY cents DESC`,
      ...scopeParams,
      start,
    )
    .filter((r) => r.cents > 0);

  const topMerchants = db.all<{ title: string; cents: number; count: number }>(
    `SELECT title, -SUM(amount_cents) AS cents, COUNT(*) AS count FROM transactions
      WHERE ${scope} AND status = 'posted' AND kind = 'card_purchase' AND created_at >= ?
      GROUP BY title ORDER BY cents DESC LIMIT 5`,
    ...scopeParams,
    start,
  );

  const incomeBySource = db.all<{ kind: string; cents: number; count: number }>(
    `SELECT kind, SUM(amount_cents) AS cents, COUNT(*) AS count FROM transactions
      WHERE ${scope} AND status = 'posted' AND kind IN ('allowance','reward','lesson_reward','deposit','p2p_received') AND created_at >= ?
      GROUP BY kind ORDER BY cents DESC`,
    ...scopeParams,
    start,
  );

  const feeRows = db.all<TransactionRow & { child_name: string }>(
    `SELECT t.*, c.name AS child_name FROM transactions t JOIN children c ON c.id = t.child_id
      WHERE ${opts.childId ? 't.family_id = ? AND t.child_id = ?' : 't.family_id = ?'} AND t.status = 'posted' AND t.kind = 'fee' AND t.created_at >= ?
      ORDER BY t.created_at DESC`,
    ...scopeParams,
    start,
  );
  const feesTotal = -feeRows.reduce((s, r) => s + r.amount_cents, 0);
  const prevFees = -(
    db.get<{ total: number | null }>(
      `SELECT SUM(amount_cents) AS total FROM transactions WHERE ${scope} AND status = 'posted' AND kind = 'fee' AND created_at >= ? AND created_at < ?`,
      ...scopeParams,
      prevStart,
      start,
    )?.total ?? 0
  );
  const byType = new Map<string, { title: string; cents: number; count: number }>();
  for (const r of feeRows) {
    const entry = byType.get(r.title) ?? { title: r.title, cents: 0, count: 0 };
    entry.cents += -r.amount_cents;
    entry.count += 1;
    byType.set(r.title, entry);
  }
  const declined =
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions WHERE ${scope} AND status = 'declined' AND created_at >= ?`,
      ...scopeParams,
      start,
    )?.n ?? 0;

  // Daily closing balance across the period.
  const opening =
    db.get<{ total: number | null }>(
      `SELECT SUM(amount_cents) AS total FROM transactions WHERE ${scope} AND status = 'posted' AND created_at < ?`,
      ...scopeParams,
      start,
    )?.total ?? 0;
  const daily = db.all<{ amount_cents: number; created_at: string }>(
    `SELECT amount_cents, created_at FROM transactions WHERE ${scope} AND status = 'posted' AND created_at >= ? ORDER BY created_at`,
    ...scopeParams,
    start,
  );
  const deltas = new Map<string, number>();
  for (const t of daily) {
    const d = localDate(new Date(t.created_at), tz);
    deltas.set(d, (deltas.get(d) ?? 0) + t.amount_cents);
  }
  const balanceTrend: { date: string; balanceCents: number }[] = [];
  let running = opening;
  for (let i = 0; i < opts.days; i++) {
    const d = addDays(startDate, i);
    running += deltas.get(d) ?? 0;
    balanceTrend.push({ date: d, balanceCents: running });
  }

  const spentCents = spendingByCategory.reduce((s, r) => s + r.cents, 0);
  const earnedCents = incomeBySource.reduce((s, r) => s + r.cents, 0);

  return {
    period: { days: opts.days, startDate, endDate: today },
    totals: { spentCents, earnedCents, feesCents: feesTotal, netCents: earnedCents - spentCents - feesTotal, declinedCount: declined },
    spendingByCategory,
    topMerchants,
    incomeBySource,
    fees: {
      totalCents: feesTotal,
      previousPeriodCents: prevFees,
      byType: [...byType.values()].sort((a, b) => b.cents - a.cents),
      items: feeRows.map((r) => toTransaction(r, { childName: r.child_name })),
      tips: feeTips(byType),
    },
    balanceTrend,
  };
}

function feeTips(byType: Map<string, { cents: number }>): string[] {
  const tips: string[] = [];
  if (byType.has('Foreign transaction fee')) {
    tips.push('Foreign transaction fees come from shops billing in another country (often online game stores). Consider a gift card in your currency.');
  }
  if (byType.has('Card replacement')) {
    tips.push('Freezing a lost card from the Card tab is free — try that before ordering a replacement in case it turns up.');
  }
  tips.push('FlexFund Family has no monthly account fee and no fee for allowance, rewards or transfers between pots.');
  return tips;
}
