/**
 * commands.js — Slash command definitions
 * Used by both deploy-commands.js and bot.js
 */

const { SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("commodity")
    .setDescription("Get info about a Star Citizen commodity")
    .addStringOption((o) =>
      o.setName("name").setDescription("Commodity name (e.g. Laranite, Agricium)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("price")
    .setDescription("Live buy/sell prices for a commodity across all terminals")
    .addStringOption((o) =>
      o.setName("commodity").setDescription("Commodity name or code (e.g. Gold, GOLD)").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("type")
        .setDescription("Filter by buy or sell prices (default: both)")
        .setRequired(false)
        .addChoices(
          { name: "Buy (cheapest first)", value: "buy" },
          { name: "Sell (most expensive first)", value: "sell" },
          { name: "Both", value: "both" }
        )
    ),

  new SlashCommandBuilder()
    .setName("route")
    .setDescription("Find the best trade route between two locations")
    .addStringOption((o) =>
      o.setName("from").setDescription("Origin location / system (e.g. Stanton, Port Olisar)").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("to")
        .setDescription("Destination location / system (e.g. Pyro, Baijini Point)")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("scu").setDescription("Cargo capacity in SCU (default: 100)").setRequired(false).setMinValue(1).setMaxValue(99999)
    ),

  new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Look up a Star Citizen ship / vehicle")
    .addStringOption((o) =>
      o.setName("name").setDescription("Ship name or manufacturer (e.g. Cutlass, MISC, Carrack)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("fuel")
    .setDescription("Check hydrogen & quantanium fuel prices")
    .addStringOption((o) =>
      o
        .setName("location")
        .setDescription("Filter by location / system (e.g. Stanton, Crusader)")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("terminal")
    .setDescription("Get details about a trade / item / vehicle terminal")
    .addStringOption((o) =>
      o.setName("name").setDescription("Terminal or location name (e.g. Baijini Point, TDD)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("gameversion")
    .setDescription("Show the current Star Citizen LIVE and PTU patch versions"),

  new SlashCommandBuilder().setName("help").setDescription("List all UEX bot commands"),

  new SlashCommandBuilder()
    .setName("pirate")
    .setDescription("Show high-traffic trade routes where you're most likely to encounter other players")
    .addStringOption((o) =>
      o.setName("system").setDescription("Filter by star system (e.g. Stanton, Pyro)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("looproutes")
    .setDescription("Find back-to-back trade routes with no dead legs and high total profit")
    .addStringOption((o) =>
      o.setName("from").setDescription("Origin station or terminal (e.g. Baijini Point, Port Tressler)").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("scu").setDescription("Cargo capacity in SCU (default: 100)").setRequired(false).setMinValue(1).setMaxValue(99999)
    ),
];

module.exports = commands.map((c) => c.toJSON());
