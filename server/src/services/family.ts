import type { Db } from '../db.js';
import { newId, randomDigits } from '../lib/crypto.js';
import type { ChildRow, FamilyRow, ParentRow } from '../types.js';

export function createFamily(
  db: Db,
  input: {
    familyName: string;
    parentName: string;
    email: string;
    passwordHash: string | null;
    googleSub?: string | null;
    timezone: string;
  },
): { family: FamilyRow; parent: ParentRow } {
  const now = new Date().toISOString();
  const family: FamilyRow = {
    id: newId('fam'),
    name: input.familyName,
    lesson_reward_cents: 50,
    timezone: input.timezone,
    created_at: now,
  };
  const parent: ParentRow = {
    id: newId('par'),
    family_id: family.id,
    name: input.parentName,
    email: input.email.toLowerCase(),
    password_hash: input.passwordHash,
    google_sub: input.googleSub ?? null,
    created_at: now,
    mfa_enabled: 0,
    mfa_secret_enc: null,
    mfa_pending_secret_enc: null,
    mfa_last_step: null,
  };
  db.tx(() => {
    db.insert('families', { ...family });
    db.insert('parents', { ...parent });
  });
  return { family, parent };
}

/** Add a co-parent to an existing family. */
export function joinFamily(
  db: Db,
  family: FamilyRow,
  input: { name: string; email: string; passwordHash: string },
): ParentRow {
  const parent: ParentRow = {
    id: newId('par'),
    family_id: family.id,
    name: input.name,
    email: input.email.toLowerCase(),
    password_hash: input.passwordHash,
    google_sub: null,
    created_at: new Date().toISOString(),
    mfa_enabled: 0,
    mfa_secret_enc: null,
    mfa_pending_secret_enc: null,
    mfa_last_step: null,
  };
  db.insert('parents', { ...parent });
  return parent;
}

export function createChild(
  db: Db,
  family: FamilyRow,
  input: { name: string; avatar: string; birthYear?: number | null; cardLast4?: string; createdAt?: string },
): ChildRow {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const child: ChildRow = {
    id: newId('chd'),
    family_id: family.id,
    name: input.name,
    avatar: input.avatar,
    birth_year: input.birthYear ?? null,
    pin_hash: null,
    pin_failed_attempts: 0,
    pin_locked_until: null,
    created_at: createdAt,
  };
  db.tx(() => {
    db.insert('children', { ...child });
    db.insert('pots', {
      id: newId('pot'),
      child_id: child.id,
      name: 'General',
      emoji: '💰',
      goal_cents: null,
      is_spending: 1,
      sort_order: 0,
      created_at: createdAt,
    });
    db.insert('cards', {
      id: newId('crd'),
      child_id: child.id,
      last4: input.cardLast4 ?? randomDigits(4),
      status: 'active',
      daily_limit_cents: 2500,
      created_at: createdAt,
    });
  });
  return child;
}

export function createPot(
  db: Db,
  childId: string,
  input: { name: string; emoji: string; goalCents?: number | null; createdAt?: string },
) {
  const maxOrder = db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM pots WHERE child_id = ?', childId)?.m ?? 0;
  const id = newId('pot');
  db.insert('pots', {
    id,
    child_id: childId,
    name: input.name,
    emoji: input.emoji,
    goal_cents: input.goalCents ?? null,
    is_spending: 0,
    sort_order: maxOrder + 1,
    created_at: input.createdAt ?? new Date().toISOString(),
  });
  return id;
}
