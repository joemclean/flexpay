import type { Db } from '../db.js';
import { newId } from '../lib/crypto.js';
import { addDays, daysBetween, localDate, startOfIsoWeek, zonedTimeToUtc } from '../lib/time.js';
import type { ChallengeRow, ChildRow, FamilyRow, ParentRow, TransactionRow } from '../types.js';
import { periodKey } from './children.js';
import { createChild, createPot } from './family.js';
import { postTransaction, spendingPot, transferBetweenPots } from './ledger.js';
import { findLesson } from './lessons.js';
import { computeNext, executeOccurrence } from './scheduler.js';

/**
 * Populates a new family with two kids and ~9 weeks of realistic history so the
 * dashboard and the kids app have something meaningful to show.
 * Names and numbers echo the Miro prototypes (Finn, card •••• 6790, New Bike, …).
 */
export function addSampleData(db: Db, family: FamilyRow, parent: ParentRow, now = new Date()): void {
  const tz = family.timezone;
  const today = localDate(now, tz);
  /** A local wall-clock time `daysAgo` days back, never in the future. */
  const at = (daysAgo: number, hour: number, minute = 0): string => {
    const instant = new Date(zonedTimeToUtc(addDays(today, -daysAgo), hour, tz).getTime() + minute * 60_000);
    return (instant > now ? new Date(now.getTime() - (5 + daysAgo) * 60_000) : instant).toISOString();
  };
  /** Days ago for weekday `day` (0 = Monday) of the ISO week `weeksAgo` weeks back, clamped to today. */
  const thisMonday = startOfIsoWeek(today);
  const weekDay = (weeksAgo: number, day: number): number =>
    Math.max(0, daysBetween(addDays(thisMonday, -7 * weeksAgo + day), today));
  const by = `parent:${parent.id}`;
  const historyStart = addDays(today, -63);

  db.tx(() => {
    // ---------------------------------------------------------------- Finn
    const finn = createChild(db, family, {
      name: 'Finn',
      avatar: '🐶',
      birthYear: now.getUTCFullYear() - 10,
      cardLast4: '6790',
      createdAt: at(64, 9),
    });
    const finnGeneral = spendingPot(db, finn.id).id;
    const bike = createPot(db, finn.id, { name: 'New Bike', emoji: '🚲', goalCents: 25000, createdAt: at(64, 9) });
    const consolePot = createPot(db, finn.id, { name: 'Console', emoji: '🎮', goalCents: 30000, createdAt: at(64, 9) });
    const holiday = createPot(db, finn.id, { name: 'Holiday spending', emoji: '😎', goalCents: 15000, createdAt: at(64, 9) });

    const finnOpening = opening(db, family, finn, [
      [finnGeneral, 9000],
      [bike, 15000],
      [consolePot, 9000],
      [holiday, 2000],
    ], at(63, 10));

    allowance(db, family, finn, finnGeneral, 1000, historyStart, by, now);

    const tidy = challenge(db, finn, 'Tidy bedroom', '🧹', 200, 'weekly', at(60, 9));
    const walk = challenge(db, finn, 'Walk the dog', '🐕', 100, 'daily', at(60, 9));
    const read = challenge(db, finn, 'Read for 20 minutes', '📚', 50, 'daily', at(40, 9));
    challenge(db, finn, 'Help wash the car', '🚗', 300, 'once', at(5, 9));

    // Weekly streak: this week and the two before (3 weeks), then a gap week, then an older run.
    for (const w of [0, 1, 2, 4, 5]) approve(db, family, finn, tidy, at(weekDay(w, 5), 18), by);
    for (const [w, d] of [[0, 0], [1, 1], [1, 3], [1, 5], [2, 0], [2, 2], [2, 4], [4, 1], [5, 3]] as const) {
      approve(db, family, finn, walk, at(weekDay(w, d), 17), by);
    }
    for (const [w, d] of [[1, 2], [1, 6], [2, 1], [2, 5]] as const) approve(db, family, finn, read, at(weekDay(w, d), 20), by);
    pending(db, finn, walk, at(0, 7, 30), tz);

    for (const d of [7, 14, 21, 28, 35, 42]) transferBetweenPots(db, finn, finnGeneral, bike, 500, by, 'Weekly bike savings', at(d, 11));
    for (const d of [24, 45]) transferBetweenPots(db, finn, finnGeneral, consolePot, 500, by, null, at(d, 11));
    for (const d of [18, 39]) transferBetweenPots(db, finn, finnGeneral, holiday, 1000, by, null, at(d, 11));

    const purchases: [number, number, string, number, TransactionRow['category'], boolean?][] = [
      [0, 15, 'DT Theatre', 1000, 'entertainment'],
      [1, 8, 'Bus', 200, 'transport'],
      [2, 13, 'Pizza Papi', 450, 'food'],
      [3, 12, 'Deli', 580, 'food'],
      [5, 16, 'Gameshop', 3000, 'games'],
      [9, 19, 'Steam', 499, 'games', true],
      [12, 15, 'Chapter One Books', 825, 'education'],
      [16, 8, 'Bus', 200, 'transport'],
      [19, 16, 'Scoops Ice Cream', 350, 'food'],
      [23, 15, 'Corner Shop', 175, 'food'],
      [33, 18, 'DT Theatre', 900, 'entertainment'],
      [40, 14, 'Toy Planet', 1499, 'shopping'],
      [47, 8, 'Bus', 200, 'transport'],
      [52, 13, 'Pizza Papi', 450, 'food'],
    ];
    for (const [d, h, merchant, amount, category, foreign] of purchases) {
      purchase(db, family, finn, finnGeneral, merchant, amount, category, at(d, h), foreign ?? false);
    }
    // A declined attempt (over the daily limit) and a one-off fee.
    postTransaction(db, {
      familyId: family.id,
      childId: finn.id,
      potId: finnGeneral,
      amountCents: -4500,
      kind: 'card_purchase',
      status: 'declined',
      declineReason: 'daily_limit',
      title: 'Gameshop',
      category: 'games',
      createdBy: 'card',
      createdAt: at(5, 16, 5),
    });
    postTransaction(db, {
      familyId: family.id,
      childId: finn.id,
      potId: finnGeneral,
      amountCents: -500,
      kind: 'fee',
      title: 'Card replacement',
      category: 'fees',
      memo: 'Replacement for a lost card',
      createdBy: 'system',
      createdAt: at(30, 10),
    });

    const finnContacts = contacts(db, finn, [
      ['Mum', '👩', 'parent', true],
      ['Dad', '👨', 'parent', false],
      ['James F', '🧢', 'friend', true],
      ['Kari S', '🎸', 'friend', true],
      ['Hannah S', '🌸', 'friend', false],
      ['Abby T', '🦄', 'friend', false],
      ['Alex P', '🏀', 'friend', false],
      ['James B', '🎮', 'friend', false],
    ], at(60, 9));
    moneyRequest(db, family, finn, finnGeneral, finnContacts.get('James F')!, 'send', 300, 'Pizza share 🍕', at(8, 18), 'approved', by);
    moneyRequest(db, family, finn, finnGeneral, finnContacts.get('Mum')!, 'request', 500, 'Cinema money', at(15, 17), 'approved', by);
    moneyRequest(db, family, finn, finnGeneral, finnContacts.get('Mum')!, 'request', 500, 'For the school trip 🚌', at(0, 7, 45), 'pending', by);

    lesson(db, family, finn, finnGeneral, 'what-is-money', at(weekDay(2, 3), 19));
    lesson(db, family, finn, finnGeneral, 'needs-vs-wants', at(weekDay(1, 4), 19));

    ensureNonNegative(db, finn, finnOpening);

    // ---------------------------------------------------------------- Emma
    const emma = createChild(db, family, {
      name: 'Emma',
      avatar: '🦊',
      birthYear: now.getUTCFullYear() - 8,
      createdAt: at(64, 9),
    });
    const emmaGeneral = spendingPot(db, emma.id).id;
    const art = createPot(db, emma.id, { name: 'Art set', emoji: '🎨', goalCents: 6000, createdAt: at(64, 9) });
    const puppy = createPot(db, emma.id, { name: 'Puppy fund', emoji: '🐾', goalCents: 20000, createdAt: at(64, 9) });
    const emmaOpening = opening(db, family, emma, [
      [emmaGeneral, 1500],
      [art, 2500],
      [puppy, 4000],
    ], at(63, 10));
    allowance(db, family, emma, emmaGeneral, 500, historyStart, by, now);

    const cat = challenge(db, emma, 'Feed the cat', '🐱', 50, 'daily', at(60, 9));
    const table = challenge(db, emma, 'Set the table', '🍽️', 50, 'daily', at(60, 9));
    const piano = challenge(db, emma, 'Practice piano', '🎹', 100, 'weekly', at(30, 9));
    for (const [w, d] of [[0, 1], [1, 0], [1, 3], [1, 5]] as const) approve(db, family, emma, cat, at(weekDay(w, d), 7), by);
    for (const [w, d] of [[1, 2], [1, 4]] as const) approve(db, family, emma, table, at(weekDay(w, d), 18), by);
    for (const w of [1, 3]) approve(db, family, emma, piano, at(weekDay(w, 6), 17), by);
    pending(db, emma, table, at(0, 7, 15), tz);

    for (const d of [7, 14, 21, 28, 35]) transferBetweenPots(db, emma, emmaGeneral, art, 200, by, null, at(d, 11));
    for (const [d, h, merchant, amount, category] of [
      [6, 15, 'Craft Corner', 650, 'shopping'],
      [13, 16, 'Scoops Ice Cream', 300, 'food'],
      [26, 11, 'School Book Fair', 500, 'education'],
    ] as const) {
      purchase(db, family, emma, emmaGeneral, merchant, amount, category, at(d, h), false);
    }
    contacts(db, emma, [
      ['Mum', '👩', 'parent', true],
      ['Dad', '👨', 'parent', true],
      ['Lily R', '🐰', 'friend', false],
      ['Noah K', '🚀', 'friend', false],
    ], at(60, 9));
    lesson(db, family, emma, emmaGeneral, 'what-is-money', at(weekDay(1, 2), 18));
    ensureNonNegative(db, emma, emmaOpening);
  });
}

