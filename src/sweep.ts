import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  TextChannel,
} from "discord.js";
import { getDb } from "./db.js";
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
  now: () => number;
}

export async function sweep(deps: SweepDeps): Promise<{
  roleWarnings: number;
  roleRemovals: number;
}> {
  const now = deps.now();
  const stats = {
    roleWarnings: 0,
    roleRemovals: 0,
    kickWarnings: 0,
    kicks: 0,
  };

  /* ======== INACTIVE WARNINGS ======== */
  // For users who are active but approaching inactive threshold
  const expireInactive = now - CONFIG.INACTIVE_AFTER_MS;
  const toWarnInactive = db.getUsersToWarnRole(expireInactive);

  for (const { user_id, guild_id } of toWarnInactive) {
    const guild = deps.client.guilds.cache.get(guild_id);
    if (!guild) continue;

    const sent = await deps.sendWarning(
      user_id,
      guild_id,
      `⚠️ You will lose the **${CONFIG.ACTIVE_ROLE_NAME}** role in **${guild.name}** soon due to inactivity. Click the button below to stay active!`,
    );
    if (sent) {
      db.markWarned(now, "role", user_id);
      stats.roleWarnings++;
    }
  }

  /* ======== ROLE TRANSITION (active → inactive) ======== */
  const toTransition = db.getUsersToStrip(
    expireInactive,
    now - CONFIG.WARN_GRACE_MS,
  );

  for (const { user_id, guild_id } of toTransition) {
    const guild = deps.client.guilds.cache.get(guild_id);
    if (!guild) continue;

    const removed = await deps.removeRole(guild_id, user_id);
    if (removed) {
      db.updateUserRole(user_id, "inactive");
      stats.roleRemovals++;

      await deps.sendWarning(
        user_id,
        guild_id,
        `Hey! You've been moved to the **${CONFIG.INACTIVE_ROLE_NAME}** role in **${guild.name}** due to inactivity. Chat again or click the button to get your **${CONFIG.ACTIVE_ROLE_NAME}** role back!`,
      );
    }
  }

  return stats;
}

// New function to get dormant users for manual kicking
export function getDormantUsers(): { user_id: string; guild_id: string }[] {
  const stmt = getDb().prepare(`
    SELECT user_id, guild_id FROM user_activity
    WHERE user_role = 'dormant'
  `);
  return stmt.all() as { user_id: string; guild_id: string }[];
}
