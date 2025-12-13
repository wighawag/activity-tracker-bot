#!/usr/bin/env bun
import { createConfig } from "./config";
import { registerCommands } from "./commands/register";

// Register commands without starting the full bot
async function main() {
  try {
    const config = createConfig();
    console.log("📋 Registering slash commands...");
    await registerCommands(config);
    console.log("✅ Slash commands registered successfully");
    process.exit(0);
  } catch (error) {
    console.error("🚨 Error registering commands:", error);
    process.exit(1);
  }
}

main();
