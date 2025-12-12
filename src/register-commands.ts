import "dotenv/config";
import { REST, Routes, ApplicationCommandType } from "discord.js";

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

const cmds = [
  {
    name: "send-panel",
    description: "Drop the activity button panel in this channel",
    type: ApplicationCommandType.ChatInput,
  },
];

(async () => {
  const appId = process.env.APP_ID!;
  await rest.put(Routes.applicationCommands(appId), { body: cmds });
  console.log("✅ Slash commands registered globally.");
})();
