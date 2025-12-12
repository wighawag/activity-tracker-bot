import { describe, it, expect, beforeEach } from "bun:test";
import {
  initDb,
  resetDb,
  upsertActivity,
  getUser,
  getUsersToWarnRole,
  getUsersToWarnKick,
  markWarned,
  getUsersToStrip,
  markRoleRemoved,
  getUsersToKick,
  deleteUser,
  getAllUsers,
} from "../../src/db.js";

describe("db", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetDb();
  });

  describe("upsertActivity", () => {
    it("should insert new user", () => {
      upsertActivity("user1", "guild1", 1000);
      const user = getUser("user1");

      expect(user).toBeDefined();
      expect(user?.user_id).toBe("user1");
      expect(user?.guild_id).toBe("guild1");
      expect(user?.last_message_at).toBe(1000);
      expect(user?.has_role).toBe(1);
      expect(user?.warned_at).toBeNull();
      expect(user?.warn_type).toBeNull();
    });

    it("should update existing user and reset warnings", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(1500, "role", "user1");

      // verify warning is set
      let user = getUser("user1");
      expect(user?.warned_at).toBe(1500);
      expect(user?.warn_type).toBe("role");

      // update activity
      upsertActivity("user1", "guild1", 2000);

      user = getUser("user1");
      expect(user?.last_message_at).toBe(2000);
      expect(user?.warned_at).toBeNull();
      expect(user?.warn_type).toBeNull();
    });

    it("should update guild_id on activity", () => {
      upsertActivity("user1", "guild1", 1000);
      upsertActivity("user1", "guild2", 2000);

      const user = getUser("user1");
      expect(user?.guild_id).toBe("guild2");
    });
  });

  describe("getUsersToWarnRole", () => {
    it("should return users with expired activity and role", () => {
      upsertActivity("user1", "guild1", 1000);
      upsertActivity("user2", "guild1", 5000);

      const toWarn = getUsersToWarnRole(3000);

      expect(toWarn.length).toBe(1);
      expect(toWarn[0]!.user_id).toBe("user1");
    });

    it("should not return already warned users", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(2000, "role", "user1");

      const toWarn = getUsersToWarnRole(3000);

      expect(toWarn.length).toBe(0);
    });

    it("should not return users without role", () => {
      upsertActivity("user1", "guild1", 1000);
      markRoleRemoved("user1");

      const toWarn = getUsersToWarnRole(3000);

      expect(toWarn.length).toBe(0);
    });
  });

  describe("getUsersToStrip", () => {
    it("should return users warned long enough ago", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(2000, "role", "user1");

      // warning at 2000, grace period check at 5000 means warned_at < 5000
      const toStrip = getUsersToStrip(3000, 5000);

      expect(toStrip.length).toBe(1);
      expect(toStrip[0]!.user_id).toBe("user1");
    });

    it("should not return users warned too recently", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(4000, "role", "user1");

      // warned at 4000, check at 3000 means 4000 < 3000 is false
      const toStrip = getUsersToStrip(3000, 3000);

      expect(toStrip.length).toBe(0);
    });

    it("should not return users with kick warning type", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(2000, "kick", "user1");

      const toStrip = getUsersToStrip(3000, 5000);

      expect(toStrip.length).toBe(0);
    });
  });

  describe("getUsersToWarnKick", () => {
    it("should return users with expired activity", () => {
      upsertActivity("user1", "guild1", 1000);

      const toWarn = getUsersToWarnKick(3000);

      expect(toWarn.length).toBe(1);
    });

    it("should not return users already warned for kick", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(2000, "kick", "user1");

      const toWarn = getUsersToWarnKick(3000);

      expect(toWarn.length).toBe(0);
    });

    it("should return users warned for role but not kick", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(2000, "role", "user1");

      const toWarn = getUsersToWarnKick(3000);

      expect(toWarn.length).toBe(1);
    });
  });

  describe("getUsersToKick", () => {
    it("should return users warned for kick long enough ago", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(2000, "kick", "user1");

      const toKick = getUsersToKick(3000, 5000);

      expect(toKick.length).toBe(1);
    });

    it("should not return users warned too recently", () => {
      upsertActivity("user1", "guild1", 1000);
      markWarned(4000, "kick", "user1");

      const toKick = getUsersToKick(3000, 3000);

      expect(toKick.length).toBe(0);
    });
  });

  describe("deleteUser", () => {
    it("should remove user from database", () => {
      upsertActivity("user1", "guild1", 1000);
      deleteUser("user1");

      const user = getUser("user1");
      expect(user).toBeUndefined();
    });
  });

  describe("getAllUsers", () => {
    it("should return all users", () => {
      upsertActivity("user1", "guild1", 1000);
      upsertActivity("user2", "guild1", 2000);
      upsertActivity("user3", "guild2", 3000);

      const users = getAllUsers();

      expect(users.length).toBe(3);
    });
  });
});
