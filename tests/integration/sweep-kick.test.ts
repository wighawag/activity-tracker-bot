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

const TEST_KICK_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TEST_WARN_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

describe("sweep - kick management", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetDb();
  });

  it("should warn users approaching kick threshold", async () => {
    const member = createMockMember("user1", []);
    const guild = createMockGuild("guild1", "Test Guild", [member], []);

    const warnings: string[] = [];
    const user = createMockUser("user1", {
      onSend: (content) => warnings.push(content.content || content),
    });

    const client = createMockClient([guild], new Map([["user1", user]]));

    const now = Date.now();
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", thirtyOneDaysAgo);

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

    expect(stats.kickWarnings).toBe(1);
    expect(warnings.some((w) => w.includes("will be **removed**"))).toBe(true);

    const userRecord = getUser("user1");
    expect(userRecord?.warn_type).toBe("kick");
  });

  it("should kick user after grace period", async () => {
    let kicked = false;
    let farewellSent = false;

    const member = createMockMember("user1", [], {
      onKick: () => {
        kicked = true;
      },
    });
    const guild = createMockGuild("guild1", "Test Guild", [member], []);

    const user = createMockUser("user1", {
      onSend: () => {
        farewellSent = true;
      },
    });

    const client = createMockClient([guild], new Map([["user1", user]]));

    const now = Date.now();
    const thirtyFiveDaysAgo = now - 35 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", thirtyFiveDaysAgo);

    // Warned 4 days ago
    const fourDaysAgo = now - 4 * 24 * 60 * 60 * 1000;
    markWarned(fourDaysAgo, "kick", "user1");

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async () => true,
      removeRole: async () => false,
      kickMember: async (guildId, userId) => {
        kicked = true;
        return true;
      },
      sendFarewell: async (userId, message) => {
        farewellSent = true;
        return true;
      },
    };

    const stats = await sweep(deps);

    expect(stats.kicks).toBe(1);
    expect(kicked).toBe(true);
    expect(farewellSent).toBe(true);

    // User should be deleted from DB
    const userRecord = getUser("user1");
    expect(userRecord).toBeUndefined();
  });

  it("should not kick if grace period not passed", async () => {
    const member = createMockMember("user1", []);
    const guild = createMockGuild("guild1", "Test Guild", [member], []);

    const client = createMockClient([guild], new Map());

    const now = Date.now();
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
    upsertActivity("user1", "guild1", thirtyOneDaysAgo);

    // Warned 1 day ago (within grace period)
    const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;
    markWarned(oneDayAgo, "kick", "user1");

    const deps: SweepDeps = {
      client: client as any,
      now: () => now,
      sendWarning: async () => true,
      removeRole: async () => false,
      kickMember: async () => true,
      sendFarewell: async () => true,
    };

    const stats = await sweep(deps);

    expect(stats.kicks).toBe(0);
  });

  it("should handle full lifecycle: warn role → strip role → warn kick → kick", async () => {
    const activeRole = createMockRole("role1", "Active");
    let hasRole = true;
    let kicked = false;

    const member = createMockMember("user1", [activeRole], {
      onRoleRemove: () => {
        hasRole = false;
      },
      onKick: () => {
        kicked = true;
      },
    });
    const guild = createMockGuild(
      "guild1",
      "Test Guild",
      [member],
      [activeRole],
    );

    const messages: string[] = [];
    const user = createMockUser("user1", {
      onSend: (content) => messages.push(content.content || content),
    });

    const client = createMockClient([guild], new Map([["user1", user]]));

    // Start: user active now
    let currentTime = Date.now();
    upsertActivity("user1", "guild1", currentTime);

    const createDeps = (now: number): SweepDeps => ({
      client: client as any,
      now: () => now,
      sendWarning: async (userId, guildId, message) => {
        messages.push(message);
        return true;
      },
      removeRole: async () => {
        hasRole = false;
        return true;
      },
      kickMember: async () => {
        kicked = true;
        return true;
      },
      sendFarewell: async (userId, message) => {
        messages.push(message);
        return true;
      },
    });

    // Day 11: should get role warning
    currentTime += 11 * 24 * 60 * 60 * 1000;
    let stats = await sweep(createDeps(currentTime));
    expect(stats.roleWarnings).toBe(1);

    // Day 14: should lose role (11 + 3 grace)
    currentTime += 3 * 24 * 60 * 60 * 1000;
    stats = await sweep(createDeps(currentTime));
    expect(stats.roleRemovals).toBe(1);
    expect(hasRole).toBe(false);

    // Day 31: should get kick warning
    currentTime += 17 * 24 * 60 * 60 * 1000;
    stats = await sweep(createDeps(currentTime));
    expect(stats.kickWarnings).toBe(1);

    // Day 34: should be kicked (31 + 3 grace)
    currentTime += 3 * 24 * 60 * 60 * 1000;
    stats = await sweep(createDeps(currentTime));
    expect(stats.kicks).toBe(1);
    expect(kicked).toBe(true);

    // User should be gone from DB
    expect(getUser("user1")).toBeUndefined();
  });
});
