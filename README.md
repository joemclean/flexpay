# FlexFund Family

Family banking for the FlexFund redesign: parents manage kids' money in a web
**Family Dashboard**, and kids see, save and learn in the **FlexFund Kids** iPhone
app. Built from the FlexFund Family Miro space — see [docs/PRODUCT.md](docs/PRODUCT.md)
for how each board maps to what's here, and [docs/API.md](docs/API.md) for the API.

```
server/   Family Account API — Hono + Node's built-in SQLite, ledger, scheduler   (TypeScript)
web/      Family Dashboard — React + TypeScript + shadcn/ui + Vite                (parents)
ios/      FlexFund Kids — SwiftUI, standard iOS components, XcodeGen project      (kids)
docs/     Product definition and API contract
assets/   Brand assets pulled from the Miro space
```

## Quick start

Requirements: Node 24+, Xcode 26+ with an iOS 26 simulator runtime, and
[XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) if you
want to regenerate the Xcode project.

```bash
npm install
npm run dev          # API on :8787 and the dashboard on :5173
```

1. Open http://localhost:5173 and create a family. Leave **Include sample kids &
   activity** checked to get Finn and Emma with ~9 weeks of history.
2. Open a child (e.g. Finn) → **Settings → Connect a device** to get a 6-character
   pairing code.
3. Run the kids app: `open ios/FlexFundKids.xcodeproj`, pick an iPhone simulator,
   press Run. Tap **Connect with a code**, enter the code, and create a PIN.
   (Or pair instantly with `xcrun simctl openurl booted "flexfundkids://pair?code=ABC123"`.)
4. In the app, mark a challenge done or ask Mum for money — it shows up under
   **Needs your approval** in the dashboard. Approve it and pull to refresh in the app.

The simulator reaches the API at `http://localhost:8787`. For a physical iPhone,
run the API on your LAN and set the server URL on the app's welcome screen (debug
builds).

## Configuration

All configuration is via environment variables (nothing secret is stored in the repo).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | API port |
| `DATABASE_PATH` | `server/data/flexfund.db` | SQLite file (created automatically) |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Browser origins allowed to call the API |
| `SCHEDULER_INTERVAL_MS` | `15000` | How often due allowances are executed |
| `GOOGLE_CLIENT_ID` | — | Enables **Sign in with Google** (a public OAuth client ID; no secret needed) |
| `MFA_ENCRYPTION_KEY` | — | Enables parent **two-step verification**; encrypts TOTP seeds at rest. Load it from your secrets manager at runtime |
| `API_PROXY_TARGET` | `http://localhost:8787` | Where the dashboard dev server proxies `/api` |

## Tests

```bash
npm test                       # server: 35 tests (money rules, auth boundaries, scheduler, TOTP, timezones)
npm run typecheck              # server + web

# Dashboard end-to-end (Playwright, 20 flows incl. two-step sign-in and co-parent invites), against a running stack:
MFA_ENCRYPTION_KEY=$(openssl rand -hex 32) npm run dev    # in one terminal
npx playwright install chromium                          # first time only
npm run e2e                                              # screenshots land in web/e2e/screenshots/
```

The iOS project includes unit tests and end-to-end UI tests that drive the app against
a live API — see [ios/README.md](ios/README.md).

## How it works

- **Ledger.** Every movement of money is an append-only transaction in integer cents;
  pot and child balances are derived from it. Transfers are paired entries, so money
  is never created or lost. Declined card attempts are recorded but never move money.
- **Parental control.** Kids never move money on their own: chores, "send to a
  friend" and "ask Mum" create requests that a parent approves in the dashboard.
- **Allowance** follows the Tech Design board's *Recurring P2P Payments* spec: schedules
  (daily / weekly / fortnightly / monthly, timezone- and DST-aware), an execution log,
  idempotency keys per occurrence, pause / resume / cancel / run-now, and catch-up after
  downtime. An in-process scheduler stands in for the message-queue consumer.
- **Kid devices** pair with a single-use code, then unlock with a 4-digit PIN (5 tries,
  then a 5-minute lock) or Face ID. A device token alone can't read data — only a
  PIN-unlocked 12-hour kid session can.
- **Security.** scrypt password/PIN hashing; opaque random bearer tokens stored only as
  SHA-256 hashes; family-scoped queries on every endpoint; CORS allow-list; secure
  headers; rate limits on sign-in, pairing and PIN unlock; optional TOTP two-step
  verification; audit log for sensitive actions; request logs never include headers or
  bodies.

## Not included (v1)

Real card issuing/processing (the dashboard's *simulate purchase* stands in for a card
network), bank linking, KYC, push notifications, multi-currency, investing. See
[docs/PRODUCT.md](docs/PRODUCT.md#out-of-scope-v1).
