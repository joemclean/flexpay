import type { Db } from '../db.js';
import { notFound } from '../lib/errors.js';
import { addDays, isoWeekKey, localDate, startOfIsoWeek } from '../lib/time.js';
import type {
  CardRow,
  ChallengeRow,
  ChildRow,
  CompletionRow,
  DeviceRow,
  FamilyRow,
  LessonCompletionRow,
} from '../types.js';
import { toCard, toDevice } from '../types.js';
import { childBalances, potsWithBalances } from './ledger.js';
import { LESSONS } from './lessons.js';

export function getChildInFamily(db: Db, familyId: string, childId: string): ChildRow {
  const child = db.get<ChildRow>('SELECT * FROM children WHERE id = ? AND family_id = ?', childId, familyId);
  if (!child) throw notFound('Child');
  return child;
}

export function getFamily(db: Db, familyId: string): FamilyRow {
  const family = db.get<FamilyRow>('SELECT * FROM families WHERE id = ?', familyId);
  if (!family) throw notFound('Family');
  return family;
}

export function cardForChild(db: Db, childId: string): CardRow {
  const card = db.get<CardRow>('SELECT * FROM cards WHERE child_id = ?', childId);
  if (!card) throw notFound('Card');
  return card;
}

/** The period a challenge completion belongs to, in the family's timezone. */
export function periodKey(recurrence: ChallengeRow['recurrence'], instant: Date, timezone: string): string {
  if (recurrence === 'once') return 'once';
  const date = localDate(instant, timezone);
  return recurrence === 'daily' ? date : isoWeekKey(date);
}

export type ChallengeStatus = 'available' | 'pending' | 'done';

export function challengesWithStatus(db: Db, child: ChildRow, timezone: string, now = new Date()) {
  const challenges = db.all<ChallengeRow>(
    'SELECT * FROM challenges WHERE child_id = ? AND active = 1 ORDER BY created_at',
    child.id,
  );
  return challenges
    .map((ch) => {
      const key = periodKey(ch.recurrence, now, timezone);
      const completion = db.get<CompletionRow>(
        "SELECT * FROM challenge_completions WHERE challenge_id = ? AND period_key = ? AND status != 'rejected'",
        ch.id,
        key,
      );
      const status: ChallengeStatus = !completion ? 'available' : completion.status === 'pending' ? 'pending' : 'done';
      return { challenge: ch, status, completion };
    })
    // One-off challenges disappear from the kid's list once approved.
    .filter((c) => !(c.challenge.recurrence === 'once' && c.status === 'done'));
}

export const toChallenge = (ch: ChallengeRow, status?: ChallengeStatus) => ({
  id: ch.id,
  childId: ch.child_id,
  title: ch.title,
  emoji: ch.emoji,
  rewardCents: ch.reward_cents,
  recurrence: ch.recurrence,
  potId: ch.pot_id,
  active: ch.active === 1,
  status,
  createdAt: ch.created_at,
});

/**
 * Consecutive ISO weeks (ending this week, or last week if nothing yet this week)
 * with at least one approved challenge or completed lesson.
 */
export function streakWeeks(db: Db, childId: string, timezone: string, now = new Date()): number {
  const instants = [
    ...db
      .all<{ at: string }>(
        "SELECT submitted_at AS at FROM challenge_completions WHERE child_id = ? AND status = 'approved'",
        childId,
      )
      .map((r) => r.at),
    ...db.all<{ at: string }>('SELECT completed_at AS at FROM lesson_completions WHERE child_id = ?', childId).map((r) => r.at),
  ];
  const weeks = new Set(instants.map((at) => isoWeekKey(localDate(new Date(at), timezone))));
  let monday = startOfIsoWeek(localDate(now, timezone));
  if (!weeks.has(isoWeekKey(monday))) monday = addDays(monday, -7);
  let streak = 0;
  while (weeks.has(isoWeekKey(monday))) {
    streak++;
    monday = addDays(monday, -7);
  }
  return streak;
}

export function age(birthYear: number | null, now = new Date()): number | null {
  return birthYear ? now.getUTCFullYear() - birthYear : null;
}

