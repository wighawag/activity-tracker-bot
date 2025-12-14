import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import type { Config } from "../config";
import type { Client } from "discord.js";
import type { ActivityRepository } from "../types";
import { RoleManagerService } from "../services/roles";
import { NotificationService } from "../services/notifications";

export class KickCommand {
  private config: Config;
  private client: Client;
  private repository: ActivityRepository;
  private roleManager: RoleManagerService;
  private notificationService: NotificationService;

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

  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName !== "kick-dormant") return;

    const confirm = interaction.options.getBoolean("confirm", true);

    if (!confirm) {
      await interaction.reply({
        content: "❌ You must confirm the action to kick dormant users.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply(
          "❌ This command can only be used in a server.",
        );
        return;
      }

      // Get all dormant users
      const dormantUsers = await this.repository.getDormantUsers(guild.id);

      if (dormantUsers.length === 0) {
        await interaction.editReply("✅ No dormant users found to kick.");
        return;
      }

      // Kick each dormant user
      let kickedCount = 0;
      for (const user of dormantUsers) {
        try {
          const member = await guild.members.fetch(user.user_id);

          // Skip bots
          if (member.user.bot) {
            console.log(`Skipping bot user ${user.user_id}`);
            continue;
          }

          // Skip users with admin permissions
          if (member.permissions.has("Administrator")) {
            console.log(`Skipping admin user ${user.user_id}`);
            continue;
          }

          // Send DM notification before kicking
          try {
            await this.notificationService.sendKickNotification(
              guild.id,
              user.user_id,
            );
          } catch (notificationError) {
            console.error(
              `Failed to send kick notification to ${user.user_id}:`,
              notificationError,
            );
            // Continue with kick even if notification fails
          }

          await member.kick("Dormant user (no activity for 30+ days)");
          kickedCount++;
        } catch (error) {
          console.error(`Failed to kick user ${user.user_id}:`, error);
        }
      }

      await interaction.editReply(
        `✅ Successfully kicked ${kickedCount} dormant users.`,
      );
    } catch (error) {
      console.error("Error handling kick command:", error);
      await interaction.editReply(
        "❌ An error occurred while processing the kick command.",
      );
    }
  }
}
