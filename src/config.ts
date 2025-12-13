import "dotenv/config";

export const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
  APP_ID: process.env.APP_ID!,
  FALLBACK_CHANNEL_ID: process.env.FALLBACK_CHANNEL_ID,

  ACTIVE_ROLE_NAME: process.env.ACTIVE_ROLE_NAME || "Active",
  INACTIVE_ROLE_NAME: process.env.INACTIVE_ROLE_NAME || "Inactive",
  DORMANT_ROLE_NAME: process.env.DORMANT_ROLE_NAME || "Dormant",

  // Timings (can be overridden via env for testing)
  INACTIVE_AFTER_MS: parseInt(
    process.env.INACTIVE_AFTER_MS || String(10 * 24 * 60 * 60 * 1000),
  ), // 10 days
  WARN_GRACE_MS: parseInt(
    process.env.WARN_GRACE_MS || String(3 * 24 * 60 * 60 * 1000),
  ), // 3 days
} as const;

export function getDbPath(): string {
  if (process.env.NODE_ENV === "test") {
    return ":memory:";
  }
  return process.env.DB_PATH || "./activity.db";
}
