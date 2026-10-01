# FlexFund Family — Product Definition

This document synthesizes the **FlexFund Family** Miro space into what we built. It
records where each requirement came from and the decisions we made where the
source material was ambiguous or conflicting.

## Source map (Miro space)

| Board | What it contributed |
| --- | --- |
| Overview | Project framing: redesign of the FlexFund banking app with personalized financial insights. |
| Discovery › Product Brief | Opportunity (18–35 demographic, young families), hypothesis ("needs to include social sign on"), success metrics, risks, feature-request table, notes from Jeff ("redesign our mobile app so we can appeal to a younger demographic", "let's use the new brand and logo", "provide insights on account fees and charges"), cards: "Add rewards for completing educational modules", "Topdrive incentivizes teen driving and safety". |
| Discovery › Brainstorm | Goal: reduce payment abandonment. Ideas: recent & favorite payees, quick send with same details, confirm after send, saved methods, scheduled/recurring payments, payment history, biometrics ("Face ID by default, fall back to passcode"), gamified onboarding, tooltips. |
| Definition › Prototypes | Three visual explorations (A purple, B pink, C green) of the **FlexFund Kids** flow: Welcome → PIN → Savings/Overview → Wallet → Card → Friends; a goals/achievements flow; a UX content evaluation; a Friends-screen usability critique. |
| Definition › Tech Design | System architecture (API gateway, auth incl. social SSO + MFA, core banking, notification engine, message queue, Postgres/Redis) and a full spec for **Recurring P2P Payments** (event-driven scheduler, schedules + execution log, pause/resume/run-now). |
| Delivery › Sprint Planning | Backlog: payment history (hide/report), payment history listing UI, smart dashboard UI, transaction logs API, payment initiation API, bank-linking API, currency dropdown, message thread UI, tests. |
| Delivery › Spec: Login Experience | The **"Bootstrap Mobile App"** spec (status: In Progress): *"enables children to view their account balance, track savings goals, and see recent transactions in a kid-friendly interface… read-only consumption of financial data already managed through the Family Dashboard and Family Account systems, with basic onboarding flows that connect kids to their parent-controlled accounts."* Chosen design: Prototype B; assets: gradient background, Bangers headline font, dog mascot, family illustration. Dev guidelines: app security guidelines + shadcn/ui. |
| Spec: Family Dashboard / Transactions / Family Account | Placeholder boards (no content) — scope inferred from the above. |
| Definition › Project Plan | Demo filler content (unrelated); ignored. |

## The product

FlexFund Family is a family banking product: **parents** manage money for their kids
in a web dashboard, and **kids** see and learn about their money in an iPhone app.

Three systems, matching the spec's language:

1. **Family Account** (`server/`) — the API and ledger. Owns families, parents,
   children, savings pots, cards, transactions, chores/challenges, lessons,
   contacts, money requests, recurring allowances and their execution log.
2. **Family Dashboard** (`web/`) — React + TypeScript + shadcn/ui web app for
   parents.
3. **FlexFund Kids** (`ios/`) — SwiftUI iPhone app for kids, built with standard
   iOS components.

### Personas

- **Parent (18–35)** — the brief's target demographic. Wants to give an allowance
  without thinking about it, teach good habits, keep control of spending, and see
  where fees go.
- **Kid (≈7–14)** — "Finn" in the prototypes. Wants to see their money, save for
  something (a new bike), earn rewards, and feel progress.

## Features

### Family Dashboard (parents, web)

- **Sign up / sign in** with email + password. Social sign-on (Google) is wired as
  an optional provider enabled by configuration (see README) — the brief's
  hypothesis. New families can start with sample data.
- **Overview** — family balance, each child's balance/pots/streak, a
  "Needs your approval" queue, recent activity.
- **Child management** — create kids, avatar, set/reset the 4-digit PIN, generate
  a one-time **pairing code** to connect the kid's iPhone, see and revoke devices.
- **Savings pots** — create goals (name, emoji, target), deposit, move money
  between pots.
- **Chores & challenges** — one-off/daily/weekly tasks with a reward. Kids mark
  them done in the app; parents approve, which pays the reward. Drives the weekly
  streak shown in the app.
- **Allowance** (Recurring P2P Payments, per Tech Design) — schedules with
  frequency (daily/weekly/biweekly/monthly), target pot, start/end dates;
  pause/resume/cancel/run-now; per-occurrence execution log with idempotency
  keys. Executed by an in-process scheduler (the spec's event-driven approach,
  scaled down).
