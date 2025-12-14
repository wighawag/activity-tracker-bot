import type { Config } from "../config";
import { PermissionFlagsBits } from "discord.js";
import type { Client, Guild, TextChannel, ThreadChannel } from "discord.js";

export class NotificationService {
  private config: Config;
  private client: Client;

  constructor(config: Config, client: Client) {
    this.config = config;
    this.client = client;
  }

  /**
   * Send notification when user becomes inactive
   */
  async sendInactiveNotification(
    guildId: string,
    userId: string,
  ): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId);
    const warningDays = this.config.INACTIVE_WARNING_MS / 86400000;
    const inactiveDays = this.config.INACTIVE_AFTER_MS / 86400000;

    const daysToDormant =
      (this.config.DORMANT_AFTER_MS - this.config.INACTIVE_AFTER_MS) / 86400000;
    let content: string;

    content = `📢 Hi again,

Your role has switched to “Inactive” (it’s been ${inactiveDays} days since your last message).
That just hides some channels; you’re still a member and everyone’s happy to see you back 🫶

To flip back to “Active” right now:
• type anything in any channel, or
• hit the “Keep Me Active” button below.

If you’d rather leave the server today, there’s a button for that too—no hard feelings either way.

Thanks for being part of ${guild.name}!`;

    const message = {
      content,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: `Keep Me Active in "${guild.name}"!`,
              custom_id: `activity_${guildId}_${userId}`,
            },
            {
              type: 2,
              style: 4,
              label: `Leave Server`,
              custom_id: `leave_${guildId}_${userId}`,
            },
          ],
        },
      ],
    };

    await this.sendNotification(guildId, userId, message);
  }

  /**
   * Send warning notification before becoming inactive
   */
  async sendWarningNotification(
    guildId: string,
    userId: string,
  ): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId);
    const warningDays = this.config.INACTIVE_WARNING_MS / 86400000;
    const inactiveDays = this.config.INACTIVE_AFTER_MS / 86400000;
    const daysToInactive =
      (this.config.INACTIVE_AFTER_MS - this.config.INACTIVE_WARNING_MS) /
      86400000;
    const dormantDays = this.config.DORMANT_AFTER_MS / 86400000;

    let content: string;
    if (this.config.ONLY_TRACK_EXISTING_USERS) {
      content = `Hey 👋

We’re dusting off "${guild.name}" server and would love to keep everyone who’s still interested 💬
You haven’t chatted in the last ${warningDays} days, so we’re giving you a quiet heads-up:

• If you post anything (or tap “Keep Me Active” below) in the next ${daysToInactive} days, you’ll stay just as you are.
• After ${inactiveDays} days total silence you’ll get an “Inactive” tag that hides some channels.
• After ${dormantDays} days total silence we’ll assume you’ve moved on and may free up your seat.

That’s it—no pressure, just wanted to make sure you saw the memo.
Hope to see you around!`;
    } else {
      content = `Hey 👋

We’re dusting off "${guild.name}" server and would love to keep everyone who’s still interested 💬
You haven’t chatted in the last ${warningDays} days, so we’re giving you a quiet heads-up:

• If you post anything (or tap “Keep Me Active” below) in the next ${daysToInactive} days, you’ll stay just as you are.
• After ${inactiveDays} days total silence you’ll get an “Inactive” tag that hides some channels.
• After ${dormantDays} days total silence we’ll assume you’ve moved on and may free up your seat.

That’s it—no pressure, just wanted to make sure you saw the memo.
Hope to see you around!`;
    }

    const message = {
      content,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: `Keep Me Active in "${guild.name}"!`,
              custom_id: `activity_${guildId}_${userId}`,
            },
          ],
        },
      ],
    };

    await this.sendNotification(guildId, userId, message);
  }

  /**
   * Send notification when user becomes dormant
   */
  async sendDormantNotification(
    guildId: string,
    userId: string,
  ): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId);
    const message = {
      content: `🚨 You have been marked as **Dormant** in **${guild.name}**.
You haven't sent any messages in the last ${this.config.DORMANT_AFTER_MS / 86400000} days.

To regain your **Active** status, simply send a message in any channel, click the "Keep Me Active" button below, or contact a moderator. If you prefer to leave the server immediately, click the "Leave Server" button.`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: `Keep Me Active in "${guild.name}"!`,
              custom_id: `activity_${guildId}_${userId}`,
            },
            {
              type: 2,
              style: 4,
              label: `Leave Server`,
              custom_id: `leave_${guildId}_${userId}`,
            },
          ],
        },
      ],
    };

    await this.sendNotification(guildId, userId, message);
  }

  /**
   * Send notification when user is being kicked
   */
  async sendKickNotification(guildId: string, userId: string): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId);
    const inviteLink = this.config.INVITE_LINK
      ? `\n\n🔗 **Rejoin here:** ${this.config.INVITE_LINK}`
      : "";
    const message = {
      content: `\n🚨 **IMPORTANT NOTICE**\n\nYou have been **kicked** from **${guild.name}**.\nYou were marked as dormant due to no activity for 30+ days.\n\nYou can rejoin the server at any time.\n${inviteLink}`,
    };

    await this.sendNotification(guildId, userId, message);
  }

  /**
   * Generic notification sender with fallback to channel
   */
  private async sendNotification(
    guildId: string,
    userId: string,
    message: {
      content: string;
      components?: Array<{
        type: number;
        components: Array<{ [key: string]: any }>;
      }>;
    },
  ): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch({ user: userId });

      if (member) {
        try {
          await member.send(message);
        } catch (dmError) {
          // Fallback to posting in the fallback channel if DMs fail
          if (this.config.FALLBACK_CHANNEL_ID) {
            try {
              const channel = await guild.channels.fetch(
                this.config.FALLBACK_CHANNEL_ID,
              );
              if (channel?.isTextBased()) {
                const textChannel = channel as TextChannel;
                await textChannel.send({
                  content: `<@${userId}> ${message.content}`,
                  components: message.components,
                });
              }
            } catch (channelError) {
              console.error(
                `Failed to send fallback notification for ${userId}:`,
                channelError,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to send notification to ${userId}:`, error);
    }
  }
}
