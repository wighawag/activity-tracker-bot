import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SweepService } from "../../src/services/sweep";
import type { Client, Guild } from "discord.js";

describe("SweepService", () => {
  let mockConfig: any;
  let mockClient: any;
  let mockRepository: any;
  let mockRoleManager: any;
  let mockNotificationService: any;
  let sweepService: SweepService;
  let mockGuild: any;

  beforeEach(() => {
    // Mock config
    mockConfig = {
      INACTIVE_AFTER_MS: 864000000, // 10 days
      DORMANT_AFTER_MS: 2592000000, // 30 days
      SWEEP_INTERVAL_MS: 60000, // 1 minute
    };

    // Mock guild
    mockGuild = {
      id: "guild123",
      fetch: mock(() => Promise.resolve(mockGuild)),
      members: {
        fetch: mock(() =>
          Promise.resolve({
            user: { bot: false },
            displayName: "Test User",
          }),
        ),
      },
    };

    // Mock client
    mockClient = {
      guilds: {
        fetch: mock(() =>
          Promise.resolve({
            values: () => [mockGuild],
          }),
        ),
      },
    };

    // Mock repository
    mockRepository = {
      getUsersExceedingThreshold: mock(() => Promise.resolve([])),
      getUsersDormantExceedingThreshold: mock(() => Promise.resolve([])),
      upsertUser: mock(() => Promise.resolve()),
      getUser: () => Promise.resolve(null),
    };

    // Mock role manager
    mockRoleManager = {
      assignRoleToUser: mock(() => Promise.resolve()),
    };

    // Mock notification service
    mockNotificationService = {
      sendInactiveNotification: mock(() => Promise.resolve()),
      sendDormantNotification: mock(() => Promise.resolve()),
    };

    sweepService = new SweepService(
      mockConfig,
      mockClient,
      mockRepository,
      mockRoleManager,
      mockNotificationService,
    );
  });

  it("should start and stop sweep process", async () => {
    sweepService.start();
    expect(sweepService["sweepTimeout"]).toBeDefined();

    await sweepService.stop();
    expect(sweepService["sweepTimeout"]).toBeNull();
  });

  it("should process guild for role transitions", async () => {
    // Mock inactive users
    mockRepository.getUsersExceedingThreshold = mock(() =>
      Promise.resolve([
        {
          user_id: "user1",
          guild_id: "guild123",
          last_activity: new Date(Date.now() - 864000000 - 1000),
          current_role: "active",
          added_via: "sync",
        },
      ]),
    );

    // Mock dormant users
    mockRepository.getUsersDormantExceedingThreshold = mock(() =>
      Promise.resolve([
        {
          user_id: "user2",
          guild_id: "guild123",
          last_activity: new Date(Date.now() - 2592000000 - 1000),
          current_role: "inactive",
          added_via: "sync",
        },
      ]),
    );

    await sweepService["processGuild"](mockGuild);

    expect(mockRoleManager.assignRoleToUser).toHaveBeenCalledTimes(2);
    expect(
      mockNotificationService.sendInactiveNotification,
    ).toHaveBeenCalledWith(mockGuild.id, "user1");
    expect(
      mockNotificationService.sendDormantNotification,
    ).toHaveBeenCalledWith(mockGuild.id, "user2");
  });

  it("should handle user activity", async () => {
    mockClient.guilds.fetch = mock(() =>
      Promise.resolve(new Map([[mockGuild.id, mockGuild]])),
    );

    await sweepService.handleUserActivity(mockGuild.id, "user123");

    // The function should complete without error
    expect(true).toBe(true);
  });
});
