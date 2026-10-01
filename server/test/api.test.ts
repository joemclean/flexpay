import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { executeOccurrence, runDueSchedules } from '../src/services/scheduler.js';

const db = openDatabase(':memory:');
const app = createApp(db, { logRequests: false });

let ipCounter = 0;
async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await app.request(`/api/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.0.0.${++ipCounter % 250}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as any };
}

const password = () => randomBytes(12).toString('base64url');

async function signup(sample = true) {
  const r = await call('POST', '/auth/signup', {
    familyName: 'Test family',
    name: 'Pat Parent',
    email: `pat+${randomBytes(4).toString('hex')}@example.com`,
    password: password(),
    timezone: 'America/New_York',
    includeSampleData: sample,
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json as { token: string; family: { id: string } };
}

async function pairKid(parentToken: string, childId: string, pin = '2580') {
  const code = await call('POST', `/children/${childId}/pairing-codes`, undefined, parentToken);
  const pair = await call('POST', '/kid/pair', { code: code.json.code, deviceName: 'Test iPhone' });
  assert.equal(pair.status, 201);
  const device = pair.json.deviceToken as string;
  const setup = await call('POST', '/kid/device/pin', { pin }, device);
  assert.equal(setup.status, 201, JSON.stringify(setup.json));
  return { device, kid: setup.json.token as string };
}

describe('parent onboarding', () => {
  it('rejects weak passwords and duplicate emails', async () => {
    const weak = await call('POST', '/auth/signup', { familyName: 'X', name: 'Y', email: 'weak@example.com', password: 'short' });
    assert.equal(weak.status, 400);
    const pw = password();
    const first = await call('POST', '/auth/signup', { familyName: 'X', name: 'Y', email: 'dupe@example.com', password: pw, includeSampleData: false });
    assert.equal(first.status, 201);
    const second = await call('POST', '/auth/signup', { familyName: 'X', name: 'Y', email: 'DUPE@example.com', password: pw });
    assert.equal(second.status, 409);
    assert.equal(second.json.error.code, 'email_taken');
  });

  it('logs in with the right password only', async () => {
    const pw = password();
    await call('POST', '/auth/signup', { familyName: 'L', name: 'L', email: 'login@example.com', password: pw, includeSampleData: false });
    assert.equal((await call('POST', '/auth/login', { email: 'login@example.com', password: 'wrong-password' })).status, 401);
    const ok = await call('POST', '/auth/login', { email: 'login@example.com', password: pw });
    assert.equal(ok.status, 200);
    assert.equal((await call('GET', '/auth/me', undefined, ok.json.token)).status, 200);
    await call('POST', '/auth/logout', undefined, ok.json.token);
    assert.equal((await call('GET', '/auth/me', undefined, ok.json.token)).status, 401);
  });

  it('creates consistent sample data', async () => {
    const { token } = await signup();
    const overview = await call('GET', '/overview', undefined, token);
    assert.equal(overview.status, 200);
    assert.equal(overview.json.children.length, 2);
    const finn = overview.json.children.find((c: { name: string }) => c.name === 'Finn');
    assert.ok(finn.spendingCents > 0, 'spending pot is positive');
    assert.equal(finn.streakWeeks, 3);
    assert.equal(finn.card.last4, '6790');
    assert.ok(overview.json.approvals.length >= 2);
    const total = overview.json.children.reduce((s: number, c: { totalCents: number }) => s + c.totalCents, 0);
    assert.equal(overview.json.totals.balanceCents, total);
  });
});

describe('co-parent invites', () => {
  it('lets a second parent join the same family exactly once', async () => {
    const { token, family } = await signup();
    const invite = await call('POST', '/family/invites', { email: 'co@example.com' }, token);
    assert.equal(invite.status, 201);
    const info = await call('GET', `/auth/invites/${invite.json.code}`);
    assert.equal(info.json.familyName, 'Test family');
    assert.equal(info.json.invitedBy, 'Pat Parent');
    const join = await call('POST', '/auth/signup', {
      inviteCode: invite.json.code,
      name: 'Casey Parent',
      email: `casey+${randomBytes(3).toString('hex')}@example.com`,
      password: password(),
    });
    assert.equal(join.status, 201);
    assert.equal(join.json.family.id, family.id);
    // The co-parent sees the same kids and no sample data was added.
    const kids = await call('GET', '/children', undefined, join.json.token);
    assert.equal(kids.json.items.length, 2);
    assert.equal((await call('GET', '/family', undefined, token)).json.parents.length, 2);
    // Single use.
    const again = await call('POST', '/auth/signup', { inviteCode: invite.json.code, name: 'X', email: 'x2@example.com', password: password() });
    assert.equal(again.status, 400);
    assert.equal(again.json.error.code, 'invalid_invite');
  });

  it('requires a family name when there is no invite', async () => {
    const r = await call('POST', '/auth/signup', { name: 'N', email: 'nofam@example.com', password: password() });
    assert.equal(r.status, 400);
  });
});

describe('family isolation', () => {
  it('prevents one family from reading or changing another family’s child', async () => {
    const a = await signup();
    const b = await signup(false);
    const childA = (await call('GET', '/children', undefined, a.token)).json.items[0].id;
    assert.equal((await call('GET', `/children/${childA}`, undefined, b.token)).status, 404);
    assert.equal((await call('PATCH', `/children/${childA}/card`, { status: 'frozen' }, b.token)).status, 404);
    assert.equal((await call('POST', `/children/${childA}/deposits`, { amountCents: 100 }, b.token)).status, 404);
    assert.equal((await call('GET', `/transactions?childId=${childA}`, undefined, b.token)).status, 404);
  });

  it('keeps kid tokens off parent routes and vice versa', async () => {
    const { token } = await signup();
    const child = (await call('GET', '/children', undefined, token)).json.items[0].id;
    const { device, kid } = await pairKid(token, child);
    assert.equal((await call('GET', '/overview', undefined, kid)).status, 401);
    assert.equal((await call('GET', '/kid/home', undefined, device)).status, 401);
    assert.equal((await call('GET', '/kid/home', undefined, token)).status, 401);
    assert.equal((await call('GET', '/kid/home', undefined, kid)).status, 200);
  });
});

describe('kid device lifecycle', () => {
  let token: string;
  let childId: string;
  before(async () => {
    ({ token } = await signup());
    childId = (await call('GET', '/children', undefined, token)).json.items[0].id;
  });

  it('uses pairing codes once', async () => {
    const code = (await call('POST', `/children/${childId}/pairing-codes`, undefined, token)).json.code;
    assert.equal((await call('POST', '/kid/pair', { code })).status, 201);
    const reuse = await call('POST', '/kid/pair', { code });
    assert.equal(reuse.status, 400);
    assert.equal(reuse.json.error.code, 'invalid_code');
  });

  it('rejects trivial PINs and locks after repeated misses', async () => {
    const code = (await call('POST', `/children/${childId}/pairing-codes`, undefined, token)).json.code;
    const device = (await call('POST', '/kid/pair', { code })).json.deviceToken;
    assert.equal((await call('POST', '/kid/device/pin', { pin: '1111' }, device)).status, 400);
    assert.equal((await call('POST', '/kid/device/pin', { pin: '7391' }, device)).status, 201);
    for (let i = 1; i <= 4; i++) {
      const r = await call('POST', '/kid/device/unlock', { pin: '0000' }, device);
      assert.equal(r.status, 401);
      assert.equal(r.json.error.attemptsRemaining, 5 - i);
    }
    const locked = await call('POST', '/kid/device/unlock', { pin: '0000' }, device);
    assert.equal(locked.status, 423);
    assert.ok(locked.json.error.lockedUntil);
    // Even the right PIN is refused while locked.
    assert.equal((await call('POST', '/kid/device/unlock', { pin: '7391' }, device)).status, 423);
    // A parent resetting the PIN clears the lock.
    await call('PUT', `/children/${childId}/pin`, { pin: '8642' }, token);
    assert.equal((await call('POST', '/kid/device/unlock', { pin: '8642' }, device)).status, 200);
  });

  it('disconnects a device when the parent revokes it', async () => {
    const fresh = (await call('POST', '/children', { name: 'Lou', avatar: '🐼' }, token)).json.id;
    const { device, kid } = await pairKid(token, fresh, '9517');
    const devices = (await call('GET', `/children/${fresh}`, undefined, token)).json.devices;
    assert.equal(devices.length, 1);
    for (const d of devices) await call('DELETE', `/devices/${d.id}`, undefined, token);
    assert.equal((await call('GET', '/kid/home', undefined, kid)).status, 401);
    assert.equal((await call('GET', '/kid/device/status', undefined, device)).status, 401);
  });
});

describe('money rules', () => {
  let token: string;
  let childId: string;
  let kid: string;
  before(async () => {
    ({ token } = await signup(false));
    const created = await call('POST', '/children', { name: 'Robin', avatar: '🦉' }, token);
    assert.equal(created.status, 201);
    childId = created.json.id;
    await call('POST', `/children/${childId}/deposits`, { amountCents: 2000 }, token);
    ({ kid } = await pairKid(token, childId, '3691'));
  });

  it('enforces freeze, balance and daily limit on card purchases', async () => {
    await call('PATCH', `/children/${childId}/card`, { status: 'frozen', dailyLimitCents: 1500 }, token);
    const frozen = await call('POST', `/children/${childId}/card/simulate-purchase`, { merchant: 'Shop', amountCents: 100 }, token);
    assert.equal(frozen.json.approved, false);
    assert.equal(frozen.json.declineReason, 'card_frozen');
    await call('PATCH', `/children/${childId}/card`, { status: 'active' }, token);
    const tooMuch = await call('POST', `/children/${childId}/card/simulate-purchase`, { merchant: 'Shop', amountCents: 2500 }, token);
    assert.equal(tooMuch.json.declineReason, 'insufficient_funds');
    const ok = await call('POST', `/children/${childId}/card/simulate-purchase`, { merchant: 'Shop', amountCents: 1000 }, token);
    assert.equal(ok.json.approved, true);
    const overLimit = await call('POST', `/children/${childId}/card/simulate-purchase`, { merchant: 'Shop', amountCents: 600 }, token);
    assert.equal(overLimit.json.declineReason, 'daily_limit');
    const home = await call('GET', '/kid/home', undefined, kid);
    assert.equal(home.json.spendingCents, 1000, 'declined attempts do not move money');
  });

  it('charges a foreign transaction fee and reports it in insights', async () => {
    await call('PATCH', `/children/${childId}/card`, { dailyLimitCents: 50000 }, token);
    const r = await call('POST', `/children/${childId}/card/simulate-purchase`, { merchant: 'Abroad', amountCents: 400, foreign: true }, token);
    assert.equal(r.json.approved, true);
    assert.equal(r.json.fee.amountCents, -10);
    const insights = await call('GET', `/insights?childId=${childId}&days=7`, undefined, token);
    assert.equal(insights.json.fees.totalCents, 10);
    assert.equal(insights.json.fees.byType[0].title, 'Foreign transaction fee');
  });

  it('pays chore rewards only after approval, once per period', async () => {
    const ch = (await call('POST', `/children/${childId}/challenges`, { title: 'Water plants', emoji: '🪴', rewardCents: 150, recurrence: 'daily' }, token)).json;
    const start = (await call('GET', '/kid/home', undefined, kid)).json.spendingCents;
    assert.equal((await call('POST', `/kid/challenges/${ch.id}/complete`, undefined, kid)).status, 201);
    assert.equal((await call('POST', `/kid/challenges/${ch.id}/complete`, undefined, kid)).status, 409);
    assert.equal((await call('GET', '/kid/home', undefined, kid)).json.spendingCents, start);
    const approval = (await call('GET', '/approvals', undefined, token)).json.items.find((a: { title: string }) => a.title === 'Water plants');
    assert.equal((await call('POST', `/approvals/challenge-completions/${approval.id}/approve`, undefined, token)).status, 200);
    assert.equal((await call('POST', `/approvals/challenge-completions/${approval.id}/approve`, undefined, token)).status, 409);
    assert.equal((await call('GET', '/kid/home', undefined, kid)).json.spendingCents, start + 150);
  });

  it('only lets kids ask parents for money and requires approval to send', async () => {
    const friend = (await call('POST', `/children/${childId}/contacts`, { name: 'Sam', avatar: '🐸', relationship: 'friend' }, token)).json;
    const mum = (await call('POST', `/children/${childId}/contacts`, { name: 'Mum', avatar: '👩', relationship: 'parent' }, token)).json;
    assert.equal((await call('POST', '/kid/money-requests', { contactId: friend.id, direction: 'request', amountCents: 100 }, kid)).status, 400);
    const ask = await call('POST', '/kid/money-requests', { contactId: mum.id, direction: 'request', amountCents: 300 }, kid);
    assert.equal(ask.status, 201);
    const send = await call('POST', '/kid/money-requests', { contactId: friend.id, direction: 'send', amountCents: 200 }, kid);
    assert.equal(send.status, 201);
    const balance = (await call('GET', '/kid/home', undefined, kid)).json.spendingCents;
    await call('POST', `/approvals/money-requests/${ask.json.id}/approve`, undefined, token);
    await call('POST', `/approvals/money-requests/${send.json.id}/approve`, undefined, token);
    assert.equal((await call('GET', '/kid/home', undefined, kid)).json.spendingCents, balance + 300 - 200);
  });

  it('rewards a lesson only on the first pass and never leaks answers', async () => {
    const lesson = await call('GET', '/kid/lessons/how-cards-work', undefined, kid);
    assert.ok(!JSON.stringify(lesson.json).includes('answerIndex'));
    const failed = await call('POST', '/kid/lessons/how-cards-work/complete', { answers: [2, 2, 2] }, kid);
    assert.equal(failed.json.passed, false);
    assert.equal(failed.json.rewardCents, 0);
    const passed = await call('POST', '/kid/lessons/how-cards-work/complete', { answers: [0, 1, 1] }, kid);
    assert.equal(passed.json.passed, true);
    assert.equal(passed.json.rewardCents, 50);
    const again = await call('POST', '/kid/lessons/how-cards-work/complete', { answers: [0, 1, 1] }, kid);
    assert.equal(again.json.rewardCents, 0);
    assert.equal(again.json.alreadyCompleted, true);
  });

  it('lets a kid report a transaction and a parent resolve it by freezing the card', async () => {
    const wallet = (await call('GET', '/kid/wallet', undefined, kid)).json;
    const tx = wallet.transactions.find((t: { kind: string }) => t.kind === 'card_purchase');
    const report = await call('POST', `/kid/transactions/${tx.id}/report`, { reason: 'dont_recognize' }, kid);
    assert.equal(report.status, 201);
    assert.equal((await call('POST', `/kid/transactions/${tx.id}/report`, { reason: 'other' }, kid)).status, 409);
    const overview = (await call('GET', '/overview', undefined, token)).json;
    const open = overview.openReports.find((r: { id: string }) => r.id === report.json.id);
    assert.equal(open.transaction.id, tx.id);
    assert.equal(open.reasonLabel, 'I don’t recognize this');
    const resolved = await call('POST', `/reports/${report.json.id}/resolve`, { freezeCard: true }, token);
    assert.equal(resolved.json.status, 'resolved');
    assert.equal((await call('GET', `/children/${childId}/card`, undefined, token)).json.status, 'frozen');
    assert.equal((await call('GET', `/kid/transactions/${tx.id}`, undefined, kid)).json.report.status, 'resolved');
    await call('PATCH', `/children/${childId}/card`, { status: 'active' }, token);
  });

  it('moves money between pots without creating or losing any', async () => {
    const pot = (await call('POST', `/children/${childId}/pots`, { name: 'Skateboard', emoji: '🛹', goalCents: 5000 }, token)).json;
    const pots = (await call('GET', `/children/${childId}/pots`, undefined, token)).json.items;
    const spending = pots.find((p: { isSpending: boolean }) => p.isSpending);
    const totalBefore = (await call('GET', '/kid/home', undefined, kid)).json.totalCents;
    const t = await call('POST', `/children/${childId}/transfers`, { fromPotId: spending.id, toPotId: pot.id, amountCents: 500 }, token);
    assert.equal(t.status, 201);
    const tooMuch = await call('POST', `/children/${childId}/transfers`, { fromPotId: pot.id, toPotId: spending.id, amountCents: 99999 }, token);
    assert.equal(tooMuch.json.error.code, 'insufficient_funds');
    const home = (await call('GET', '/kid/home', undefined, kid)).json;
    assert.equal(home.totalCents, totalBefore);
    assert.equal(home.pots.find((p: { id: string }) => p.id === pot.id).balanceCents, 500);
  });
});

describe('allowance scheduler', () => {
  it('executes due schedules exactly once per occurrence', async () => {
    const { token } = await signup(false);
    const childId = (await call('POST', '/children', { name: 'Jo', avatar: '🐢' }, token)).json.id;
    const s = (await call('POST', `/children/${childId}/schedules`, { amountCents: 500, frequency: 'weekly', weekday: 1 }, token)).json;
    assert.equal(s.status, 'active');
    assert.ok(s.nextRunAt);

    // Pretend the clock reached the scheduled time.
    const due = new Date(Date.parse(s.nextRunAt) + 1000);
    const first = runDueSchedules(db, due).filter((e) => e.schedule_id === s.id);
    assert.equal(first.length, 1);
    assert.equal(runDueSchedules(db, due).filter((e) => e.schedule_id === s.id).length, 0);

    // Re-delivering the same occurrence is idempotent.
    const replay = executeOccurrence(db, s.id, { trigger: 'schedule', scheduledFor: s.nextRunAt, now: due });
    assert.equal(replay.id, first[0]!.id);

    const after = (await call('GET', `/schedules/${s.id}`, undefined, token)).json;
    assert.equal(after.occurrenceCount, 1);
    assert.ok(Date.parse(after.nextRunAt) > Date.parse(s.nextRunAt));
    assert.equal(after.upcoming.length, 5);
    const balance = (await call('GET', `/children/${childId}`, undefined, token)).json.spendingCents;
    assert.equal(balance, 500);
  });

  it('pauses, resumes, runs now and cancels', async () => {
    const { token } = await signup(false);
    const childId = (await call('POST', '/children', { name: 'Kai', avatar: '🐙' }, token)).json.id;
    const s = (await call('POST', `/children/${childId}/schedules`, { amountCents: 300, frequency: 'monthly', dayOfMonth: 31 }, token)).json;
    assert.equal((await call('POST', `/schedules/${s.id}/pause`, undefined, token)).json.status, 'paused');
    assert.equal((await call('POST', `/schedules/${s.id}/resume`, undefined, token)).json.status, 'active');
    const run = await call('POST', `/schedules/${s.id}/run-now`, undefined, token);
    assert.equal(run.status, 201);
    assert.equal(run.json.execution.status, 'completed');
    assert.equal((await call('GET', `/schedules/${s.id}/executions`, undefined, token)).json.items.length, 1);
    assert.equal((await call('POST', `/schedules/${s.id}/cancel`, undefined, token)).json.status, 'canceled');
    assert.equal((await call('POST', `/schedules/${s.id}/run-now`, undefined, token)).status, 409);
  });

  it('validates schedule input', async () => {
    const { token } = await signup(false);
    const childId = (await call('POST', '/children', { name: 'Ash', avatar: '🦔' }, token)).json.id;
    const noDay = await call('POST', `/children/${childId}/schedules`, { amountCents: 300, frequency: 'weekly' }, token);
    assert.equal(noDay.status, 400);
    const backwards = await call('POST', `/children/${childId}/schedules`, { amountCents: 300, frequency: 'daily', startDate: '2026-12-10', endDate: '2026-12-01' }, token);
    assert.equal(backwards.status, 400);
  });
});
