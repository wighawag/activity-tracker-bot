/**
 * Database schema for the activity tracker bot
 */

export const createTables = `
-- Users activity table
CREATE TABLE IF NOT EXISTS user_activity (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  last_activity INTEGER NOT NULL, -- Unix timestamp in milliseconds
  current_role TEXT NOT NULL CHECK(current_role IN ('active', 'inactive', 'dormant')),
  PRIMARY KEY (user_id, guild_id)
);

-- Index for faster lookups by role and last activity
CREATE INDEX IF NOT EXISTS idx_user_activity_role ON user_activity(current_role);
CREATE INDEX IF NOT EXISTS idx_user_activity_last_activity ON user_activity(last_activity);
`;

export const migrations = [
  // Migration 1: Initial schema
  createTables,
];
