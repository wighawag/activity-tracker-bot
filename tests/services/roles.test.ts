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
    // Mock guild with all roles present
    const mockGuild = {
      name: "Test Guild",
      roles: {
        cache: {
          find: (fn: any) => {
            const role = { name: "Active" };
            return fn(role) ? role : null;
          },
        },
      },
    } as unknown as Guild;

    // Mock find to return roles for all names
    mockGuild.roles.cache.find = (fn: any) => {
      const activeRole = { name: "Active" };
      const inactiveRole = { name: "Inactive" };
      const dormantRole = { name: "Dormant" };
      if (fn(activeRole)) return activeRole;
      if (fn(inactiveRole)) return inactiveRole;
      if (fn(dormantRole)) return dormantRole;
      return null;
    };

    const roleMap = await roleManager.ensureRolesExist(mockGuild);

    expect(roleMap.size).toBe(3);
    expect(roleMap.get("Active")).toBeDefined();
    expect(roleMap.get("Inactive")).toBeDefined();
    expect(roleMap.get("Dormant")).toBeDefined();
  });

  it("should throw error if role does not exist", async () => {
    // Mock guild missing Inactive role
    const mockGuild = {
      name: "Test Guild",
      roles: {
        cache: {
          find: (fn: any) => {
            const activeRole = { name: "Active" };
            const dormantRole = { name: "Dormant" };
            if (fn(activeRole)) return activeRole;
            if (fn(dormantRole)) return dormantRole;
            return null; // Inactive missing
          },
        },
      },
    } as unknown as Guild;

    await expect(roleManager.ensureRolesExist(mockGuild)).rejects.toThrow(
      'Required role "Inactive" does not exist in guild "Test Guild". Please create it manually.'
    );
  });

  it("should assign role to user", async () => {
    // Mock roles
    const activeRole = { id: "role123", name: "Active" };
    const inactiveRole = { id: "role124", name: "Inactive" };
    const dormantRole = { id: "role125", name: "Dormant" };

    // Track calls
    let removeCalled = false;
    let addCalled = false;

    // Mock guild
    const mockGuild = {
      id: "guild123",
      roles: {
        cache: {
          find: (fn: any) => {
            if (fn(activeRole)) return activeRole;
            if (fn(inactiveRole)) return inactiveRole;
            if (fn(dormantRole)) return dormantRole;
            return null;
          },
        },
        create: () => Promise.resolve(activeRole),
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
    // Mock roles
    const activeRole = { id: "role123", name: "Active" };
    const inactiveRole = { id: "role124", name: "Inactive" };
    const dormantRole = { id: "role125", name: "Dormant" };

    // Track calls
    let addCalled = false;

    // Mock guild
    const mockGuild = {
      id: "guild123",
      roles: {
        cache: {
          find: (fn: any) => {
            if (fn(activeRole)) return activeRole;
            if (fn(inactiveRole)) return inactiveRole;
            if (fn(dormantRole)) return dormantRole;
            return null;
          },
        },
        create: () => Promise.resolve(activeRole),
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

    // Mock roles
    const activeRole = { id: "role122", name: "Active" };
    const inactiveRole = { id: "role123", name: "Inactive" };
    const dormantRole = { id: "role124", name: "Dormant" };

    // Track calls
    let addCalled = false;

    // Mock guild
    const mockGuild = {
      id: "guild123",
      roles: {
        cache: {
          find: (fn: any) => {
            if (fn(activeRole)) return activeRole;
            if (fn(inactiveRole)) return inactiveRole;
            if (fn(dormantRole)) return dormantRole;
            return null;
          },
        },
        create: () => Promise.resolve(inactiveRole),
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
