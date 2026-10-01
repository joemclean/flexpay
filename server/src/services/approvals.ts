import type { Db } from '../db.js';
import { conflict, notFound } from '../lib/errors.js';
import type { ChallengeRow, ChildRow, CompletionRow, ContactRow, FamilyRow, MoneyRequestRow, PotRow } from '../types.js';
import { formatCents, postTransaction, potBalance, spendingPot } from './ledger.js';

export function listApprovals(db: Db, familyId: string) {
  const completions = db.all<CompletionRow & { title: string; emoji: string; reward_cents: number; recurrence: string; child_name: string; child_avatar: string }>(
    `SELECT cc.*, ch.title, ch.emoji, ch.reward_cents, ch.recurrence, c.name AS child_name, c.avatar AS child_avatar
       FROM challenge_completions cc
       JOIN challenges ch ON ch.id = cc.challenge_id
       JOIN children c ON c.id = cc.child_id
      WHERE c.family_id = ? AND cc.status = 'pending'
      ORDER BY cc.submitted_at DESC`,
    familyId,
  );
  const requests = db.all<MoneyRequestRow & { contact_name: string; contact_avatar: string; relationship: string; child_name: string; child_avatar: string }>(
    `SELECT r.*, ct.name AS contact_name, ct.avatar AS contact_avatar, ct.relationship, c.name AS child_name, c.avatar AS child_avatar
       FROM money_requests r
       JOIN contacts ct ON ct.id = r.contact_id
       JOIN children c ON c.id = r.child_id
      WHERE c.family_id = ? AND r.status = 'pending'
      ORDER BY r.created_at DESC`,
    familyId,
  );
  return [
    ...completions.map((cc) => ({
      type: 'challenge' as const,
      id: cc.id,
      child: { id: cc.child_id, name: cc.child_name, avatar: cc.child_avatar },
      title: cc.title,
      emoji: cc.emoji,
      description: `${cc.child_name} finished “${cc.title}”`,
      amountCents: cc.reward_cents,
      createdAt: cc.submitted_at,
    })),
    ...requests.map((r) => ({
      type: 'money_request' as const,
      id: r.id,
      child: { id: r.child_id, name: r.child_name, avatar: r.child_avatar },
      title: r.direction === 'send' ? `Send to ${r.contact_name}` : `Ask ${r.contact_name}`,
      emoji: r.contact_avatar,
      description:
        r.direction === 'send'
          ? `${r.child_name} wants to send ${formatCents(r.amount_cents)} to ${r.contact_name}`
          : `${r.child_name} is asking ${r.contact_name} for ${formatCents(r.amount_cents)}`,
      note: r.note,
      direction: r.direction,
      amountCents: r.amount_cents,
      createdAt: r.created_at,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function loadCompletion(db: Db, familyId: string, id: string) {
  const cc = db.get<CompletionRow>(
    'SELECT cc.* FROM challenge_completions cc JOIN children c ON c.id = cc.child_id WHERE cc.id = ? AND c.family_id = ?',
    id,
    familyId,
  );
  if (!cc) throw notFound('Challenge completion');
  if (cc.status !== 'pending') throw conflict('already_reviewed', 'This has already been reviewed');
  return cc;
}

export function approveCompletion(db: Db, family: FamilyRow, id: string, reviewer: string) {
  return db.tx(() => {
    const cc = loadCompletion(db, family.id, id);
    const ch = db.get<ChallengeRow>('SELECT * FROM challenges WHERE id = ?', cc.challenge_id)!;
    const target =
      (ch.pot_id && db.get<PotRow>('SELECT * FROM pots WHERE id = ? AND archived_at IS NULL', ch.pot_id)) ||
      spendingPot(db, cc.child_id);
    const now = new Date().toISOString();
    let transactionId: string | null = null;
    if (ch.reward_cents > 0) {
      transactionId = postTransaction(db, {
        familyId: family.id,
        childId: cc.child_id,
        potId: target.id,
        amountCents: ch.reward_cents,
        kind: 'reward',
        title: ch.title,
        category: 'income',
        relatedType: 'challenge_completion',
        relatedId: cc.id,
        createdBy: reviewer,
      }).id;
    }
    db.update('challenge_completions', cc.id, {
      status: 'approved',
      reviewed_at: now,
      reviewed_by: reviewer,
      transaction_id: transactionId,
    });
    return { ...cc, status: 'approved' as const, transaction_id: transactionId };
  });
}

export function rejectCompletion(db: Db, family: FamilyRow, id: string, reviewer: string) {
  const cc = loadCompletion(db, family.id, id);
  db.update('challenge_completions', cc.id, { status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: reviewer });
  return { ...cc, status: 'rejected' as const };
}

function loadRequest(db: Db, familyId: string, id: string) {
  const r = db.get<MoneyRequestRow>(
    'SELECT r.* FROM money_requests r JOIN children c ON c.id = r.child_id WHERE r.id = ? AND c.family_id = ?',
    id,
    familyId,
  );
  if (!r) throw notFound('Request');
  if (r.status !== 'pending') throw conflict('already_reviewed', 'This request has already been reviewed');
  return r;
}

export function approveRequest(db: Db, family: FamilyRow, id: string, reviewer: string) {
  return db.tx(() => {
    const r = loadRequest(db, family.id, id);
    const contact = db.get<ContactRow>('SELECT * FROM contacts WHERE id = ?', r.contact_id)!;
    const child = db.get<ChildRow>('SELECT * FROM children WHERE id = ?', r.child_id)!;
    const pot = spendingPot(db, child.id);
    if (r.direction === 'send') {
      const available = potBalance(db, pot.id);
      if (available < r.amount_cents) {
        throw conflict('insufficient_funds', `${child.name}'s spending pot only has ${formatCents(available)}`, {
          availableCents: available,
        });
      }
    }
    const tx = postTransaction(db, {
      familyId: family.id,
      childId: child.id,
      potId: pot.id,
      amountCents: r.direction === 'send' ? -r.amount_cents : r.amount_cents,
      kind: r.direction === 'send' ? 'p2p_sent' : 'p2p_received',
      title: r.direction === 'send' ? `Sent to ${contact.name}` : `From ${contact.name}`,
      category: 'gifts',
      counterparty: contact.name,
      memo: r.note,
      relatedType: 'money_request',
      relatedId: r.id,
      createdBy: reviewer,
    });
    const now = new Date().toISOString();
    db.update('money_requests', r.id, { status: 'approved', reviewed_at: now, reviewed_by: reviewer, transaction_id: tx.id });
    return { ...r, status: 'approved' as const, reviewed_at: now, transaction_id: tx.id };
  });
}

export function declineRequest(db: Db, family: FamilyRow, id: string, reviewer: string) {
  const r = loadRequest(db, family.id, id);
  const now = new Date().toISOString();
  db.update('money_requests', r.id, { status: 'declined', reviewed_at: now, reviewed_by: reviewer });
  return { ...r, status: 'declined' as const, reviewed_at: now };
}
