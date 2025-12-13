import { describe, it, expect, beforeEach } from "bun:test";
import {
  initDb,
  resetDb,
  upsertActivity,
  getUser,
  deleteUser,
  getUsersByRole,
} from "../../src/db.js";
import { getDormantUsers } from "../../src/sweep.js";

describe("admin commands - dormant user management", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetDb();
  });

  describe("getDormantUsers", () => {
    it("should return dormant users for manual kicking", () => {
      // Create users with different roles
      upsertActivity("user1", "guild1", Date.now() - 1000, "active");
      upsertActivity("user2", "guild1", Date.now() - 2000, "inactive");
      upsertActivity("user3", "guild1", Date.now() - 3000, "dormant");
      upsertActivity("user4", "guild2", Date.now() - 4000, "dormant");

      // Test getDormantUsers function
      const dormantUsers = getDormantUsers();
      expect(dormantUsers.length).toBe(2);

      const guild1Dormant = dormantUsers.filter((u) => u.guild_id === "guild1");
      const guild2Dormant = dormantUsers.filter((u) => u.guild_id === "guild2");

      expect(guild1Dormant.length).toBe(1);
      expect(guild1Dormant[0]?.user_id).toBe("user3");

      expect(guild2Dormant.length).toBe(1);
      expect(guild2Dormant[0]?.user_id).toBe("user4");
    });

    it("should return empty array when no dormant users exist", () => {
      // Create users with other roles
      upsertActivity("user1", "guild1", Date.now() - 1000, "active");
      upsertActivity("user2", "guild1", Date.now() - 2000, "inactive");

      const dormantUsers = getDormantUsers();
      expect(dormantUsers.length).toBe(0);
    });
  });

  describe("role management", () => {
    it("should transition users between roles correctly", () => {
      // Start with active user
      upsertActivity("user1", "guild1", Date.now() - 1000, "active");
      let user = getUser("user1");
      expect(user?.user_role).toBe("active");

      // Transition to inactive
      upsertActivity("user1", "guild1", Date.now() - 2000, "inactive");
      user = getUser("user1");
      expect(user?.user_role).toBe("inactive");

      // Transition to dormant
      upsertActivity("user1", "guild1", Date.now() - 3000, "dormant");
      user = getUser("user1");
      expect(user?.user_role).toBe("dormant");
    });

    it("should get users by role", () => {
      upsertActivity("user1", "guild1", Date.now() - 1000, "active");
      upsertActivity("user2", "guild1", Date.now() - 2000, "inactive");
      upsertActivity("user3", "guild1", Date.now() - 3000, "dormant");

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
});
