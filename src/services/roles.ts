import type { Config } from "../config";
import type { Guild, Role, GuildMember } from "discord.js";
import type { ActivityRepository } from "../types";

export class RoleManagerService {
  private config: Config;
  private repository: ActivityRepository;

  constructor(config: Config, repository: ActivityRepository) {
    this.config = config;
    this.repository = repository;
  }

  /**
   * Ensure all required roles exist in the guild
   */
  async ensureRolesExist(guild: Guild): Promise<Map<string, Role>> {
    const roleMap = new Map<string, Role>();

    // Check for each required role
    for (const roleName of [
      this.config.ACTIVE_ROLE_NAME,
      this.config.INACTIVE_ROLE_NAME,
      this.config.DORMANT_ROLE_NAME,
    ]) {
      const existingRole = guild.roles.cache.find((r) => r.name === roleName);
      if (existingRole) {
        roleMap.set(roleName, existingRole);
      } else {
        const newRole = await guild.roles.create({ name: roleName });
        roleMap.set(roleName, newRole);
      }
    }

    return roleMap;
  }

  /**
   * Assign the appropriate role to a user based on their activity status
   */
  async assignRoleToUser(
    guild: Guild,
    userId: string,
    roleName: "active" | "inactive" | "dormant",
  ): Promise<void> {
    const member = await guild.members.fetch({ user: userId });
    const roleMap = await this.ensureRolesExist(guild);

    // Remove all activity roles first
    for (const [name, role] of roleMap) {
      await member.roles.remove(role);
    }

    // Add the appropriate role
    const targetRole = roleMap.get(
      roleName === "active"
        ? this.config.ACTIVE_ROLE_NAME
        : roleName === "inactive"
          ? this.config.INACTIVE_ROLE_NAME
          : this.config.DORMANT_ROLE_NAME,
    );

    if (targetRole) {
      await member.roles.add(targetRole);
    }

    // Update database after successful role assignment
    await this.repository.upsertUser({
      user_id: userId,
      guild_id: guild.id,
      last_activity: new Date(),
      current_role: roleName,
    });
  }

  /**
   * Ensure a user has an activity role (assign active if none)
   */
  async ensureUserHasRole(guild: Guild, userId: string): Promise<void> {
    const user = await this.repository.getUser(userId, guild.id);
    if (!user) {
      // New user - assign active role
      await this.assignRoleToUser(guild, userId, "active");
    } else {
      // Existing user - ensure they have the correct role
      await this.assignRoleToUser(guild, userId, user.current_role);
    }
  }

  /**
   * Get the current role name for a user
   */
  async getUserRoleName(
    guildId: string,
    userId: string,
  ): Promise<"active" | "inactive" | "dormant"> {
    const user = await this.repository.getUser(userId, guildId);
    return user?.current_role || "active";
  }
}
