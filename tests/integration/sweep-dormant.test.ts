import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  initDb,
  resetDb,
  upsertActivity,
  getUser,
  markWarned,
  getUsersByRole,
} from "../../src/db.js";
import { sweep, type SweepDeps } from "../../src/sweep.js";
import {
  createMockClient,
  createMockGuild,
  createMockMember,
  createMockRole,
  createMockUser,
} from "../mocks/discord.js";

// Mock the config module
mock.module("../../src/config.js", () => ({
  CONFIG: {
    INACTIVE_AFTER_MS: 10 * 24 * 60 * 60 * 1000, // 10 days
    DORMANT_AFTER_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
    WARN_GRACE_MS: 3 * 24 * 60 * 60 * 1000, // 3 days
    ACTIVE_ROLE_NAME: "Active",
    INACTIVE_ROLE_NAME: "Inactive",
    DORMANT_ROLE_NAME: "Dormant",
    FALLBACK_CHANNEL_ID: null,
  },
}));

describe("sweep - dormant role management", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetDb();
  });

  it("should warn users approaching dormant status", async () => {
    const activeRole = createMockRole("role1", "Active");
    const inactiveRole = createMockRole("role2", "Inactive");
    const member = createMockMember("user1", [inactiveRole]);
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole, inactiveRole],
    );

    const warnings: string[] = [];
    const user = createMockUser("user1", {
      onSend: (content) => warnings.push(content.content || content),
    });

    const client = createMockClient([guild], new Map([["user1", user]]));

    // User was active 31 days ago (expired for dormant)
    const now = Date.now();
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", thirtyOneDaysAgo, "inactive");

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async (userId, guildId, message) => {
        warnings.push(message);
        return true;
      },
      removeRole: async () => false,
    };

    const stats = await sweep(deps);

    expect(stats.dormantWarnings).toBe(1);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("will be marked as **Dormant**");

    const userRecord = getUser("user1");
    expect(userRecord?.warn_type).toBe("dormant");
    expect(userRecord?.warned_at).toBeDefined();
    expect(userRecord?.user_role).toBe("inactive");
  });

  it("should not warn users who are still inactive but not yet dormant", async () => {
    const activeRole = createMockRole("role1", "Active");
    const inactiveRole = createMockRole("role2", "Inactive");
    const member = createMockMember("user1", [inactiveRole]);
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole, inactiveRole],
    );

    const client = createMockClient([guild], new Map());

    const now = Date.now();
    const twentyDaysAgo = now - 20 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", twentyDaysAgo, "inactive");

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async () => true,
      removeRole: async () => false,
    };

    const stats = await sweep(deps);

    expect(stats.dormantWarnings).toBe(0);
  });

  it("should transition user from inactive to dormant after grace period", async () => {
    const activeRole = createMockRole("role1", "Active");
    const inactiveRole = createMockRole("role2", "Inactive");
    const dormantRole = createMockRole("role3", "Dormant");
    const member = createMockMember("user1", [inactiveRole]);
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole, inactiveRole, dormantRole],
    );

    const messages: string[] = [];
    const user = createMockUser("user1", {
      onSend: (content) => messages.push(content.content || content),
    });

    const client = createMockClient([guild], new Map([["user1", user]]));

    const now = Date.now();
    const thirtyFiveDaysAgo = now - 35 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", thirtyFiveDaysAgo, "inactive");

    // User was warned 4 days ago (past grace period)
    const fourDaysAgo = now - 4 * 24 * 60 * 60 * 1000;
    markWarned(fourDaysAgo, "dormant", "user1");

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async (userId, guildId, message) => {
        messages.push(message);
        return true;
      },
      removeRole: async () => false,
    };

    const stats = await sweep(deps);

    expect(stats.dormantTransitions).toBe(1);
    expect(messages.length).toBe(1);
    expect(messages[0]).toContain("marked as **Dormant**");

    const userRecord = getUser("user1");
    expect(userRecord?.user_role).toBe("dormant");
  });

  it("should not transition user if grace period not passed", async () => {
    const activeRole = createMockRole("role1", "Active");
    const inactiveRole = createMockRole("role2", "Inactive");
    const member = createMockMember("user1", [inactiveRole]);
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole, inactiveRole],
    );

    const client = createMockClient([guild], new Map());

    const now = Date.now();
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", thirtyOneDaysAgo, "inactive");

    // User was warned 1 day ago (within grace period)
    const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;
    markWarned(oneDayAgo, "dormant", "user1");

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async () => true,
      removeRole: async () => false,
    };

    const stats = await sweep(deps);

    expect(stats.dormantTransitions).toBe(0);
    const userRecord = getUser("user1");
    expect(userRecord?.user_role).toBe("inactive");
  });

  it("should handle dormant role lifecycle: inactive → dormant", async () => {
    const activeRole = createMockRole("role1", "Active");
    const inactiveRole = createMockRole("role2", "Inactive");
    const dormantRole = createMockRole("role3", "Dormant");
    const member = createMockMember("user1", [inactiveRole]);
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole, inactiveRole, dormantRole],
    );

    const messages: string[] = [];
    const user = createMockUser("user1", {
      onSend: (content) => messages.push(content.content || content),
    });

    const client = createMockClient([guild], new Map([["user1", user]]));

    // Start: user inactive now
    let currentTime = Date.now();
    const thirtyOneDaysAgo = currentTime - 31 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", thirtyOneDaysAgo, "inactive");

    const createDeps = (now: number): SweepDeps => ({
      client: client as any,
      now: () => now,
      sendWarning: async (userId, guildId, message) => {
        messages.push(message);
        return true;
      },
      removeRole: async (guildId, userId) => {
        return false;
      },
    });

    // Day 31: should get dormant warning
    let stats = await sweep(createDeps(currentTime));
    expect(stats.dormantWarnings).toBe(1);

    // Day 34: should transition to dormant (31 + 3 grace)
    currentTime += 3 * 24 * 60 * 60 * 1000;
    stats = await sweep(createDeps(currentTime));
    expect(stats.dormantTransitions).toBe(1);

    const userRecord = getUser("user1");
    expect(userRecord?.user_role).toBe("dormant");
  });
});
