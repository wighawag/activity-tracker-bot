import { Database } from "bun:sqlite";
import type { ActivityRepository, UserActivity } from "../types";
import { createTables } from "./schema";

export class SQLiteActivityRepository implements ActivityRepository {
  private db: Database;

  constructor(dbPathOrDb: string | Database) {
    if (typeof dbPathOrDb === "string") {
      this.db = new Database(dbPathOrDb, { create: true });
    } else {
      this.db = dbPathOrDb;
    }
    this.initialize();
  }

  async initialize(): Promise<void> {
    this.db.run(createTables);
  }

  async getUser(userId: string, guildId: string): Promise<UserActivity | null> {
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role, added_via
      FROM user_activity
      WHERE user_id = ? AND guild_id = ?
    `);

    const result = query.get(userId, guildId) as {
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
      added_via: "sync" | "activity";
    } | null;

    if (!result) return null;

    return {
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
      added_via: result.added_via,
    };
  }

  async upsertUser(user: UserActivity): Promise<void> {
    if (user.warning_sent === undefined) {
      // Don't update warning_sent
      const query = this.db.prepare(`
        INSERT INTO user_activity
        (user_id, guild_id, last_activity, current_role, added_via, warning_sent)
        VALUES (?, ?, ?, ?, ?, 0)
        ON CONFLICT(user_id, guild_id) DO UPDATE SET
          last_activity = excluded.last_activity,
          current_role = excluded.current_role,
          added_via = excluded.added_via
      `);

      query.run(
        user.user_id,
        user.guild_id,
        user.last_activity.getTime(),
        user.current_role,
        user.added_via,
      );
    } else {
      // Update warning_sent
      const warningValue =
        user.warning_sent === null ? 0 : user.warning_sent.getTime();

      const query = this.db.prepare(`
        INSERT INTO user_activity
        (user_id, guild_id, last_activity, current_role, added_via, warning_sent)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, guild_id) DO UPDATE SET
          last_activity = excluded.last_activity,
          current_role = excluded.current_role,
          added_via = excluded.added_via,
          warning_sent = excluded.warning_sent
      `);

      query.run(
        user.user_id,
        user.guild_id,
        user.last_activity.getTime(),
        user.current_role,
        user.added_via,
        warningValue,
      );
    }
  }

  async getUsersExceedingThreshold(
    thresholdMs: number,
    role: "active" | "inactive",
    guildId: string,
  ): Promise<UserActivity[]> {
    const thresholdTime = Date.now() - thresholdMs;
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role, added_via
      FROM user_activity
      WHERE current_role = ? AND last_activity < ? AND guild_id = ?
    `);

    const results = query.all(role, thresholdTime, guildId) as Array<{
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
      added_via: "sync" | "activity";
    }>;

    return results.map((result) => ({
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
      added_via: result.added_via,
    }));
  }

  async getUsersNeedingWarning(
    warningThresholdMs: number,
    inactiveThresholdMs: number,
    guildId: string,
  ): Promise<UserActivity[]> {
    const warningThresholdTime = Date.now() - warningThresholdMs;
    const inactiveThresholdTime = Date.now() - inactiveThresholdMs;
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role, added_via, warning_sent
      FROM user_activity
      WHERE current_role = 'active' AND last_activity < ? AND last_activity >= ? AND guild_id = ? AND warning_sent = 0
    `);

    const results = query.all(
      warningThresholdTime,
      inactiveThresholdTime,
      guildId,
    ) as Array<{
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
      added_via: "sync" | "activity";
      warning_sent: number;
    }>;

    return results.map((result) => ({
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
      added_via: result.added_via,
      warning_sent:
        result.warning_sent > 0 ? new Date(result.warning_sent) : undefined,
    }));
  }

  async getUsersDormantExceedingThreshold(
    thresholdMs: number,
    guildId: string,
  ): Promise<UserActivity[]> {
    const thresholdTime = Date.now() - thresholdMs;
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role, added_via
      FROM user_activity
      WHERE current_role = 'inactive' AND last_activity < ? AND guild_id = ?
    `);

    const results = query.all(thresholdTime, guildId) as Array<{
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
      added_via: "sync" | "activity";
    }>;

    return results.map((result) => ({
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
      added_via: result.added_via,
    }));
  }

  async getDormantUsers(guildId: string): Promise<UserActivity[]> {
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role, added_via, warning_sent
      FROM user_activity
      WHERE current_role = 'dormant' AND guild_id = ?
    `);

    const results = query.all(guildId) as Array<{
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
      added_via: "sync" | "activity";
      warning_sent: number;
    }>;

    return results.map((result) => ({
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
      added_via: result.added_via,
      warning_sent:
        result.warning_sent > 0 ? new Date(result.warning_sent) : undefined,
    }));
  }

  async getAllUsers(): Promise<UserActivity[]> {
    const query = this.db.prepare(`
      SELECT user_id, guild_id, last_activity, current_role, added_via
      FROM user_activity
    `);

    const results = query.all() as Array<{
      user_id: string;
      guild_id: string;
      last_activity: number;
      current_role: "active" | "inactive" | "dormant";
      added_via: "sync" | "activity";
    }>;

    return results.map((result) => ({
      user_id: result.user_id,
      guild_id: result.guild_id,
      last_activity: new Date(result.last_activity),
      current_role: result.current_role,
      added_via: result.added_via,
    }));
  }

  close(): void {
    this.db.close();
  }
}
