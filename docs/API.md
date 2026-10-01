# Family Account API (v1)

Base URL: `http://localhost:8787/api/v1` (dev). JSON in/out, **camelCase** fields.
Money is always **integer cents** (USD). Timestamps are ISO-8601 UTC strings;
local dates are `YYYY-MM-DD` in the family timezone.

Auth: `Authorization: Bearer <token>`. Three token kinds:

| Token | Obtained from | Used for |
| --- | --- | --- |
| Parent session | `POST /auth/signup`, `/auth/login`, `/auth/google` | everything except `/kid/*` |
| Device token | `POST /kid/pair` (one-time pairing code) | `/kid/device/*` (PIN setup/unlock) |
| Kid session (12h) | `POST /kid/device/pin` or `/kid/device/unlock` | `/kid/*` data endpoints |

Errors: `{ "error": { "code": string, "message": string, ...details } }` with HTTP
status 400 (validation, `issues[]`), 401, 403, 404, 409 (conflicts such as
`insufficient_funds`, `already_completed`, `email_taken`), 423 (`locked`, PIN
lockout, includes `lockedUntil`), 429 (`rate_limited`). `message` is always safe to
show to users.

## Shared shapes

```ts
type Pot = { id; childId; name; emoji; goalCents: number|null; balanceCents; isSpending: boolean;
             progress: number|null /*0..1*/; goalReached: boolean; sortOrder; createdAt }
type Transaction = { id; childId; childName?; potId; potName: string|null; amountCents /*signed*/;
  kind: 'allowance'|'reward'|'lesson_reward'|'deposit'|'transfer'|'card_purchase'|'fee'|'p2p_sent'|'p2p_received';
  status: 'posted'|'declined'; title; category: 'food'|'transport'|'entertainment'|'shopping'|'games'|
  'education'|'gifts'|'fees'|'income'|'savings'|'other'; counterparty: string|null; memo: string|null;
  declineReason: 'card_frozen'|'insufficient_funds'|'daily_limit'|null; createdAt }
type Card = { id; childId; name: 'Purchase Card'; last4; status: 'active'|'frozen'; dailyLimitCents;
  createdAt; spentTodayCents; remainingTodayCents; spendingBalanceCents? }
type Challenge = { id; childId; title; emoji; rewardCents; recurrence: 'once'|'daily'|'weekly';
  potId: string|null; active; status?: 'available'|'pending'|'done'; createdAt }
type Contact = { id; childId; name; avatar /*emoji*/; relationship: 'parent'|'family'|'friend'; isFavorite; createdAt }
type MoneyRequest = { id; childId; contactId; contactName?; contactAvatar?; direction: 'send'|'request';
  amountCents; note: string|null; status: 'pending'|'approved'|'declined'|'canceled'; createdAt; reviewedAt }
type Schedule = { id; childId; potId; potName?; amountCents; frequency: 'daily'|'weekly'|'biweekly'|'monthly';
  weekday: 0-6|null /*0=Sun*/; dayOfMonth: 1-31|null; timezone; runHour; startDate; endDate: string|null;
  memo: string|null; status: 'active'|'paused'|'canceled'|'completed'; nextRunAt: string|null;
  lastRunAt: string|null; occurrenceCount; createdAt; updatedAt }
type Execution = { id; scheduleId; occurrenceIndex; idempotencyKey; trigger: 'schedule'|'run_now';
  status: 'completed'|'failed'; transactionId; errorMessage; scheduledFor; executedAt }
type Achievement = { id; title; description; emoji; current; target; earned: boolean }
type ChildSummary = { id; name; avatar; birthYear; age; totalCents; spendingCents; savedCents; streakWeeks;
  hasPin; deviceCount; pendingApprovals; card: { last4; status } | null; createdAt }
type ChildDetail = ChildSummary & { pots: Pot[]; card: Card; devices: Device[]; achievements: Achievement[] }
type Device = { id; childId; name; platform; createdAt; lastSeenAt }
type Approval = { type: 'challenge'|'money_request'; id; child: { id; name; avatar }; title; emoji;
  description; amountCents; createdAt; note?; direction? }
```

