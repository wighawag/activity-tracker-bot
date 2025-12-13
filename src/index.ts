import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";
import {
  sweep,
  makeActivityButton,
  type SweepDeps,
  getDormantUsers,
} from "./sweep.js";
import { handleButtonInteraction } from "./button-handler.js";
import {
  handleKickDormantCommand,
  handleKickConfirmation,
} from "./admin-commands.js";

export { CONFIG, makeActivityButton };
export { refreshActivity };

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

client.login(CONFIG.DISCORD_TOKEN);

function refreshActivity(userId: string, guildId: string): void {
  db.upsertActivity(userId, guildId, Date.now());
}

/* ---------- message listener ---------- */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  const guild = msg.guild!;
  const member = msg.member!;

  // Find all three roles
  const activeRole = guild.roles.cache.find(
    (r) => r.name === CONFIG.ACTIVE_ROLE_NAME,
  );
  const inactiveRole = guild.roles.cache.find(
    (r) => r.name === CONFIG.INACTIVE_ROLE_NAME,
  );
  const dormantRole = guild.roles.cache.find(
    (r) => r.name === CONFIG.DORMANT_ROLE_NAME,
  );

  if (!activeRole) return;

  refreshActivity(msg.author.id, guild.id);

  // If user doesn't have any of the three roles, assign active role
  if (
    !member.roles.cache.has(activeRole.id) &&
    (!inactiveRole || !member.roles.cache.has(inactiveRole.id)) &&
    (!dormantRole || !member.roles.cache.has(dormantRole.id))
  ) {
    await member.roles.add(activeRole).catch(() => {});
  }
});

/* ---------- ready: fetch members + catch-up ---------- */
client.once("clientReady", async () => {
  console.log(`[+] Bot ready as ${client.user?.tag}`);
  console.log("[+] Fetching members...");
  for (const g of client.guilds.cache.values()) {
    try {
      await g.members.fetch();
    } catch {}
  }
  console.log(
    "[+] Members fetched – assigning roles to users without role status...",
  );
  await assignRolesToUsersWithoutStatus();
  console.log("[+] Role assignment complete – running catch-up sweep...");
  await runSweep();
  console.log("[+] Catch-up complete.");
});

/* ---------- assign roles to users without role status ---------- */
async function assignRolesToUsersWithoutStatus(): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      // Find all three roles
      const activeRole = guild.roles.cache.find(
        (r) => r.name === CONFIG.ACTIVE_ROLE_NAME,
      );
      const inactiveRole = guild.roles.cache.find(
        (r) => r.name === CONFIG.INACTIVE_ROLE_NAME,
      );
      const dormantRole = guild.roles.cache.find(
        (r) => r.name === CONFIG.DORMANT_ROLE_NAME,
      );

      if (!activeRole) continue;

      // Get all members in the guild
      const members = await guild.members.fetch();

      for (const member of members.values()) {
        if (member.user.bot) continue;

        // Check if user has any of the three roles
        const hasActive = activeRole && member.roles.cache.has(activeRole.id);
        const hasInactive =
          inactiveRole && member.roles.cache.has(inactiveRole?.id);
        const hasDormant =
          dormantRole && member.roles.cache.has(dormantRole?.id);

        // If user doesn't have any of the three roles, assign active role
        if (!hasActive && !hasInactive && !hasDormant) {
          try {
            await member.roles.add(activeRole);
            // Update database with user's activity status
            db.upsertActivity(member.id, guild.id, Date.now(), "active");
            console.log(
              `[+] Assigned active role to user ${member.user.tag} in guild ${guild.name}`,
            );
          } catch (error) {
            console.error(
              `[-] Failed to assign active role to user ${member.user.tag} in guild ${guild.name}:`,
              error,
            );
          }
        } else {
          // Ensure user has a database record with the correct role
          const dbUser = db.getUser(member.id);
          if (dbUser) {
            // Update role in database if it doesn't match Discord
            if (hasActive && dbUser.user_role !== "active") {
              db.updateUserRole(member.id, "active");
            } else if (hasInactive && dbUser.user_role !== "inactive") {
              db.updateUserRole(member.id, "inactive");
            } else if (hasDormant && dbUser.user_role !== "dormant") {
              db.updateUserRole(member.id, "dormant");
            }
          } else {
            // Create database record for user
            let role = "active";
            if (hasInactive) role = "inactive";
            if (hasDormant) role = "dormant";
            db.upsertActivity(member.id, guild.id, Date.now(), role);
          }
        }
      }
    } catch (error) {
      console.error(`[-] Error processing guild ${guild.name}:`, error);
    }
  }
}

/* ---------- sweep with real Discord deps ---------- */
async function runSweep(): Promise<void> {
  const deps: SweepDeps = {
    client,
    now: () => Date.now(),

    async sendWarning(userId, guildId, message) {
      const row = makeActivityButton();
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) return false;

      // try DM
      try {
        await user.send({ content: message, components: [row] });
        return true;
      } catch {}

      // fallback
      if (!CONFIG.FALLBACK_CHANNEL_ID) return false;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return false;
      const channel = guild.channels.cache.get(CONFIG.FALLBACK_CHANNEL_ID);
      if (!channel || !(channel instanceof TextChannel)) return false;

      try {
        await channel.send({
          content: `<@${userId}> ${message}`,
          components: [row],
        });
        return true;
      } catch {
        return false;
      }
    },

    async removeRole(guildId, userId) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return false;
      const member = guild.members.cache.get(userId);
      const role = guild.roles.cache.find(
        (r) => r.name === CONFIG.ACTIVE_ROLE_NAME,
      );
      if (!member || !role || !member.roles.cache.has(role.id)) return false;
      try {
        await member.roles.remove(role);
        return true;
      } catch {
        return false;
      }
    },
  };

  const stats = await sweep(deps);
  console.log("[sweep]", stats);
}

/* ---------- interaction handler ---------- */
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) {
    if (interaction.customId === "activity-register") {
      await handleButtonInteraction(interaction);
    } else if (
      interaction.customId === "confirm-kick-dormant" ||
      interaction.customId === "cancel-kick-dormant"
    ) {
      await handleKickConfirmation(interaction, client);
    }
  } else if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "kick-dormant") {
      await handleKickDormantCommand(interaction, client);
    }
  }
});

/* ---------- periodic sweep ---------- */
setInterval(runSweep, 60_000);
