# 🛸 UEX Discord Bot

A Discord bot for **Star Citizen** that pulls live trading data from the
[UEX Corp API 2.0](https://uexcorp.space/api/documentation) — commodity prices,
trade routes, ship stats, fuel prices, terminals, and more.

---

## Commands

| Command | Description |
|---|---|
| `/commodity <name>` | Info + average prices for a commodity (e.g. *Laranite*) |
| `/price <commodity> [type]` | Live buy/sell prices across all terminals |
| `/route <from> <to> [scu]` | Best trade route between two locations |
| `/ship <name>` | Ship stats: cargo, crew, mass, pledge price |
| `/fuel [location]` | Hydrogen & Quantanium fuel prices |
| `/terminal <name>` | Terminal details and available services |
| `/gameversion` | Current LIVE and PTU patch version |
| `/help` | List all commands |

---

## Setup

### 1 — Prerequisites
- **Node.js ≥ 18**
- A **Discord application** with a bot user → [discord.com/developers](https://discord.com/developers/applications)
- (Optional) A **UEX API token** for user-specific data → [uexcorp.space/api/apps](https://uexcorp.space/api/apps)

### 2 — Install dependencies
```bash
npm install
```

### 3 — Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `DISCORD_TOKEN` | Discord Developer Portal → Your App → Bot → Token |
| `CLIENT_ID` | Discord Developer Portal → Your App → OAuth2 → Client ID |
| `GUILD_ID` | Right-click your server → Copy Server ID (optional, for instant dev registration) |
| `UEX_API_TOKEN` | [uexcorp.space/api/apps](https://uexcorp.space/api/apps) → Create App → copy token (optional) |

### 4 — Invite the bot to your server
In the Discord Developer Portal:
1. **OAuth2 → URL Generator**
2. Scopes: `bot`, `applications.commands`
3. Bot Permissions: `Send Messages`, `Embed Links`, `Read Message History`
4. Copy the generated URL → open in browser → invite to your server

### 5 — Register slash commands
```bash
# Register to a single guild instantly (set GUILD_ID in .env first)
npm run deploy

# Or register globally (takes ~1 hour, remove GUILD_ID from .env)
npm run deploy
```

### 6 — Start the bot
```bash
npm start
```

---

## Project Structure

```
uex-discord-bot/
├── bot.js              # Main entry point, Discord client, command handlers
├── commands.js         # Slash command definitions (schema only)
├── deploy-commands.js  # One-time script to register slash commands
├── uex-api.js          # UEX Corp API wrapper
├── package.json
└── .env.example
```

---

## UEX API Notes

- **Base URL**: `https://api.uexcorp.space/2.0`
- All public endpoints (commodities, routes, ships, terminals, fuel) work **without a token**
- User-specific endpoints (trades, fleet, wallet) require `UEX_API_TOKEN`
- Data is community-sourced; prices update as datarunners submit reports
- Full docs: [uexcorp.space/api/documentation](https://uexcorp.space/api/documentation)

---

## Extending the Bot

Add a new command in 3 steps:
1. Add the `SlashCommandBuilder` entry in `commands.js`
2. Add a `case` + handler function in `bot.js`
3. Add a helper in `uex-api.js` if you need a new endpoint
4. Re-run `npm run deploy` to register the new command

Available UEX endpoints you could add:
- `/items_prices_all` — item shop prices
- `/commodities_ranking` — most traded commodities
- `/marketplace_listings` — player marketplace
- `/refineries_yields` — refinery output data
- `/orbits_distances` — travel distances between orbits

---

*Not affiliated with Cloud Imperium Games or Roberts Space Industries.*
*UEX Corp data is community-sourced — always verify prices in-game.*
