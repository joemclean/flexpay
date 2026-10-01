import { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, audit, revokeSessions } from '../auth.js';
import { config } from '../config.js';
import { hashSecret, newPairingCode } from '../lib/crypto.js';
import { notFound } from '../lib/errors.js';
import { body, emoji, name, pin } from '../lib/validate.js';
import { achievements, childDetail, childSummary, getChildInFamily } from '../services/children.js';
import { createChild } from '../services/family.js';
import { LESSONS } from '../services/lessons.js';
import type { ChildRow, DeviceRow, LessonCompletionRow, ParentRow } from '../types.js';

export const childrenRoutes = new Hono<AppEnv>();

const actor = (c: { get(k: 'parent'): ParentRow }) => `parent:${c.get('parent').id}`;
const birthYear = z.number().int().min(new Date().getFullYear() - 19).max(new Date().getFullYear()).nullable().optional();

childrenRoutes.get('/children', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const children = db.all<ChildRow>('SELECT * FROM children WHERE family_id = ? ORDER BY created_at', family.id);
  return c.json({ items: children.map((ch) => childSummary(db, ch, family)) });
});

childrenRoutes.post('/children', async (c) => {
  const input = await body(c, z.object({ name, avatar: emoji.default('🐶'), birthYear, pin: pin.optional() }));
  const db = c.get('db');
  const family = c.get('family');
  const pinHash = input.pin ? await hashSecret(input.pin) : null;
  const child = createChild(db, family, { name: input.name, avatar: input.avatar, birthYear: input.birthYear });
  if (pinHash) db.update('children', child.id, { pin_hash: pinHash });
  audit(db, family.id, actor(c), 'child.created', { type: 'child', id: child.id }, { name: input.name });
  const created = db.get<ChildRow>('SELECT * FROM children WHERE id = ?', child.id)!;
  return c.json(childDetail(db, created, family), 201);
});

childrenRoutes.get('/children/:id', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  return c.json(childDetail(db, getChildInFamily(db, family.id, c.req.param('id')), family));
});

childrenRoutes.patch('/children/:id', async (c) => {
  const input = await body(c, z.object({ name: name.optional(), avatar: emoji.optional(), birthYear }));
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  db.update('children', child.id, { name: input.name, avatar: input.avatar, birth_year: input.birthYear });
  return c.json(childDetail(db, getChildInFamily(db, family.id, child.id), family));
});

childrenRoutes.get('/children/:id/achievements', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  return c.json({ items: achievements(db, getChildInFamily(db, family.id, c.req.param('id')), family) });
});

// ---- PIN ------------------------------------------------------------------------

childrenRoutes.put('/children/:id/pin', async (c) => {
  const input = await body(c, z.object({ pin }));
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  const pinHash = await hashSecret(input.pin);
  db.update('children', child.id, { pin_hash: pinHash, pin_failed_attempts: 0, pin_locked_until: null });
  revokeKidSessions(db, child.id);
  audit(db, family.id, actor(c), 'child.pin_set', { type: 'child', id: child.id });
  return c.json({ ok: true, hasPin: true });
});

/** Clear the PIN; the kid creates a new one on their device at next unlock. */
childrenRoutes.delete('/children/:id/pin', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  db.run('UPDATE children SET pin_hash = NULL, pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = ?', child.id);
  revokeKidSessions(db, child.id);
  audit(db, family.id, actor(c), 'child.pin_reset', { type: 'child', id: child.id });
  return c.json({ ok: true, hasPin: false });
});

function revokeKidSessions(db: AppEnv['Variables']['db'], childId: string) {
  for (const d of db.all<DeviceRow>('SELECT * FROM devices WHERE child_id = ?', childId)) revokeSessions(db, 'kid', d.id);
}

// ---- Pairing & devices ------------------------------------------------------------

childrenRoutes.post('/children/:id/pairing-codes', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  // Invalidate any previous unused codes for this child.
  db.run('DELETE FROM pairing_codes WHERE child_id = ? AND used_at IS NULL', child.id);
  let code = newPairingCode();
  while (db.get('SELECT 1 AS x FROM pairing_codes WHERE code = ?', code)) code = newPairingCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.pairingCodeMinutes * 60_000).toISOString();
  db.insert('pairing_codes', {
    code,
    child_id: child.id,
    created_by: actor(c),
    created_at: now.toISOString(),
    expires_at: expiresAt,
  });
  audit(db, family.id, actor(c), 'device.pairing_code_created', { type: 'child', id: child.id });
  return c.json({ code, expiresAt, deepLink: `flexfundkids://pair?code=${code}` }, 201);
});

childrenRoutes.delete('/devices/:id', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const device = db.get<DeviceRow>(
    'SELECT d.* FROM devices d JOIN children c ON c.id = d.child_id WHERE d.id = ? AND c.family_id = ? AND d.revoked_at IS NULL',
    c.req.param('id'),
    family.id,
  );
  if (!device) throw notFound('Device');
  db.run('UPDATE devices SET revoked_at = ? WHERE id = ?', new Date().toISOString(), device.id);
  revokeSessions(db, 'device', device.id);
  revokeSessions(db, 'kid', device.id);
  audit(db, family.id, actor(c), 'device.revoked', { type: 'device', id: device.id }, { name: device.name });
  return c.json({ ok: true });
});

// ---- Lessons progress ---------------------------------------------------------------

childrenRoutes.get('/children/:id/lessons', (c) => {
  const db = c.get('db');
  const family = c.get('family');
  const child = getChildInFamily(db, family.id, c.req.param('id'));
  const done = new Map(
    db.all<LessonCompletionRow>('SELECT * FROM lesson_completions WHERE child_id = ?', child.id).map((l) => [l.lesson_id, l]),
  );
  return c.json({
    rewardCents: family.lesson_reward_cents,
    items: LESSONS.map((l) => {
      const completion = done.get(l.id);
      return {
        id: l.id,
        title: l.title,
        emoji: l.emoji,
        minutes: l.minutes,
        summary: l.summary,
        completed: Boolean(completion),
        score: completion?.score ?? null,
        total: l.quiz.length,
        rewardCents: completion?.reward_cents ?? null,
        completedAt: completion?.completed_at ?? null,
      };
    }),
  });
});