- **Card controls** — freeze/unfreeze the kid's Purchase Card, daily spending
  limit, and a "simulate purchase" tool (stand-in for a card processor) that
  exercises declines, limits, and foreign-transaction fees.
- **Activity** — searchable, filterable transaction history across kids.
- **Insights** — spending by category, **fees & charges** breakdown (Jeff's note),
  income by source, savings trend.
- **Learning rewards** — set the reward kids earn per completed lesson.
- **Contacts** — the approved list of people a kid can pay or ask (Mum, Dad,
  friends), with favorites.
- **Approvals** — approve/reject chore completions and kids' send/ask requests.
- **Reported transactions** — when a kid flags a charge they don't recognize, it
  appears on the Overview; the parent marks it checked or freezes the card in one step
  (sprint backlog: "manage payment history — report").
- **Two-step verification** — optional TOTP (authenticator app) for parent sign-in,
  the brief's mitigation for social sign-on risk.
- **Co-parents** — invite another parent with a single-use link; they see the same
  kids, approvals and activity.

### FlexFund Kids (kids, iPhone)

- **Welcome + pairing** — "Your fun adventure into the world of money starts
  here!" with a descriptive CTA and value prop (per UX evaluation); connect with
  the pairing code (or a `flexfundkids://pair?code=…` link).
- **PIN** — "Hey, Finn 👋 Enter your PIN to continue". First run: create & confirm
  PIN. Face ID unlock after first PIN entry (brainstorm: Face ID by default, fall
  back to passcode). "Parent login" lets a parent unlink the device.
- **Savings** (home) — streak ("You're on a 3 week streak!"), challenges ("Complete
  more challenges to boost your pots"), pots with progress toward goals.
- **Wallet** — Purchase Card (•••• 6790, frozen state), spending balance, limit,
  recent transactions with merchant, category and relative date.
- **Learn** — short money lessons with a quiz; passing earns the family's lesson
  reward and a badge (brief: "rewards for completing educational modules").
- **Friends** — search, favorites, A–Z list; send money or ask a parent for money.
  Every request goes to a parent for approval (kids never move money unsupervised).
- **Report a problem** — from any transaction, "I don't recognize this" sends it to a
  parent to check.
- **Achievements** — badges computed from real progress, each with an explanation
  (UX evaluation: badges must reflect actual progress and explain themselves).

## Design decisions

- **Two brands, one family.** The parent dashboard uses the **new FlexFund brand**
  (purple `#9542FF`, circle-and-square mark, italic wordmark) per "let's use the new
  brand and logo". The kids app uses the spec-selected **Prototype B** identity
  (pink `#EB4489` / deep purple `#561C70`, pink→purple gradient, Bangers headline
  font, yellow dog mascot `#F7B500`).
- **Critique applied.** The Friends critique flagged pink-on-purple contrast and
  inconsistent hierarchy. The kids app therefore uses neutral system surfaces
  (grouped backgrounds, standard lists and cells) with brand color as accent and in
  hero areas only, 44pt+ touch targets, Dynamic Type, and system SF Symbols.
- **iOS standard components first.** `TabView`, `NavigationStack`, `List`,
  `Section`, `LabeledContent`, `ProgressView`/`Gauge`, `.searchable`,
  `ContentUnavailableView`, sheets, `ShareLink`, LocalAuthentication, Keychain.
- **Read-mostly kids app.** Per spec v1 is read-only consumption; the only kid
  writes are *requests* that a parent must approve (chore done, send/ask money) and
  lesson completion.
- **Money as integer cents, USD.** Balances are derived from an append-only ledger.
- **Security.** scrypt password hashing, opaque random session tokens stored only
  as SHA-256 hashes (no signing secrets to manage), PIN attempt lockout, device
  tokens separate from PIN-unlocked kid sessions, CORS allow-list, input
  validation on every endpoint, audit events for sensitive parent actions. No
  secrets are committed; configuration comes from environment variables.

## Out of scope (v1)

Real card issuing/processing, real bank linking (Plaid etc.), KYC, push/SMS
delivery, multi-currency (the "currency dropdown" backlog item), investment
portfolios and the social investment network (feature-request table: high effort),
teen driving rewards (Topdrive integration — noted as a future challenge type).

## Success metrics (from the brief)

- +30% users aged 18–35 within six months
- +50% peer-to-peer transaction volume
- 4.5+ star app store rating
