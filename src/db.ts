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
        user_role       TEXT NOT NULL DEFAULT 'active',
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
    // Reset prepared statements so they're recreated for the new data
    _upsertActivity = undefined;
    _getUser = undefined;
    _getUsersToWarnRole = undefined;
    _getUsersToWarnDormant = undefined;
    _getUsersToWarnKick = undefined;
    _markWarned = undefined;
    _getUsersToStrip = undefined;
    _getUsersToMarkDormant = undefined;
    _markRoleRemoved = undefined;
    _getUsersToKick = undefined;
    _deleteUser = undefined;
    _getAllUsers = undefined;
    _getUsersByRole = undefined;
    _updateUserRole = undefined;
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined as any;
  }
}

// --- Prepared statements (lazy initialization) ---

let _upsertActivity: Statement | undefined;
export function upsertActivity(
  userId: string,
  guildId: string,
  timestamp: number,
  role: string = "active",
): void {
  if (!_upsertActivity) {
    _upsertActivity = getDb().prepare(`
      INSERT INTO user_activity (user_id, guild_id, last_message_at, user_role)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        guild_id = excluded.guild_id,
        last_message_at = excluded.last_message_at,
        user_role = excluded.user_role,
        warned_at = NULL,
        warn_type = NULL
    `);
  }
  _upsertActivity.run(userId, guildId, timestamp, role);
}

let _getUser: Statement | undefined;
export interface UserActivity {
  user_id: string;
  guild_id: string;
  last_message_at: number;
  user_role: string;
  warned_at: number | null;
  warn_type: string | null;
}

export function getUser(userId: string): UserActivity | undefined {
  if (!_getUser) {
    _getUser = getDb().prepare("SELECT * FROM user_activity WHERE user_id = ?");
  }
  const result = _getUser.get(userId) as UserActivity | null;
  return result || undefined;
}

let _getUsersToWarnRole: Statement | undefined;
export function getUsersToWarnRole(
  expireTime: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToWarnRole) {
    _getUsersToWarnRole = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND user_role = 'active'
        AND (warned_at IS NULL OR warn_type != 'role')
    `);
  }
  return _getUsersToWarnRole.all(expireTime) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _getUsersToWarnDormant: Statement | undefined;
export function getUsersToWarnDormant(
  expireTime: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToWarnDormant) {
    _getUsersToWarnDormant = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND user_role = 'inactive'
        AND (warned_at IS NULL OR warn_type != 'dormant')
    `);
  }
  return _getUsersToWarnDormant.all(expireTime) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _getUsersToWarnKick: Statement | undefined;
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

let _markWarned: Statement | undefined;
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

let _getUsersToStrip: Statement | undefined;
export function getUsersToStrip(
  expireTime: number,
  warnedBefore: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToStrip) {
    _getUsersToStrip = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND user_role = 'active'
        AND warn_type = 'role'
        AND warned_at <= ?
    `);
  }
  return _getUsersToStrip.all(expireTime, warnedBefore) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _getUsersToMarkDormant: Statement | undefined;
export function getUsersToMarkDormant(
  expireTime: number,
  warnedBefore: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToMarkDormant) {
    _getUsersToMarkDormant = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND user_role = 'inactive'
        AND warn_type = 'dormant'
        AND warned_at <= ?
    `);
  }
  return _getUsersToMarkDormant.all(expireTime, warnedBefore) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _markRoleRemoved: Statement | undefined;
export function markRoleRemoved(userId: string): void {
  if (!_markRoleRemoved) {
    _markRoleRemoved = getDb().prepare(
      "UPDATE user_activity SET user_role = 'inactive' WHERE user_id = ?",
    );
  }
  _markRoleRemoved.run(userId);
}

let _getUsersToKick: Statement | undefined;
export function getUsersToKick(
  expireTime: number,
  warnedBefore: number,
): { user_id: string; guild_id: string }[] {
  if (!_getUsersToKick) {
    _getUsersToKick = getDb().prepare(`
      SELECT user_id, guild_id FROM user_activity
      WHERE last_message_at < ?
        AND warn_type = 'kick'
        AND warned_at <= ?
    `);
  }
  return _getUsersToKick.all(expireTime, warnedBefore) as {
    user_id: string;
    guild_id: string;
  }[];
}

let _deleteUser: Statement | undefined;
export function deleteUser(userId: string): void {
  if (!_deleteUser) {
    _deleteUser = getDb().prepare(
      "DELETE FROM user_activity WHERE user_id = ?",
    );
  }
  _deleteUser.run(userId);
}

let _getAllUsers: Statement | undefined;
export function getAllUsers(): UserActivity[] {
  if (!_getAllUsers) {
    _getAllUsers = getDb().prepare("SELECT * FROM user_activity");
  }
  return _getAllUsers.all() as UserActivity[];
}

let _getUsersByRole: Statement | undefined;
export function getUsersByRole(role: string): UserActivity[] {
  if (!_getUsersByRole) {
    _getUsersByRole = getDb().prepare(
      "SELECT * FROM user_activity WHERE user_role = ?",
    );
  }
  return _getUsersByRole.all(role) as UserActivity[];
}

let _updateUserRole: Statement | undefined;
export function updateUserRole(userId: string, role: string): void {
  if (!_updateUserRole) {
    _updateUserRole = getDb().prepare(
      "UPDATE user_activity SET user_role = ? WHERE user_id = ?",
    );
  }
  _updateUserRole.run(role, userId);
}
