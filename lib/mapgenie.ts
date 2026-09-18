import { useState, useEffect } from "react";
import { pb } from "./pocketbase";

export interface MapGenieGame {
  id?: string;
  title: string;
  slug: string;
  url: string;
}

const STORAGE_KEY = "fitrepacks_mapgenie_cache";

// Initialize from localStorage synchronously if available
function getInitialCache(): MapGenieGame[] {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }
  return [];
}

let mapGenieCache: MapGenieGame[] = getInitialCache();
let hasFetchedFromPb = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
}

export function subscribeMapGenieUpdates(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Fetch all maps from PocketBase 'maps' collection and update memory cache
 */
export async function loadMapGenieFromPocketBase(): Promise<MapGenieGame[]> {
  try {
    let records: any[] = [];
    try {
      records = await pb.collection("maps").getFullList({
        sort: "title",
      });
    } catch {
      try {
        records = await pb.collection("mapgenie").getFullList({
          sort: "title",
        });
      } catch {}
    }

    if (records && records.length > 0) {
      const items: MapGenieGame[] = records.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        url: r.url,
      }));
      mapGenieCache = items;
      hasFetchedFromPb = true;

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch {}
      }

      notifyListeners();
      return items;
    }
  } catch (err) {
    console.warn("Failed to load maps from PocketBase:", err);
  }
  return mapGenieCache;
}

// Auto-trigger background load from PocketBase on import in browser environment
if (typeof window !== "undefined") {
  loadMapGenieFromPocketBase().catch(() => {});
}

