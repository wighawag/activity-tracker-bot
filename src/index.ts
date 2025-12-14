import { Client, GatewayIntentBits, Partials } from "discord.js";
import { createConfig } from "./config";
import { SQLiteActivityRepository } from "./db/repository";
import { RoleManagerService } from "./services/roles";
import { NotificationService } from "./services/notifications";
import { SweepService } from "./services/sweep";
import { KickCommand } from "./commands/kick";
import { registerCommands } from "./commands/register";

// Add logging utility
function logWithTimestamp(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function main() {
  // Load configuration
  const config = createConfig();

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
      await syncGuildMembers(client, repository);
      logWithTimestamp("✅ Guild members synced successfully");
    } catch (error) {
      console.error("🚨 Error during bot initialization:", error);
      process.exit(1);
    }
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    try {
      if (message.guild) {
        // Update user activity
        await sweepService.handleUserActivity(
          message.guild.id,
          message.author.id,
        );

        // Ensure user has a role
        await roleManager.ensureUserHasRole(message.guild, message.author.id);
      }
    } catch (error) {
      console.error(
        `🚨 Error handling message from ${message.author.tag}:`,
        error,
      );
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
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
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      logWithTimestamp(`🆕 New member joined: ${member.user.tag}`);
      // Ensure new members get the active role
      await roleManager.ensureUserHasRole(member.guild, member.id);
      logWithTimestamp(`✅ Assigned active role to ${member.user.tag}`);
    } catch (error) {
      console.error(`🚨 Error handling new member ${member.user.tag}:`, error);
    }
  });

  // Handle process termination
  const shutdown = async (signal: string) => {
    logWithTimestamp(`🛑 Received ${signal}, shutting down gracefully...`);
    await sweepService.stop();
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
 * Sync all guild members to the database on startup
 */
async function syncGuildMembers(
  client: Client,
  repository: SQLiteActivityRepository,
): Promise<void> {
  try {
    const guilds = await client.guilds.fetch();
    let totalMembers = 0;

    for (const guild of guilds.values()) {
      logWithTimestamp(
        `🔄 Syncing members for guild: ${guild.name} (${guild.id})`,
      );
      const fetchedGuild = await guild.fetch();
      const members = await fetchedGuild.members.fetch();
      const memberIds = Array.from(members.keys());
      totalMembers += memberIds.length;

      await repository.syncGuildMembers(guild.id, memberIds);

      // Ensure all members have roles
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
    logWithTimestamp(
      `✅ Successfully synced ${totalMembers} guild members across ${guilds.size} guilds`,
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
