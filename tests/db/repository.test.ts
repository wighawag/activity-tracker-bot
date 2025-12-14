import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import type { ActivityRepository } from "../../src/types";
import { createTables } from "../../src/db/schema";
import { SQLiteActivityRepository } from "../../src/db/repository";

describe("SQLiteActivityRepository", () => {
  let db: Database;
  let repository: ActivityRepository;
  const testDbPath = ":memory:";

  beforeEach(() => {
    db = new Database(testDbPath);
    db.exec(createTables);
    repository = new SQLiteActivityRepository(testDbPath);
  });

  afterEach(() => {
    db.close();
  });

  it("should initialize the database", async () => {
    // Already initialized in beforeEach
    const result = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_activity'",
      )
      .get();
    expect(result).toBeDefined();
  });

  it("should upsert and get user", async () => {
    const user = {
      user_id: "user123",
      guild_id: "guild123",
      last_activity: new Date(),
      current_role: "active" as const,
    };

    await repository.upsertUser(user);
    const retrievedUser = await repository.getUser("user123", "guild123");

    expect(retrievedUser).toBeDefined();
    expect(retrievedUser?.user_id).toBe("user123");
    expect(retrievedUser?.guild_id).toBe("guild123");
    expect(retrievedUser?.current_role).toBe("active");
  });

  it("should return null for non-existent user", async () => {
    const user = await repository.getUser("nonexistent", "guild123");
    expect(user).toBeNull();
  });

  it("should get users exceeding threshold", async () => {
    // Insert test users
    const now = Date.now();
    const activeUser = {
      user_id: "active1",
      guild_id: "guild123",
      last_activity: new Date(now - 1000), // 1 second ago
      current_role: "active" as const,
    };

    const inactiveUser = {
      user_id: "inactive1",
      guild_id: "guild123",
      last_activity: new Date(now - 864000000 - 1000), // 10 days + 1 second ago
      current_role: "active" as const,
    };

    await repository.upsertUser(activeUser);
    await repository.upsertUser(inactiveUser);

    const inactiveCandidates = await repository.getUsersExceedingThreshold(
      864000000, // 10 days
      "active",
      "guild123",
    );

    expect(inactiveCandidates.length).toBe(1);
    expect(inactiveCandidates[0]!.user_id).toBe("inactive1");
  });

  it("should get dormant users exceeding threshold", async () => {
    // Insert test users
    const now = Date.now();
    const inactiveUser = {
      user_id: "inactive1",
      guild_id: "guild123",
      last_activity: new Date(now - 2592000000 - 1000), // 30 days + 1 second ago
      current_role: "inactive" as const,
    };

    await repository.upsertUser(inactiveUser);

    const dormantCandidates =
      await repository.getUsersDormantExceedingThreshold(
        2592000000, // 30 days
        "guild123",
      );

    expect(dormantCandidates.length).toBe(1);
    expect(dormantCandidates[0]?.user_id).toBe("inactive1");
  });

  it("should get dormant users", async () => {
    // Insert test users
    const dormantUser = {
      user_id: "dormant1",
      guild_id: "guild123",
      last_activity: new Date(),
      current_role: "dormant" as const,
    };

    await repository.upsertUser(dormantUser);

    const dormantUsers = await repository.getDormantUsers("guild123");

    expect(dormantUsers.length).toBe(1);
    expect(dormantUsers[0]?.user_id).toBe("dormant1");
    expect(dormantUsers[0]?.current_role).toBe("dormant");
  });
});
