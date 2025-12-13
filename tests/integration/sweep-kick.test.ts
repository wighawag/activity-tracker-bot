import { describe, it, expect, beforeEach } from "bun:test";
import {
  initDb,
  resetDb,
  upsertActivity,
  getUser,
  markWarned,
  updateUserRole,
  getUsersByRole,
} from "../../src/db.js";
import { sweep, type SweepDeps, getDormantUsers } from "../../src/sweep.js";
import {
  createMockClient,
  createMockGuild,
  createMockMember,
  createMockRole,
  createMockUser,
} from "../mocks/discord.js";

const TEST_INACTIVE_AFTER_MS = 10 * 24 * 60 * 60 * 1000; // 10 days
const TEST_WARN_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

describe("sweep - dormant role management", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetDb();
  });

  it("should transition user from active to inactive after grace period", async () => {
    const activeRole = createMockRole("role1", "Active");
    let roleRemoved = false;
    const member = createMockMember("user1", [activeRole], {
      onRoleRemove: () => {
        roleRemoved = true;
      },
    });
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole],
    );

    const client = createMockClient([guild], new Map());

    const now = Date.now();
    const fifteenDaysAgo = now - 15 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", fifteenDaysAgo);

    // User was warned 4 days ago (past grace period)
    const fourDaysAgo = now - 4 * 24 * 60 * 60 * 1000;
    markWarned(fourDaysAgo, "role", "user1");

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async () => true,
      removeRole: async (guildId, userId) => {
        roleRemoved = true;
        return true;
      },
    };

    const stats = await sweep(deps);

    expect(stats.roleRemovals).toBe(1);
    expect(roleRemoved).toBe(true);

    const userRecord = getUser("user1");
    expect(userRecord?.user_role).toBe("inactive");
  });

  it("should not transition user if grace period not passed", async () => {
    const activeRole = createMockRole("role1", "Active");
    const member = createMockMember("user1", [activeRole]);
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole],
    );

    const client = createMockClient([guild], new Map());

    const now = Date.now();
    const elevenDaysAgo = now - 11 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", elevenDaysAgo);

    // User was warned 1 day ago (within grace period)
    const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;
    markWarned(oneDayAgo, "role", "user1");

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async () => true,
      removeRole: async () => true,
    };

    const stats = await sweep(deps);

    expect(stats.roleRemovals).toBe(0);
    const userRecord = getUser("user1");
    expect(userRecord?.user_role).toBe("active");
  });

  it("should get dormant users for manual kicking", async () => {
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

  it("should handle role lifecycle: active → inactive", async () => {
    const activeRole = createMockRole("role1", "Active");
    const inactiveRole = createMockRole("role2", "Inactive");
    let roleChanges = 0;

    const member = createMockMember("user1", [activeRole], {
      onRoleRemove: (role) => {
        roleChanges++;
      },
      onRoleAdd: (role) => {
        roleChanges++;
      },
    });
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole, inactiveRole],
    );

    const messages: string[] = [];
    const user = createMockUser("user1", {
      onSend: (content) => messages.push(content.content || content),
    });

    const client = createMockClient([guild], new Map([["user1", user]]));

    // Start: user active now
    let currentTime = Date.now();
    upsertActivity("user1", "guild1", currentTime, "active");

    const createDeps = (now: number): SweepDeps => ({
      client: client as any,
      now: () => now,
      sendWarning: async (userId, guildId, message) => {
        messages.push(message);
        return true;
      },
      removeRole: async (guildId, userId) => {
        return true;
      },
    });

    // Day 11: should get role warning
    currentTime += 11 * 24 * 60 * 60 * 1000;
    let stats = await sweep(createDeps(currentTime));
    expect(stats.roleWarnings).toBe(1);

    // Day 14: should transition to inactive (11 + 3 grace)
    currentTime += 3 * 24 * 60 * 60 * 1000;
    stats = await sweep(createDeps(currentTime));
    expect(stats.roleRemovals).toBe(1);

    const userRecord = getUser("user1");
    expect(userRecord?.user_role).toBe("inactive");
  });
});
