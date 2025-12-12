import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { ButtonInteraction, GuildMember } from "discord.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class RegisterButton extends InteractionHandler {
  public override parse(inter: ButtonInteraction) {
    return inter.customId === "activity-register" ? this.some() : this.none();
  }

  public async run(inter: ButtonInteraction) {
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

    db.upsertActivity(inter.user.id, guildId, Date.now());

    const role = member.guild.roles.cache.find(
      (r) => r.name === CONFIG.ACTIVE_ROLE_NAME,
    );
    if (role && !member.roles.cache.has(role.id)) {
      await member.roles.add(role).catch(() => {});
    }

    return inter.reply({
      content: "✅ Activity registered! Your timers have been reset.",
      ephemeral: true,
    });
  }
}
