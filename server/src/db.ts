import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';

type Param = SQLInputValue | boolean | undefined;

const MIGRATIONS: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lesson_reward_cents INTEGER NOT NULL DEFAULT 50,
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    created_at TEXT NOT NULL
  );

  CREATE TABLE parents (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    google_sub TEXT UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('parent', 'device', 'kid')),
    subject_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL
  );
  CREATE INDEX sessions_subject ON sessions(kind, subject_id);

  CREATE TABLE children (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '🐶',
    birth_year INTEGER,
    pin_hash TEXT,
    pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
    pin_locked_until TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX children_family ON children(family_id);

  CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE INDEX devices_child ON devices(child_id);

  CREATE TABLE pairing_codes (
    code TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE pots (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '💰',
    goal_cents INTEGER,
    is_spending INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX pots_child ON pots(child_id);

  CREATE TABLE cards (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL UNIQUE REFERENCES children(id) ON DELETE CASCADE,
    last4 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen')),
    daily_limit_cents INTEGER NOT NULL DEFAULT 2500,
    created_at TEXT NOT NULL
  );

  CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    pot_id TEXT REFERENCES pots(id),
    amount_cents INTEGER NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'declined')),
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    counterparty TEXT,
    memo TEXT,
    decline_reason TEXT,
    related_type TEXT,
    related_id TEXT,
    transfer_group TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX tx_child_time ON transactions(child_id, created_at DESC);
  CREATE INDEX tx_family_time ON transactions(family_id, created_at DESC);
  CREATE INDEX tx_pot ON transactions(pot_id, status);

  CREATE TABLE challenges (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '⭐️',
    reward_cents INTEGER NOT NULL DEFAULT 0,
    recurrence TEXT NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once', 'daily', 'weekly')),
    pot_id TEXT REFERENCES pots(id),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE INDEX challenges_child ON challenges(child_id);

  CREATE TABLE challenge_completions (
    id TEXT PRIMARY KEY,
    challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    period_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    submitted_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT,
    transaction_id TEXT
  );
  CREATE UNIQUE INDEX completions_one_per_period
    ON challenge_completions(challenge_id, period_key) WHERE status != 'rejected';
  CREATE INDEX completions_child ON challenge_completions(child_id, status);

  CREATE TABLE lesson_completions (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    reward_cents INTEGER NOT NULL,
    transaction_id TEXT,
    completed_at TEXT NOT NULL,
    UNIQUE (child_id, lesson_id)
  );

  CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    relationship TEXT NOT NULL CHECK (relationship IN ('parent', 'family', 'friend')),
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX contacts_child ON contacts(child_id);

  CREATE TABLE money_requests (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('send', 'request')),
    amount_cents INTEGER NOT NULL,
    note TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'canceled')),
    created_at TEXT NOT NULL,
    reviewed_at TEXT,
    reviewed_by TEXT,
    transaction_id TEXT
  );
  CREATE INDEX money_requests_child ON money_requests(child_id, status);

  CREATE TABLE recurring_schedules (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    pot_id TEXT NOT NULL REFERENCES pots(id),
    amount_cents INTEGER NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
    weekday INTEGER,
    day_of_month INTEGER,
    timezone TEXT NOT NULL,
    run_hour INTEGER NOT NULL DEFAULT 8,
    start_date TEXT NOT NULL,
    end_date TEXT,
    memo TEXT,
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'canceled', 'completed')),
    next_run_at TEXT,
    last_run_at TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX schedules_due ON recurring_schedules(status, next_run_at);
  CREATE INDEX schedules_child ON recurring_schedules(child_id);

  CREATE TABLE recurring_executions (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,
    occurrence_index INTEGER NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    trigger TEXT NOT NULL CHECK (trigger IN ('schedule', 'run_now')),
    status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
    transaction_id TEXT,
    error_message TEXT,
    scheduled_for TEXT,
    executed_at TEXT NOT NULL
  );
  CREATE INDEX executions_schedule ON recurring_executions(schedule_id, executed_at DESC);

  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX audit_family_time ON audit_events(family_id, created_at DESC);
  `,
  /* 2: parent multi-factor authentication (TOTP) */ `
  ALTER TABLE parents ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE parents ADD COLUMN mfa_secret_enc TEXT;
  ALTER TABLE parents ADD COLUMN mfa_pending_secret_enc TEXT;
  ALTER TABLE parents ADD COLUMN mfa_last_step INTEGER;

  CREATE TABLE mfa_challenges (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  `,
  /* 3: kids can report a transaction they don't recognize (sprint: "manage payment history") */ `
  CREATE TABLE transaction_reports (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (reason IN ('dont_recognize', 'wrong_amount', 'other')),
    note TEXT,
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
    created_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    resolution TEXT
  );
  CREATE UNIQUE INDEX reports_one_open ON transaction_reports(transaction_id) WHERE status = 'open';
  CREATE INDEX reports_child ON transaction_reports(child_id, status);
  `,
  /* 4: invite a co-parent into an existing family */ `
  CREATE TABLE family_invites (
    code TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    email TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_by TEXT
  );
  CREATE INDEX invites_family ON family_invites(family_id);
  `,
];

function normalize(params: Param[]): SQLInputValue[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export class Db {
  private readonly statements = new Map<string, StatementSync>();
  private depth = 0;

  constructor(readonly raw: DatabaseSync) {}

  private stmt(sql: string): StatementSync {
    let s = this.statements.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.statements.set(sql, s);
    }
    return s;
  }

  get<T>(sql: string, ...params: Param[]): T | undefined {
    return this.stmt(sql).get(...normalize(params)) as T | undefined;
  }

  all<T>(sql: string, ...params: Param[]): T[] {
    return this.stmt(sql).all(...normalize(params)) as T[];
  }

  run(sql: string, ...params: Param[]): number {
    return Number(this.stmt(sql).run(...normalize(params)).changes);
  }

  /** Insert a row from a plain object. Undefined values are omitted. */
  insert(table: string, row: Record<string, Param>): void {
    const keys = Object.keys(row).filter((k) => row[k] !== undefined);
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    this.run(sql, ...keys.map((k) => row[k]));
  }

  /** Update columns of a row by id. Undefined values are omitted. */
  update(table: string, id: string, patch: Record<string, Param>): number {
    const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
    if (keys.length === 0) return 0;
    const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return this.run(sql, ...keys.map((k) => patch[k]), id);
  }

  /** Run fn atomically. Nested calls use savepoints. fn must be synchronous. */
  tx<T>(fn: () => T): T {
    const savepoint = `sp_${this.depth}`;
    this.raw.exec(this.depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.depth++;
    try {
      const result = fn();
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
      return result;
    } catch (err) {
      this.depth--;
      this.raw.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      throw err;
    }
  }

  close(): void {
    this.raw.close();
  }
}

export function openDatabase(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const db = new Db(raw);
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const row = db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  const current = row?.v ?? 0;
  MIGRATIONS.forEach((sql, index) => {
    const version = index + 1;
    if (version <= current) return;
    db.tx(() => {
      db.raw.exec(sql);
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', version, new Date().toISOString());
    });
  });
}
