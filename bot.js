/**
 * UEX Corp Discord Bot
 * Star Citizen trading data via the UEX API 2.0
 * https://uexcorp.space/api/documentation
 *
 * Setup:
 *   npm install discord.js dotenv node-fetch
 *   Copy .env.example -> .env and fill in your tokens
 *   node deploy-commands.js   (register slash commands once)
 *   node bot.js
 */

require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const commands = require("./commands");
const uex = require("./uex-api");

// ─── Client Setup ────────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", () => {
  console.log(`✅  Logged in as ${client.user.tag}`);
  client.user.setActivity("Star Citizen | /help", { type: 0 });
});

// ─── Interaction Handler ──────────────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply();

  try {
    switch (interaction.commandName) {
      case "commodity":
        await handleCommodity(interaction);
        break;
      case "price":
        await handlePrice(interaction);
        break;
      case "route":
        await handleRoute(interaction);
        break;
      case "ship":
        await handleShip(interaction);
        break;
      case "fuel":
        await handleFuel(interaction);
        break;
      case "terminal":
        await handleTerminal(interaction);
        break;
      case "gameversion":
        await handleGameVersion(interaction);
        break;
      case "help":
        await handleHelp(interaction);
        break;
      default:
        await interaction.editReply("❓ Unknown command.");
    }
  } catch (err) {
    console.error(err);
    await interaction.editReply({
      embeds: [errorEmbed("Something went wrong fetching UEX data. Try again later.")],
    });
  }
});

// ─── Command Handlers ─────────────────────────────────────────────────────────

/** /commodity <name> – Info + current status for a commodity */
async function handleCommodity(interaction) {
  const name = interaction.options.getString("name");
  const data = await uex.getCommodities(name);

  if (!data || data.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed(`No commodity found matching **${name}**`)] });
  }

  const c = data[0];
  const embed = new EmbedBuilder()
    .setColor(0x00d4ff)
    .setTitle(`📦 ${c.name}`)
    .setURL(`https://uexcorp.space/commodities/info/name/${encodeURIComponent(c.name_short || c.name)}`)
    .setDescription(c.wiki || "No description available.")
    .addFields(
      { name: "Code", value: c.code || "—", inline: true },
      { name: "Kind", value: c.kind || "—", inline: true },
      { name: "Trade", value: c.is_available ? "✅ Available" : "❌ Unavailable", inline: true },
      { name: "Avg Buy", value: c.price_buy ? `${uex.formatPrice(c.price_buy)} aUEC` : "—", inline: true },
      { name: "Avg Sell", value: c.price_sell ? `${uex.formatPrice(c.price_sell)} aUEC` : "—", inline: true },
      { name: "SCC", value: c.scu || "—", inline: true }
    )
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/** /price <commodity> – Live buy/sell prices across terminals */
async function handlePrice(interaction) {
  const name = interaction.options.getString("commodity");
  const type = interaction.options.getString("type") || "both";

  const prices = await uex.getCommodityPricesAll(name);

  if (!prices || prices.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed(`No prices found for **${name}**`)] });
  }

  // Filter & sort
  let list = prices;
  if (type === "buy") list = prices.filter((p) => p.price_buy > 0).sort((a, b) => a.price_buy - b.price_buy);
  if (type === "sell") list = prices.filter((p) => p.price_sell > 0).sort((a, b) => b.price_sell - a.price_sell);

  const top = list.slice(0, 10);

  const embed = new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle(`💰 Prices: ${name.toUpperCase()}`)
    .setURL(`https://uexcorp.space/commodities/info/name/${encodeURIComponent(name)}`)
    .setDescription(
      top
        .map((p, i) => {
          const buy = p.price_buy ? `🟢 Buy: **${uex.formatPrice(p.price_buy)}**` : "";
          const sell = p.price_sell ? `🔴 Sell: **${uex.formatPrice(p.price_sell)}**` : "";
          return `**${i + 1}.** ${p.terminal_name} (${p.star_system_name})\n${[buy, sell].filter(Boolean).join(" | ")}`;
        })
        .join("\n\n") || "No data."
    )
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/** /route <from> <to> – Best trade route between two locations */
async function handleRoute(interaction) {
  const from = interaction.options.getString("from");
  const to = interaction.options.getString("to");
  const scu = interaction.options.getInteger("scu") || 100;

  const routes = await uex.getRoutes({ from, to, scu });

  if (!routes || routes.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed(`No routes found between **${from}** and **${to}**.\nTry broader location names like a star system (e.g. *Stanton*) or orbit (e.g. *Crusader*).`)] });
  }

  const r = routes[0];
  // Correct field names per API docs:
  // origin_terminal_name, destination_terminal_name, profit (not profit_total)
  const profit = r.profit ? `${uex.formatPrice(r.profit)} aUEC` : "—";

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🚀 Best Route: ${from} → ${to}`)
    .setURL(`https://uexcorp.space/trade/route?code=${r.code || ""}`)
    .addFields(
      { name: "Commodity", value: r.commodity_name || "—", inline: true },
      { name: "Buy At", value: r.origin_terminal_name || from, inline: true },
      { name: "Sell At", value: r.destination_terminal_name || to, inline: true },
      { name: "Buy Price/SCU", value: r.price_origin ? `${uex.formatPrice(r.price_origin)} aUEC` : "—", inline: true },
      { name: "Sell Price/SCU", value: r.price_destination ? `${uex.formatPrice(r.price_destination)} aUEC` : "—", inline: true },
      { name: `Max Profit`, value: profit, inline: true },
      { name: "UEX Score", value: r.score ? String(r.score) : "—", inline: true },
      { name: "Distance", value: r.distance ? `${r.distance} GM` : "—", inline: true },
      { name: "Margin", value: r.price_margin ? `${r.price_margin}%` : "—", inline: true }
    )
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  // Show top 3 alternatives if available
  if (routes.length > 1) {
    const alts = routes
      .slice(1, 4)
      .map((alt, i) => `**${i + 2}.** ${alt.commodity_name} — ${uex.formatPrice(alt.profit || 0)} aUEC`)
      .join("\n");
    embed.addFields({ name: "Other options", value: alts });
  }

  await interaction.editReply({ embeds: [embed] });
}

