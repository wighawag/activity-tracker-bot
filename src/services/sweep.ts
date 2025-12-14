import type { Config } from "../config";
import type { Client, Guild, User } from "discord.js";
import type { ActivityRepository } from "../types";
import { RoleManagerService } from "./roles";
import { NotificationService } from "./notifications";
import { logWithTimestamp } from "./logging";

export class SweepService {
  private config: Config;
  private client: Client;
  private repository: ActivityRepository;
  private roleManager: RoleManagerService;
  private notificationService: NotificationService;
  private sweepTimeout: NodeJS.Timeout | null = null;
  private currentSweep: Promise<void> | null = null;

  constructor(
    config: Config,
    client: Client,
    repository: ActivityRepository,
    roleManager: RoleManagerService,
    notificationService: NotificationService,
  ) {
    this.config = config;
    this.client = client;
    this.repository = repository;
    this.roleManager = roleManager;
    this.notificationService = notificationService;
  }

  /**
   * Start the periodic sweep process
   */
  start(): void {
    if (this.sweepTimeout) {
      this.stop();
    }

    this.runAndSchedule();
  }

  /**
   * Run a sweep and schedule the next one
   */
  private runAndSchedule(): void {
    const startTime = Date.now();
    this.currentSweep = this.runSweep().catch(console.error);
    this.currentSweep.finally(() => {
      const elapsed = Date.now() - startTime;
      const delay = Math.max(0, this.config.SWEEP_INTERVAL_MS - elapsed);
      this.sweepTimeout = setTimeout(() => this.runAndSchedule(), delay);
    });
  }

  /**
   * Stop the periodic sweep process
   */
  async stop(): Promise<void> {
    if (this.currentSweep) {
      await this.currentSweep;
      this.currentSweep = null;
    }
    if (this.sweepTimeout) {
      clearTimeout(this.sweepTimeout);
      this.sweepTimeout = null;
    }
  }

  /**
   * Run a single sweep to check for inactive users
   */
  async runSweep(): Promise<void> {
    logWithTimestamp("🧹 running sweep...");
    try {
      const guilds = await this.client.guilds.fetch();

      if (guilds.size === 0) {
        logWithTimestamp("⚠️  No guilds to sweep. Bot is not in any servers.");
        return;
      }

      for (const guild of guilds.values()) {
        const fetchedGuild = await guild.fetch();
        await this.processGuild(fetchedGuild);
      }
    } catch (error) {
      console.error("Error during sweep:", error);
    }
  }

  /**
   * Process a single guild for role transitions
   */
  private async processGuild(guild: Guild): Promise<void> {
    // Process active → inactive transitions
    const inactiveCandidates = await this.repository.getUsersExceedingThreshold(
      this.config.INACTIVE_AFTER_MS,
      "active",
    );

    for (const user of inactiveCandidates) {
      const discordUser = user as unknown as User;
      const name =
        discordUser.displayName ||
        discordUser.globalName ||
        discordUser.username;
      try {
        logWithTimestamp(`⚠️ ${name} is inactive, assigning new role`);
        await this.roleManager.assignRoleToUser(
          guild,
          user.user_id,
          "inactive",
        );
        await this.notificationService.sendInactiveNotification(
          guild.id,
          user.user_id,
        );
      } catch (error) {
        console.error(
          `Failed to transition user ${user.user_id} to inactive:`,
          error,
        );
      }
    }

    // Process inactive → dormant transitions
    const dormantCandidates =
      await this.repository.getUsersDormantExceedingThreshold(
        this.config.DORMANT_AFTER_MS,
      );

    for (const user of dormantCandidates) {
      const discordUser = user as unknown as User;
      const name =
        discordUser.displayName ||
        discordUser.globalName ||
        discordUser.username;
      try {
        logWithTimestamp(`⚠️ ${name} is dormant, assigning new role`);
        await this.roleManager.assignRoleToUser(guild, user.user_id, "dormant");
        await this.notificationService.sendDormantNotification(
          guild.id,
          user.user_id,
        );
      } catch (error) {
        console.error(
          `Failed to transition user ${user.user_id} to dormant:`,
          error,
        );
      }
    }
  }

  /**
   * Handle user activity (message sent)
   */
  async handleUserActivity(guildId: string, userId: string): Promise<void> {
    try {
      const guilds = await this.client.guilds.fetch();
      const guild = guilds.get(guildId);
      if (!guild) return;

      const fetchedGuild = await guild.fetch();

      // Update last activity time
      await this.repository.upsertUser({
        user_id: userId,
        guild_id: guildId,
        last_activity: new Date(),
        current_role: "active",
      });

      // Ensure user has active role
      await this.roleManager.assignRoleToUser(fetchedGuild, userId, "active");
    } catch (error) {
      console.error(`Failed to handle activity for user ${userId}:`, error);
    }
  }
}
