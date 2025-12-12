import { readFileSync } from "node:fs";
import { getDbPath } from "./config.js";
import Database, { Statement } from "bun:sqlite";

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = initDb(getDbPath());
  }
  return db;
}

export function initDb(path: string): Database {
  const database = new Database(path);

  // Read schema and execute
  const schemaPath =
    process.env.NODE_ENV === "test" ? "./schema.sql" : "/app/schema.sql";

  try {
    const sql = readFileSync(schemaPath, "utf8");
    database.exec(sql);
  } catch {
    // Fallback: inline schema for tests
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_activity (
        user_id         TEXT PRIMARY KEY,
        guild_id        TEXT NOT NULL,
        last_message_at INTEGER NOT NULL,
        has_role        INTEGER NOT NULL DEFAULT 0,
        warned_at       INTEGER,
        warn_type       TEXT
      );
    `);
  }

  db = database;
  return database;
}

export function resetDb(): void {
  if (db) {
    db.exec("DELETE FROM user_activity");
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined as any;
  }
}

// --- Prepared statements (lazy initialization) ---

let _upsertActivity: Statement;
export function upsertActivity(
  userId: string,
  guildId: string,
  timestamp: number,
): void {
  if (!_upsertActivity) {
    _upsertActivity = getDb().prepare(`
      INSERT INTO user_activity (user_id, guild_id, last_message_at, has_role)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id) DO UPDATE SET
        guild_id = excluded.guild_id,
        last_message_at = excluded.last_message_at,
        has_role = 1,
        warned_at = NULL,
        warn_type = NULL
    `);
  }
  _upsertActivity.run(userId, guildId, timestamp);
}

let _getUser: Statement;
export interface UserActivity {
  user_id: string;
  guild_id: string;
  last_message_at: number;
  has_role: number;
  warned_at: number | null;
  warn_type: string | null;
}

export function getUser(userId: string): UserActivity | undefined {
  if (!_getUser) {
    _getUser = getDb().prepare("SELECT * FROM user_activity WHERE user_id = ?");
  }
  return _getUser.get(userId) as UserActivity | undefined;
}

let _getUsersToWarnRole: Statement;
export function getUsersToWarnRole(
  expireTime: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToWarnRole) {
    _getUsersToWarnRole = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND has_role = 1
        AND (warned_at IS NULL OR warn_type != 'role')
    `);
  }
  return _getUsersToWarnRole.all(expireTime) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _getUsersToWarnKick: Statement;
export function getUsersToWarnKick(
  expireTime: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToWarnKick) {
    _getUsersToWarnKick = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND (warned_at IS NULL OR warn_type != 'kick')
    `);
  }
  return _getUsersToWarnKick.all(expireTime) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _markWarned: Statement;
export function markWarned(
  timestamp: number,
  warnType: string,
  userId: string,
): void {
  if (!_markWarned) {
    _markWarned = getDb().prepare(
      "UPDATE user_activity SET warned_at = ?, warn_type = ? WHERE user_id = ?",
    );
  }
  _markWarned.run(timestamp, warnType, userId);
}

let _getUsersToStrip: Statement;
export function getUsersToStrip(
  expireTime: number,
  warnedBefore: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToStrip) {
    _getUsersToStrip = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND has_role = 1
        AND warn_type = 'role'
        AND warned_at < ?
    `);
  }
  return _getUsersToStrip.all(expireTime, warnedBefore) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _markRoleRemoved: Statement;
export function markRoleRemoved(userId: string): void {
  if (!_markRoleRemoved) {
    _markRoleRemoved = getDb().prepare(
      "UPDATE user_activity SET has_role = 0 WHERE user_id = ?",
    );
  }
  _markRoleRemoved.run(userId);
}

let _getUsersToKick: Statement;
export function getUsersToKick(
  expireTime: number,
  warnedBefore: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToKick) {
    _getUsersToKick = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND warn_type = 'kick'
        AND warned_at < ?
    `);
  }
  return _getUsersToKick.all(expireTime, warnedBefore) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _deleteUser: Statement;
export function deleteUser(userId: string): void {
  if (!_deleteUser) {
    _deleteUser = getDb().prepare(
      "DELETE FROM user_activity WHERE user_id = ?",
    );
  }
  _deleteUser.run(userId);
}

let _getAllUsers: Statement;
export function getAllUsers(): UserActivity[] {
  if (!_getAllUsers) {
    _getAllUsers = getDb().prepare("SELECT * FROM user_activity");
  }
  return _getAllUsers.all() as UserActivity[];
}
