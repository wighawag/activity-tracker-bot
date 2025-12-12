import { describe, it, expect, beforeEach } from "bun:test";
import {
  initDb,
  resetDb,
  upsertActivity,
  getUser,
  markWarned,
} from "../../src/db.js";

describe("button handler - activity registration", () => {
  beforeEach(() => {
    initDb(":memory:");
    resetDb();
  });

  it("should register new user activity", () => {
    const now = Date.now();
    upsertActivity("user1", "guild1", now);

    const user = getUser("user1");

    expect(user).toBeDefined();
    expect(user?.user_id).toBe("user1");
    expect(user?.guild_id).toBe("guild1");
    expect(user?.has_role).toBe(1);
  });

  it("should reset warnings when button is pressed", () => {
    const now = Date.now();
    const elevenDaysAgo = now - 11 * 24 * 60 * 60 * 1000;

    // User was warned
    upsertActivity("user1", "guild1", elevenDaysAgo);
    markWarned(now - 2 * 24 * 60 * 60 * 1000, "role", "user1");

    let user = getUser("user1");
    expect(user?.warned_at).not.toBeNull();
    expect(user?.warn_type).toBe("role");

    // Simulate button press
    upsertActivity("user1", "guild1", now);

    user = getUser("user1");
    expect(user?.warned_at).toBeNull();
    expect(user?.warn_type).toBeNull();
    expect(user?.last_message_at).toBe(now);
  });

  it("should reset kick warnings when button is pressed", () => {
    const now = Date.now();
    const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;

    // User was warned for kick
    upsertActivity("user1", "guild1", thirtyOneDaysAgo);
    markWarned(now - 2 * 24 * 60 * 60 * 1000, "kick", "user1");

    let user = getUser("user1");
    expect(user?.warn_type).toBe("kick");

    // Simulate button press
    upsertActivity("user1", "guild1", now);

    user = getUser("user1");
    expect(user?.warned_at).toBeNull();
    expect(user?.warn_type).toBeNull();
  });

  it("should restore role flag when button is pressed after role removal", async () => {
    const now = Date.now();

    upsertActivity("user1", "guild1", now - 20 * 24 * 60 * 60 * 1000);

    // Simulate role being removed
    const db = (await import("../../src/db.js")).getDb();
    db.prepare("UPDATE user_activity SET has_role = 0 WHERE user_id = ?").run(
      "user1",
    );

    let user = getUser("user1");
    expect(user?.has_role).toBe(0);

    // Simulate button press
    upsertActivity("user1", "guild1", now);

    user = getUser("user1");
    expect(user?.has_role).toBe(1);
  });

  it("should handle button press from user not in database", () => {
    const now = Date.now();

    // New user presses button
    upsertActivity("newuser", "guild1", now);

    const user = getUser("newuser");
    expect(user).toBeDefined();
    expect(user?.has_role).toBe(1);
    expect(user?.warned_at).toBeNull();
  });

  it("should update guild_id if user switches guilds", () => {
    const now = Date.now();

    upsertActivity("user1", "guild1", now - 1000);

    let user = getUser("user1");
    expect(user?.guild_id).toBe("guild1");

    // User active in different guild
    upsertActivity("user1", "guild2", now);

    user = getUser("user1");
    expect(user?.guild_id).toBe("guild2");
  });
});