// ---- helpers -------------------------------------------------------------------

function opening(db: Db, family: FamilyRow, child: ChildRow, amounts: [string, number][], createdAt: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const [potId, cents] of amounts) {
    const tx = postTransaction(db, {
      familyId: family.id,
      childId: child.id,
      potId,
      amountCents: cents,
      kind: 'deposit',
      title: 'Birthday money',
      category: 'gifts',
      counterparty: 'Grandma',
      createdBy: 'system',
      createdAt,
    });
    ids.set(potId, tx.id);
  }
  return ids;
}

/** If any pot ever dipped below zero in the generated history, top up its opening deposit. */
function ensureNonNegative(db: Db, child: ChildRow, openingTx: Map<string, string>): void {
  const rows = db.all<{ pot_id: string; amount_cents: number }>(
    "SELECT pot_id, amount_cents FROM transactions WHERE child_id = ? AND status = 'posted' AND pot_id IS NOT NULL ORDER BY created_at, rowid",
    child.id,
  );
  const running = new Map<string, number>();
  const minimum = new Map<string, number>();
  for (const r of rows) {
    const v = (running.get(r.pot_id) ?? 0) + r.amount_cents;
    running.set(r.pot_id, v);
    minimum.set(r.pot_id, Math.min(minimum.get(r.pot_id) ?? 0, v));
  }
  for (const [potId, min] of minimum) {
    const txId = openingTx.get(potId);
    if (min < 0 && txId) db.run('UPDATE transactions SET amount_cents = amount_cents + ? WHERE id = ?', -min + 500, txId);
  }
}

