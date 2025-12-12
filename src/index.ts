import "reflect-metadata";
import { SapphireClient } from "@sapphire/framework";
import { GatewayIntentBits, TextChannel } from "discord.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";
import { sweep, makeActivityButton, type SweepDeps } from "./sweep.js";
import "./button-handler.js";
import "./cmd-send-panel.js";

export { CONFIG, makeActivityButton };
export { refreshActivity };

const client = new SapphireClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  loadMessageCommandListeners: true,
  auth: CONFIG.DISCORD_TOKEN,
});

function refreshActivity(userId: string, guildId: string): void {
  db.upsertActivity(userId, guildId, Date.now());
}

/* ---------- message listener ---------- */
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  const guild = msg.guild!;
  const member = msg.member!;
  const role = guild.roles.cache.find(
    (r) => r.name === CONFIG.ACTIVE_ROLE_NAME,
  );
  if (!role) return;

  refreshActivity(msg.author.id, guild.id);
  if (!member.roles.cache.has(role.id)) {
    await member.roles.add(role).catch(() => {});
  }
});

/* ---------- ready: fetch members + catch-up ---------- */
client.once("ready", async () => {
  console.log(`[+] Bot ready as ${client.user?.tag}`);
  console.log("[+] Fetching members...");
  for (const g of client.guilds.cache.values()) {
    try {
      await g.members.fetch();
    } catch {}
  }
  console.log("[+] Members fetched – running catch-up sweep...");
  await runSweep();
  console.log("[+] Catch-up complete.");
});

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

    async kickMember(guildId, userId) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return false;
      const member = guild.members.cache.get(userId);
      if (!member) return false;
      try {
        await member.kick("Prolonged inactivity");
        return true;
      } catch {
        return false;
      }
    },

    async sendFarewell(userId, message) {
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) return false;
      try {
        await user.send(message);
        return true;
      } catch {
        return false;
      }
    },
  };

  const stats = await sweep(deps);
  console.log("[sweep]", stats);
}

/* ---------- periodic sweep ---------- */
setInterval(runSweep, 60_000);
client.login();
