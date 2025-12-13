import { describe, it, expect, beforeEach } from "bun:test";
import {
  initDb,
  resetDb,
  upsertActivity,
  getUser,
  getUsersToWarnRole,
  markWarned,
  getUsersToStrip,
  markRoleRemoved,
  deleteUser,
  getAllUsers,
  updateUserRole,
  getUsersByRole,
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
      expect(user?.user_role).toBe("active");
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
      expect(user?.user_role).toBe("active");
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

    it("should not return users with inactive role", () => {
      upsertActivity("user1", "guild1", 1000, "active");
      updateUserRole("user1", "inactive");

      const toWarn = getUsersToWarnRole(3000);

      expect(toWarn.length).toBe(0);
    });
  });

  describe("getUsersToStrip", () => {
    it("should return users warned long enough ago", () => {
      upsertActivity("user1", "guild1", 1000, "active");
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

    it("should not return users with inactive role", () => {
      upsertActivity("user1", "guild1", 1000, "inactive");
      markWarned(2000, "role", "user1");

      const toStrip = getUsersToStrip(3000, 5000);

      expect(toStrip.length).toBe(0);
    });
  });

  describe("role management", () => {
    it("should update user role", () => {
      upsertActivity("user1", "guild1", 1000, "active");
      updateUserRole("user1", "inactive");

      const user = getUser("user1");
      expect(user?.user_role).toBe("inactive");
    });

    it("should get users by role", () => {
      upsertActivity("user1", "guild1", 1000, "active");
      upsertActivity("user2", "guild1", 2000, "inactive");
      upsertActivity("user3", "guild1", 3000, "dormant");

      const activeUsers = getUsersByRole("active");
      const inactiveUsers = getUsersByRole("inactive");
      const dormantUsers = getUsersByRole("dormant");

      expect(activeUsers.length).toBe(1);
      expect(inactiveUsers.length).toBe(1);
      expect(dormantUsers.length).toBe(1);
      expect(activeUsers[0]?.user_id).toBe("user1");
      expect(inactiveUsers[0]?.user_id).toBe("user2");
      expect(dormantUsers[0]?.user_id).toBe("user3");
    });
  });

  describe("deleteUser", () => {
    it("should remove user from database", () => {
      upsertActivity("user1", "guild1", 1000, "active");
      deleteUser("user1");

      const user = getUser("user1");
      expect(user).toBeUndefined();
    });
  });

  describe("getAllUsers", () => {
    it("should return all users", () => {
      upsertActivity("user1", "guild1", 1000, "active");
      upsertActivity("user2", "guild1", 2000, "inactive");
      upsertActivity("user3", "guild2", 3000, "dormant");

      const users = getAllUsers();

      expect(users.length).toBe(3);
    });
  });
});
