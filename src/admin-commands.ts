import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ButtonInteraction,
  Client,
  GuildMember,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";
import { getDormantUsers } from "./sweep.js";

export async function handleKickDormantCommand(
  interaction: ChatInputCommandInteraction,
  client: Client,
): Promise<void> {
  // Check if user has admin permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "❌ You need administrator permissions to use this command.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  // Get dormant users
  const dormantUsers = getDormantUsers();
  const guildDormantUsers = dormantUsers.filter(
    (user) => user.guild_id === interaction.guild!.id,
  );

  if (guildDormantUsers.length === 0) {
    await interaction.reply({
      content: "✅ No dormant users found in this server.",
      ephemeral: true,
    });
    return;
  }

  // Create confirmation buttons
  const confirmButton = new ButtonBuilder()
    .setCustomId("confirm-kick-dormant")
    .setLabel("Confirm Kick")
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId("cancel-kick-dormant")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
    cancelButton,
  );

  // Show confirmation message with user count
  await interaction.reply({
    content: `⚠️ Are you sure you want to kick ${guildDormantUsers.length} dormant user(s)? This action cannot be undone.`,
    components: [row],
    ephemeral: true,
  });
}

export async function handleKickConfirmation(
  interaction: ButtonInteraction,
  client: Client,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "❌ This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === "confirm-kick-dormant") {
    await handleConfirmKick(interaction, client);
  } else if (interaction.customId === "cancel-kick-dormant") {
    await handleCancelKick(interaction);
  }
}

async function handleConfirmKick(
  interaction: ButtonInteraction,
  client: Client,
): Promise<void> {
  if (!interaction.guild) return;

  // Get dormant users for this guild
  const dormantUsers = getDormantUsers();
  const guildDormantUsers = dormantUsers.filter(
    (user) => user.guild_id === interaction.guild!.id,
  );

  if (guildDormantUsers.length === 0) {
    await interaction.update({
      content: "✅ No dormant users found in this server.",
      components: [],
    });
    return;
  }

  // Kick each dormant user
  let kickedCount = 0;
  let failedCount = 0;
  const kickResults = [];

  for (const user of guildDormantUsers) {
    try {
      const member = await interaction.guild.members
        .fetch(user.user_id)
        .catch(() => null);
      if (member) {
        await member.kick("Dormant user (manual kick by admin)");
        db.deleteUser(user.user_id);
        kickedCount++;
        kickResults.push(`✅ <@${user.user_id}> - Successfully kicked`);
      } else {
        failedCount++;
        kickResults.push(`❌ <@${user.user_id}> - Member not found`);
      }
    } catch (error) {
      failedCount++;
      kickResults.push(
        `❌ <@${user.user_id}> - Failed to kick: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Create result message
  const resultMessage = [
    `📊 **Kick Results**`,
    `**Total users processed:** ${guildDormantUsers.length}`,
    `**Successfully kicked:** ${kickedCount}`,
    `**Failed to kick:** ${failedCount}`,
    ``,
    ...kickResults.slice(0, 10), // Show first 10 results
  ];

  if (kickResults.length > 10) {
    resultMessage.push(`... and ${kickResults.length - 10} more`);
  }

  await interaction.update({
    content: resultMessage.join("\n"),
    components: [],
  });
}

async function handleCancelKick(interaction: ButtonInteraction): Promise<void> {
  await interaction.update({
    content: "✅ Kick operation cancelled.",
    components: [],
  });
}
