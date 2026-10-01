export interface FamilyRow {
  id: string;
  name: string;
  lesson_reward_cents: number;
  timezone: string;
  created_at: string;
}

export interface ParentRow {
  id: string;
  family_id: string;
  name: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  created_at: string;
  mfa_enabled: number;
  mfa_secret_enc: string | null;
  mfa_pending_secret_enc: string | null;
  mfa_last_step: number | null;
}

export interface SessionRow {
  id: string;
  token_hash: string;
  kind: 'parent' | 'device' | 'kid';
  subject_id: string;
  created_at: string;
  expires_at: string;
  last_used_at: string;
}

export interface ChildRow {
  id: string;
  family_id: string;
  name: string;
  avatar: string;
  birth_year: number | null;
  pin_hash: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
  created_at: string;
}

export interface DeviceRow {
  id: string;
  child_id: string;
  name: string;
  platform: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface PotRow {
  id: string;
  child_id: string;
  name: string;
  emoji: string;
  goal_cents: number | null;
  is_spending: number;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
}

export interface CardRow {
  id: string;
  child_id: string;
  last4: string;
  status: 'active' | 'frozen';
  daily_limit_cents: number;
  created_at: string;
}

export type TransactionKind =
  | 'allowance'
  | 'reward'
  | 'lesson_reward'
  | 'deposit'
  | 'transfer'
  | 'card_purchase'
  | 'fee'
  | 'p2p_sent'
  | 'p2p_received';

export const CATEGORIES = [
  'food',
  'transport',
  'entertainment',
  'shopping',
  'games',
  'education',
  'gifts',
  'fees',
  'income',
  'savings',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface TransactionRow {
  id: string;
  family_id: string;
  child_id: string;
  pot_id: string | null;
  amount_cents: number;
  kind: TransactionKind;
  status: 'posted' | 'declined';
  title: string;
  category: Category;
  counterparty: string | null;
  memo: string | null;
  decline_reason: string | null;
  related_type: string | null;
  related_id: string | null;
  transfer_group: string | null;
  created_by: string;
  created_at: string;
}

export interface ChallengeRow {
  id: string;
  child_id: string;
  title: string;
  emoji: string;
  reward_cents: number;
  recurrence: 'once' | 'daily' | 'weekly';
  pot_id: string | null;
  active: number;
  created_at: string;
}

export interface CompletionRow {
  id: string;
  challenge_id: string;
  child_id: string;
  period_key: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  transaction_id: string | null;
}

export interface LessonCompletionRow {
  id: string;
  child_id: string;
  lesson_id: string;
  score: number;
  total: number;
  reward_cents: number;
  transaction_id: string | null;
  completed_at: string;
}

export interface ContactRow {
  id: string;
  child_id: string;
  name: string;
  avatar: string;
  relationship: 'parent' | 'family' | 'friend';
  is_favorite: number;
  created_at: string;
}

export interface MoneyRequestRow {
  id: string;
  child_id: string;
  contact_id: string;
  direction: 'send' | 'request';
  amount_cents: number;
  note: string | null;
  status: 'pending' | 'approved' | 'declined' | 'canceled';
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  transaction_id: string | null;
}

export interface ScheduleRow {
  id: string;
  family_id: string;
  child_id: string;
  pot_id: string;
  amount_cents: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  weekday: number | null;
  day_of_month: number | null;
  timezone: string;
  run_hour: number;
  start_date: string;
  end_date: string | null;
  memo: string | null;
  status: 'active' | 'paused' | 'canceled' | 'completed';
  next_run_at: string | null;
  last_run_at: string | null;
  occurrence_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ExecutionRow {
  id: string;
  schedule_id: string;
  occurrence_index: number;
  idempotency_key: string;
  trigger: 'schedule' | 'run_now';
  status: 'completed' | 'failed';
  transaction_id: string | null;
  error_message: string | null;
  scheduled_for: string | null;
  executed_at: string;
}

export interface InviteRow {
  code: string;
  family_id: string;
  email: string | null;
  created_by: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
}

export const toInvite = (i: InviteRow) => ({
  code: i.code,
  email: i.email,
  createdAt: i.created_at,
  expiresAt: i.expires_at,
  path: `/sign-up?invite=${i.code}`,
});

export interface ReportRow {
  id: string;
  transaction_id: string;
  child_id: string;
  reason: 'dont_recognize' | 'wrong_amount' | 'other';
  note: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
}

export const REPORT_REASONS: Record<ReportRow['reason'], string> = {
  dont_recognize: 'I don’t recognize this',
  wrong_amount: 'The amount is wrong',
  other: 'Something else',
};

export const toReport = (r: ReportRow) => ({
  id: r.id,
  transactionId: r.transaction_id,
  childId: r.child_id,
  reason: r.reason,
  reasonLabel: REPORT_REASONS[r.reason],
  note: r.note,
  status: r.status,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at,
  resolution: r.resolution,
});

export interface AuditRow {
  id: string;
  family_id: string;
  actor: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
}

// ---- JSON mappers ---------------------------------------------------------

export const toFamily = (f: FamilyRow) => ({
  id: f.id,
  name: f.name,
  lessonRewardCents: f.lesson_reward_cents,
  timezone: f.timezone,
  createdAt: f.created_at,
});

export const toParent = (p: ParentRow) => ({
  id: p.id,
  familyId: p.family_id,
  name: p.name,
  email: p.email,
  hasPassword: p.password_hash !== null,
  googleLinked: p.google_sub !== null,
  mfaEnabled: p.mfa_enabled === 1,
  createdAt: p.created_at,
});

export const toDevice = (d: DeviceRow) => ({
  id: d.id,
  childId: d.child_id,
  name: d.name,
  platform: d.platform,
  createdAt: d.created_at,
  lastSeenAt: d.last_seen_at,
});

export const toCard = (c: CardRow) => ({
  id: c.id,
  childId: c.child_id,
  name: 'Purchase Card',
  last4: c.last4,
  status: c.status,
  dailyLimitCents: c.daily_limit_cents,
  createdAt: c.created_at,
});

export const toTransaction = (t: TransactionRow, extra?: { childName?: string; potName?: string | null }) => ({
  id: t.id,
  childId: t.child_id,
  childName: extra?.childName,
  potId: t.pot_id,
  potName: extra?.potName ?? null,
  amountCents: t.amount_cents,
  kind: t.kind,
  status: t.status,
  title: t.title,
  category: t.category,
  counterparty: t.counterparty,
  memo: t.memo,
  declineReason: t.decline_reason,
  createdAt: t.created_at,
});

export const toContact = (c: ContactRow) => ({
  id: c.id,
  childId: c.child_id,
  name: c.name,
  avatar: c.avatar,
  relationship: c.relationship,
  isFavorite: c.is_favorite === 1,
  createdAt: c.created_at,
});

export const toMoneyRequest = (r: MoneyRequestRow, contact?: ContactRow) => ({
  id: r.id,
  childId: r.child_id,
  contactId: r.contact_id,
  contactName: contact?.name,
  contactAvatar: contact?.avatar,
  direction: r.direction,
  amountCents: r.amount_cents,
  note: r.note,
  status: r.status,
  createdAt: r.created_at,
  reviewedAt: r.reviewed_at,
});

export const toSchedule = (s: ScheduleRow, potName?: string) => ({
  id: s.id,
  childId: s.child_id,
  potId: s.pot_id,
  potName,
  amountCents: s.amount_cents,
  frequency: s.frequency,
  weekday: s.weekday,
  dayOfMonth: s.day_of_month,
  timezone: s.timezone,
  runHour: s.run_hour,
  startDate: s.start_date,
  endDate: s.end_date,
  memo: s.memo,
  status: s.status,
  nextRunAt: s.next_run_at,
  lastRunAt: s.last_run_at,
  occurrenceCount: s.occurrence_count,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

export const toExecution = (e: ExecutionRow) => ({
  id: e.id,
  scheduleId: e.schedule_id,
  occurrenceIndex: e.occurrence_index,
  idempotencyKey: e.idempotency_key,
  trigger: e.trigger,
  status: e.status,
  transactionId: e.transaction_id,
  errorMessage: e.error_message,
  scheduledFor: e.scheduled_for,
  executedAt: e.executed_at,
});

export const toAudit = (a: AuditRow) => ({
  id: a.id,
  actor: a.actor,
  action: a.action,
  targetType: a.target_type,
  targetId: a.target_id,
  details: a.details ? (JSON.parse(a.details) as Record<string, unknown>) : null,
  createdAt: a.created_at,
});