## Auth (parents)

| Method | Path | Body → Response |
| --- | --- | --- |
| GET | `/auth/providers` | → `{ password: true, google: { clientId } \| null }` |
| POST | `/auth/signup` | `{ familyName, name, email, password (≥8), timezone?, includeSampleData? = true }` → `201 { token, expiresAt, parent, family }`. With `inviteCode` instead of `familyName`, joins that family as a co-parent (400 `invalid_invite` if used/expired). |
| GET | `/auth/invites/:code` | public → `{ familyName, invitedBy, email, expiresAt }` for the sign-up page |
| POST | `/auth/login` | `{ email, password }` → `{ token, expiresAt, parent, family }` |
| POST | `/auth/google` | `{ credential /* GIS ID token */, timezone? }` → same (404 if not enabled) |
| POST | `/auth/logout` | → `{ ok }` |
| GET | `/auth/me` | → `{ parent, family }` |

`parent = { id, familyId, name, email, hasPassword, googleLinked, mfaEnabled, createdAt }`,
`family = { id, name, lessonRewardCents, timezone, createdAt }`.

### Two-step verification (TOTP)

Enabled on the server when `MFA_ENCRYPTION_KEY` is set (`/auth/providers` → `mfa: true`).

| Method | Path | Body → Response |
| --- | --- | --- |
| POST | `/auth/mfa/setup` (parent) | → `{ secret /* base32 */, otpauthUrl }` — render `otpauthUrl` as a QR code |
| POST | `/auth/mfa/enable` (parent) | `{ code }` → `{ parent }`; 400 `wrong_code` |
| POST | `/auth/mfa/disable` (parent) | `{ code }` → `{ parent }` |
| POST | `/auth/mfa/verify` | `{ mfaToken, code }` → `{ token, expiresAt, parent, family }`; 401 `wrong_code` |

When a parent has MFA on, `POST /auth/login` and `/auth/google` return
`{ mfaRequired: true, mfaToken, expiresAt /* 5 min */ }` instead of a session; finish
with `/auth/mfa/verify`. `POST /kid/device/unlink` then also needs `code` (401
`mfa_required` if missing).

