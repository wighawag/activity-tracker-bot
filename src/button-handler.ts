import type { ButtonInteraction, GuildMember } from "discord.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";

export async function handleButtonInteraction(inter: ButtonInteraction) {
  if (inter.customId !== "activity-register") return;

  let guildId: string | null = null;
  let member: GuildMember | null = null;

  if (inter.inGuild()) {
    guildId = inter.guildId;
    member = inter.member as GuildMember;
  } else {
    // pressed in DM → find a mutual guild
    for (const g of inter.client.guilds.cache.values()) {
      const m = g.members.cache.get(inter.user.id);
      if (m) {
        guildId = g.id;
        member = m;
        break;
      }
    }
  }

  if (!guildId || !member) {
    return inter.reply({
      content: "❌ Could not find you in any server.",
      ephemeral: true,
    });
  }

  db.upsertActivity(inter.user.id, guildId, Date.now(), "active");

  // Find all three roles
  const activeRole = member.guild.roles.cache.find(
    (r) => r.name === CONFIG.ACTIVE_ROLE_NAME,
  );
  const inactiveRole = member.guild.roles.cache.find(
    (r) => r.name === CONFIG.INACTIVE_ROLE_NAME,
  );
  const dormantRole = member.guild.roles.cache.find(
    (r) => r.name === CONFIG.DORMANT_ROLE_NAME,
  );

  // Remove inactive and dormant roles, add active role
  if (activeRole && !member.roles.cache.has(activeRole.id)) {
    await member.roles.add(activeRole).catch(() => {});
  }
  if (inactiveRole && member.roles.cache.has(inactiveRole.id)) {
    await member.roles.remove(inactiveRole).catch(() => {});
  }
  if (dormantRole && member.roles.cache.has(dormantRole.id)) {
    await member.roles.remove(dormantRole).catch(() => {});
  }

  return inter.reply({
    content: "✅ Activity registered! Your timers have been reset.",
    ephemeral: true,
  });
}
