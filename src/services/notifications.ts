import type { Config } from "../config";
import type { Client, Guild, TextChannel } from "discord.js";

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
    const message = {
      content: `📢 You have been marked as **Inactive** in this server.
You haven't sent any messages in the last ${this.config.INACTIVE_AFTER_MS / 86400000} days.

To regain your **Active** status, simply send a message in any channel or click the button below!`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: "I'm Active!",
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
    const message = {
      content: `🚨 You have been marked as **Dormant** in this server.
You haven't sent any messages in the last ${this.config.DORMANT_AFTER_MS / 86400000} days.

To regain your **Active** status, simply send a message in any channel or contact a moderator.`,
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
                await (channel as TextChannel).send({
                  content: `📢 Notification for <@${userId}>:\n${message.content}`,
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
