import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, audit } from '../auth.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { body, cents, emoji, name, optionalCents } from '../lib/validate.js';
import { cardForChild, getChildInFamily } from '../services/children.js';
import { createPot } from '../services/family.js';
import {
  authorizePurchase,
  cardSpendToday,
  declineMessage,
  formatCents,
  getPotForChild,
  postTransaction,
  potBalance,
  potsWithBalances,
  spendingPot,
  toPot,
  transferBetweenPots,
} from '../services/ledger.js';
import type { CardRow, ChildRow, ParentRow, PotRow } from '../types.js';
import { CATEGORIES, toCard, toTransaction } from '../types.js';

export const moneyRoutes = new Hono<AppEnv>();

const actor = (c: { get(k: 'parent'): ParentRow }) => `parent:${c.get('parent').id}`;

function potInFamily(db: AppEnv['Variables']['db'], familyId: string, potId: string): { pot: PotRow; child: ChildRow } {
  const pot = db.get<PotRow>(
    'SELECT p.* FROM pots p JOIN children c ON c.id = p.child_id WHERE p.id = ? AND c.family_id = ? AND p.archived_at IS NULL',
    potId,
    familyId,
  );
  if (!pot) throw notFound('Pot');
  return { pot, child: getChildInFamily(db, familyId, pot.child_id) };
}

// ---- Pots -------------------------------------------------------------------------

moneyRoutes.get('/children/:id/pots', (c) => {
  const db = c.get('db');
  const child = getChildInFamily(db, c.get('family').id, c.req.param('id'));
  return c.json({ items: potsWithBalances(db, child.id) });
});

moneyRoutes.post('/children/:id/pots', async (c) => {
  const input = await body(c, z.object({ name, emoji: emoji.default('💰'), goalCents: cents.nullable().optional() }));
  const db = c.get('db');
  const child = getChildInFamily(db, c.get('family').id, c.req.param('id'));
  const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM pots WHERE child_id = ? AND archived_at IS NULL', child.id)?.n ?? 0;
  if (count >= 12) throw conflict('too_many_pots', 'A child can have up to 12 pots');
  const id = createPot(db, child.id, input);
  return c.json(toPot(db.get<PotRow>('SELECT * FROM pots WHERE id = ?', id)!, 0), 201);
});

moneyRoutes.patch('/pots/:id', async (c) => {
  const input = await body(
    c,
    z.object({ name: name.optional(), emoji: emoji.optional(), goalCents: cents.nullable().optional(), sortOrder: z.number().int().optional() }),
  );
  const db = c.get('db');
  const { pot } = potInFamily(db, c.get('family').id, c.req.param('id'));
  if (pot.is_spending && input.goalCents) throw badRequest('The spending pot cannot have a goal');
  db.update('pots', pot.id, { name: input.name, emoji: input.emoji, goal_cents: input.goalCents, sort_order: input.sortOrder });
  const updated = db.get<PotRow>('SELECT * FROM pots WHERE id = ?', pot.id)!;
  return c.json(toPot(updated, potBalance(db, pot.id)));
});

/** Archive a pot. Any remaining balance moves to the spending pot. */
moneyRoutes.delete('/pots/:id', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const { pot, child } = potInFamily(db, family.id, c.req.param('id'));
  if (pot.is_spending) throw badRequest('The spending pot cannot be removed');
  db.tx(() => {
    const balance = potBalance(db, pot.id);
    if (balance > 0) transferBetweenPots(db, child, pot.id, spendingPot(db, child.id).id, balance, actor(c), `Closed ${pot.name}`);
    db.run('UPDATE recurring_schedules SET pot_id = ? WHERE pot_id = ?', spendingPot(db, child.id).id, pot.id);
    db.run('UPDATE pots SET archived_at = ? WHERE id = ?', new Date().toISOString(), pot.id);
  });
  audit(db, family.id, actor(c), 'pot.archived', { type: 'pot', id: pot.id }, { name: pot.name });
  return c.json({ ok: true });
});

