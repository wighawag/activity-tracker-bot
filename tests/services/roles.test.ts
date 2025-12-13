import { describe, it, expect, beforeEach } from "bun:test";
import { RoleManagerService } from "../../src/services/roles";
import type { Guild, Role, GuildMember } from "discord.js";

describe("RoleManagerService", () => {
  let mockRepository: any;
  let mockConfig: any;
  let roleManager: RoleManagerService;

  beforeEach(() => {
    // Mock repository
    mockRepository = {
      getUser: (userId: string, guildId: string) => Promise.resolve(null),
      upsertUser: (user: any) => Promise.resolve(),
    };

    // Mock config
    mockConfig = {
      ACTIVE_ROLE_NAME: "Active",
      INACTIVE_ROLE_NAME: "Inactive",
      DORMANT_ROLE_NAME: "Dormant",
    };

    roleManager = new RoleManagerService(mockConfig, mockRepository);
  });

  it("should ensure roles exist", async () => {
    // Track created roles
    const createdRoles: any[] = [];

    // Mock guild
    const mockGuild = {
      roles: {
        cache: {
          find: (fn: any) => fn({ name: "Active" }),
        },
        create: (options: any) => {
          const role = { name: options.name };
          createdRoles.push(role);
          return Promise.resolve(role);
        },
      },
    } as unknown as Guild;

    const roleMap = await roleManager.ensureRolesExist(mockGuild);

    expect(roleMap.size).toBe(3);
    expect(createdRoles.length).toBe(2); // Inactive and Dormant
    expect(createdRoles.some((r) => r.name === "Inactive")).toBeTrue();
    expect(createdRoles.some((r) => r.name === "Dormant")).toBeTrue();
  });

  it("should assign role to user", async () => {
    // Mock role
    const mockRole = { id: "role123", name: "Active" };

    // Track calls
    let removeCalled = false;
    let addCalled = false;

    // Mock guild
    const mockGuild = {
      id: "guild123",
      roles: {
        cache: {
          find: (fn: any) => fn(mockRole),
        },
        create: () => Promise.resolve(mockRole),
      },
    } as unknown as Guild;

    // Mock member
    const mockMember = {
      roles: {
        remove: (role: any) => {
          removeCalled = true;
          return Promise.resolve();
        },
        add: (role: any) => {
          addCalled = true;
          return Promise.resolve();
        },
      },
    } as unknown as GuildMember;

    // Mock guild.members.fetch
    mockGuild.members = {
      fetch: () => Promise.resolve(mockMember),
    } as any;

    await roleManager.assignRoleToUser(mockGuild, "user123", "active");

    expect(removeCalled).toBeTrue();
    expect(addCalled).toBeTrue();
  });

  it("should ensure user has role (new user)", async () => {
    // Mock role
    const mockRole = { id: "role123", name: "Active" };

    // Track calls
    let addCalled = false;

    // Mock guild
    const mockGuild = {
      id: "guild123",
      roles: {
        cache: {
          find: (fn: any) => fn(mockRole),
        },
        create: () => Promise.resolve(mockRole),
      },
    } as unknown as Guild;

    // Mock member
    const mockMember = {
      roles: {
        remove: () => Promise.resolve(),
        add: (role: any) => {
          addCalled = true;
          return Promise.resolve();
        },
      },
    } as unknown as GuildMember;

    // Mock guild.members.fetch
    mockGuild.members = {
      fetch: () => Promise.resolve(mockMember),
    } as any;

    await roleManager.ensureUserHasRole(mockGuild, "user123");

    expect(addCalled).toBeTrue();
  });

  it("should ensure user has role (existing user)", async () => {
    // Mock existing user
    mockRepository.getUser = (userId: string, guildId: string) =>
      Promise.resolve({
        user_id: "user123",
        guild_id: "guild123",
        last_activity: new Date(),
        current_role: "inactive",
      });

    // Mock role
    const mockRole = { id: "role123", name: "Inactive" };

    // Track calls
    let addCalled = false;

    // Mock guild
    const mockGuild = {
      id: "guild123",
      roles: {
        cache: {
          find: (fn: any) => fn(mockRole),
        },
        create: () => Promise.resolve(mockRole),
      },
    } as unknown as Guild;

    // Mock member
    const mockMember = {
      roles: {
        remove: () => Promise.resolve(),
        add: (role: any) => {
          addCalled = true;
          return Promise.resolve();
        },
      },
    } as unknown as GuildMember;

    // Mock guild.members.fetch
    mockGuild.members = {
      fetch: () => Promise.resolve(mockMember),
    } as any;

    await roleManager.ensureUserHasRole(mockGuild, "user123");

    expect(addCalled).toBeTrue();
  });
});
