// End-to-end check of the Family Dashboard against a live API.
// Usage (from repo root):
//   MFA_ENCRYPTION_KEY=$(openssl rand -hex 32) npm run dev   # API + dashboard (MFA flow needs the key)
//   npm run e2e --workspace web                              # first time: npx playwright install chromium
// Env: WEB (default http://localhost:5173), SHOTS (screenshot dir, default web/e2e/screenshots).
import { createHmac, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.env.WEB ?? 'http://localhost:5173'
const SHOTS = process.env.SHOTS ?? new URL('./screenshots/', import.meta.url).pathname
fs.mkdirSync(SHOTS, { recursive: true })

// ---- TOTP (RFC 6238, SHA-1, 30s, 6 digits) ----
function base32Decode(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of s.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}
const step = () => Math.floor(Date.now() / 30000)
function totp(secret, s = step()) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(s))
  const h = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const o = h[h.length - 1] & 0xf
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0')
  return code
}
async function waitForNextStep(used) {
  while (step() <= used) await new Promise((r) => setTimeout(r, 500))
}

const results = []
let page
async function run(name, fn) {
  const t = Date.now()
  try {
    await fn()
    results.push(`PASS ${name} (${Date.now() - t}ms)`)
    console.log(`PASS ${name}`)
  } catch (err) {
    results.push(`FAIL ${name}: ${err.message.split('\n')[0]}`)
    console.log(`FAIL ${name}: ${err.message}`)
    await page?.screenshot({ path: `${SHOTS}/FAIL-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {})
  }
}
const shot = async (name, full = true) => {
  await page.waitForTimeout(450) // let dialog/sheet open-close animations settle
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
}
const toast = (text) => page.locator('[data-sonner-toast]').filter({ hasText: text }).first().waitFor({ timeout: 8000 })

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
page = await context.newPage()
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
page.on('response', (r) => r.status() >= 400 && consoleErrors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`))

const email = `sam+${Date.now()}@example.com`
const password = randomBytes(12).toString('base64url')
let mfaSecret = null
let lastStep = 0

await run('sign-up with sample data', async () => {
  await page.goto(`${BASE}/sign-up`)
  await page.getByLabel('Family name').waitFor()
  await shot('01-sign-up', false)
  await page.getByLabel('Family name').fill('The Taylors')
  await page.getByLabel('Your name').fill('Sam Taylor')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening), Sam/ }).waitFor()
  await page.getByText('Family balance').waitFor()
  await page.waitForLoadState('networkidle')
  await shot('02-overview')
})

await run('approve an item from the queue', async () => {
  const card = page.locator('[data-slot=card]').filter({ hasText: 'Needs your approval' })
  const before = await card.getByRole('button', { name: /^Approve:/ }).count()
  await card.getByRole('button', { name: /^Approve:/ }).first().click()
  await toast(/paid|added|Sent|Approved/)
  await page.waitForFunction((n) => document.querySelectorAll('button[aria-label^="Approve:"]').length < n * 2, before)
  await shot('03-overview-after-approve')
})

await run('open Finn', async () => {
  await page.getByRole('link', { name: /Finn/ }).first().click()
  await page.getByRole('heading', { name: 'Finn' }).waitFor()
  await page.getByText('Achievements').waitFor()
  await page.waitForLoadState('networkidle')
  await shot('04-child-overview')
})

