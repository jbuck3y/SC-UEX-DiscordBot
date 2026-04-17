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

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    throw new Error(`UEX API error ${res.status}: ${res.statusText} (${url})`);
  }

  const json = await res.json();
  // UEX wraps data in { status: "ok", data: [...] }
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
 */
async function getRoutes(opts = {}) {
  const params = {};
  if (opts.scu) params.scu = opts.scu;

  const data = await get("/commodities_routes", params);
  if (!data) return [];

  let routes = data;

  // Filter by from/to location name substring match
  if (opts.from) {
    const q = opts.from.toLowerCase();
    routes = routes.filter(
      (r) =>
        r.terminal_origin_name?.toLowerCase().includes(q) ||
        r.star_system_origin_name?.toLowerCase().includes(q)
    );
  }
  if (opts.to) {
    const q = opts.to.toLowerCase();
    routes = routes.filter(
      (r) =>
        r.terminal_destination_name?.toLowerCase().includes(q) ||
        r.star_system_destination_name?.toLowerCase().includes(q)
    );
  }

  // Sort by profit descending
  return routes.sort((a, b) => (b.profit_total || 0) - (a.profit_total || 0));
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

/** Get terminals, optionally filtered by name */
async function getTerminals(name) {
  const data = await get("/terminals");
  if (!name) return data;
  const q = name.toLowerCase();
  return data.filter(
    (t) =>
      t.name?.toLowerCase().includes(q) ||
      t.orbit_name?.toLowerCase().includes(q) ||
      t.star_system_name?.toLowerCase().includes(q)
  );
}

// ─── Game Versions ────────────────────────────────────────────────────────────

async function getGameVersions() {
  return get("/game_versions");
}

// ─── Star Systems / Locations ─────────────────────────────────────────────────

async function getStarSystems() {
  return get("/star_systems");
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

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Format a price number with thousands separators */
function formatPrice(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}

module.exports = {
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
  formatPrice,
};
