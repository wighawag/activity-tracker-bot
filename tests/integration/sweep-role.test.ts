import { describe, it, expect, beforeEach } from "bun:test";
import {
  initDb,
  resetDb,
  upsertActivity,
  getUser,
  markWarned,
} from "../../src/db.js";
import { sweep, type SweepDeps } from "../../src/sweep.js";
import {
  createMockClient,
  createMockGuild,
  createMockMember,
  createMockRole,
  createMockUser,
} from "../mocks/discord.js";

// Override config for tests
const TEST_INACTIVE_AFTER_MS = 10 * 24 * 60 * 60 * 1000; // 10 days
const TEST_WARN_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

describe("sweep - role management", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetDb();
  });

  it("should warn users approaching role expiration", async () => {
    const activeRole = createMockRole("role1", "Active");
    const member = createMockMember("user1", [activeRole]);
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole],
    );

    const warnings: string[] = [];
    const user = createMockUser("user1", {
      onSend: (content) => warnings.push(content.content || content),
    });

    const client = createMockClient([guild], new Map([["user1", user]]));

    // User was active 11 days ago (expired)
    const now = Date.now();
    const elevenDaysAgo = now - 11 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", elevenDaysAgo);

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async (userId, guildId, message) => {
        warnings.push(message);
        return true;
      },
      removeRole: async () => false,
      kickMember: async () => false,
      sendFarewell: async () => false,
    };

    const stats = await sweep(deps);

    expect(stats.roleWarnings).toBe(1);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("will lose the **Active** role");

    const userRecord = getUser("user1");
    expect(userRecord?.warn_type).toBe("role");
    expect(userRecord?.warned_at).toBeDefined();
  });

  it("should not warn users who are still active", async () => {
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
    const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", fiveDaysAgo);

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async () => true,
      removeRole: async () => false,
      kickMember: async () => false,
      sendFarewell: async () => false,
    };

    const stats = await sweep(deps);

    expect(stats.roleWarnings).toBe(0);
  });

  it("should remove role after grace period", async () => {
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
      kickMember: async () => false,
      sendFarewell: async () => false,
    };

    const stats = await sweep(deps);

    expect(stats.roleRemovals).toBe(1);
    expect(roleRemoved).toBe(true);

    const userRecord = getUser("user1");
    expect(userRecord?.has_role).toBe(0);
  });

  it("should not remove role if grace period not passed", async () => {
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
      kickMember: async () => false,
      sendFarewell: async () => false,
    };

    const stats = await sweep(deps);

    expect(stats.roleRemovals).toBe(0);
  });

  it("should reset warnings when user becomes active", async () => {
    const now = Date.now();
    const elevenDaysAgo = now - 11 * 24 * 60 * 60 * 1000;

    upsertActivity("user1", "guild1", elevenDaysAgo);
    markWarned(now - 2 * 24 * 60 * 60 * 1000, "role", "user1");

    // User becomes active again
    upsertActivity("user1", "guild1", now);

    const userRecord = getUser("user1");
    expect(userRecord?.warned_at).toBeNull();
    expect(userRecord?.warn_type).toBeNull();
    expect(userRecord?.last_message_at).toBe(now);
  });
});
