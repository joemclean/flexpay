export type TransactionKind =
  | 'allowance'
  | 'reward'
  | 'lesson_reward'
  | 'deposit'
  | 'transfer'
  | 'card_purchase'
  | 'fee'
  | 'p2p_sent'
  | 'p2p_received'

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
] as const
export type Category = (typeof CATEGORIES)[number]

export interface Family {
  id: string
  name: string
  lessonRewardCents: number
  timezone: string
  createdAt: string
}

export interface Parent {
  id: string
  familyId: string
  name: string
  email: string
  hasPassword: boolean
  googleLinked: boolean
  mfaEnabled?: boolean
  createdAt: string
}

export interface Session {
  token: string
  expiresAt: string
  parent: Parent
  family: Family
}

export interface MfaChallenge {
  mfaRequired: true
  mfaToken: string
  expiresAt: string
}

/** A pending co-parent invite (single use, 7 days). */
export interface Invite {
  code: string
  email: string | null
  createdAt: string
  expiresAt: string
  path: string
}

/** Public details of an invite link, shown on the sign-up page. */
export interface InviteInfo {
  familyName: string
  invitedBy: string | null
  email: string | null
  expiresAt: string
}

export interface Providers {
  password: boolean
  google: { clientId: string } | null
  mfa?: boolean
}

export interface Pot {
  id: string
  childId: string
  name: string
  emoji: string
  goalCents: number | null
  balanceCents: number
  isSpending: boolean
  progress: number | null
  goalReached: boolean
  sortOrder: number
  createdAt: string
}

export interface Transaction {
  id: string
  childId: string
  childName?: string
  potId: string | null
  potName: string | null
  amountCents: number
  kind: TransactionKind
  status: 'posted' | 'declined'
  title: string
  category: Category
  counterparty: string | null
  memo: string | null
  declineReason: 'card_frozen' | 'insufficient_funds' | 'daily_limit' | null
  createdAt: string
}

export interface Card {
  id: string
  childId: string
  name: string
  last4: string
  status: 'active' | 'frozen'
  dailyLimitCents: number
  createdAt: string
  spentTodayCents: number
  remainingTodayCents: number
  spendingBalanceCents?: number
}

export type ChallengeStatus = 'available' | 'pending' | 'done'
export type Recurrence = 'once' | 'daily' | 'weekly'

export interface Challenge {
  id: string
  childId: string
  title: string
  emoji: string
  rewardCents: number
  recurrence: Recurrence
  potId: string | null
  active: boolean
  status?: ChallengeStatus
  completedCount?: number
  createdAt: string
}

export interface ChallengeHistoryItem {
  id: string
  challengeId: string
  title: string
  emoji: string
  rewardCents: number
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  reviewedAt: string | null
}

export type Relationship = 'parent' | 'family' | 'friend'

export interface Contact {
  id: string
  childId: string
  name: string
  avatar: string
  relationship: Relationship
  isFavorite: boolean
  createdAt: string
}

export interface MoneyRequest {
  id: string
  childId: string
  contactId: string
  contactName?: string
  contactAvatar?: string
  direction: 'send' | 'request'
  amountCents: number
  note: string | null
  status: 'pending' | 'approved' | 'declined' | 'canceled'
  createdAt: string
  reviewedAt: string | null
}

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface Schedule {
  id: string
  childId: string
  potId: string
  potName?: string
  amountCents: number
  frequency: Frequency
  weekday: number | null
  dayOfMonth: number | null
  timezone: string
  runHour: number
  startDate: string
  endDate: string | null
  memo: string | null
  status: 'active' | 'paused' | 'canceled' | 'completed'
  nextRunAt: string | null
  lastRunAt: string | null
  occurrenceCount: number
  createdAt: string
  updatedAt: string
  upcoming?: string[]
}

export interface Execution {
  id: string
  scheduleId: string
  occurrenceIndex: number
  idempotencyKey: string
  trigger: 'schedule' | 'run_now'
  status: 'completed' | 'failed'
  transactionId: string | null
  errorMessage: string | null
  scheduledFor: string | null
  executedAt: string
}

export interface Achievement {
  id: string
  title: string
  description: string
  emoji: string
  current: number
  target: number
  earned: boolean
}

export interface Device {
  id: string
  childId: string
  name: string
  platform: string
  createdAt: string
  lastSeenAt: string
}

export interface ChildSummary {
  id: string
  name: string
  avatar: string
  birthYear: number | null
  age: number | null
  totalCents: number
  spendingCents: number
  savedCents: number
  streakWeeks: number
  hasPin: boolean
  deviceCount: number
  pendingApprovals: number
  card: { last4: string; status: 'active' | 'frozen' } | null
  createdAt: string
}

export interface ChildDetail extends Omit<ChildSummary, 'card'> {
  pots: Pot[]
  /** Card summary; daily spend figures come from GET /children/:id/card. */
  card: Omit<Card, 'spentTodayCents' | 'remainingTodayCents' | 'spendingBalanceCents'>
  devices: Device[]
  achievements: Achievement[]
}

export interface Approval {
  type: 'challenge' | 'money_request'
  id: string
  child: { id: string; name: string; avatar: string }
  title: string
  emoji: string
  description: string
  amountCents: number
  createdAt: string
  note?: string | null
  direction?: 'send' | 'request'
}

export interface Overview {
  family: Family
  totals: {
    balanceCents: number
    savedCents: number
    spentThisMonthCents: number
    earnedThisMonthCents: number
    feesThisMonthCents: number
  }
  children: ChildSummary[]
  approvals: Approval[]
  recentActivity: Transaction[]
  openReports?: Report[]
}

export interface Insights {
  period: { days: number; startDate: string; endDate: string }
  totals: { spentCents: number; earnedCents: number; feesCents: number; netCents: number; declinedCount: number }
  spendingByCategory: { category: Category; cents: number; count: number }[]
  topMerchants: { title: string; cents: number; count: number }[]
  incomeBySource: { kind: TransactionKind; cents: number; count: number }[]
  fees: {
    totalCents: number
    previousPeriodCents: number
    byType: { title: string; cents: number; count: number }[]
    items: Transaction[]
    tips: string[]
  }
  balanceTrend: { date: string; balanceCents: number }[]
}

export interface Lesson {
  id: string
  title: string
  emoji: string
  minutes: number
  summary: string
  completed: boolean
  score: number | null
  total: number
  rewardCents: number | null
  completedAt: string | null
}

export interface AuditEvent {
  id: string
  actor: string
  action: string
  targetType: string | null
  targetId: string | null
  details: Record<string, unknown> | null
  createdAt: string
}

export interface PairingCode {
  code: string
  expiresAt: string
  deepLink: string
}

export interface PurchaseResult {
  approved: boolean
  declineReason: string | null
  message: string
  transaction: Transaction
  fee: Transaction | null
  card: Card
}

export interface Report {
  id: string
  transactionId: string
  childId: string
  reason: string
  reasonLabel: string
  note: string | null
  status: 'open' | 'resolved'
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
  child: { id: string; name: string; avatar: string }
  transaction: Transaction
}