export function pendingApprovalCount(db: Db, childId: string): number {
  const a = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM challenge_completions WHERE child_id = ? AND status = 'pending'",
    childId,
  )?.n;
  const b = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM money_requests WHERE child_id = ? AND status = 'pending'", childId)?.n;
  return (a ?? 0) + (b ?? 0);
}

export function activeDevices(db: Db, childId: string): DeviceRow[] {
  return db.all<DeviceRow>(
    'SELECT * FROM devices WHERE child_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC',
    childId,
  );
}

export function childSummary(db: Db, child: ChildRow, family: FamilyRow) {
  const balances = childBalances(db, child.id);
  const card = db.get<CardRow>('SELECT * FROM cards WHERE child_id = ?', child.id);
  return {
    id: child.id,
    name: child.name,
    avatar: child.avatar,
    birthYear: child.birth_year,
    age: age(child.birth_year),
    ...balances,
    streakWeeks: streakWeeks(db, child.id, family.timezone),
    hasPin: child.pin_hash !== null,
    deviceCount: activeDevices(db, child.id).length,
    pendingApprovals: pendingApprovalCount(db, child.id),
    card: card ? { last4: card.last4, status: card.status } : null,
    createdAt: child.created_at,
  };
}

export function childDetail(db: Db, child: ChildRow, family: FamilyRow) {
  return {
    ...childSummary(db, child, family),
    pots: potsWithBalances(db, child.id),
    card: toCard(cardForChild(db, child.id)),
    devices: activeDevices(db, child.id).map(toDevice),
    achievements: achievements(db, child, family),
  };
}

// ---- Achievements -----------------------------------------------------------

const INCOME_KINDS = "('allowance','reward','lesson_reward','deposit','p2p_received')";

export function achievements(db: Db, child: ChildRow, family: FamilyRow) {
  const pots = potsWithBalances(db, child.id);
  const saved = pots.filter((p) => !p.isSpending).reduce((sum, p) => sum + p.balanceCents, 0);
  const deposits =
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM transactions WHERE child_id = ? AND status = 'posted' AND kind IN ${INCOME_KINDS}`,
      child.id,
    )?.n ?? 0;
  const approvedChallenges =
    db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM challenge_completions WHERE child_id = ? AND status = 'approved'",
      child.id,
    )?.n ?? 0;
  const lessons = db.all<LessonCompletionRow>('SELECT * FROM lesson_completions WHERE child_id = ?', child.id).length;
  const goals = pots.filter((p) => p.goalCents);
  const streak = streakWeeks(db, child.id, family.timezone);

  const badge = (
    id: string,
    title: string,
    description: string,
    emoji: string,
    current: number,
    target: number,
  ) => ({ id, title, description, emoji, current: Math.min(current, target), target, earned: current >= target });

  return [
    badge('first-deposit', 'First Deposit', 'Get money into FlexFund for the first time.', '🌱', deposits, 1),
    badge('five-deposits', '5 Deposits', 'Receive money five times — allowance, rewards and gifts all count.', '🖐️', deposits, 5),
    badge('goal-set', 'Goal Set', 'Have a savings pot with a target amount.', '🎯', goals.length, 1),
    badge(
      'goal-reached',
      'Goal Reached',
      'Fill a savings pot all the way to its target.',
      '🏆',
      goals.filter((p) => p.goalReached).length,
      1,
    ),
    badge('saved-50', 'Saved $50', 'Keep $50 or more across your savings pots.', '💰', saved, 5000),
    badge('saved-100', 'Saved $100', 'Keep $100 or more across your savings pots.', '💎', saved, 10000),
    badge('first-challenge', 'Helping Hand', 'Get your first challenge approved.', '🧹', approvedChallenges, 1),
    badge('streak-3', '3-Week Streak', 'Finish a challenge or lesson every week for 3 weeks in a row.', '⚡️', streak, 3),
    badge('first-lesson', 'Money Learner', 'Pass your first lesson quiz.', '📚', lessons, 1),
    badge('all-lessons', 'Money Master', 'Pass every lesson quiz.', '🎓', lessons, LESSONS.length),
  ];
}
