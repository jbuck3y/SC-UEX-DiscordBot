/**
 * uex-api.js — Thin wrapper around the UEX Corp API 2.0
 * Docs: https://uexcorp.space/api/documentation
 *
 * All public endpoints that don't require a user token work without auth.
 * Set UEX_API_TOKEN in .env for authenticated endpoints (user_trades, fleet, etc.)
 */

const BASE = "https://api.uexcorp.space/2.0";

/**
 * Generic fetch helper
 * @param {string} path  - e.g. "/commodities"
 * @param {object} params - query string params
 */
async function get(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }

  const headers = { "Content-Type": "application/json" };
  if (process.env.UEX_API_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.UEX_API_TOKEN}`;
  }

  // ── Debug logging ──────────────────────────────────────────
  console.log(`[UEX] GET ${url.toString()}`);

  const res = await fetch(url.toString(), { headers });

  // Log raw response before any processing
  const rawText = await res.text();
  console.log(`[UEX] HTTP ${res.status} ${res.statusText}`);
  console.log(`[UEX] Response: ${rawText.slice(0, 500)}`); // first 500 chars

  if (!res.ok) {
    throw new Error(`UEX API HTTP ${res.status}: ${res.statusText}\nURL: ${url}\nBody: ${rawText.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(rawText);
  } catch (e) {
    throw new Error(`UEX API returned non-JSON response: ${rawText.slice(0, 300)}`);
  }

  // UEX wraps responses: { status: "ok"|"error", data: [...] }
  if (json?.status && json.status !== "ok") {
    throw new Error(`UEX API error status "${json.status}": ${JSON.stringify(json).slice(0, 300)}\nURL: ${url}`);
  }

  return json?.data ?? json;
}

// ─── Commodities ──────────────────────────────────────────────────────────────

/** Get commodities list, optionally filtered by name */
async function getCommodities(name) {
  const data = await get("/commodities");
  if (!name) return data;
  const q = name.toLowerCase();
  return data.filter(
    (c) =>
      c.name?.toLowerCase().includes(q) ||
      c.code?.toLowerCase().includes(q) ||
      c.name_short?.toLowerCase().includes(q)
  );
}

/** Get all commodity prices (buy + sell across terminals), optionally filtered */
async function getCommodityPricesAll(commodity) {
  const data = await get("/commodities_prices_all");
  if (!commodity) return data;
  const q = commodity.toLowerCase();
  return data.filter(
    (p) =>
      p.commodity_name?.toLowerCase().includes(q) ||
      p.commodity_code?.toLowerCase().includes(q)
  );
}

/** Get commodity price history */
async function getCommodityPriceHistory(commodityId) {
  return get("/commodities_prices_history", { id_commodity: commodityId });
}