function allowance(db: Db, family: FamilyRow, child: ChildRow, potId: string, cents: number, startDate: string, by: string, now: Date) {
  const id = newId('sch');
  const base = {
    frequency: 'weekly' as const,
    weekday: 6,
    day_of_month: null,
    timezone: family.timezone,
    run_hour: 8,
    start_date: startDate,
    end_date: null,
  };
  const first = computeNext(base, new Date(zonedTimeToUtc(startDate, 0, family.timezone).getTime() - 1));
  db.insert('recurring_schedules', {
    id,
    family_id: family.id,
    child_id: child.id,
    pot_id: potId,
    amount_cents: cents,
    ...base,
    memo: null,
    status: 'active',
    next_run_at: first.nextRunAt,
    last_run_at: null,
    occurrence_count: 0,
    created_by: by,
    created_at: zonedTimeToUtc(startDate, 9, family.timezone).toISOString(),
    updated_at: zonedTimeToUtc(startDate, 9, family.timezone).toISOString(),
  });
  // Replay past occurrences with their real timestamps.
  for (let guard = 0; guard < 100; guard++) {
    const s = db.get<{ next_run_at: string | null }>('SELECT next_run_at FROM recurring_schedules WHERE id = ?', id);
    if (!s?.next_run_at || s.next_run_at > now.toISOString()) break;
    executeOccurrence(db, id, { trigger: 'schedule', scheduledFor: s.next_run_at, now: new Date(s.next_run_at) });
  }
}