/** /ship <name> – Ship stats and rental/purchase prices */
async function handleShip(interaction) {
  const name = interaction.options.getString("name");
  const vehicles = await uex.getVehicles(name);

  if (!vehicles || vehicles.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed(`No ship found matching **${name}**`)] });
  }

  const v = vehicles[0];
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`🛸 ${v.name}`)
    .setURL(`https://uexcorp.space/vehicles/info/name/${encodeURIComponent(v.name_short || v.name)}`)
    .addFields(
      { name: "Manufacturer", value: v.company_name || "—", inline: true },
      { name: "Role", value: v.role || "—", inline: true },
      { name: "Career", value: v.career || "—", inline: true },
      { name: "Size", value: v.size || "—", inline: true },
      { name: "Crew", value: v.crew ? `${v.crew_min || 1}–${v.crew}` : "—", inline: true },
      { name: "Cargo (SCU)", value: v.scu ? String(v.scu) : "—", inline: true },
      { name: "Mass (kg)", value: v.mass ? uex.formatPrice(v.mass) : "—", inline: true },
      { name: "HP", value: v.hp ? String(v.hp) : "—", inline: true },
      { name: "Pledge Price", value: v.price_pledge ? `$${v.price_pledge}` : "—", inline: true }
    )
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  if (v.url_store) embed.setThumbnail(v.url_store);

  await interaction.editReply({ embeds: [embed] });
}

/** /fuel <location> – Fuel prices at a location */
async function handleFuel(interaction) {
  const location = interaction.options.getString("location");
  const prices = await uex.getFuelPricesAll(location);

  if (!prices || prices.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed(`No fuel prices found for **${location}**`)] });
  }

  const top = prices.slice(0, 8);
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`⛽ Fuel Prices${location ? ` near ${location}` : ""}`)
    .setURL("https://uexcorp.space/commodities/fuel_prices")
    .setDescription(
      top
        .map((f) => `**${f.terminal_name}** (${f.orbit_name || f.star_system_name})\nHydrogen: **${f.price_hydrogen || "—"}** | Quantanium: **${f.price_quantanium || "—"}**`)
        .join("\n\n")
    )
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/** /terminal <name> – Terminal info */
async function handleTerminal(interaction) {
  const name = interaction.options.getString("name");
  const terminals = await uex.getTerminals(name);

  if (!terminals || terminals.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed(`No terminal found matching **${name}**`)] });
  }

  const t = terminals[0];
  const embed = new EmbedBuilder()
    .setColor(0x1abc9c)
    .setTitle(`🏪 ${t.name}`)
    .setURL("https://uexcorp.space/terminals")
    .addFields(
      { name: "Type", value: t.type || "—", inline: true },
      { name: "Star System", value: t.star_system_name || "—", inline: true },
      { name: "Orbit", value: t.orbit_name || "—", inline: true },
      { name: "Space Station", value: t.space_station_name || "—", inline: true },
      { name: "City", value: t.city_name || "—", inline: true },
      { name: "Faction", value: t.faction_name || "—", inline: true },
      { name: "Commodities", value: t.is_commodity ? "✅" : "❌", inline: true },
      { name: "Items", value: t.is_item ? "✅" : "❌", inline: true },
      { name: "Vehicles", value: t.is_vehicle ? "✅" : "❌", inline: true }
    )
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/** /gameversion – Current Star Citizen patch info */
async function handleGameVersion(interaction) {
  // API returns { live: "4.7.1", ptu: "" } — a plain object, not an array
  const v = await uex.getGameVersions();
  if (!v || (!v.live && !v.ptu)) {
    return interaction.editReply({ embeds: [errorEmbed("Could not fetch game version data.")] });
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("🎮 Current Star Citizen Version")
    .setURL("https://uexcorp.space")
    .addFields(
      { name: "LIVE", value: v.live || "—", inline: true },
      { name: "PTU", value: v.ptu || "None", inline: true }
    )
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/** /help – Command list */
async function handleHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x00d4ff)
    .setTitle("🛸 UEX Discord Bot — Commands")
    .setURL("https://uexcorp.space/api/documentation")
    .setDescription("Star Citizen trading data powered by the [UEX Corp API](https://uexcorp.space).")
    .addFields(
      { name: "/commodity `<name>`", value: "Info about a tradeable commodity." },
      { name: "/price `<commodity>` `[type]`", value: "Buy/sell prices across terminals." },
      { name: "/route `<from>` `<to>` `[scu]`", value: "Best trade route between two locations." },
      { name: "/ship `<name>`", value: "Ship stats, cargo capacity, and crew info." },
      { name: "/fuel `[location]`", value: "Hydrogen & Quantanium fuel prices." },
      { name: "/terminal `<name>`", value: "Terminal details and available services." },
      { name: "/gameversion", value: "Current Star Citizen LIVE / PTU patch." }
    )
    .setFooter({ text: "Data from uexcorp.space • community-driven", iconURL: "https://uexcorp.space/favicon.ico" });

  await interaction.editReply({ embeds: [embed] });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorEmbed(msg) {
  return new EmbedBuilder().setColor(0xff4444).setTitle("❌ Error").setDescription(msg);
}

// ─── Login ───────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);
