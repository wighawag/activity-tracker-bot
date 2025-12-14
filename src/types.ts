/**
 * Represents the possible activity states for a user
 */
export type ActivityRole = "active" | "inactive" | "dormant";
/**
 * Represents a user's activity record in the database
 */
export interface UserActivity {
  user_id: string;
  guild_id: string;
  last_activity: Date;
  current_role: ActivityRole;
}
/**
 * Discord client interface for dependency injection
 */
export interface DiscordClient {
  guilds: {
    fetch: (guildId: string) => Promise<Guild>;
  };
  on: (event: string, handler: (...args: any[]) => void) => void;
  login: (token: string) => Promise<string>;
}
/**
 * Guild interface for dependency injection
 */
export interface Guild {
  id: string;
  members: {
    fetch: () => Promise<GuildMemberManager>;
  };
  roles: {
    fetch: () => Promise<RoleManager>;
    create: (options: { name: string }) => Promise<Role>;
  };
}
/**
 * Guild member manager interface
 */
export interface GuildMemberManager {
  cache: Map<string, GuildMember>;
  fetch: (options?: { user: string }) => Promise<GuildMember>;
}
/**
 * Role manager interface
 */
export interface RoleManager {
  cache: Map<string, Role>;
  create: (options: { name: string }) => Promise<Role>;
}
/**
 * Guild member interface
 */
export interface GuildMember {
  id: string;
  roles: {
    add: (role: Role | string) => Promise<void>;
    remove: (role: Role | string) => Promise<void>;
    cache: Map<string, Role>;
  };
  send: (options: { content: string }) => Promise<void>;
}
/**
 * Role interface
 */
export interface Role {
  id: string;
  name: string;
}
/**
 * Database repository interface for testing
 */
export interface ActivityRepository {
  initialize: () => Promise<void>;
  getUser: (userId: string, guildId: string) => Promise<UserActivity | null>;
  upsertUser: (user: UserActivity) => Promise<void>;
  getUsersExceedingThreshold(
    thresholdMs: number,
    role: "active" | "inactive",
  ): Promise<UserActivity[]>;
  getUsersDormantExceedingThreshold(
    thresholdMs: number,
  ): Promise<UserActivity[]>;
  getAllUsers: () => Promise<UserActivity[]>;
}
