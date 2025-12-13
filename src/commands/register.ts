import { REST, Routes, SlashCommandBuilder } from "discord.js";
import type { Config } from "../config";

export async function registerCommands(config: Config): Promise<void> {
  const commands = [
    new SlashCommandBuilder()
      .setName("kick-dormant")
      .setDescription("Kick dormant users from the server")
      .addBooleanOption((option) =>
        option
          .setName("confirm")
          .setDescription("Confirm you want to kick dormant users")
          .setRequired(true),
      )
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(config.APP_ID), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error refreshing commands:", error);
  }
}
