/**
 * deploy-commands.js
 * Run this ONCE to register slash commands with Discord:
 *   node deploy-commands.js
 *
 * To register globally (all servers, 1hr propagation):
 *   Set GUILD_ID="" in .env and use Routes.applicationCommands
 *
 * To register to a single guild (instant, for testing):
 *   Set GUILD_ID=your_server_id in .env
 */

require("dotenv").config();
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const commands = require("./commands");

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`📡 Registering ${commands.length} slash commands...`);

    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    await rest.put(route, { body: commands });

    const scope = process.env.GUILD_ID ? `guild ${process.env.GUILD_ID}` : "global (all guilds)";
    console.log(`✅ Commands registered ${scope}`);
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
    process.exit(1);
  }
})();
