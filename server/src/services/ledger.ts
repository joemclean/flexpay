import type { Db } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { localDate, zonedTimeToUtc } from '../lib/time.js';
import type { CardRow, Category, ChildRow, PotRow, TransactionKind, TransactionRow } from '../types.js';

export interface PostInput {
  familyId: string;
  childId: string;
  potId: string | null;
  amountCents: number;
  kind: TransactionKind;
  title: string;
  category: Category;
  createdBy: string;
  counterparty?: string | null;
  memo?: string | null;
  status?: 'posted' | 'declined';
  declineReason?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  transferGroup?: string | null;
  createdAt?: string;
}

export function postTransaction(db: Db, input: PostInput): TransactionRow {
  const row: TransactionRow = {
    id: newId('txn'),
    family_id: input.familyId,
    child_id: input.childId,
    pot_id: input.potId,
    amount_cents: input.amountCents,
    kind: input.kind,
    status: input.status ?? 'posted',
    title: input.title,
    category: input.category,
    counterparty: input.counterparty ?? null,
    memo: input.memo ?? null,
    decline_reason: input.declineReason ?? null,
    related_type: input.relatedType ?? null,
    related_id: input.relatedId ?? null,
    transfer_group: input.transferGroup ?? null,
    created_by: input.createdBy,
    created_at: input.createdAt ?? new Date().toISOString(),
  };
  db.insert('transactions', { ...row });
  return row;
}

export function potBalance(db: Db, potId: string): number {
  return (
    db.get<{ total: number | null }>(
      "SELECT SUM(amount_cents) AS total FROM transactions WHERE pot_id = ? AND status = 'posted'",
      potId,
    )?.total ?? 0
  );
}

export function potBalances(db: Db, childId: string): Map<string, number> {
  const rows = db.all<{ pot_id: string; total: number }>(
    "SELECT pot_id, SUM(amount_cents) AS total FROM transactions WHERE child_id = ? AND status = 'posted' AND pot_id IS NOT NULL GROUP BY pot_id",
    childId,
  );
  return new Map(rows.map((r) => [r.pot_id, r.total]));
}

export function activePots(db: Db, childId: string): PotRow[] {
  return db.all<PotRow>(
    'SELECT * FROM pots WHERE child_id = ? AND archived_at IS NULL ORDER BY is_spending DESC, sort_order, created_at',
    childId,
  );
}

export function spendingPot(db: Db, childId: string): PotRow {
  const pot = db.get<PotRow>(
    'SELECT * FROM pots WHERE child_id = ? AND is_spending = 1 AND archived_at IS NULL LIMIT 1',
    childId,
  );
  if (!pot) throw notFound('Spending pot');
  return pot;
}

export function childBalances(db: Db, childId: string) {
  const pots = activePots(db, childId);
  const balances = potBalances(db, childId);
  let total = 0;
  let spending = 0;
  for (const pot of pots) {
    const b = balances.get(pot.id) ?? 0;
    total += b;
    if (pot.is_spending) spending += b;
  }
  return { totalCents: total, spendingCents: spending, savedCents: total - spending };
}

export function toPot(pot: PotRow, balanceCents: number) {
  const goal = pot.goal_cents;
  return {
    id: pot.id,
    childId: pot.child_id,
    name: pot.name,
    emoji: pot.emoji,
    goalCents: goal,
    balanceCents,
    isSpending: pot.is_spending === 1,
    progress: goal && goal > 0 ? Math.min(1, Math.max(0, balanceCents / goal)) : null,
    goalReached: goal !== null && goal > 0 && balanceCents >= goal,
    sortOrder: pot.sort_order,
    createdAt: pot.created_at,
  };
}

export function potsWithBalances(db: Db, childId: string) {
  const balances = potBalances(db, childId);
  return activePots(db, childId).map((p) => toPot(p, balances.get(p.id) ?? 0));
}

export function getPotForChild(db: Db, childId: string, potId: string): PotRow {
  const pot = db.get<PotRow>('SELECT * FROM pots WHERE id = ? AND child_id = ? AND archived_at IS NULL', potId, childId);
  if (!pot) throw notFound('Pot');
  return pot;
}

