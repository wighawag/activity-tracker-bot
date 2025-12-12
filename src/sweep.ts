import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  TextChannel,
} from "discord.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";

export function makeActivityButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("activity-register")
      .setLabel("I'm still here!")
      .setEmoji("👀")
      .setStyle(ButtonStyle.Success),
  );
}

export interface SendWarningDeps {
  client: Client;
  sendDm: (userId: string, message: string, row: any) => Promise<boolean>;
  sendChannel: (
    channelId: string,
    userId: string,
    message: string,
    row: any,
  ) => Promise<boolean>;
}

export async function sendWarning(
  deps: SendWarningDeps,
  userId: string,
  guildId: string,
  message: string,
): Promise<boolean> {
  const row = makeActivityButton();

  // try DM first
  const dmSent = await deps.sendDm(userId, message, row);
  if (dmSent) return true;

  // fallback to channel
  if (!CONFIG.FALLBACK_CHANNEL_ID) return false;
  return deps.sendChannel(CONFIG.FALLBACK_CHANNEL_ID, userId, message, row);
}

export interface SweepDeps {
  client: Client;
  sendWarning: (
    userId: string,
    guildId: string,
    message: string,
  ) => Promise<boolean>;
  removeRole: (guildId: string, userId: string) => Promise<boolean>;
  kickMember: (guildId: string, userId: string) => Promise<boolean>;
  sendFarewell: (userId: string, message: string) => Promise<boolean>;
  now: () => number;
}

export async function sweep(deps: SweepDeps): Promise<{
  roleWarnings: number;
  roleRemovals: number;
  kickWarnings: number;
  kicks: number;
}> {
  const now = deps.now();
  const stats = {
    roleWarnings: 0,
    roleRemovals: 0,
    kickWarnings: 0,
    kicks: 0,
  };

  /* ======== ROLE WARNINGS ======== */
  const expireRole = now - CONFIG.INACTIVE_AFTER_MS;
  const toWarnRole = db.getUsersToWarnRole(expireRole);

  for (const { user_id, guild_id } of toWarnRole) {
    const guild = deps.client.guilds.cache.get(guild_id);
    if (!guild) continue;

    const sent = await deps.sendWarning(
      user_id,
      guild_id,
      `⚠️ You will lose the **${CONFIG.ACTIVE_ROLE_NAME}** role in **${guild.name}** soon due to inactivity. Click the button below to stay active!`,
    );
    if (sent) {
      // Only mark as role warned if they don't have a kick warning
      const user = db.getUser(user_id);
      if (!user || user.warn_type !== "kick") {
        db.markWarned(now, "role", user_id);
      }
      stats.roleWarnings++;
    }
  }

  /* ======== ROLE REMOVAL ======== */
  const toStrip = db.getUsersToStrip(expireRole, now - CONFIG.WARN_GRACE_MS);

  for (const { user_id, guild_id } of toStrip) {
    const guild = deps.client.guilds.cache.get(guild_id);
    if (!guild) continue;

    const removed = await deps.removeRole(guild_id, user_id);
    if (removed) {
      db.markRoleRemoved(user_id);
      stats.roleRemovals++;

      await deps.sendWarning(
        user_id,
        guild_id,
        `Hey! You lost the **${CONFIG.ACTIVE_ROLE_NAME}** role in **${guild.name}** due to inactivity. Chat again or click the button to get it back!`,
      );
    }
  }

  /* ======== KICK WARNINGS ======== */
  const expireKick = now - CONFIG.KICK_AFTER_MS;
  const toWarnKick = db.getUsersToWarnKick(expireKick);

  for (const { user_id, guild_id } of toWarnKick) {
    const guild = deps.client.guilds.cache.get(guild_id);
    if (!guild) continue;

    const sent = await deps.sendWarning(
      user_id,
      guild_id,
      `⚠️ You will be **removed** from **${guild.name}** soon for prolonged inactivity. Click the button below to stay!`,
    );
    if (sent) {
      db.markWarned(now, "kick", user_id);
      stats.kickWarnings++;
    }
  }

  /* ======== KICK ======== */
  const toKick = db.getUsersToKick(expireKick, now - CONFIG.WARN_GRACE_MS);

  for (const { user_id, guild_id } of toKick) {
    const guild = deps.client.guilds.cache.get(guild_id);
    if (!guild) continue;

    await deps.sendFarewell(
      user_id,
      `You've been removed from **${guild.name}** for prolonged inactivity, but you're always welcome back whenever you feel like chatting again!`,
    );

    const kicked = await deps.kickMember(guild_id, user_id);
    if (kicked) {
      db.deleteUser(user_id);
      stats.kicks++;
    }
  }

  return stats;
}
