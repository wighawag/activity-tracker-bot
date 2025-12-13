import { Database } from "bun:sqlite";
import type { ActivityRepository, UserActivity } from "../types";
import { createTables } from "./schema";

export class SQLiteActivityRepository implements ActivityRepository {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.initialize();
  }

  async initialize(): Promise<void> {
    this.db.exec(createTables);
  }

  async getUser(userId: string, guildId: string): Promise<UserActivity | null> {
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role
      FROM user_activity
      WHERE user_id = ? AND guild_id = ?
    `);

    const result = query.get(userId, guildId) as {
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
    } | null;

    if (!result) return null;

    return {
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
    };
  }

  async upsertUser(user: UserActivity): Promise<void> {
    const query = this.db.prepare(`
      INSERT OR REPLACE INTO user_activity
      (user_id, guild_id, last_activity, current_role)
      VALUES (?, ?, ?, ?)
    `);

    query.run(
      user.user_id,
      user.guild_id,
      user.last_activity.getTime(),
      user.current_role,
    );
  }

  async getUsersExceedingThreshold(
    thresholdMs: number,
    role: "active" | "inactive",
  ): Promise<UserActivity[]> {
    const thresholdTime = Date.now() - thresholdMs;
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role
      FROM user_activity
      WHERE current_role = ? AND last_activity < ?
    `);

    const results = query.all(role, thresholdTime) as Array<{
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
    }>;

    return results.map((result) => ({
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
    }));
  }

  async getUsersDormantExceedingThreshold(
    thresholdMs: number,
  ): Promise<UserActivity[]> {
    const thresholdTime = Date.now() - thresholdMs;
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role
      FROM user_activity
      WHERE current_role = 'inactive' AND last_activity < ?
    `);

    const results = query.all(thresholdTime) as Array<{
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
    }>;

    return results.map((result) => ({
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
    }));
  }

  async getAllUsers(): Promise<UserActivity[]> {
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role
      FROM user_activity
    `);

    const results = query.all() as Array<{
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
    }>;

    return results.map((result) => ({
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
    }));
  }

  async syncGuildMembers(guildId: string, memberIds: string[]): Promise<void> {
    // Get all existing users for this guild
    const existingUsers = this.db
      .prepare(
        `
      SELECT user_id FROM user_activity WHERE guild_id = ?
    `,
      )
      .all(guildId) as Array<{ user_id: string }>;

    const existingUserIds = new Set(existingUsers.map((u) => u.user_id));
    const currentUserIds = new Set(memberIds);

    // Insert new users (not in DB but in guild)
    for (const userId of memberIds) {
      if (!existingUserIds.has(userId)) {
        this.upsertUser({
          user_id: userId,
          guild_id: guildId,
          last_activity: new Date(),
          current_role: "active",
        });
      }
    }

    // Remove users that are no longer in the guild
    for (const user of existingUsers) {
      if (!currentUserIds.has(user.user_id)) {
        this.db
          .prepare(
            `
          DELETE FROM user_activity WHERE user_id = ? AND guild_id = ?
        `,
          )
          .run(user.user_id, guildId);
      }
    }
  }

  close(): void {
    this.db.close();
  }
}