// Normalize title for accurate matching
export function normalizeTitleForMatching(title: string): string {
  if (!title) return "";
  let clean = title.toLowerCase();

  // Remove repack / scene / release / edition tags
  clean = clean
    .replace(/\b(fitgirl|steamrip|dodi|elamigos|codex|tenoke|rune|flt|skidrow)\b/gi, "")
    .replace(/\b(repack|remastered|remake|definitive|edition|goty|deluxe|complete|cut|director's|bundle|v\d+[\w._-]*)\b/gi, "")
    .replace(/\b(game of the year|enhanced edition|anniversary edition)\b/gi, "")
    .replace(/[^\w\s]/g, " ") // replace symbols with space
    .replace(/\s+/g, " ")
    .trim();

  // Normalize common Roman numerals to arabic numbers
  clean = clean
    .replace(/\bviii\b/g, "8")
    .replace(/\bvii\b/g, "7")
    .replace(/\bvi\b/g, "6")
    .replace(/\biv\b/g, "4")
    .replace(/\bv\b/g, "5")
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\bix\b/g, "9")
    .replace(/\bx\b/g, "10");

  return clean.replace(/\s+/g, " ").trim();
}

/**
 * Checks if a game has an interactive map on MapGenie and returns the map details.
 */
export function getMapGenieMap(gameTitle: string): MapGenieGame | null {
  if (!gameTitle || !gameTitle.trim()) return null;

  // Background fetch if not already done
  if (!hasFetchedFromPb && typeof window !== "undefined") {
    loadMapGenieFromPocketBase().catch(() => {});
  }

  const rawClean = normalizeTitleForMatching(gameTitle);
  if (!rawClean) return null;

  // 1. Direct exact or normalized match
  for (const game of mapGenieCache) {
    const mgNorm = normalizeTitleForMatching(game.title);
    if (mgNorm === rawClean) {
      return game;
    }
  }

  // 2. Slug match (e.g. "elden-ring" or "cyberpunk-2077")
  const targetSlug = rawClean.replace(/\s+/g, "-");
  for (const game of mapGenieCache) {
    if (game.slug === targetSlug) {
      return game;
    }
  }

  // 3. Substring matching with word boundaries
  for (const game of mapGenieCache) {
    const mgNorm = normalizeTitleForMatching(game.title);
    if (mgNorm.length >= 4) {
      // Check if one contains the other as whole word sequence
      if (rawClean === mgNorm || rawClean.startsWith(mgNorm + " ") || mgNorm.startsWith(rawClean + " ")) {
        return game;
      }
    }
  }

  // 4. Special cases & aliases
  const aliases: Record<string, string> = {
    "rdr2": "red-dead-redemption-2",
    "rdr 2": "red-dead-redemption-2",
    "gta 5": "grand-theft-auto-5",
    "gta v": "grand-theft-auto-5",
    "gta 4": "grand-theft-auto-iv",
    "gta iv": "grand-theft-auto-iv",
    "cp2077": "cyberpunk-2077",
    "botw": "the-legend-of-zelda-breath-of-the-wild",
    "totk": "the-legend-of-zelda-tears-of-the-kingdom",
    "bg3": "baldurs-gate-3",
  };

  const aliasSlug = aliases[rawClean];
  if (aliasSlug) {
    const found = mapGenieCache.find((g) => g.slug === aliasSlug || g.slug.startsWith(aliasSlug));
    if (found) return found;
  }

  return null;
}

/**
 * React hook to get the MapGenie map for a game title, automatically re-rendering
 * when the maps finish loading from PocketBase or local cache.
 */
export function useMapGenieMap(gameTitle: string | undefined): MapGenieGame | null {
  const [map, setMap] = useState<MapGenieGame | null>(() =>
    gameTitle ? getMapGenieMap(gameTitle) : null
  );

  useEffect(() => {
    if (!gameTitle) {
      setMap(null);
      return;
    }

    setMap(getMapGenieMap(gameTitle));

    const unsubscribe = subscribeMapGenieUpdates(() => {
      setMap(getMapGenieMap(gameTitle));
    });

    return unsubscribe;
  }, [gameTitle]);

  return map;
}

/**
 * Manually trigger MapGenie scraper sync endpoint on PocketBase server
 */
export async function triggerPocketBaseMapGenieSync(): Promise<any> {
  try {
    const res = await pb.send("/api/custom/mapgenie/sync", {
      method: "POST",
    });
    await loadMapGenieFromPocketBase();
    return res;
  } catch (err) {
    console.error("Failed to trigger PocketBase MapGenie sync:", err);
    throw err;
  }
}

/**
 * FMG MapGenie Pro and tracking injection script adapted for Webview
 */
export const MAPGENIE_FMG_INJECTED_SCRIPT = `
(function() {
  if (window.__FMG_INITIALIZED__) return;
  window.__FMG_INITIALIZED__ = true;

  // 1. Setup local storage provider for window.fmg
  if (!window.fmg) {
    window.fmg = {
      getData: async () => {
        try {
          return JSON.parse(localStorage.getItem("fmg_mapgenie_data") || "{}");
        } catch {
          return {};
        }
      },
      setData: async (data) => {
        try {
          localStorage.setItem("fmg_mapgenie_data", JSON.stringify(data));
        } catch (e) {
          console.error("[FMG] Storage save error:", e);
        }
      }
    };
  }

  // 2. FMG Main Logic
  const PRO_SECRET = "Iz0b5C3fjesjMuqKzj79ATDjQrymQOT?";

  class FMG_Logger {
    static log(...args) { console.log("[FMG]", ...args); }
    static error(...args) { console.error("[FMG]", ...args); }
    static debug(...args) { if (window.__FMG_DEBUG__) console.debug("[FMG]", ...args); }
  }

  class FMG_Storage {
    constructor() {
      this.data = { locations: {}, categories: [], notes: [] };
      this.fullData = {};
    }
    async load() {
      const res = await window.fmg.getData();
      this.fullData = res || {};
      
      let gameSlug = window.game?.slug;
      if (!gameSlug) {
         for (let i = 0; i < 50; i++) {
           await new Promise(r => setTimeout(r, 100));
           gameSlug = window.game?.slug;
           if (gameSlug) break;
         }
      }
      gameSlug = gameSlug || "global";
      
      const gameData = this.fullData[gameSlug] || {};
      
      const locations = {};
      const savedLocs = Array.isArray(gameData.locations) ? gameData.locations : (gameData.locations ? Object.keys(gameData.locations) : []);
      savedLocs.forEach(id => locations[id] = true);
      
      this.data = {
        locations: locations,
        categories: gameData.categories || [],
        notes: gameData.notes || []
      };
      FMG_Logger.log("Data loaded for " + gameSlug + ":", Object.keys(this.data.locations).length, "locations.");
    }
    async save() {
      const gameSlug = window.game?.slug || "global";
      const locationIds = Object.keys(this.data.locations).map(Number).filter(id => !isNaN(id));
      
      this.fullData[gameSlug] = {
        locations: locationIds,
        categories: this.data.categories,
        notes: this.data.notes
      };
      
      await window.fmg.setData(this.fullData);
      FMG_Logger.log("Data saved for " + gameSlug + ".");
    }
  }

  class FMG_Store {
    constructor(store) {
      this.store = store;
    }
    dispatch(action) {
      if (this.store && this.store.dispatch) {
        this.store.dispatch(action);
      }
    }
    getState() {
      return this.store ? this.store.getState() : {};
    }
    updateFoundCount(count) {
      this.dispatch({ type: "MG:USER:UPDATE_FOUND_LOCATIONS_COUNT", meta: { count } });
    }
    updateCategoryProgress() {
      this.dispatch({ type: "MG:USER:UPDATE_CATEGORY_PROGRESS" });
    }
    updateMapData(locations, categories) {
       const locationsById = locations.reduce((acc, l) => { acc[l.id] = l; return acc; }, {});
       this.dispatch({ type: "MG:MAP:UPDATE_LOCATIONS", meta: { locationsById } });
       this.dispatch({ type: "MG:MAP:UPDATE_CATEGORIES", meta: { categoriesById: categories } });
    }
  }

  class FMG_NetworkInterceptor {
    constructor(manager) {
      this.manager = manager;
      this.installXHR();
      this.installFetch();
    }
    installXHR() {
      const self = this;
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        this._fmgMethod = method;
        this._fmgUrl = String(url); 
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function(data) {
        const url = this._fmgUrl;
        const method = this._fmgMethod;
        if (url && url.includes("/api/v1/user/")) {
          const result = self.manager.handleUserRequest(method, url, data);
          if (result) {
            FMG_Logger.log("Blocked XHR:", method, url);
            Object.defineProperty(this, "status", { writable: true, value: 200 });
            Object.defineProperty(this, "readyState", { writable: true, value: 4 });
            Object.defineProperty(this, "responseText", { writable: true, value: JSON.stringify(result) });
            if (this.onreadystatechange) this.onreadystatechange();
            if (this.onload) this.onload();
            return;
          }
        }
        return originalSend.apply(this, arguments);
      };
      FMG_Logger.log("XHR Interceptor installed.");
    }
    installFetch() {
      const self = this;
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const urlStr = typeof args[0] === "string" ? args[0] : (args[0]?.url || String(args[0]));
        const options = args[1] || {};
        const method = (options.method || "GET").toUpperCase();
        
        if (urlStr && urlStr.includes("/api/v1/user/")) {
          const result = self.manager.handleUserRequest(method, urlStr, options.body);
          if (result) {
            FMG_Logger.log("Blocked Fetch:", method, urlStr);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
        }
        return originalFetch.apply(window, args);
      };
      FMG_Logger.log("Fetch Interceptor installed.");
    }
  }

  class FMG_Progress {
    constructor(name, selector) {
      this.name = name;
      this.selector = selector;
      this.el = null;
    }
    render() {
      if (this.el) return;
      const target = document.querySelector(this.selector);
      if (!target) return;

      const div = document.createElement("div");
      div.className = "progress-item-wrapper fmg-" + this.name;
      div.innerHTML = \`
        <div class="progress-item">
          <span class="title">0.00%</span>
          <span class="counter">0 / 0</span>
          <div class="progress-bar-container">
            <div class="progress-bar" role="progressbar" style="width: 0%"></div>
          </div>
        </div>
        <hr/>
      \`;
      target.parentNode.insertBefore(div, target);
      this.el = div;
    }
    update(value, total) {
      this.render();
      if (!this.el) return;
      const percent = total > 0 ? (value / total * 100).toFixed(2) : "0.00";
      this.el.querySelector(".title").textContent = this.name.charAt(0).toUpperCase() + this.name.slice(1) + ": " + percent + "%";
      this.el.querySelector(".counter").textContent = value + " / " + total;
      this.el.querySelector(".progress-bar").style.width = percent + "%";
    }
  }

  class FMG_MapManager {
    constructor() {
      this.storage = new FMG_Storage();
      this.store = null;
      this.interceptor = null;
      this.totalProgress = new FMG_Progress("total", ".category-progress");
      this.categoryProgress = new FMG_Progress("category", ".category-progress");
    }
    async init() {
      await this.storage.load();
      if (window.store) this.store = new FMG_Store(window.store);
      this.interceptor = new FMG_NetworkInterceptor(this);
      
      this.syncGlobals();
      this.setupUIListeners();
    }
    handleUserRequest(method, url, data) {
      method = method.toUpperCase();
      const parseBody = (d) => {
        try { return typeof d === "string" ? JSON.parse(d) : d; }
        catch(e) { return null; }
      };

      const match = /\\/api\\/v1\\/user\\/(?<key>[^/?#]+)(\\/(?<id>[^/?#]+))?/.exec(url);
      if (!match) return null;

      const { key, id } = match.groups;
      const body = parseBody(data);
      
      FMG_Logger.debug(\`Matching Intercepted Request: \${method} \${key} \${id || '(no-id)'}\`, body);

      if (key === "locations") {
        if (id) {
          if (method === "POST" || method === "PUT") this.storage.data.locations[id] = true;
          else if (method === "DELETE") delete this.storage.data.locations[id];
        } else if (body) {
          const ids = (body.location_ids || (body.location ? [body.location] : [])).map(Number);
          ids.forEach(lid => {
            if (method === "POST") this.storage.data.locations[lid] = true;
            else if (method === "DELETE") delete this.storage.data.locations[lid];
          });
        }
        this.saveAndSync();
        return { success: true };
      }

      if (key === "categories") {
        if (id) {
          const cid = parseInt(id);
          if (method === "POST" || method === "PUT") {
            if (!this.storage.data.categories.includes(cid)) this.storage.data.categories.push(cid);
          } else if (method === "DELETE") {
            this.storage.data.categories = this.storage.data.categories.filter(c => c !== cid);
          }
        } else if (body) {
          const ids = (body.category_ids || (body.category ? [body.category] : [])).map(Number);
          ids.forEach(cid => {
            if (method === "POST" || method === "PUT") {
              if (!this.storage.data.categories.includes(cid)) this.storage.data.categories.push(cid);
            } else if (method === "DELETE") {
              this.storage.data.categories = this.storage.data.categories.filter(c => c !== cid);
            }
          });
        }
        this.saveAndSync();
        return { success: true };
      }

      return null;
    }
    async saveAndSync() {
      await this.storage.save();
      this.syncGlobals();
    }
    syncGlobals() {
      if (!window.user) {
        window.user = { id: 1, username: "FMG_User", suggestions: [], locations: {}, trackedCategoryIds: [] };
      }
      window.user.hasPro = true;
      window.user.role = "admin";
      
      const storageLocs = this.storage.data.locations;
      window.user.locations = { ...window.user.locations, ...storageLocs };
      window.user.trackedCategoryIds = Array.from(new Set([...(window.user.trackedCategoryIds || []), ...this.storage.data.categories]));
      
      if (window.mapData) window.mapData.maxMarkedLocations = Infinity;
      
      if (this.store) {
        const state = this.store.getState();
        if (state.map && state.map.categories) {
          const foundInStore = state.user?.foundLocations || {};
          Object.keys(storageLocs).forEach(id => {
            if (!foundInStore[id]) {
              this.store.dispatch({ type: "MG:USER:MARK_LOCATION", meta: { locationId: parseInt(id), found: true } });
            }
          });
          this.store.updateCategoryProgress();
        }
      }

      const count = Object.keys(storageLocs).length;
      window.user.gameLocationsCount = count;
      if (this.store) this.store.updateFoundCount(count);
      
      this.updateNativeUI();
    }
    updateNativeUI() {
      const storageLocs = this.storage.data.locations;
      const totalLocs = window.mapData?.locations || [];

      this.totalProgress.update(Object.keys(storageLocs).length, totalLocs.length);

      const tracked = this.storage.data.categories;
      let catTotal = 0;
      let catCount = 0;
      totalLocs.forEach(l => {
        if (tracked.includes(l.category_id)) {
          catTotal++;
          if (storageLocs[l.id]) catCount++;
        }
      });
      this.categoryProgress.update(catCount, catTotal);

      const toggle = document.getElementById("toggle-found");
      if (toggle) {
        const icon = toggle.querySelector("i");
        const count = Object.keys(storageLocs).length;
        toggle.textContent = "";
        if (icon) toggle.appendChild(icon);
        toggle.appendChild(document.createTextNode(\` Found Locations (\${count})\`));
      }
    }
    setupUIListeners() {
      if (window.$) {
        $(document).off("click", "#toggle-found").on("click", "#toggle-found", function() {
          const $btn = $(this);
          $btn.toggleClass("disabled");
          if (window.mapManager) window.mapManager.setFoundLocationsShown(!$btn.hasClass("disabled"));
        });
      }

      const syncToggle = () => {
        const btn = document.getElementById("toggle-found");
        if (btn && window.mapManager) {
          window.mapManager.setFoundLocationsShown(!btn.classList.contains("disabled"));
        } else if (document.getElementById("toggle-found")) {
          setTimeout(syncToggle, 500);
        }
      };
      syncToggle();
    }
  }

  class FMG_App {
    constructor() {
      this.manager = new FMG_MapManager();
    }
    async start() {
      FMG_Logger.log("Initializing FMG App...");
      await this.manager.init();
      this.setupCleanup();
      this.unlockPro();
      
      const storeWait = setInterval(() => {
         if (window.store && !this.manager.store) {
            this.manager.store = new FMG_Store(window.store);
            this.manager.syncGlobals();
         }
         if (this.manager.store) clearInterval(storeWait);
      }, 1000);
    }
    setupCleanup() {
      setInterval(() => {
        document.querySelectorAll("#nitro-floating-wrapper, #blobby-left, .premium-button, .upgrade-link").forEach(el => el.remove());
        document.querySelectorAll(".map-switcher-panel .map-link").forEach(el => el.classList.remove("locked"));
        this.manager.updateNativeUI();
      }, 2000);
    }
    async unlockPro() {
      if (!window.game || !window.mapData) return setTimeout(() => this.unlockPro(), 500);
      FMG_Logger.log("Unlocking Pro Maps (" + window.game.id + ")...");
      try {
        const res = await fetch(\`https://mapgenie.io/api/v1/games/\${window.game.id}/full\`, {
          headers: { "X-Api-Secret": PRO_SECRET }
        });
        const full = await res.json();
        if (full && full.maps) {
          const curMap = full.maps.find(m => m.id === window.mapData.map.id);
          if (curMap) {
            const og = window.mapData;
            window.mapData = {
              ...og,
              maps: full.maps.map(m => ({ id: m.id, title: m.title, slug: m.slug })),
              groups: curMap.groups,
              categories: curMap.groups.reduce((acc, g) => { g.categories.forEach(c => acc[c.id] = c); return acc; }, {}),
              locations: curMap.groups.flatMap(g => g.categories.flatMap(c => c.locations)),
              presets: full.default_presets || [],
              maxMarkedLocations: Infinity
            };
            if (window.mapData.mapConfig?.tile_sets) {
              window.mapData.mapConfig.tile_sets.forEach(ts => {
                if (!ts.pattern) {
                  const ogTs = og.mapConfig.tile_sets.find(o => o.name === ts.name);
                  if (ogTs?.pattern) ts.pattern = ogTs.pattern;
                  else if (ogTs?.path) ts.pattern = \`\${ogTs.path}/{z}/{x}/{y}.jpg\`;
                }
              });
            }
            if (this.manager.store) this.manager.store.updateMapData(window.mapData.locations, window.mapData.categories);
            FMG_Logger.log("Pro Maps Unlocked.");
          }
        }
        if (window.mapData.heatmapGroups?.length > 0) {
           const hmRes = await fetch(\`https://mapgenie.io/api/v1/maps/\${window.mapData.map.id}/heatmaps\`, {
              headers: { "X-Api-Secret": PRO_SECRET }
           });
           const hms = await hmRes.json();
           if (hms) {
              window.mapData.heatmapGroups = hms.map(h => ({ ...h, heatmap_categories: h.categories }));
              window.mapData.heatmapCategories = Object.fromEntries(hms.flatMap(h => h.categories).map(c => [c.id, c]));
           }
        }
      } catch (e) { FMG_Logger.error("Unlock failed", e); }
      this.manager.syncGlobals();
      const old = document.querySelector("script[src*='map.js?id=']");
      if (old && !window.mapManager) {
         const n = document.createElement("script");
         n.src = old.src.replace("id=", "ready&id=");
         document.body.appendChild(n);
      }
    }
  }

  // 3. Inject styles
  if (!document.getElementById("fmg-styles")) {
    const style = document.createElement("style");
    style.id = "fmg-styles";
    style.textContent = \`
      #nitro-floating-wrapper, #blobby-left, .premium-button, .upgrade-link { display: none !important; }
      .progress-item-wrapper { margin-top: 15px; margin-bottom: 5px; }
      .progress-item { position: relative; padding-bottom: 5px; }
      .progress-item .title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #ccc; }
      .progress-item .counter { position: absolute; top: 0; right: 0; font-size: 11px; color: #aaa; }
      .progress-bar-container { background: rgba(0,0,0,0.3); border-radius: 2px; height: 6px; margin-top: 4px; overflow: hidden; }
      .progress-bar { background: #00bcd4; height: 100%; width: 0; transition: width 0.3s ease; }
      .fmg-total hr, .fmg-category hr { border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0; }
    \`;
    (document.head || document.documentElement).appendChild(style);
  }

  window.fmgApp = new FMG_App();
  window.fmgApp.start();
})();
`;

