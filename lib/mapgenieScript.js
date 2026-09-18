export function mapgenieScript() {
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
      },
    };
  }

  // 2. FMG Main Logic
  const PRO_SECRET = "Iz0b5C3fjesjMuqKzj79ATDjQrymQOT?";

  class FMG_Logger {
    static log(...args) {
      console.log("[FMG]", ...args);
    }
    static error(...args) {
      console.error("[FMG]", ...args);
    }
    static debug(...args) {
      if (window.__FMG_DEBUG__) console.debug("[FMG]", ...args);
    }
  }

  class FMG_Storage {
    constructor() {
      this.data = {
        locations: {},
        categories: [],
        notes: [],
        hideFound: false,
      };
      this.fullData = {};
    }
    async load() {
      const res = await window.fmg.getData();
      this.fullData = res || {};

      let gameSlug = window.game?.slug;
      if (!gameSlug) {
        for (let i = 0; i < 50; i++) {
          await new Promise((r) => setTimeout(r, 100));
          gameSlug = window.game?.slug;
          if (gameSlug) break;
        }
      }
      gameSlug = gameSlug || "global";

      const gameData = this.fullData[gameSlug] || {};

      const locations = {};
      const savedLocs = Array.isArray(gameData.locations)
        ? gameData.locations
        : gameData.locations
          ? Object.keys(gameData.locations)
          : [];
      savedLocs.forEach((id) => (locations[id] = true));

      this.data = {
        locations: locations,
        categories: gameData.categories || [],
        notes: gameData.notes || [],
        hideFound: !!gameData.hideFound,
      };
      FMG_Logger.log(
        "Data loaded for " + gameSlug + ":",
        Object.keys(this.data.locations).length,
        "locations.",
      );
    }
    async save() {
      const gameSlug = window.game?.slug || "global";
      const locationIds = Object.keys(this.data.locations)
        .map(Number)
        .filter((id) => !isNaN(id));

      this.fullData[gameSlug] = {
        locations: locationIds,
        categories: this.data.categories,
        notes: this.data.notes,
        hideFound: !!this.data.hideFound,
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
      this.dispatch({
        type: "MG:USER:UPDATE_FOUND_LOCATIONS_COUNT",
        meta: { count },
      });
    }
    updateCategoryProgress() {
      this.dispatch({ type: "MG:USER:UPDATE_CATEGORY_PROGRESS" });
    }
    updateMapData(locations, categories) {
      const locationsById = locations.reduce((acc, l) => {
        acc[l.id] = l;
        return acc;
      }, {});
      this.dispatch({
        type: "MG:MAP:UPDATE_LOCATIONS",
        meta: { locationsById },
      });
      this.dispatch({
        type: "MG:MAP:UPDATE_CATEGORIES",
        meta: { categoriesById: categories },
      });
    }
  }

  class FMG_NetworkInterceptor {
    constructor(manager) {
      this.manager = manager;
      this.installAxios();
      this.installXHR();
      this.installFetch();
    }
    installAxios() {
      const self = this;
      const attachAxios = () => {
        if (
          window.axios &&
          window.axios.interceptors &&
          !window.axios.__fmg_intercepted
        ) {
          window.axios.__fmg_intercepted = true;
          window.axios.interceptors.request.use(async (config) => {
            if (!config.url || !config.method) return config;
            const method = config.method.toUpperCase();
            const url = config.url;
            if (url && url.includes("/api/v1/user/")) {
              const result = self.manager.handleUserRequest(
                method,
                url,
                config.data,
              );
              if (result) {
                config.adapter = () => {
                  return Promise.resolve({
                    data: result,
                    status: 200,
                    statusText: "OK",
                    headers: { "content-type": "application/json" },
                    config,
                    request: null,
                  });
                };
              }
            }
            return config;
          });
          FMG_Logger.log("Axios Interceptor installed.");
        } else if (!window.axios) {
          setTimeout(attachAxios, 300);
        }
      };
      attachAxios();
    }
    installXHR() {
      const self = this;
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url) {
        this._fmgMethod = method;
        this._fmgUrl = String(url);
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function (data) {
        const url = this._fmgUrl;
        const method = this._fmgMethod;
        if (url && url.includes("/api/v1/user/")) {
          const xhr = this;
          setTimeout(() => {
            try {
              const result = self.manager.handleUserRequest(method, url, data);
              if (result) {
                FMG_Logger.log("Blocked XHR:", method, url);
                const text = JSON.stringify(result);
                const def = (key, value) => {
                  Object.defineProperty(xhr, key, {
                    configurable: true,
                    get: () => value,
                  });
                };
                def("readyState", 4);
                def("status", 200);
                def("statusText", "OK");
                def("responseText", text);
                def(
                  "response",
                  xhr.responseType === "" || xhr.responseType === "text"
                    ? text
                    : result,
                );
                def("responseURL", url);
                xhr.getAllResponseHeaders = () =>
                  "content-type: application/json";
                xhr.getResponseHeader = (h) =>
                  /content-type/i.test(h) ? "application/json" : null;

                if (typeof xhr.onreadystatechange === "function")
                  xhr.onreadystatechange();
                if (typeof xhr.onload === "function") xhr.onload();
                if (typeof xhr.onloadend === "function") xhr.onloadend();
                xhr.dispatchEvent(new Event("readystatechange"));
                xhr.dispatchEvent(new Event("load"));
                xhr.dispatchEvent(new Event("loadend"));
              } else {
                originalSend.call(xhr, data);
              }
            } catch (err) {
              FMG_Logger.error("XHR intercept error:", err);
              try {
                originalSend.call(xhr, data);
              } catch (_) {}
            }
          }, 0);
          return;
        }
        return originalSend.apply(this, arguments);
      };
      FMG_Logger.log("XHR Interceptor installed.");
    }
    installFetch() {
      const self = this;
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const urlStr =
          typeof args[0] === "string"
            ? args[0]
            : args[0]?.url || String(args[0]);
        const options = args[1] || {};
        const method = (options.method || "GET").toUpperCase();

        if (urlStr && urlStr.includes("/api/v1/user/")) {
          const result = self.manager.handleUserRequest(
            method,
            urlStr,
            options.body,
          );
          if (result) {
            FMG_Logger.log("Blocked Fetch:", method, urlStr);
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
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
      div.innerHTML = `
        <div class="progress-item">
          <span class="title">0.00%</span>
          <span class="counter">0 / 0</span>
          <div class="progress-bar-container">
            <div class="progress-bar" role="progressbar" style="width: 0%"></div>
          </div>
        </div>
        <hr/>
      `;
      target.parentNode.insertBefore(div, target);
      this.el = div;
    }
    update(value, total) {
      this.render();
      if (!this.el) return;
      const percent = total > 0 ? ((value / total) * 100).toFixed(2) : "0.00";
      this.el.querySelector(".title").textContent =
        this.name.charAt(0).toUpperCase() +
        this.name.slice(1) +
        ": " +
        percent +
        "%";
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
      this.categoryProgress = new FMG_Progress(
        "category",
        ".category-progress",
      );
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
        try {
          return typeof d === "string" ? JSON.parse(d) : d;
        } catch (e) {
          return null;
        }
      };

      const match = /\/api\/v1\/user\/(?<key>[^/?#]+)(\/(?<id>[^/?#]+))?/.exec(
        url,
      );
      if (!match) return null;

      const { key, id } = match.groups;
      const body = parseBody(data);

      FMG_Logger.debug(
        `Matching Intercepted Request: ${method} ${key} ${id || "(no-id)"}`,
        body,
      );

      if (key === "map-data") {
        const storageLocs = this.storage.data.locations || {};
        const mapId = parseInt(id) || window.mapData?.map?.id;
        const locations = {};
        Object.keys(storageLocs).forEach((lid) => {
          locations[Number(lid)] = true;
        });

        return {
          locations: locations,
          hasPro: true,
          role: "admin",
          trackedCategoryIds: this.storage.data.categories || [],
          suggestions: [],
          presets: this.storage.data.presets || [],
          notes: (this.storage.data.notes || []).filter(
            (n) => !mapId || n.map_id === mapId,
          ),
          maxMarkedLocations: Infinity,
        };
      }

      if (key === "locations") {
        if (id) {
          if (method === "POST" || method === "PUT")
            this.storage.data.locations[id] = true;
          else if (method === "DELETE") delete this.storage.data.locations[id];
        } else if (body) {
          const ids = (
            body.location_ids || (body.location ? [body.location] : [])
          ).map(Number);
          ids.forEach((lid) => {
            if (method === "POST" || method === "PUT")
              this.storage.data.locations[lid] = true;
            else if (method === "DELETE")
              delete this.storage.data.locations[lid];
          });
        }
        this.saveAndSync();
        return { success: true };
      }

      if (key === "categories") {
        if (id) {
          const cid = parseInt(id);
          if (method === "POST" || method === "PUT") {
            if (!this.storage.data.categories.includes(cid))
              this.storage.data.categories.push(cid);
          } else if (method === "DELETE") {
            this.storage.data.categories = this.storage.data.categories.filter(
              (c) => c !== cid,
            );
          }
        } else if (body) {
          const ids = (
            body.category_ids || (body.category ? [body.category] : [])
          ).map(Number);
          ids.forEach((cid) => {
            if (method === "POST" || method === "PUT") {
              if (!this.storage.data.categories.includes(cid))
                this.storage.data.categories.push(cid);
            } else if (method === "DELETE") {
              this.storage.data.categories =
                this.storage.data.categories.filter((c) => c !== cid);
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
        window.user = {
          id: 1,
          username: "FMG_User",
          suggestions: [],
          locations: {},
          trackedCategoryIds: [],
        };
      }
      window.user.hasPro = true;
      window.user.role = "admin";

      const storageLocs = this.storage.data.locations;
      window.user.locations = { ...window.user.locations, ...storageLocs };
      window.user.trackedCategoryIds = Array.from(
        new Set([
          ...(window.user.trackedCategoryIds || []),
          ...this.storage.data.categories,
        ]),
      );

      if (window.mapData) window.mapData.maxMarkedLocations = Infinity;

      if (this.store) {
        const state = this.store.getState();
        if (state.map && state.map.categories) {
          const foundInStore = state.user?.foundLocations || {};
          Object.keys(storageLocs).forEach((id) => {
            if (!foundInStore[id]) {
              this.store.dispatch({
                type: "MG:USER:MARK_LOCATION",
                meta: { locationId: parseInt(id), found: true },
              });
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

      this.totalProgress.update(
        Object.keys(storageLocs).length,
        totalLocs.length,
      );

      const tracked = this.storage.data.categories;
      let catTotal = 0;
      let catCount = 0;
      totalLocs.forEach((l) => {
        if (tracked.includes(l.category_id)) {
          catTotal++;
          if (storageLocs[l.id]) catCount++;
        }
      });
      this.categoryProgress.update(catCount, catTotal);

      const toggle = document.getElementById("toggle-found");
      if (toggle) {
        let icon = toggle.querySelector("i");
        if (!icon) {
          icon = document.createElement("i");
          icon.className = "icon ui-icon-show-hide";
        }
        const count = Object.keys(storageLocs).length;
        toggle.innerHTML = "";
        toggle.appendChild(icon);
        toggle.appendChild(
          document.createTextNode(` Found Locations (${count})`),
        );
        toggle.classList.toggle("disabled", !!this.storage.data.hideFound);
      }
    }
    setupUIListeners() {
      const self = this;

      const applyStoredShownState = () => {
        if (
          window.mapManager &&
          typeof window.mapManager.setFoundLocationsShown === "function"
        ) {
          const shown = !self.storage.data.hideFound;
          window.mapManager.setFoundLocationsShown(shown);
          self.updateNativeUI();
        }
      };

      const attachMapManager = () => {
        if (
          window.mapManager &&
          typeof window.mapManager.setFoundLocationsShown === "function"
        ) {
          const orig = window.mapManager.setFoundLocationsShown;
          if (!orig.__fmg_wrapped) {
            const wrapped = function (shown) {
              orig.call(window.mapManager, shown);
              self.storage.data.hideFound = !shown;
              self.storage.save();
              self.updateNativeUI();
            };
            wrapped.__fmg_wrapped = true;
            window.mapManager.setFoundLocationsShown = wrapped;
          }
          applyStoredShownState();
        } else {
          setTimeout(attachMapManager, 300);
        }
      };
      attachMapManager();

      const attachMapLoaded = () => {
        if (window.map && window.map.on) {
          if (!window.map.__fmg_loaded_attached) {
            window.map.__fmg_loaded_attached = true;
            window.map.on("load", () => {
              applyStoredShownState();
            });
          }
        } else {
          setTimeout(attachMapLoaded, 500);
        }
      };
      attachMapLoaded();
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
        document
          .querySelectorAll(
            "#nitro-floating-wrapper, #blobby-left, .premium-button, .upgrade-link",
          )
          .forEach((el) => el.remove());
        document
          .querySelectorAll(".map-switcher-panel .map-link")
          .forEach((el) => el.classList.remove("locked"));
        this.manager.updateNativeUI();
      }, 2000);
    }
    async unlockPro() {
      if (!window.game || !window.mapData)
        return setTimeout(() => this.unlockPro(), 500);
      FMG_Logger.log("Unlocking Pro Maps (" + window.game.id + ")...");
      try {
        const res = await fetch(
          `https://mapgenie.io/api/v1/games/${window.game.id}/full`,
          {
            headers: { "X-Api-Secret": PRO_SECRET },
          },
        );
        const full = await res.json();
        if (full && full.maps) {
          const curMap = full.maps.find((m) => m.id === window.mapData.map.id);
          if (curMap) {
            const og = window.mapData;
            window.mapData = {
              ...og,
              maps: full.maps.map((m) => ({
                id: m.id,
                title: m.title,
                slug: m.slug,
              })),
              groups: curMap.groups,
              categories: curMap.groups.reduce((acc, g) => {
                g.categories.forEach((c) => (acc[c.id] = c));
                return acc;
              }, {}),
              locations: curMap.groups.flatMap((g) =>
                g.categories.flatMap((c) => c.locations),
              ),
              presets: full.default_presets || [],
              maxMarkedLocations: Infinity,
            };
            if (window.mapData.mapConfig?.tile_sets) {
              window.mapData.mapConfig.tile_sets.forEach((ts) => {
                if (!ts.pattern) {
                  const ogTs = og.mapConfig.tile_sets.find(
                    (o) => o.name === ts.name,
                  );
                  if (ogTs?.pattern) ts.pattern = ogTs.pattern;
                  else if (ogTs?.path)
                    ts.pattern = `${ogTs.path}/{z}/{x}/{y}.jpg`;
                }
              });
            }
            if (this.manager.store)
              this.manager.store.updateMapData(
                window.mapData.locations,
                window.mapData.categories,
              );
            FMG_Logger.log("Pro Maps Unlocked.");
          }
        }
        if (window.mapData.heatmapGroups?.length > 0) {
          const hmRes = await fetch(
            `https://mapgenie.io/api/v1/maps/${window.mapData.map.id}/heatmaps`,
            {
              headers: { "X-Api-Secret": PRO_SECRET },
            },
          );
          const hms = await hmRes.json();
          if (hms) {
            window.mapData.heatmapGroups = hms.map((h) => ({
              ...h,
              heatmap_categories: h.categories,
            }));
            window.mapData.heatmapCategories = Object.fromEntries(
              hms.flatMap((h) => h.categories).map((c) => [c.id, c]),
            );
          }
        }
      } catch (e) {
        FMG_Logger.error("Unlock failed", e);
      }
      this.manager.syncGlobals();
    }
  }

  // 3. Inject styles
  if (!document.getElementById("fmg-styles")) {
    const style = document.createElement("style");
    style.id = "fmg-styles";
    style.textContent = `
      #nitro-floating-wrapper, #blobby-left, .premium-button, .upgrade-link { display: none !important; }
      body.fmg-hide-found .maplibregl-marker.found,
      body.fmg-hide-found .mapboxgl-marker.found {
        display: none !important;
      }
      .progress-item-wrapper { margin-top: 15px; margin-bottom: 5px; }
      .progress-item { position: relative; padding-bottom: 5px; }
      .progress-item .title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #ccc; }
      .progress-item .counter { position: absolute; top: 0; right: 0; font-size: 11px; color: #aaa; }
      .progress-bar-container { background: rgba(0,0,0,0.3); border-radius: 2px; height: 6px; margin-top: 4px; overflow: hidden; }
      .progress-bar { background: #00bcd4; height: 100%; width: 0; transition: width 0.3s ease; }
      .fmg-total hr, .fmg-category hr { border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0; }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  window.fmgApp = new FMG_App();
  window.fmgApp.start();
}

export const MAPGENIE_FMG_INJECTED_SCRIPT = `(${mapgenieScript.toString()})();`;
export default MAPGENIE_FMG_INJECTED_SCRIPT;