await run('create pot + move money', async () => {
  await page.getByRole('tab', { name: 'Pots' }).click()
  await page.getByRole('button', { name: 'New pot' }).click()
  await page.getByLabel('Name').fill('Skateboard')
  await page.getByLabel('Goal (optional)').fill('80')
  await page.getByRole('button', { name: 'Create pot' }).click()
  await toast('Skateboard pot created')
  await page.getByTestId('pot-Skateboard').waitFor()
  await page.getByTestId('pot-Skateboard').getByRole('button', { name: 'Move' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Amount').fill('5')
  await dialog.getByRole('button', { name: /Move \$5\.00/ }).click()
  await toast('Moved $5.00 to Skateboard')
  await page.getByTestId('pot-Skateboard').getByText('$5.00').first().waitFor()
  await shot('05-pots')
})

await run('chores tab', async () => {
  await page.getByRole('tab', { name: 'Chores' }).click()
  await page.getByText('Chores & challenges').waitFor()
  await page.getByRole('button', { name: 'New' }).click()
  await page.getByLabel('What needs doing?').fill('Water the plants')
  await page.getByRole('radio', { name: 'Daily' }).click()
  await page.getByRole('button', { name: 'Add challenge' }).click()
  await toast('Water the plants added')
  await page.waitForLoadState('networkidle')
  await shot('06-chores')
})

await run('allowance: create + pay now + details', async () => {
  await page.getByRole('tab', { name: 'Allowance' }).click()
  await page.getByRole('button', { name: 'New allowance' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Amount').fill('3')
  await dialog.getByLabel('Label (optional)').fill('Snack money')
  await dialog.getByRole('button', { name: 'Start allowance' }).click()
  await toast(/allowance set up for Finn/)
  const card = page.locator('[data-slot=card]').filter({ hasText: 'Snack money' })
  await card.getByRole('button', { name: 'Pay now' }).click()
  await toast('$3.00 paid to Finn')
  await card.getByText('1 paid so far').waitFor()
  await shot('07-allowance')
  await card.getByRole('button', { name: 'Details' }).click()
  await page.getByText('Payment log').waitFor()
  await page.getByRole('dialog').getByText('Paid now').waitFor()
  await shot('08-allowance-details', false)
  await page.keyboard.press('Escape')
})

await run('card: freeze + declined purchase, unfreeze + foreign fee', async () => {
  await page.getByRole('tab', { name: 'Card' }).click()
  await page.getByRole('switch', { name: /Freeze card/ }).click()
  await toast('card is frozen')
  await page.getByRole('img', { name: /frozen/ }).waitFor()
  await page.getByRole('button', { name: 'Simulate a purchase' }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /Pizza Papi/ }).click()
  await dialog.getByRole('button', { name: 'Charge card' }).click()
  await dialog.getByText('Declined', { exact: true }).waitFor()
  await shot('09-card-declined', false)
  await dialog.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('switch', { name: /Freeze card/ }).click()
  await toast('active again')
  await page.getByRole('button', { name: 'Simulate a purchase' }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /Steam/ }).click()
  await dialog.getByRole('button', { name: 'Charge card' }).click()
  await dialog.getByText('Approved', { exact: true }).waitFor()
  await dialog.getByRole('status').getByText(/foreign transaction fee/).waitFor()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await page.waitForLoadState('networkidle')
  await shot('10-card')
})

await run('child activity, friends, lessons tabs', async () => {
  await page.getByRole('tab', { name: 'Activity' }).click()
  await page.getByText('Pizza Papi').first().waitFor()
  await shot('11-child-activity')
  await page.getByRole('tab', { name: 'Friends' }).click()
  await page.getByText('James F').first().waitFor()
  await shot('12-friends')
  await page.getByRole('tab', { name: 'Lessons' }).click()
  await page.getByText('Money lessons').waitFor()
  await page.getByText('Needs vs. wants').waitFor()
  await shot('13-lessons')
})

let parentToken = null
let finnId = null
await run('settings tab + pairing code', async () => {
  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByText('App PIN').waitFor()
  await shot('14-child-settings')
  await page.getByRole('button', { name: 'Connect a device' }).click()
  const code = await page.getByTestId('pairing-code').textContent()
  if (!/^[A-Z0-9]{6}$/.test(code ?? '')) throw new Error(`bad code ${code}`)
  await page.getByText(/Expires in \d+:\d\d/).waitFor()
  await shot('15-pairing', false)
  await page.keyboard.press('Escape')
  finnId = page.url().split('/children/')[1].split('/')[0]
  parentToken = await page.evaluate(() => localStorage.getItem('flexfund.parentToken'))
})

await run('kid reports a charge (via kid API) → resolve on overview', async () => {
  const api = async (path, body, token) => {
    const r = await fetch(`${BASE}/api/v1${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j)}`)
    return j
  }
  const code = await api(`/children/${finnId}/pairing-codes`, {}, parentToken)
  const pair = await api('/kid/pair', { code: code.code, deviceName: 'Finn’s iPhone' })
  const pinSession = await api('/kid/device/pin', { pin: '2580' }, pair.deviceToken)
  const wallet = await api('/kid/wallet', null, pinSession.token)
  const tx = wallet.transactions.find((t) => t.title === 'DT Theatre') ?? wallet.transactions.find((t) => t.kind === 'card_purchase')
  await api(`/kid/transactions/${tx.id}/report`, { reason: 'dont_recognize', note: 'I was at school' }, pinSession.token)
  await page.getByRole('link', { name: 'Overview' }).click()
  const reports = page.locator('[data-slot=card]').filter({ hasText: 'Reported charges' })
  await reports.waitFor()
  await reports.getByText('I was at school').waitFor()
  await shot('16-overview-report')
  await reports.getByRole('button', { name: 'Mark as checked' }).click()
  await toast('Marked as checked')
  await reports.waitFor({ state: 'detached' })
})

await run('activity page + declined filter + load more', async () => {
  await page.getByRole('link', { name: 'Activity' }).click()
  await page.getByRole('heading', { name: 'Activity' }).waitFor()
  await page.locator('table tbody tr').first().waitFor()
  await shot('17-activity')
  if (await page.getByRole('button', { name: 'Load more' }).isVisible()) {
    const before = await page.locator('table tbody tr').count()
    await page.getByRole('button', { name: 'Load more' }).click()
    await page.waitForFunction((n) => document.querySelectorAll('table tbody tr').length > n, before)
  }
  await page.getByRole('combobox', { name: 'Status' }).click()
  await page.getByRole('option', { name: 'Declined' }).click()
  await page.getByText('Declined · Card frozen').first().waitFor()
  await shot('18-activity-declined')
  await page.getByRole('button', { name: 'Clear' }).click()
  await page.getByLabel('Search').fill('pizza')
  await page.waitForTimeout(600)
  await page.waitForLoadState('networkidle')
  const rows = await page.locator('table tbody tr').allTextContents()
  if (!rows.length || !rows.every((r) => /pizza/i.test(r))) throw new Error(`search mismatch: ${rows.length}`)
})

await run('insights page', async () => {
  await page.getByRole('link', { name: 'Insights' }).click()
  await page.getByText('Fees & charges').waitFor()
  await page.getByText('Spending by category').waitFor()
  await page.locator('.recharts-surface').first().waitFor()
  await page.waitForTimeout(800)
  await shot('19-insights')
  await page.getByRole('radio', { name: '90 days' }).click()
  await page.waitForLoadState('networkidle')
  await page.getByText(/previous 90 days/).waitFor()
})

await run('settings page + enable two-step verification', async () => {
  await page.getByRole('link', { name: 'Settings' }).first().click()
  await page.getByRole('heading', { name: 'Settings' }).waitFor()
  await page.getByText('Security & audit log').waitFor()
  await shot('20-settings')
  await page.getByRole('button', { name: 'Set up two-step verification' }).click()
  mfaSecret = (await page.getByTestId('mfa-secret').textContent()).trim()
  await shot('21-mfa-setup', false)
  lastStep = step()
  await page.getByLabel('2. Enter the 6-digit code it shows').fill(totp(mfaSecret, lastStep))
  await page.getByRole('button', { name: 'Turn on' }).click()
  await toast('Two-step verification is on')
  await page.getByText('To turn it off, enter a current code').waitFor()
})

await run('sign out → sign in with password + TOTP', async () => {
  await page.getByRole('button', { name: /Sam Taylor/ }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor()
  await shot('22-sign-in', false)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Two-step verification' }).waitFor()
  await shot('23-mfa-step', false)
  await waitForNextStep(lastStep)
  lastStep = step()
  await page.getByLabel('Verification code').fill(totp(mfaSecret, lastStep))
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening), Sam/ }).waitFor()
})