function challenge(db: Db, child: ChildRow, title: string, emoji: string, reward: number, recurrence: ChallengeRow['recurrence'], createdAt: string): ChallengeRow {
  const row: ChallengeRow = {
    id: newId('chl'),
    child_id: child.id,
    title,
    emoji,
    reward_cents: reward,
    recurrence,
    pot_id: null,
    active: 1,
    created_at: createdAt,
  };
  db.insert('challenges', { ...row });
  return row;
}

function approve(db: Db, family: FamilyRow, child: ChildRow, ch: ChallengeRow, submittedAt: string, by: string) {
  const key = periodKey(ch.recurrence, new Date(submittedAt), family.timezone);
  const exists = db.get('SELECT 1 AS x FROM challenge_completions WHERE challenge_id = ? AND period_key = ?', ch.id, key);
  if (exists) return;
  const reviewedAt = new Date(Date.parse(submittedAt) + 45 * 60_000).toISOString();
  const completionId = newId('cmp');
  const tx = postTransaction(db, {
    familyId: family.id,
    childId: child.id,
    potId: spendingPot(db, child.id).id,
    amountCents: ch.reward_cents,
    kind: 'reward',
    title: ch.title,
    category: 'income',
    relatedType: 'challenge_completion',
    relatedId: completionId,
    createdBy: by,
    createdAt: reviewedAt,
  });
  db.insert('challenge_completions', {
    id: completionId,
    challenge_id: ch.id,
    child_id: child.id,
    period_key: key,
    status: 'approved',
    submitted_at: submittedAt,
    reviewed_at: reviewedAt,
    reviewed_by: by,
    transaction_id: tx.id,
  });
}

function pending(db: Db, child: ChildRow, ch: ChallengeRow, submittedAt: string, tz: string) {
  const key = periodKey(ch.recurrence, new Date(submittedAt), tz);
  if (db.get('SELECT 1 AS x FROM challenge_completions WHERE challenge_id = ? AND period_key = ?', ch.id, key)) return;
  db.insert('challenge_completions', {
    id: newId('cmp'),
    challenge_id: ch.id,
    child_id: child.id,
    period_key: key,
    status: 'pending',
    submitted_at: submittedAt,
  });
}

