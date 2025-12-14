import { Client, GatewayIntentBits, Partials } from "discord.js";
import { createConfig } from "./config";
import { SQLiteActivityRepository } from "./db/repository";
import { RoleManagerService } from "./services/roles";
import { NotificationService } from "./services/notifications";
import { SweepService } from "./services/sweep";
import { KickCommand } from "./commands/kick";
import type { ActivityRepository } from "./types";
import { logWithTimestamp } from "./services/logging";

async function main() {
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const syncTimeWindowMs =
    args.length > 0 && args[0] ? parseInt(args[0]) : 3600000; // Default to 1 hour

  // Load configuration
  const config = createConfig();

  // Graceful shutdown tracking
  let shuttingDown = false;
  const ongoingPromises = new Set<Promise<void>>();

  // Initialize database
  const repository = new SQLiteActivityRepository(config.DB_PATH);
  await repository.initialize();
  logWithTimestamp("✅ Database initialized successfully");

  // Create Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  // Initialize services
  const roleManager = new RoleManagerService(config, repository);
  const notificationService = new NotificationService(config, client);
  const sweepService = new SweepService(
    config,
    client,
    repository,
    roleManager,
    notificationService,
  );

  const kickCommand = new KickCommand(config, client, repository, roleManager);

  logWithTimestamp("🛠️  Services initialized");

  // Register event handlers
  client.on("ready", async () => {
    logWithTimestamp(`🚀 Logged in as ${client.user?.tag}!`);

    try {
      // Note: Slash commands are registered separately using `bun run register`
      // This avoids unnecessary API calls on every bot restart

      // Start sweep process
      logWithTimestamp("🧹 Starting sweep process...");
      sweepService.start();
      logWithTimestamp(
        `✅ Sweep process started (interval: ${config.SWEEP_INTERVAL_MS}ms)`,
      );

      // Sync guild members on startup
      logWithTimestamp("🔄 Syncing guild members...");
      await syncGuildMembers(client, repository, syncTimeWindowMs);
      logWithTimestamp("✅ Guild members synced successfully");
    } catch (error) {
      console.error("🚨 Error during bot initialization:", error);
      process.exit(1);
    }
  });

  client.on("messageCreate", (message) => {
    if (message.author.bot || shuttingDown) return;

    const handler = async () => {
      try {
        if (message.guild) {
          // Update user activity
          await sweepService.handleUserActivity(
            message.guild.id,
            message.author.id,
          );
        }
      } catch (error) {
        console.error(
          `🚨 Error handling message from ${message.author.tag}:`,
          error,
        );
      }
    };

    const promise = handler();
    ongoingPromises.add(promise);
    promise.finally(() => ongoingPromises.delete(promise));
  });

  client.on("interactionCreate", (interaction) => {
    if (!interaction.isChatInputCommand() || shuttingDown) return;

    const handler = async () => {
      try {
        await kickCommand.handle(interaction);
      } catch (error) {
        console.error(`🚨 Error handling interaction:`, error);
        if (interaction.isRepliable()) {
          await interaction.reply({
            content: "❌ An error occurred while processing your command.",
            ephemeral: true,
          });
        }
      }
    };

    const promise = handler();
    ongoingPromises.add(promise);
    promise.finally(() => ongoingPromises.delete(promise));
  });

  client.on("guildMemberAdd", (member) => {
    if (shuttingDown) return;

    const handler = async () => {
      try {
        logWithTimestamp(`🆕 New member joined: ${member.user.tag}`);
        // Assign active role to new/rejoining members
        await roleManager.assignRoleToUser(member.guild, member.id, "active");
        logWithTimestamp(`✅ Assigned active role to ${member.user.tag}`);
      } catch (error) {
        console.error(
          `🚨 Error handling new member ${member.user.tag}:`,
          error,
        );
      }
    };

    const promise = handler();
    ongoingPromises.add(promise);
    promise.finally(() => ongoingPromises.delete(promise));
  });

  // Handle process termination
  const shutdown = async (signal: string) => {
    logWithTimestamp(`🛑 Received ${signal}, shutting down gracefully...`);
    shuttingDown = true;
    await sweepService.stop();
    if (ongoingPromises.size > 0) {
      logWithTimestamp(
        `⏳ Waiting for ${ongoingPromises.size} ongoing operations to complete...`,
      );
      await Promise.allSettled(ongoingPromises);
      logWithTimestamp("✅ Ongoing operations completed");
    }
    await client.destroy();
    logWithTimestamp("✅ Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("uncaughtException", (error) => {
    console.error("🚨 Uncaught exception:", error);
    // Attempt graceful shutdown
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("🚨 Unhandled rejection:", reason);
  });

  // Login to Discord
  logWithTimestamp("🔑 Logging in to Discord...");
  await client.login(config.DISCORD_TOKEN);
  logWithTimestamp("✅ Successfully logged in to Discord");
}

/**
 * Sync guild members to the database on startup
 * @param syncTimeWindowMs Time window in milliseconds (0 = sync all members)
 */
async function syncGuildMembers(
  client: Client,
  repository: ActivityRepository,
  syncTimeWindowMs: number,
): Promise<void> {
  try {
    const guilds = await client.guilds.fetch();

    if (guilds.size === 0) {
      logWithTimestamp(
        "⚠️  Bot is not in any guilds. Please invite the bot to a Discord server to start tracking activity.",
      );
    }

    let totalMembers = 0;

    for (const guild of guilds.values()) {
      logWithTimestamp(
        `🔄 Syncing members for guild: ${guild.name} (${guild.id})`,
      );
      const fetchedGuild = await guild.fetch();
      const members = await fetchedGuild.members.fetch();

      let membersToProcess: Map<string, any>;

      if (syncTimeWindowMs === 0) {
        // Sync all members
        membersToProcess = members;
        logWithTimestamp(`📊 Syncing all ${members.size} members`);
      } else {
        // Filter to only members who joined within the time window
        const cutoffTime = Date.now() - syncTimeWindowMs;
        membersToProcess = members.filter(
          (member) =>
            member.joinedTimestamp && member.joinedTimestamp > cutoffTime,
        );
        const hours = Math.round(syncTimeWindowMs / (60 * 60 * 1000));
        logWithTimestamp(
          `📊 Found ${membersToProcess.size} members who joined in the last ${hours} hour${hours !== 1 ? "s" : ""}`,
        );
      }

      const memberIds = Array.from(membersToProcess.keys());
      totalMembers += memberIds.length;

      // Ensure members have roles
      const roleManager = new RoleManagerService(createConfig(), repository);
      for (const memberId of memberIds) {
        try {
          await roleManager.ensureUserHasRole(fetchedGuild, memberId);
        } catch (error) {
          console.error(
            `🚨 Error assigning role to member ${memberId} in guild ${guild.id}:`,
            error,
          );
        }
      }
    }
    const syncType = syncTimeWindowMs === 0 ? "all" : "recent";
    logWithTimestamp(
      `✅ Successfully synced ${totalMembers} ${syncType} guild members across ${guilds.size} guilds`,
    );
  } catch (error) {
    console.error("🚨 Error syncing guild members:", error);
    throw error; // Re-throw to trigger bot restart
  }
}

// Start the bot
main().catch((error) => {
  console.error("🚨 Fatal error starting bot:", error);
  process.exit(1);
});