await run('wrong password shows error', async () => {
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p2 = await ctx2.newPage()
  await p2.goto(`${BASE}/sign-in`)
  await p2.getByLabel('Email').fill(email)
  await p2.getByLabel('Password').fill('not-the-password')
  await p2.getByRole('button', { name: 'Sign in' }).click()
  await p2.getByText('Email or password is incorrect').waitFor()
  await ctx2.close()
})

await run('dark mode overview', async () => {
  await page.evaluate(() => localStorage.setItem('theme', 'dark'))
  await page.reload()
  await page.getByText('Family balance').waitFor()
  await page.waitForLoadState('networkidle')
  await shot('24-overview-dark')
  await page.goto(`${BASE}/children/${finnId}/card`)
  await page.getByText('Recent card activity').waitFor()
  await page.waitForLoadState('networkidle')
  await shot('25-card-dark')
  await page.goto(`${BASE}/insights`)
  await page.locator('.recharts-surface').first().waitFor()
  await page.waitForTimeout(800)
  await shot('26-insights-dark')
  await page.evaluate(() => localStorage.setItem('theme', 'light'))
})

await run('mobile 390px screens', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/`)
  await page.getByText('Family balance').waitFor()
  await page.waitForLoadState('networkidle')
  await shot('27-mobile-overview')
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click()
  await page.getByRole('link', { name: /Emma/ }).waitFor()
  await shot('28-mobile-sidebar', false)
  await page.getByRole('link', { name: /Emma/ }).click()
  await page.getByRole('heading', { name: 'Emma' }).waitFor()
  await page.waitForLoadState('networkidle')
  await shot('29-mobile-child')
  await page.goto(`${BASE}/children/${finnId}/allowance`)
  await page.getByRole('button', { name: 'New allowance' }).waitFor()
  await page.waitForLoadState('networkidle')
  await shot('30-mobile-allowance')
  await page.goto(`${BASE}/activity`)
  await page.getByRole('heading', { name: 'Activity' }).waitFor()
  await page.waitForLoadState('networkidle')
  await shot('31-mobile-activity')
  await page.goto(`${BASE}/insights`)
  await page.getByText('Fees & charges').waitFor()
  await page.waitForTimeout(800)
  await shot('32-mobile-insights')
  await page.goto(`${BASE}/sign-in`)
})

await run('mobile auth screen', async () => {
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const p3 = await ctx3.newPage()
  await p3.goto(`${BASE}/sign-up`)
  await p3.getByLabel('Family name').waitFor()
  await p3.screenshot({ path: `${SHOTS}/33-mobile-sign-up.png`, fullPage: true })
  await ctx3.close()
})

await run('invite a co-parent → they join the family', async () => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/settings`)
  await page.getByRole('button', { name: 'Invite a co-parent' }).click()
  await page.getByLabel('Their email (optional)').fill(`co+${Date.now()}@example.com`)
  await page.getByRole('button', { name: 'Create invite link' }).click()
  const link = await page.getByLabel('Invite link').inputValue()
  await shot('34-invite-link', false)
  await page.getByRole('button', { name: 'Done' }).click()

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p2 = await ctx.newPage()
  await p2.goto(link)
  await p2.getByRole('heading', { name: /^Join / }).waitFor()
  await p2.getByLabel('Your name').fill('Alex Taylor')
  await p2.getByLabel('Password').fill(randomBytes(12).toString('base64url'))
  await p2.waitForTimeout(300)
  await p2.screenshot({ path: `${SHOTS}/35-join-family.png` })
  await p2.getByRole('button', { name: 'Join family' }).click()
  await p2.getByText('Needs your approval').waitFor({ timeout: 10000 })
  await p2.screenshot({ path: `${SHOTS}/36-co-parent-overview.png` })
  await ctx.close()

  await page.reload()
  await page.getByText('Alex Taylor').first().waitFor()
  await shot('37-settings-two-parents', false)
})

await run('unknown route + 401 handling', async () => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/nope`)
  await page.getByText('Page not found').waitFor()
  await page.evaluate(() => localStorage.setItem('flexfund.parentToken', 'bogus-token'))
  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor({ timeout: 10000 })
})

await browser.close()
console.log('\n' + results.join('\n'))
console.log(`\nconsole errors: ${consoleErrors.length}`)
for (const e of consoleErrors.slice(0, 15)) console.log('  ', e.slice(0, 300))
const failed = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n${results.length - failed}/${results.length} flows passed · screenshots in ${SHOTS}`)
process.exit(failed ? 1 : 0)