## Family (parent token)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/family` | `{ family, parents[], invites: [{ code, email, createdAt, expiresAt, path }] }` (pending co-parent invites) |
| POST | `/family/invites` | `{ email? }` → `201 Invite` — single-use link `path` (`/sign-up?invite=…`), expires in 7 days; max 4 parents |
| DELETE | `/family/invites/:code` | cancel a pending invite |
| PATCH | `/family` | `{ name?, lessonRewardCents? (0–2000), timezone? }` → `{ family }` |
| GET | `/overview` | `{ family, totals: { balanceCents, savedCents, spentThisMonthCents, earnedThisMonthCents, feesThisMonthCents }, children: ChildSummary[], approvals: Approval[], recentActivity: Transaction[] }` |
| GET | `/approvals` | `{ items: Approval[] }` |
| POST | `/approvals/challenge-completions/:id/approve` \| `/reject` | pays the reward on approve |
| POST | `/approvals/money-requests/:id/approve` \| `/decline` | 409 `insufficient_funds` if a send can't be covered |
| GET | `/transactions` | query: `childId, kind, category, status, q, from, to (YYYY-MM-DD), includeTransfers=true, limit (≤200), cursor` → `{ items: Transaction[], nextCursor }`. Transfers are hidden unless `includeTransfers=true` or `kind=transfer`. |
| GET | `/insights` | query: `childId?, days (7–365, default 30)` → `{ period, totals: { spentCents, earnedCents, feesCents, netCents, declinedCount }, spendingByCategory: [{category, cents, count}], topMerchants: [{title, cents, count}], incomeBySource: [{kind, cents, count}], fees: { totalCents, previousPeriodCents, byType: [{title, cents, count}], items: Transaction[], tips: string[] }, balanceTrend: [{date, balanceCents}] }` |
| GET | `/audit-events` | `{ items: [{ id, actor, action, targetType, targetId, details, createdAt }] }` |
| GET | `/reports` | query `status=open\|resolved\|all` (default open) → `{ items: Report[] }` — transactions a kid flagged |
| POST | `/reports/:id/resolve` | `{ resolution?, freezeCard? = false }` → `Report` (optionally freezes the kid's card) |

`Report = { id, transactionId, childId, reason: 'dont_recognize'|'wrong_amount'|'other', reasonLabel, note,
status: 'open'|'resolved', createdAt, resolvedAt, resolution, child?: { id, name, avatar }, transaction?: Transaction }`.
`GET /overview` also returns `openReports: Report[]`.

## Children (parent token)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/children` | `{ items: ChildSummary[] }` |
| POST | `/children` | `{ name, avatar? (emoji), birthYear?, pin? (4 digits) }` → `201 ChildDetail` (creates General spending pot + Purchase Card) |
| GET | `/children/:id` | `ChildDetail` |
| PATCH | `/children/:id` | `{ name?, avatar?, birthYear? }` → `ChildDetail` |
| GET | `/children/:id/achievements` | `{ items: Achievement[] }` |
| PUT | `/children/:id/pin` | `{ pin }` set/replace PIN (signs the kid out) |
| DELETE | `/children/:id/pin` | clear PIN; kid creates a new one on the device |
| POST | `/children/:id/pairing-codes` | → `201 { code /*6 chars*/, expiresAt /*15 min*/, deepLink: 'flexfundkids://pair?code=…' }` |
| DELETE | `/devices/:id` | disconnect a kid device |
| GET | `/children/:id/lessons` | `{ rewardCents, items: [{ id, title, emoji, minutes, summary, completed, score, total, rewardCents, completedAt }] }` |

### Money

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/children/:id/pots` | `{ items: Pot[] }` (spending pot first) |
| POST | `/children/:id/pots` | `{ name, emoji?, goalCents? }` → `201 Pot` |
| PATCH | `/pots/:id` | `{ name?, emoji?, goalCents? (null clears), sortOrder? }` |
| DELETE | `/pots/:id` | archives; balance moves to the spending pot |
| POST | `/children/:id/transfers` | `{ fromPotId, toPotId, amountCents, memo? }` → `201 { out, in, pots }` |
| POST | `/children/:id/deposits` | `{ potId? (default spending), amountCents, memo? }` → `201 { transaction, pots }` |
| GET | `/children/:id/card` | `Card` |
| PATCH | `/children/:id/card` | `{ status?: 'active'\|'frozen', dailyLimitCents? (100–50000) }` → `Card` |
| POST | `/children/:id/card/simulate-purchase` | `{ merchant, amountCents, category?, foreign? }` → `{ approved, declineReason, message, transaction, fee, card }` |

### Chores, contacts, allowance

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/children/:id/challenges` | `{ items: (Challenge & { completedCount })[], history: [{ id, challengeId, title, emoji, rewardCents, status, submittedAt, reviewedAt }] }` |
| POST | `/children/:id/challenges` | `{ title, emoji?, rewardCents?, recurrence?, potId? }` → `201 Challenge` |
| PATCH / DELETE | `/challenges/:id` | delete deactivates and rejects pending completions |
| GET | `/children/:id/contacts` | `{ items: Contact[] }` |
| POST | `/children/:id/contacts` | `{ name, avatar?, relationship?, isFavorite? }` → `201 Contact` |
| PATCH / DELETE | `/contacts/:id` | |
| GET | `/children/:id/money-requests` | `{ items: MoneyRequest[] }` |
| GET | `/children/:id/schedules` | `{ items: Schedule[] }` (excludes canceled) |
| POST | `/children/:id/schedules` | `{ amountCents, frequency, weekday? (req. weekly/biweekly), dayOfMonth? (req. monthly), potId?, startDate?, endDate?, runHour? = 8, memo? }` → `201 Schedule` |
| GET | `/schedules/:id` | `Schedule & { upcoming: string[] }` (next 5 run times) |
| PATCH | `/schedules/:id` | `{ amountCents?, potId?, endDate?, memo?, weekday?, dayOfMonth?, runHour? }` |
| POST | `/schedules/:id/pause` \| `/resume` \| `/cancel` | → `Schedule` |
| POST | `/schedules/:id/run-now` | → `201 { execution, schedule }` |
| GET | `/schedules/:id/executions` | `{ items: Execution[] }` |

## Kids app

### Pairing (no auth)

`POST /kid/pair` `{ code, deviceName?, platform? }` →
`201 { deviceToken, expiresAt, child: { id, name, avatar, hasPin }, family: { name } }`.
400 `invalid_code` if unknown/expired/used.

### Device token

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/kid/device/status` | `{ child: { id, name, avatar, hasPin }, family: { name }, lockedUntil }` |
| POST | `/kid/device/pin` | `{ pin }` first-time PIN (rejects trivial PINs like 1111/1234) → `201 { token, expiresAt, child }` (kid session) |
| POST | `/kid/device/unlock` | `{ pin }` → `{ token, expiresAt, child }`; 401 `wrong_pin` with `attemptsRemaining`; 423 `locked` with `lockedUntil` after 5 misses (5 min); 409 `pin_not_set` |
| POST | `/kid/device/unlink` | `{ email, password }` parent credentials → disconnects this device |

### Kid session

| Method | Path | Response |
| --- | --- | --- |
| GET | `/kid/home` | `{ child, totalCents, spendingCents, savedCents, streakWeeks, pots: Pot[], challenges: Challenge[] (with status), pendingRequests, card: Card }` |
| GET | `/kid/pots/:id` | `{ pot: Pot, transactions: Transaction[] }` |
| GET | `/kid/wallet` | `{ card: Card, spendingCents, transactions: Transaction[] /* 25 most recent, no transfers */ }` |
| GET | `/kid/transactions?limit&before` | `{ items: Transaction[] }` (`before` = ISO timestamp for paging) |
| GET | `/kid/transactions/:id` | `Transaction & { report: Report \| null }` |
| POST | `/kid/transactions/:id/report` | `{ reason: 'dont_recognize'\|'wrong_amount'\|'other', note? }` → `201 Report`; 409 `already_reported` |
| POST | `/kid/challenges/:id/complete` | `201 Challenge (status 'pending')`; 409 `already_completed` |
| GET | `/kid/lessons` | `{ rewardCents, items: [{ id, title, emoji, minutes, summary, completed, score, total }] }` |
| GET | `/kid/lessons/:id` | `{ id, title, emoji, minutes, summary, pages: [{ emoji, title, body }], quiz: [{ question, options: string[] }], completed, rewardCents }` |
| POST | `/kid/lessons/:id/complete` | `{ answers: number[] }` → `{ score, total, passed /* ≥2/3 */, results: [{ question, selectedIndex, correctIndex, correct, explanation }], rewardCents /* >0 only on first pass */, alreadyCompleted }` |
| GET | `/kid/contacts` | `{ items: Contact[] }` (A–Z) |
| GET | `/kid/contacts/:id` | `{ contact, canRequest /* parents only */, requests: MoneyRequest[] }` |
| GET | `/kid/money-requests` | `{ items: MoneyRequest[] }` |
| POST | `/kid/money-requests` | `{ contactId, direction: 'send'\|'request', amountCents (≤10000), note? }` → `201 MoneyRequest`; 400 asking a non-parent; 409 `insufficient_funds` / `too_many_pending` (max 5) |
| POST | `/kid/money-requests/:id/cancel` | → `MoneyRequest` |
| GET | `/kid/achievements` | `{ items: Achievement[] }` |
| POST | `/kid/lock` | ends the kid session |
