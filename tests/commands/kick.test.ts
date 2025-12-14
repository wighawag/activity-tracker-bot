import { describe, it, expect, beforeEach, mock } from "bun:test";
import { KickCommand } from "../../src/commands/kick";
import type { ChatInputCommandInteraction, Guild } from "discord.js";

describe("KickCommand", () => {
  let mockConfig: any;
  let mockClient: any;
  let mockRepository: any;
  let mockRoleManager: any;
  let mockNotificationService: any;
  let kickCommand: KickCommand;

  beforeEach(() => {
    // Mock config
    mockConfig = {
      DORMANT_AFTER_MS: 2592000000, // 30 days
    };

    // Mock client
    mockClient = {};

    // Mock repository
    mockRepository = {
      getDormantUsers: mock(() => Promise.resolve([])),
    };

    // Mock role manager
    mockRoleManager = {};

    // Mock notification service
    mockNotificationService = {
      sendKickNotification: mock(() => Promise.resolve()),
    };

    kickCommand = new KickCommand(
      mockConfig,
      mockClient,
      mockRepository,
      mockRoleManager,
      mockNotificationService,
    );
  });

  it("should reject non-confirmation", async () => {
    const replyMock = mock(() => Promise.resolve());
    const mockInteraction = {
      commandName: "kick-dormant",
      options: {
        getBoolean: mock(() => false),
      },
      reply: replyMock,
    } as unknown as ChatInputCommandInteraction;

    await kickCommand.handle(mockInteraction);

    expect(replyMock).toHaveBeenCalledWith({
      content: "❌ You must confirm the action to kick dormant users.",
      ephemeral: true,
    });
  });

  it("should handle non-guild interaction", async () => {
    const editReplyMock = mock(() => Promise.resolve());
    const mockInteraction = {
      commandName: "kick-dormant",
      options: {
        getBoolean: mock(() => true),
      },
      guild: null,
      deferReply: mock(() => Promise.resolve()),
      editReply: editReplyMock,
    } as unknown as ChatInputCommandInteraction;

    await kickCommand.handle(mockInteraction);

    expect(editReplyMock).toHaveBeenCalledWith(
      "❌ This command can only be used in a server.",
    );
  });

  it("should handle no dormant users", async () => {
    const editReplyMock = mock(() => Promise.resolve());
    const mockGuild = { id: "guild123" } as Guild;
    const mockInteraction = {
      commandName: "kick-dormant",
      options: {
        getBoolean: mock(() => true),
      },
      guild: mockGuild,
      deferReply: mock(() => Promise.resolve()),
      editReply: editReplyMock,
    } as unknown as ChatInputCommandInteraction;

    await kickCommand.handle(mockInteraction);

    expect(editReplyMock).toHaveBeenCalledWith(
      "✅ No dormant users found to kick.",
    );
  });

  it("should kick dormant users", async () => {
    // Mock dormant users
    mockRepository.getDormantUsers = mock(() =>
      Promise.resolve([
        {
          user_id: "user1",
          guild_id: "guild123",
          last_activity: new Date(Date.now() - 2592000000 - 1000),
          current_role: "dormant",
        },
      ]),
    );

    // Track kick calls
    const kickMock = mock(() => Promise.resolve());

    // Mock guild
    const mockGuild = {
      id: "guild123",
      members: {
        fetch: mock(() =>
          Promise.resolve({
            user: { bot: false },
            permissions: { has: mock(() => false) },
            kick: kickMock,
          }),
        ),
      },
    } as unknown as Guild;

    const editReplyMock = mock(() => Promise.resolve());
    const mockInteraction = {
      commandName: "kick-dormant",
      options: {
        getBoolean: mock(() => true),
      },
      guild: mockGuild,
      deferReply: mock(() => Promise.resolve()),
      editReply: editReplyMock,
    } as unknown as ChatInputCommandInteraction;

    await kickCommand.handle(mockInteraction);

    expect(mockGuild.members.fetch).toHaveBeenCalledWith("user1");
    expect(mockNotificationService.sendKickNotification).toHaveBeenCalledWith(
      "guild123",
      "user1",
    );
    expect(kickMock).toHaveBeenCalled();
    expect(editReplyMock).toHaveBeenCalledWith(
      "✅ Successfully kicked 1 dormant users.",
    );
  });

  it("should skip bot users", async () => {
    // Mock dormant users
    mockRepository.getDormantUsers = mock(() =>
      Promise.resolve([
        {
          user_id: "bot1",
          guild_id: "guild123",
          last_activity: new Date(Date.now() - 2592000000 - 1000),
          current_role: "dormant",
        },
      ]),
    );

    // Mock guild
    const mockGuild = {
      id: "guild123",
      members: {
        fetch: mock(() =>
          Promise.resolve({
            user: { bot: true },
            permissions: { has: mock(() => false) },
            kick: mock(() => Promise.resolve()),
          }),
        ),
      },
    } as unknown as Guild;

    const editReplyMock = mock(() => Promise.resolve());
    const mockInteraction = {
      commandName: "kick-dormant",
      options: {
        getBoolean: mock(() => true),
      },
      guild: mockGuild,
      deferReply: mock(() => Promise.resolve()),
      editReply: editReplyMock,
    } as unknown as ChatInputCommandInteraction;

    await kickCommand.handle(mockInteraction);

    expect(editReplyMock).toHaveBeenCalledWith(
      "✅ Successfully kicked 0 dormant users.",
    );
  });

  it("should skip admin users", async () => {
    // Mock dormant users
    mockRepository.getDormantUsers = mock(() =>
      Promise.resolve([
        {
          user_id: "admin1",
          guild_id: "guild123",
          last_activity: new Date(Date.now() - 2592000000 - 1000),
          current_role: "dormant",
        },
      ]),
    );

    // Mock guild
    const mockGuild = {
      id: "guild123",
      members: {
        fetch: mock(() =>
          Promise.resolve({
            user: { bot: false },
            permissions: { has: mock(() => true) },
            kick: mock(() => Promise.resolve()),
          }),
        ),
      },
    } as unknown as Guild;

    const editReplyMock = mock(() => Promise.resolve());
    const mockInteraction = {
      commandName: "kick-dormant",
      options: {
        getBoolean: mock(() => true),
      },
      guild: mockGuild,
      deferReply: mock(() => Promise.resolve()),
      editReply: editReplyMock,
    } as unknown as ChatInputCommandInteraction;

    await kickCommand.handle(mockInteraction);

    expect(editReplyMock).toHaveBeenCalledWith(
      "✅ Successfully kicked 0 dormant users.",
    );
  });

  it("should handle kick errors gracefully", async () => {
    // Mock dormant users
    mockRepository.getDormantUsers = mock(() =>
      Promise.resolve([
        {
          user_id: "user1",
          guild_id: "guild123",
          last_activity: new Date(Date.now() - 2592000000 - 1000),
          current_role: "dormant",
        },
      ]),
    );

    // Mock guild with failing kick - wrap in try/catch to prevent test from throwing
    const mockGuild = {
      id: "guild123",
      members: {
        fetch: mock(() => {
          return Promise.resolve({
            user: { bot: false },
            permissions: { has: mock(() => false) },
            kick: () => Promise.reject(new Error("Kick failed")),
          });
        }),
      },
    } as unknown as Guild;

    const editReplyMock = mock(() => Promise.resolve());
    const mockInteraction = {
      commandName: "kick-dormant",
      options: {
        getBoolean: mock(() => true),
      },
      guild: mockGuild,
      deferReply: mock(() => Promise.resolve()),
      editReply: editReplyMock,
    } as unknown as ChatInputCommandInteraction;

    await kickCommand.handle(mockInteraction);

    expect(editReplyMock).toHaveBeenCalledWith(
      "✅ Successfully kicked 0 dormant users.",
    );
  });
});