function purchase(db: Db, family: FamilyRow, child: ChildRow, potId: string, merchant: string, cents: number, category: TransactionRow['category'], createdAt: string, foreign: boolean) {
  const tx = postTransaction(db, {
    familyId: family.id,
    childId: child.id,
    potId,
    amountCents: -cents,
    kind: 'card_purchase',
    title: merchant,
    category,
    createdBy: 'card',
    createdAt,
  });
  if (foreign) {
    postTransaction(db, {
      familyId: family.id,
      childId: child.id,
      potId,
      amountCents: -Math.max(10, Math.round(cents * 0.025)),
      kind: 'fee',
      title: 'Foreign transaction fee',
      category: 'fees',
      counterparty: merchant,
      memo: `2.5% of $${(cents / 100).toFixed(2)}`,
      relatedType: 'transaction',
      relatedId: tx.id,
      createdBy: 'system',
      createdAt,
    });
  }
}

function contacts(db: Db, child: ChildRow, list: [string, string, 'parent' | 'family' | 'friend', boolean][], createdAt: string) {
  const ids = new Map<string, string>();
  for (const [name, avatar, relationship, fav] of list) {
    const id = newId('con');
    db.insert('contacts', { id, child_id: child.id, name, avatar, relationship, is_favorite: fav, created_at: createdAt });
    ids.set(name, id);
  }
  return ids;
}

function moneyRequest(
  db: Db,
  family: FamilyRow,
  child: ChildRow,
  potId: string,
  contactId: string,
  direction: 'send' | 'request',
  cents: number,
  note: string,
  createdAt: string,
  status: 'pending' | 'approved',
  by: string,
) {
  const id = newId('req');
  const contactName = db.get<{ name: string }>('SELECT name FROM contacts WHERE id = ?', contactId)?.name ?? 'Friend';
  let transactionId: string | null = null;
  const reviewedAt = status === 'approved' ? new Date(Date.parse(createdAt) + 20 * 60_000).toISOString() : null;
  if (status === 'approved') {
    transactionId = postTransaction(db, {
      familyId: family.id,
      childId: child.id,
      potId,
      amountCents: direction === 'send' ? -cents : cents,
      kind: direction === 'send' ? 'p2p_sent' : 'p2p_received',
      title: direction === 'send' ? `Sent to ${contactName}` : `From ${contactName}`,
      category: 'gifts',
      counterparty: contactName,
      memo: note,
      relatedType: 'money_request',
      relatedId: id,
      createdBy: by,
      createdAt: reviewedAt!,
    }).id;
  }
  db.insert('money_requests', {
    id,
    child_id: child.id,
    contact_id: contactId,
    direction,
    amount_cents: cents,
    note,
    status,
    created_at: createdAt,
    reviewed_at: reviewedAt,
    reviewed_by: status === 'approved' ? by : null,
    transaction_id: transactionId,
  });
}

function lesson(db: Db, family: FamilyRow, child: ChildRow, potId: string, lessonId: string, completedAt: string) {
  const l = findLesson(lessonId);
  if (!l) return;
  const id = newId('lsn');
  const tx = postTransaction(db, {
    familyId: family.id,
    childId: child.id,
    potId,
    amountCents: family.lesson_reward_cents,
    kind: 'lesson_reward',
    title: `Lesson: ${l.title}`,
    category: 'education',
    relatedType: 'lesson_completion',
    relatedId: id,
    createdBy: 'system',
    createdAt: completedAt,
  });
  db.insert('lesson_completions', {
    id,
    child_id: child.id,
    lesson_id: lessonId,
    score: l.quiz.length,
    total: l.quiz.length,
    reward_cents: family.lesson_reward_cents,
    transaction_id: tx.id,
    completed_at: completedAt,
  });
}