/** Get commodity ranking (most traded) */
async function getCommodityRanking() {
  return get("/commodities_ranking");
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * Get best trade routes
 * @param {{ from?: string, to?: string, scu?: number }} opts
 *
 * NOTE: /commodities_routes REQUIRES at least one of:
 *   id_terminal_origin | id_planet_origin | id_orbit_origin | id_commodity
 * Passing only a text name is not supported by the API — we must look up the
 * terminal/orbit ID first, then call the route endpoint.
 * As a fallback we accept id_terminal_origin directly if provided.
 */
async function getRoutes(opts = {}) {
  const params = {};

  if (opts.id_terminal_origin)      params.id_terminal_origin      = parseInt(opts.id_terminal_origin);
  if (opts.id_orbit_origin)         params.id_orbit_origin         = parseInt(opts.id_orbit_origin);
  if (opts.id_terminal_destination) params.id_terminal_destination = parseInt(opts.id_terminal_destination);
  if (opts.id_orbit_destination)    params.id_orbit_destination    = parseInt(opts.id_orbit_destination);
  if (opts.id_planet_destination)   params.id_planet_destination   = parseInt(opts.id_planet_destination);
  if (opts.id_commodity)            params.id_commodity            = parseInt(opts.id_commodity);
  if (opts.investment)              params.investment              = parseInt(opts.investment);

  // The API requires id_terminal_origin, id_orbit_origin, or id_commodity — id_terminal_destination alone is not accepted
  const hasRequired = params.id_terminal_origin || params.id_orbit_origin || params.id_commodity;
  if (!hasRequired) {
    throw new Error("getRoutes requires at least one of: id_terminal_origin, id_terminal_destination, id_commodity");
  }

  const data = await get("/commodities_routes", params);
  if (!data || !Array.isArray(data)) return [];

  // Client-side filter by destination system name if provided
  let routes = data;
  if (opts.filter_dest_system) {
    const q = opts.filter_dest_system.toLowerCase();
    routes = routes.filter(r =>
      r.destination_star_system_name?.toLowerCase().includes(q) ||
      r.destination_orbit_name?.toLowerCase().includes(q) ||
      r.destination_terminal_name?.toLowerCase().includes(q)
    );
  }

  return routes.sort((a, b) => (b.profit || 0) - (a.profit || 0));
}

// ─── Vehicles / Ships ─────────────────────────────────────────────────────────

/** Get vehicles list, optionally filtered by name */
async function getVehicles(name) {
  const data = await get("/vehicles");
  if (!name) return data;
  const q = name.toLowerCase();
  return data.filter(
    (v) =>
      v.name?.toLowerCase().includes(q) ||
      v.name_short?.toLowerCase().includes(q) ||
      v.company_name?.toLowerCase().includes(q)
  );
}

/** Get vehicle in-game purchase prices */
async function getVehiclePurchasePrices(vehicleId) {
  return get("/vehicles_purchases_prices", { id_vehicle: vehicleId });
}

/** Get vehicle rental prices */
async function getVehicleRentalPrices(vehicleId) {
  return get("/vehicles_rentals_prices", { id_vehicle: vehicleId });
}

// ─── Fuel ─────────────────────────────────────────────────────────────────────

/** Get all fuel prices, optionally filtered by location */
async function getFuelPricesAll(location) {
  const data = await get("/fuel_prices_all");
  if (!location) return data;
  const q = location.toLowerCase();
  return data.filter(
    (f) =>
      f.terminal_name?.toLowerCase().includes(q) ||
      f.orbit_name?.toLowerCase().includes(q) ||
      f.star_system_name?.toLowerCase().includes(q)
  );
}

// ─── Terminals ────────────────────────────────────────────────────────────────

/** Get terminals filtered by name using the API's native name param */
async function getTerminals(name) {
  const params = {};
  if (name) params.name = name;
  const data = await get("/terminals", params);
  if (!Array.isArray(data)) return [];
  return data;
}

/** Get all NQA terminals and their sell prices, optionally filtered by commodity name */
async function getNQASellPrices(commodity) {
  const allTerminals = await get("/terminals", { is_nqa: 1 });
  const nqa = Array.isArray(allTerminals) ? allTerminals.filter(t => t.is_nqa === 1) : [];
  const nqaById = Object.fromEntries(nqa.map(t => [t.id, t]));
  const nqaIds  = new Set(nqa.map(t => t.id));

  const prices = await getCommodityPricesAll();
  let sell = prices.filter(p => nqaIds.has(p.id_terminal) && p.price_sell > 0);

  if (commodity) {
    const q = commodity.toLowerCase();
    sell = sell.filter(p =>
      p.commodity_name?.toLowerCase().includes(q) ||
      p.commodity_code?.toLowerCase().includes(q)
    );
  }

  // Attach terminal info and sort by sell price descending
  return sell
    .map(p => ({ ...p, terminal: nqaById[p.id_terminal] }))
    .sort((a, b) => b.price_sell - a.price_sell);
}

// ─── Game Versions ────────────────────────────────────────────────────────────

async function getGameVersions() {
  // /game_versions returns a plain object: { live: "4.7.1", ptu: "" }
  // NOT an array — the old code called versions[0] which would be undefined
  const data = await get("/game_versions");
  return data; // { live, ptu }
}

// ─── Star Systems / Locations ─────────────────────────────────────────────────

async function getStarSystems(name) {
  const data = await get("/star_systems");
  if (!name) return data;
  const q = name.toLowerCase();
  return data.filter(s => s.name?.toLowerCase().includes(q));
}

async function getPlanets(starSystemId) {
  return get("/planets", { id_star_system: starSystemId });
}

async function getSpaceStations(orbitId) {
  return get("/space_stations", { id_orbit: orbitId });
}

// ─── Items ────────────────────────────────────────────────────────────────────

async function getItems(name) {
  const data = await get("/items");
  if (!name) return data;
  const q = name.toLowerCase();
  return data.filter((i) => i.name?.toLowerCase().includes(q));
}

/** Get item shop prices across all terminals, filtered by item name */
async function getItemPricesAll(name) {
  const data = await get("/items_prices_all");
  if (!Array.isArray(data)) return [];
  if (!name) return data;
  const q = name.toLowerCase();
  return data.filter(p => p.item_name?.toLowerCase().includes(q));
}

/** Get player marketplace listings with optional search and operation filter */
async function getMarketplaceListings(opts = {}) {
  const data = await get("/marketplace_listings");
  if (!Array.isArray(data)) return [];
  let results = data;
  if (opts.search) {
    const q = opts.search.toLowerCase();
    results = results.filter(l =>
      l.title?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q)
    );
  }
  if (opts.operation) {
    results = results.filter(l => l.operation === opts.operation);
  }
  return results;
}

/** Get refinery yield modifiers, filtered by ore name and/or location */
async function getRefineryYields(opts = {}) {
  const data = await get("/refineries_yields");
  if (!Array.isArray(data)) return [];
  let results = data;
  if (opts.ore) {
    const q = opts.ore.toLowerCase();
    results = results.filter(r => r.commodity_name?.toLowerCase().includes(q));
  }
  if (opts.location) {
    const q = opts.location.toLowerCase();
    results = results.filter(r =>
      r.terminal_name?.toLowerCase().includes(q) ||
      r.star_system_name?.toLowerCase().includes(q) ||
      r.orbit_name?.toLowerCase().includes(q) ||
      r.space_station_name?.toLowerCase().includes(q)
    );
  }
  return results.sort((a, b) => (b.value || 0) - (a.value || 0));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Format a price number with thousands separators */
function formatPrice(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}

module.exports = {
  getNQASellPrices,
  get,
  getCommodities,
  getCommodityPricesAll,
  getCommodityPriceHistory,
  getCommodityRanking,
  getRoutes,
  getVehicles,
  getVehiclePurchasePrices,
  getVehicleRentalPrices,
  getFuelPricesAll,
  getTerminals,
  getGameVersions,
  getStarSystems,
  getPlanets,
  getSpaceStations,
  getItems,
  getItemPricesAll,
  getMarketplaceListings,
  getRefineryYields,
  formatPrice,
};