export function transferBetweenPots(
  db: Db,
  child: ChildRow,
  fromPotId: string,
  toPotId: string,
  amountCents: number,
  createdBy: string,
  memo?: string | null,
  createdAt?: string,
) {
  if (fromPotId === toPotId) throw badRequest('Choose two different pots');
  return db.tx(() => {
    const from = getPotForChild(db, child.id, fromPotId);
    const to = getPotForChild(db, child.id, toPotId);
    const available = potBalance(db, from.id);
    if (available < amountCents) {
      throw conflict('insufficient_funds', `${from.name} only has ${formatCents(available)}`, {
        availableCents: available,
      });
    }
    const group = newId('xfr');
    const out = postTransaction(db, {
      familyId: child.family_id,
      childId: child.id,
      potId: from.id,
      amountCents: -amountCents,
      kind: 'transfer',
      title: `Moved to ${to.name}`,
      category: 'savings',
      memo,
      transferGroup: group,
      createdBy,
      createdAt,
    });
    const inn = postTransaction(db, {
      familyId: child.family_id,
      childId: child.id,
      potId: to.id,
      amountCents,
      kind: 'transfer',
      title: `Moved from ${from.name}`,
      category: 'savings',
      memo,
      transferGroup: group,
      createdBy,
      createdAt,
    });
    return { out, in: inn };
  });
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** Card spend (posted purchases) for the child's current local day. */
export function cardSpendToday(db: Db, childId: string, timezone: string, now = new Date()): number {
  const today = localDate(now, timezone);
  const start = zonedTimeToUtc(today, 0, timezone).toISOString();
  return -(
    db.get<{ total: number | null }>(
      "SELECT SUM(amount_cents) AS total FROM transactions WHERE child_id = ? AND kind = 'card_purchase' AND status = 'posted' AND created_at >= ?",
      childId,
      start,
    )?.total ?? 0
  );
}

export const FOREIGN_FEE_RATE = 0.025;
export const MIN_FOREIGN_FEE_CENTS = 10;

export interface PurchaseInput {
  merchant: string;
  amountCents: number;
  category: Category;
  foreign: boolean;
  createdBy: string;
  createdAt?: string;
}

export interface PurchaseResult {
  approved: boolean;
  declineReason: string | null;
  transaction: TransactionRow;
  fee: TransactionRow | null;
}

const DECLINE_MESSAGES: Record<string, string> = {
  card_frozen: 'Card is frozen',
  insufficient_funds: 'Not enough money in the spending pot',
  daily_limit: 'Daily spending limit reached',
};

export function declineMessage(reason: string | null): string | null {
  return reason ? (DECLINE_MESSAGES[reason] ?? reason) : null;
}

/** Authorize and post a card purchase against the child's spending pot. */
export function authorizePurchase(db: Db, child: ChildRow, card: CardRow, timezone: string, input: PurchaseInput): PurchaseResult {
  return db.tx(() => {
    const pot = spendingPot(db, child.id);
    const fee = input.foreign ? Math.max(MIN_FOREIGN_FEE_CENTS, Math.round(input.amountCents * FOREIGN_FEE_RATE)) : 0;
    let declineReason: string | null = null;
    if (card.status === 'frozen') declineReason = 'card_frozen';
    else if (potBalance(db, pot.id) < input.amountCents + fee) declineReason = 'insufficient_funds';
    else if (cardSpendToday(db, child.id, timezone) + input.amountCents > card.daily_limit_cents) declineReason = 'daily_limit';

    const transaction = postTransaction(db, {
      familyId: child.family_id,
      childId: child.id,
      potId: pot.id,
      amountCents: -input.amountCents,
      kind: 'card_purchase',
      status: declineReason ? 'declined' : 'posted',
      declineReason,
      title: input.merchant,
      category: input.category,
      relatedType: 'card',
      relatedId: card.id,
      createdBy: input.createdBy,
      createdAt: input.createdAt,
    });

    let feeTx: TransactionRow | null = null;
    if (!declineReason && fee > 0) {
      feeTx = postTransaction(db, {
        familyId: child.family_id,
        childId: child.id,
        potId: pot.id,
        amountCents: -fee,
        kind: 'fee',
        title: 'Foreign transaction fee',
        category: 'fees',
        counterparty: input.merchant,
        memo: `${(FOREIGN_FEE_RATE * 100).toFixed(1)}% of ${formatCents(input.amountCents)}`,
        relatedType: 'transaction',
        relatedId: transaction.id,
        createdBy: 'system',
        createdAt: input.createdAt,
      });
    }
    return { approved: declineReason === null, declineReason, transaction, fee: feeTx };
  });
}
