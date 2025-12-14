import type { Config } from "../config";
import type { Guild, Role, GuildMember } from "discord.js";
import type { ActivityRepository } from "../types";
import { logWithTimestamp } from "./logging";

export class RoleManagerService {
  private config: Config;
  private repository: ActivityRepository;
  private roleCache = new Map<string, Map<string, Role>>();

  constructor(config: Config, repository: ActivityRepository) {
    this.config = config;
    this.repository = repository;
  }

  /**
   * Ensure all required roles exist in the guild
   */
  async ensureRolesExist(guild: Guild): Promise<Map<string, Role>> {
    const cached = this.roleCache.get(guild.id);
    if (cached) return cached;

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

    this.roleCache.set(guild.id, roleMap);
    return roleMap;
  }

  /**
   * Assign the appropriate role to a user based on their activity status
   */
  async assignRoleToUser(
    guild: Guild,
    userId: string,
    roleName: "active" | "inactive" | "dormant",
    added_via: "sync" | "activity",
  ): Promise<void> {
    const member = await guild.members.fetch({ user: userId });
    let roleMap = await this.ensureRolesExist(guild);

    const getTargetRole = () =>
      roleMap.get(
        roleName === "active"
          ? this.config.ACTIVE_ROLE_NAME
          : roleName === "inactive"
            ? this.config.INACTIVE_ROLE_NAME
            : this.config.DORMANT_ROLE_NAME,
      );

    let targetRole = getTargetRole();

    if (!targetRole) {
      throw new Error(`Target role for ${roleName} not found`);
    }

    // Check if member already has the correct role
    if (member.roles.cache.has(targetRole.id)) {
      logWithTimestamp(
        `✅ User ${userId} already has ${roleName} role in guild ${guild.id}`,
      );
      // Already has the role, just update database
      await this.repository.upsertUser({
        user_id: userId,
        guild_id: guild.id,
        last_activity: new Date(),
        current_role: roleName,
        added_via: added_via,
      });
      return;
    }

    logWithTimestamp(
      `🔄 Assigning ${roleName} role to user ${userId} in guild ${guild.id}`,
    );

    // Retry logic for role operations
    let attempts = 0;
    const maxAttempts = 2;
    while (attempts < maxAttempts) {
      try {
        // Remove all activity roles except the target
        let removedRoles = 0;
        for (const [name, role] of roleMap) {
          if (role.id !== targetRole.id && member.roles.cache.has(role.id)) {
            await member.roles.remove(role);
            removedRoles++;
            logWithTimestamp(`➖ Removed ${name} role from user ${userId}`);
          }
        }

        // Add the target role
        await member.roles.add(targetRole);
        logWithTimestamp(`➕ Added ${roleName} role to user ${userId}`);

        // Verify the role assignment was successful
        const refreshedMember = await guild.members.fetch({ user: userId });
        const hasTargetRole = refreshedMember.roles.cache.has(targetRole.id);
        const activityRolesCount = Array.from(roleMap.values()).filter((role) =>
          refreshedMember.roles.cache.has(role.id),
        ).length;

        if (!hasTargetRole || activityRolesCount !== 1) {
          throw new Error(
            `Role assignment verification failed: hasTarget=${hasTargetRole}, activityRoles=${activityRolesCount}`,
          );
        }

        // Update database after successful role assignment
        await this.repository.upsertUser({
          user_id: userId,
          guild_id: guild.id,
          last_activity: new Date(),
          current_role: roleName,
          added_via: added_via,
        });
        logWithTimestamp(
          `💾 Updated database for user ${userId} with role ${roleName}`,
        );
        return;
      } catch (error) {
        attempts++;
        logWithTimestamp(
          `⚠️ Attempt ${attempts} failed for user ${userId}: ${error}`,
        );
        if (attempts >= maxAttempts) {
          logWithTimestamp(
            `❌ Failed to assign ${roleName} role to user ${userId} after ${maxAttempts} attempts`,
          );
          throw error;
        }
        // Clear cache and retry
        this.roleCache.delete(guild.id);
        roleMap = await this.ensureRolesExist(guild);
        targetRole = getTargetRole();
        if (!targetRole) {
          throw new Error(`Target role for ${roleName} not found`);
        }
      }
    }
  }

  /**
   * Ensure a user has an activity role (assign active if none)
   */
  async ensureUserHasRole(guild: Guild, userId: string): Promise<void> {
    const user = await this.repository.getUser(userId, guild.id);
    if (!user) {
      // New user - assign active role
      await this.assignRoleToUser(guild, userId, "active", "sync");
    } else {
      // Existing user - ensure they have the correct role
      await this.assignRoleToUser(
        guild,
        userId,
        user.current_role,
        user.added_via,
      );
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