moneyRoutes.post('/children/:id/transfers', async (c) => {
  const input = await body(c, z.object({ fromPotId: z.string(), toPotId: z.string(), amountCents: cents, memo: z.string().max(140).optional() }));
  const db = c.get('db');
  const child = getChildInFamily(db, c.get('family').id, c.req.param('id'));
  const result = transferBetweenPots(db, child, input.fromPotId, input.toPotId, input.amountCents, actor(c), input.memo);
  return c.json({ out: toTransaction(result.out), in: toTransaction(result.in), pots: potsWithBalances(db, child.id) }, 201);
});

moneyRoutes.post('/children/:id/deposits', async (c) => {
  const input = await body(
    c,
    z.object({ potId: z.string().optional(), amountCents: cents.max(100_000), memo: z.string().max(140).optional() }),
  );
  const db = c.get('db');
  const family = c.get('family');
  const parent = c.get('parent');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  const pot = input.potId ? getPotForChild(db, child.id, input.potId) : spendingPot(db, child.id);
  const tx = postTransaction(db, {
    familyId: family.id,
    childId: child.id,
    potId: pot.id,
    amountCents: input.amountCents,
    kind: 'deposit',
    title: input.memo?.trim() || `Money from ${parent.name}`,
    category: 'income',
    counterparty: parent.name,
    memo: input.memo,
    createdBy: actor(c),
  });
  audit(db, family.id, actor(c), 'deposit.created', { type: 'child', id: child.id }, { amountCents: input.amountCents, potId: pot.id });
  return c.json({ transaction: toTransaction(tx, { potName: pot.name }), pots: potsWithBalances(db, child.id) }, 201);
});

// ---- Card -------------------------------------------------------------------------------

function cardView(db: AppEnv['Variables']['db'], card: CardRow, timezone: string) {
  const spentToday = cardSpendToday(db, card.child_id, timezone);
  return {
    ...toCard(card),
    spentTodayCents: spentToday,
    remainingTodayCents: Math.max(0, card.daily_limit_cents - spentToday),
    spendingBalanceCents: potBalance(db, spendingPot(db, card.child_id).id),
  };
}

moneyRoutes.get('/children/:id/card', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  return c.json(cardView(db, cardForChild(db, child.id), family.timezone));
});

moneyRoutes.patch('/children/:id/card', async (c) => {
  const input = await body(
    c,
    z.object({ status: z.enum(['active', 'frozen']).optional(), dailyLimitCents: optionalCents.min(100).max(50_000).optional() }),
  );
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  const card = cardForChild(db, child.id);
  db.update('cards', card.id, { status: input.status, daily_limit_cents: input.dailyLimitCents });
  if (input.status && input.status !== card.status) {
    audit(db, family.id, actor(c), input.status === 'frozen' ? 'card.frozen' : 'card.unfrozen', { type: 'card', id: card.id });
  }
  if (input.dailyLimitCents !== undefined && input.dailyLimitCents !== card.daily_limit_cents) {
    audit(db, family.id, actor(c), 'card.limit_changed', { type: 'card', id: card.id }, {
      from: card.daily_limit_cents,
      to: input.dailyLimitCents,
    });
  }
  return c.json(cardView(db, cardForChild(db, child.id), family.timezone));
});

/**
 * Stand-in for a card network authorization, so the end-to-end flow
 * (limits, freezes, declines, foreign fees) can be exercised without an issuer.
 */
moneyRoutes.post('/children/:id/card/simulate-purchase', async (c) => {
  const input = await body(
    c,
    z.object({
      merchant: z.string().trim().min(1).max(60),
      amountCents: cents.max(100_000),
      category: z.enum(CATEGORIES).default('shopping'),
      foreign: z.boolean().default(false),
    }),
  );
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  const card = cardForChild(db, child.id);
  const result = authorizePurchase(db, child, card, family.timezone, { ...input, createdBy: 'card' });
  return c.json({
    approved: result.approved,
    declineReason: result.declineReason,
    message: result.approved
      ? `Approved: ${input.merchant} ${formatCents(input.amountCents)}`
      : `Declined: ${declineMessage(result.declineReason)}`,
    transaction: toTransaction(result.transaction),
    fee: result.fee ? toTransaction(result.fee) : null,
    card: cardView(db, cardForChild(db, child.id), family.timezone),
  });
});
