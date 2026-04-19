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
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, REST, Routes } = require("discord.js");
const uex = require("./uex-api");
const commands = require("./commands");

// ─── Auto-deploy slash commands ───────────────────────────────────────────────

async function deployCommands() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    console.warn("⚠️  Skipping command deploy — DISCORD_TOKEN or CLIENT_ID missing.");
    return;
  }
  try {
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
    const route = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID);
    await rest.put(route, { body: commands });
    const scope = GUILD_ID ? `guild ${GUILD_ID}` : "global";
    console.log(`📡  Slash commands registered (${scope})`);
  } catch (err) {
    console.error("❌  Failed to register commands:", err.message);
  }
}

// ─── Client Setup ────────────────────────────────────────────────────────────

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("ready", async () => {
  console.log(`✅  Logged in as ${client.user.tag}`);
  client.user.setActivity("Star Citizen | /help", { type: ActivityType.Playing });
  await deployCommands();
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
      case "pirate":
        await handlePirate(interaction);
        break;
      case "looproutes":
        await handleLoopRoutes(interaction);
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
    .setDescription(c.wiki ? `[View on Star Citizen Wiki](${c.wiki})` : "No description available.")
    .addFields(
      { name: "Code", value: c.code || "—", inline: true },
      { name: "Kind", value: c.kind || "—", inline: true },
      { name: "Trade", value: c.is_available ? "✅ Available" : "❌ Unavailable", inline: true },
      { name: "Avg Buy", value: c.price_buy ? `${uex.formatPrice(c.price_buy)} aUEC` : "—", inline: true },
      { name: "Avg Sell", value: c.price_sell ? `${uex.formatPrice(c.price_sell)} aUEC` : "—", inline: true },
      { name: "SCU", value: c.scu != null ? String(c.scu) : "—", inline: true }
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

  // Pick best terminal — exclude Admin terminals, prefer commodity type
  const pickBest = (list) => {
    if (!list || list.length === 0) return null;
    const nonAdmin = list.filter(t => !t.name.startsWith("Admin -"));
    const pool = nonAdmin.length > 0 ? nonAdmin : list; // fall back to all if only admins exist
    return (
      pool.find(t => t.type === "commodity" && t.is_available === 1) ||
      pool.find(t => t.type === "commodity") ||
      pool.find(t => t.is_available === 1) ||
      pool[0]
    );
  };

  // Step 1: Resolve origin
  const originTerminals = await uex.getTerminals(from);
  console.log(`[ROUTE] "${from}" → ${originTerminals?.length ?? 0} results`);
  originTerminals?.forEach(t => console.log(`  id=${t.id} name="${t.name}" type="${t.type}" available=${t.is_available}`));

  const originTerminal = pickBest(originTerminals);
  if (!originTerminal) {
    return interaction.editReply({
      embeds: [errorEmbed(
        `No terminal found matching **${from}**.\n` +
        `Try an exact name like *Baijini Point*, *Port Tressler*, or *TDD New Babbage*.`
      )],
    });
  }
  console.log(`[ROUTE] Using origin: id=${originTerminal.id} "${originTerminal.name}" type=${originTerminal.type}`);

  // Step 2: Resolve destination (optional)
  // If destination matches a specific terminal (few results), pass its ID
  // If it matches many terminals (star system / orbit name), filter results client-side
  let destTerminal = null;
  let filter_dest_system = null;

  if (to) {
    const destTerminals = await uex.getTerminals(to);
    const nonAdminDest = destTerminals?.filter(t => !t.name.startsWith("Admin -")) || [];
    const destCommodity = nonAdminDest.filter(t => t.type === "commodity");
    console.log(`[ROUTE] "${to}" → ${destTerminals?.length ?? 0} results, ${destCommodity.length} non-admin commodity`);

    if (destCommodity.length === 1) {
      // Exact single match — use terminal ID
      destTerminal = destCommodity[0];
      console.log(`[ROUTE] Using dest terminal: id=${destTerminal.id} "${destTerminal.name}"`);
    } else {
      // Multiple or zero matches — treat as system/orbit/location name and filter client-side
      filter_dest_system = to;
      console.log(`[ROUTE] Using client-side dest filter: "${to}"`);
    }
  }

  // Step 3: Fetch routes — only pass terminal ID for exact matches
  const routeOpts = { id_terminal_origin: originTerminal.id };
  if (destTerminal) routeOpts.id_terminal_destination = destTerminal.id;
  if (filter_dest_system) routeOpts.filter_dest_system = filter_dest_system;
  // investment = aUEC budget; assume ~1000 aUEC/SCU average commodity price as baseline
  if (scu) routeOpts.investment = scu * 1000 * 1000;

  console.log(`[ROUTE] getRoutes opts:`, JSON.stringify(routeOpts));
  const routes = await uex.getRoutes(routeOpts);
  console.log(`[ROUTE] Got ${routes?.length ?? 0} routes`);

  if (!routes || routes.length === 0) {
    return interaction.editReply({
      embeds: [errorEmbed(
        `No routes found from **${originTerminal.name}**` +
        `${destTerminal ? ` to **${destTerminal.name}**` : ""}.\n` +
        `Try a major station like *Baijini Point* or *Port Tressler*.`
      )],
    });
  }

  const r = routes[0];
  const profit = r.profit ? `${uex.formatPrice(Math.round(r.profit))} aUEC` : "—";
  const investment = r.investment ? `${uex.formatPrice(Math.round(r.investment))} aUEC` : "—";

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`🚀 Best Route from ${originTerminal.name}`)
    .setURL(`https://uexcorp.space/trade/route?code=${r.code || ""}`)
    .addFields(
      { name: "Commodity", value: r.commodity_name || "—", inline: true },
      { name: "Buy At", value: r.origin_terminal_name || originTerminal.name, inline: true },
      { name: "Sell At", value: r.destination_terminal_name || "—", inline: true },
      { name: "Buy Price/SCU", value: r.price_origin ? `${uex.formatPrice(r.price_origin)} aUEC` : "—", inline: true },
      { name: "Sell Price/SCU", value: r.price_destination ? `${uex.formatPrice(r.price_destination)} aUEC` : "—", inline: true },
      { name: "Margin", value: r.price_margin ? `${r.price_margin}%` : "—", inline: true },
      { name: "Max Profit", value: profit, inline: true },
      { name: "Investment", value: investment, inline: true },
      { name: "UEX Score", value: r.score ? String(r.score) : "—", inline: true }
    )
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  if (routes.length > 1) {
    const alts = routes
      .slice(1, 4)
      .map((alt, i) =>
        `**${i + 2}.** ${alt.commodity_name} → ${alt.destination_terminal_name || "?"} — **${uex.formatPrice(Math.round(alt.profit || 0))} aUEC**`
      )
      .join("\n");
    embed.addFields({ name: "Other Top Routes", value: alts });
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
      { name: "Crew", value: v.crew ? String(v.crew) : "—", inline: true },
      { name: "Cargo (SCU)", value: v.scu != null ? String(v.scu) : "—", inline: true },
      { name: "Mass (kg)", value: v.mass != null ? uex.formatPrice(v.mass) : "—", inline: true },
      { name: "Landing Pad", value: v.pad_type || "—", inline: true },
      { name: "Version Added", value: v.game_version || "—", inline: true }
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
    return interaction.editReply({ embeds: [errorEmbed(location ? `No fuel prices found for **${location}**` : "No fuel price data available.")] });
  }

  // API returns one entry per fuel type per terminal — group by terminal
  const byTerminal = {};
  for (const f of prices) {
    if (!byTerminal[f.terminal_name]) byTerminal[f.terminal_name] = {};
    const name = (f.commodity_name || "").toLowerCase();
    if (name.includes("hydrogen")) byTerminal[f.terminal_name].hydrogen = f.price_buy;
    if (name.includes("quantum"))  byTerminal[f.terminal_name].quantum  = f.price_buy;
  }

  const terminals = Object.entries(byTerminal).slice(0, 8);
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle(`⛽ Fuel Prices${location ? ` near ${location}` : ""}`)
    .setURL("https://uexcorp.space/commodities/fuel_prices")
    .setDescription(
      terminals
        .map(([name, f]) =>
          `**${name}**\nHydrogen: **${f.hydrogen != null ? uex.formatPrice(f.hydrogen) : "—"}** | Quantum: **${f.quantum != null ? uex.formatPrice(f.quantum) : "—"}**`
        )
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
      { name: "Refuel", value: t.is_refuel ? "✅" : "❌", inline: true },
      { name: "Cargo", value: t.is_cargo_center ? "✅" : "❌", inline: true },
      { name: "Refinery", value: t.is_refinery ? "✅" : "❌", inline: true },
      { name: "FPS Shop", value: t.is_shop_fps ? "✅" : "❌", inline: true },
      { name: "Vehicles", value: t.is_shop_vehicle ? "✅" : "❌", inline: true },
      { name: "Medical", value: t.is_medical ? "✅" : "❌", inline: true }
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

/** /pirate – High-traffic routes most likely to encounter other players */
async function handlePirate(interaction) {
  const system = interaction.options.getString("system");

  // Top commodities by cax_score = highest real player trading volume
  const ranking = await uex.getCommodityRanking();
  if (!ranking || ranking.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed("Could not fetch commodity ranking data.")] });
  }

  // Fetch routes for top 4 commodities (by cax_score, already sorted)
  const allRoutes = [];
  for (const commodity of ranking.slice(0, 4)) {
    try {
      const routes = await uex.getRoutes({ id_commodity: commodity.id });
      if (routes && routes.length > 0) {
        allRoutes.push(...routes.slice(0, 6).map(r => ({ ...r, cax_score: commodity.cax_score, commodity_name: commodity.name })));
      }
    } catch (_) { /* skip */ }
  }

  if (allRoutes.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed("No route data available.")] });
  }

  // Optional system filter
  let routes = allRoutes;
  if (system) {
    const q = system.toLowerCase();
    routes = routes.filter(r =>
      r.origin_star_system_name?.toLowerCase().includes(q) ||
      r.destination_star_system_name?.toLowerCase().includes(q)
    );
    if (routes.length === 0) {
      return interaction.editReply({ embeds: [errorEmbed(`No high-traffic routes found in **${system}**.`)] });
    }
  }

  // Sort by composite: cax_score (player volume) × route score (profitability signal)
  routes.sort((a, b) => ((b.cax_score || 0) * (b.score || 1)) - ((a.cax_score || 0) * (a.score || 1)));

  const top = routes.slice(0, 8);

  const threatLabel = (cax) => {
    if (cax > 1_000_000) return "🔴 High";
    if (cax > 200_000)   return "🟡 Medium";
    return "🟢 Low";
  };

  const desc = top.map((r, i) =>
    `**${i + 1}.** ${cleanTerminal(r.origin_terminal_name)} → **${cleanTerminal(r.destination_terminal_name)}**\n` +
    `Cargo: ${r.commodity_name} | Profit: **${uex.formatPrice(Math.round(r.profit || 0))} aUEC** | Traffic: ${threatLabel(r.cax_score)}`
  ).join("\n\n");

  const embed = new EmbedBuilder()
    .setColor(0xff4500)
    .setTitle(`☠️ High-Traffic Trade Routes${system ? ` in ${system}` : ""}`)
    .setURL("https://uexcorp.space/trade/route")
    .setDescription(desc)
    .addFields({ name: "Traffic Key", value: "🔴 High  🟡 Medium  🟢 Low — based on UEX community trading volume" })
    .setFooter({ text: "UEX Corp • uexcorp.space", iconURL: "https://uexcorp.space/favicon.ico" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/** /looproutes – Back-to-back trade routes with minimal dead legs */
async function handleLoopRoutes(interaction) {
  const from = interaction.options.getString("from");
  const scu  = interaction.options.getInteger("scu") || 100;

  // Resolve origin terminal (same logic as /route)
  const originTerminals = await uex.getTerminals(from);
  const nonAdmin = originTerminals?.filter(t => !t.name.startsWith("Admin -")) || [];
  const origin =
    nonAdmin.find(t => t.type === "commodity" && t.is_available === 1) ||
    nonAdmin.find(t => t.type === "commodity") ||
    nonAdmin[0] || originTerminals?.[0];

  if (!origin) {
    return interaction.editReply({
      embeds: [errorEmbed(`No terminal found matching **${from}**.\nTry a station name like *Baijini Point* or *Port Tressler*.`)],
    });
  }

  // Get top outbound routes from origin (no investment filter — API filters too aggressively at low values)
  const outbound = await uex.getRoutes({ id_terminal_origin: origin.id });
  if (!outbound || outbound.length === 0) {
    return interaction.editReply({ embeds: [errorEmbed(`No routes found from **${origin.name}**.`)] });
  }

  // For each top destination, get routes from that terminal and filter for any returning to origin
  const loops = [];
  const seen = new Set();
  for (const out of outbound.slice(0, 15)) {
    const destId = out.id_terminal_destination;
    if (!destId || seen.has(destId)) continue;
    seen.add(destId);
    try {
      const returnRoutes = await uex.getRoutes({ id_terminal_origin: destId });
      // Filter client-side for routes that return to our origin terminal
      const returning = returnRoutes.filter(r => r.id_terminal_destination === origin.id);
      if (returning.length > 0) {
        const ret = returning[0];
        loops.push({
          out,
          ret,
          totalProfit: (out.profit || 0) + (ret.profit || 0),
        });
      }
    } catch (_) { /* skip terminals with no return route */ }
  }

  if (loops.length === 0) {
    return interaction.editReply({
      embeds: [errorEmbed(
        `No full loop routes found from **${origin.name}**.\n` +
        `Try a major hub like *Baijini Point* or *Port Tressler*.`
      )],
    });
  }

  loops.sort((a, b) => b.totalProfit - a.totalProfit);

  const desc = loops.slice(0, 5).map((l, i) => {
    const { out, ret } = l;
    return (
      `**${i + 1}. ${uex.formatPrice(Math.round(l.totalProfit))} aUEC total**\n` +
      `→ Buy **${out.commodity_name}** · ${cleanTerminal(out.origin_terminal_name || origin.name)} → ${cleanTerminal(out.destination_terminal_name)} (+**${uex.formatPrice(Math.round(out.profit || 0))}**)\n` +
      `← Buy **${ret.commodity_name}** · ${cleanTerminal(ret.origin_terminal_name)} → ${cleanTerminal(ret.destination_terminal_name || origin.name)} (+**${uex.formatPrice(Math.round(ret.profit || 0))}**)`
    );
  }).join("\n\n");

  const embed = new EmbedBuilder()
    .setColor(0x27ae60)
    .setTitle(`🔄 Loop Routes from ${origin.name}`)
    .setURL("https://uexcorp.space/trade/route")
    .setDescription(desc)
    .setFooter({ text: `${scu} SCU cargo · zero dead legs · UEX Corp`, iconURL: "https://uexcorp.space/favicon.ico" })
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
      { name: "/fuel `[location]`", value: "Hydrogen & Quantum fuel prices." },
      { name: "/terminal `<name>`", value: "Terminal details and available services." },
      { name: "/gameversion", value: "Current Star Citizen LIVE / PTU patch." },
      { name: "/pirate `[system]`", value: "High-traffic routes most likely to have other players." },
      { name: "/looproutes `<from>` `[scu]`", value: "Back-to-back routes with zero dead legs and high profit." }
    )
    .setFooter({ text: "Data from uexcorp.space • community-driven", iconURL: "https://uexcorp.space/favicon.ico" });

  await interaction.editReply({ embeds: [embed] });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip "Admin - " prefix from terminal display names */
function cleanTerminal(name) {
  return name ? name.replace(/^Admin - /, "") : "?";
}

function errorEmbed(msg) {
  return new EmbedBuilder().setColor(0xff4444).setTitle("❌ Error").setDescription(msg);
}

// ─── Login ───────────────────────────────────────────────────────────────────

client.login(process.env.DISCORD_TOKEN);
