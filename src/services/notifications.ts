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
    const daysToDormant =
      (this.config.DORMANT_AFTER_MS - this.config.INACTIVE_AFTER_MS) / 86400000;
    let content: string;

    if (this.config.ONLY_TRACK_EXISTING_USERS) {
      content = `📢 You have been marked as **Inactive** in **${guild.name}**.

**Note:** The Inactive role may restrict access to some channels.

To regain your **Active** status, simply send a message in any channel or click the "Keep Me Active" button below. If you prefer to leave the server immediately, click the "Leave Server" button.`;
    } else {
      content = `📢 You have been marked as **Inactive** in **${guild.name}**.
You haven't sent any messages in the last ${this.config.INACTIVE_AFTER_MS / 86400000} days.

After ${daysToDormant} more days (${this.config.DORMANT_AFTER_MS / 86400000} days total), you will be considered **Dormant** and eligible for server removal unless you perform some activity (including clicking the "Keep Me Active" button below).

**Note:** The Inactive role may restrict access to some channels.

To regain your **Active** status, simply send a message in any channel or click the "Keep Me Active" button below. If you prefer to leave the server immediately, click the "Leave Server" button.`;
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
    const daysToInactive =
      (this.config.INACTIVE_AFTER_MS - this.config.INACTIVE_WARNING_MS) /
      86400000;
    const daysToDormant = this.config.DORMANT_AFTER_MS / 86400000;

    let content: string;
    if (this.config.ONLY_TRACK_EXISTING_USERS) {
      content = `⚠️ **Inactivity Warning** in **${guild.name}**.

This is a warning for old users as we are re-activating our community and want to make sure we have all interested members.

You haven't sent any messages in the last ${(this.config.INACTIVE_WARNING_MS / 86400000).toFixed(1)} days.

In ${daysToInactive.toFixed(1)} more days (${(this.config.INACTIVE_AFTER_MS / 86400000).toFixed(1)} days total), you will be marked as **Inactive**, which will disable access to some channels.

After becoming **Dormant** (${daysToDormant.toFixed(1)} days total), you will be eligible for server removal.

To remain **Active**, simply send a message in any channel or click the "Keep Me Active" button below.`;
    } else {
      content = `⚠️ **Inactivity Warning** in **${guild.name}**.

You haven't sent any messages in the last ${(this.config.INACTIVE_WARNING_MS / 86400000).toFixed(1)} days.

In ${daysToInactive.toFixed(1)} more days (${(this.config.INACTIVE_AFTER_MS / 86400000).toFixed(1)} days total), you will be marked as **Inactive**, which will disable access to some channels.

After becoming **Dormant** (${daysToDormant.toFixed(1)} days total), you will be eligible for server removal.

To remain **Active**, simply send a message in any channel or click the "Keep Me Active" button below.`;
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
