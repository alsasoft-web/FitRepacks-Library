/**
 * Offline Map Storage Manager using native IndexedDB.
 * Zero external dependencies.
 */

const DB_NAME = "fitrepacks_maps_offline_db";
const DB_VERSION = 1;

const STORES = {
  MAPS: "offline_maps",
  ASSETS: "offline_assets",
  METADATA: "offline_metadata",
} as const;

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

export async function fetchAssetBlob(url: string): Promise<Blob | null> {
  if (!url) return null;
  if (isTauri()) {
    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      const res = await tauriFetch(url, {
        headers: {
          "Accept": "*/*",
          "Referer": "https://mapgenie.io/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });
      if (res.ok) {
        return await res.blob();
      }
    } catch {}
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      return await res.blob();
    }
  } catch {}
  return null;
}

export async function fetchAndCacheOfflineAsset(key: string, url: string): Promise<Blob | null> {
  if (!key || !url) return null;
  const existing = await getOfflineAsset(key);
  if (existing) return existing;

  const blob = await fetchAssetBlob(url);
  if (blob && blob.size > 0) {
    try {
      await saveOfflineAsset(key, blob);
    } catch {}
    return blob;
  }
  return null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function getOfflineDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in browser"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORES.MAPS)) {
          db.createObjectStore(STORES.MAPS, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORES.ASSETS)) {
          db.createObjectStore(STORES.ASSETS, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORES.METADATA)) {
          db.createObjectStore(STORES.METADATA, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function saveOfflineAsset(key: string, data: Blob | string): Promise<void> {
  const db = await getOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.ASSETS, "readwrite");
    const store = tx.objectStore(STORES.ASSETS);
    const req = store.put({ key, data, timestamp: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineAsset(key: string): Promise<Blob | null> {
  if (!key) return null;
  try {
    const db = await getOfflineDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.ASSETS, "readonly");
      const store = tx.objectStore(STORES.ASSETS);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result?.data) {
          if (req.result.data instanceof Blob) {
            resolve(req.result.data);
          } else if (typeof req.result.data === "string") {
            resolve(new Blob([req.result.data]));
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getOfflineAssetText(key: string): Promise<string | null> {
  if (!key) return null;
  try {
    const db = await getOfflineDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.ASSETS, "readonly");
      const store = tx.objectStore(STORES.ASSETS);
      const req = store.get(key);
      req.onsuccess = async () => {
        if (req.result?.data) {
          if (typeof req.result.data === "string") {
            resolve(req.result.data);
          } else if (req.result.data instanceof Blob) {
            resolve(await req.result.data.text());
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveOfflineMapData(gameSlug: string, mapSlug: string, data: any): Promise<void> {
  const db = await getOfflineDb();
  const key = `${gameSlug}_${mapSlug}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MAPS, "readwrite");
    const store = tx.objectStore(STORES.MAPS);
    const req = store.put({ key, data, timestamp: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflineMapData(gameSlug: string, mapSlug: string): Promise<any | null> {
  try {
    const db = await getOfflineDb();
    const key = `${gameSlug}_${mapSlug}`;
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.MAPS, "readonly");
      const store = tx.objectStore(STORES.MAPS);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export interface OfflineMapMeta {
  key: string;
  gameSlug: string;
  mapSlug: string;
  totalItems: number;
  totalBytes: number;
  downloadedAt: number;
}

export async function isMapOfflineReady(gameSlug: string, mapSlug: string): Promise<boolean> {
  if (!gameSlug || !mapSlug) return false;
  try {
    const db = await getOfflineDb();
    const key = `${gameSlug}_${mapSlug}`;
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.METADATA, "readonly");
      const store = tx.objectStore(STORES.METADATA);
      const req = store.get(key);
      req.onsuccess = () => resolve(Boolean(req.result));
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function getOfflineMetadata(gameSlug: string, mapSlug: string): Promise<OfflineMapMeta | null> {
  try {
    const db = await getOfflineDb();
    const key = `${gameSlug}_${mapSlug}`;
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.METADATA, "readonly");
      const store = tx.objectStore(STORES.METADATA);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteOfflineMap(gameSlug: string, mapSlug: string): Promise<void> {
  try {
    const db = await getOfflineDb();
    const mapKey = `${gameSlug}_${mapSlug}`;

    // Delete map JSON and metadata
    const tx = db.transaction([STORES.MAPS, STORES.METADATA], "readwrite");
    tx.objectStore(STORES.MAPS).delete(mapKey);
    tx.objectStore(STORES.METADATA).delete(mapKey);
  } catch {}
}

export async function clearOfflineMapTileCache(gameSlug?: string, mapSlug?: string): Promise<void> {
  try {
    const db = await getOfflineDb();
    const tx = db.transaction(STORES.ASSETS, "readwrite");
    const store = tx.objectStore(STORES.ASSETS);
    const req = store.openCursor();
    const prefix = gameSlug && mapSlug ? `tile_${gameSlug}_${mapSlug}` : gameSlug ? `tile_${gameSlug}` : "tile_";
    const prefixV2 = gameSlug && mapSlug ? `tile_v2_${gameSlug}_${mapSlug}` : gameSlug ? `tile_v2_${gameSlug}` : "tile_v2_";

    req.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const key = String(cursor.key);
        if (key.startsWith(prefix) || key.startsWith(prefixV2)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch {}
}

export interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  status: string;
}

/**
 * Downloads all tiles, styles, fonts, marker icons, and media images for a map.
 */
export async function downloadFullOfflineMap(
  gameSlug: string,
  mapSlug: string,
  mapData: any,
  onProgress?: (p: DownloadProgress) => void,
  abortSignal?: { aborted: boolean }
): Promise<boolean> {
  if (!gameSlug || !mapSlug || !mapData) return false;

  const tileSets = (mapData as any)?.tile_sets || mapData?.map?.tile_sets || mapData?.mapConfig?.tile_sets || [];
  const primaryTileSet = (Array.isArray(tileSets) && tileSets[0]) || {};

  // Always download zoom range from 8 to 15 (or wider if map defines it)
  const minZoom = Math.max(0, Math.min(8, primaryTileSet.min_zoom ?? 8));
  const maxZoom = Math.max(15, primaryTileSet.tiles_max_zoom ?? primaryTileSet.max_zoom ?? 15);

  const bounds = primaryTileSet.bounds || (mapData?.mapConfig?.tile_sets?.[0]?.bounds) || {};

  // Helper to convert Lat/Lng to Tile coordinates
  const latLngToTile = (lat: number, lng: number, zoom: number): { x: number; y: number } => {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    return {
      x: Math.max(0, Math.min(n - 1, x)),
      y: Math.max(0, Math.min(n - 1, y)),
    };
  };

  // Pre-calculate locations bounding box if available
  const locList = Array.isArray(mapData?.locations) ? mapData.locations : [];
  let locMinLat = Infinity, locMaxLat = -Infinity, locMinLng = Infinity, locMaxLng = -Infinity;
  let hasValidLocs = false;
  for (const loc of locList) {
    const lat = typeof loc.latitude === "string" ? parseFloat(loc.latitude) : loc.latitude;
    const lng = typeof loc.longitude === "string" ? parseFloat(loc.longitude) : loc.longitude;
    if (!isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0)) {
      locMinLat = Math.min(locMinLat, lat);
      locMaxLat = Math.max(locMaxLat, lat);
      locMinLng = Math.min(locMinLng, lng);
      locMaxLng = Math.max(locMaxLng, lng);
      hasValidLocs = true;
    }
  }

  // 1. Collect all tile candidate URLs across all zoom levels
  const candidateTileUrls: { key: string; urls: string[] }[] = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const b = bounds[String(z)] || bounds[z];
    let minX = 0;
    let maxX = Math.pow(2, z) - 1;
    let minY = 0;
    let maxY = Math.pow(2, z) - 1;

    if (b && b.x && b.y) {
      minX = b.x.min;
      maxX = b.x.max;
      minY = b.y.min;
      maxY = b.y.max;
    } else {
      const definedZooms = Object.keys(bounds)
        .map(Number)
        .filter((k) => !isNaN(k) && bounds[k]?.x && bounds[k]?.y);
      if (definedZooms.length > 0) {
        const closestZ = definedZooms.reduce((prev, curr) =>
          Math.abs(curr - z) < Math.abs(prev - z) ? curr : prev
        );
        const refB = bounds[closestZ];
        const scale = Math.pow(2, z - closestZ);
        minX = Math.max(0, Math.floor(refB.x.min * scale));
        maxX = Math.min(Math.pow(2, z) - 1, Math.ceil((refB.x.max + 1) * scale) - 1);
        minY = Math.max(0, Math.floor(refB.y.min * scale));
        maxY = Math.min(Math.pow(2, z) - 1, Math.ceil((refB.y.max + 1) * scale) - 1);
      } else if (hasValidLocs) {
        const p1 = latLngToTile(locMaxLat, locMinLng, z);
        const p2 = latLngToTile(locMinLat, locMaxLng, z);
        minX = Math.max(0, Math.min(p1.x, p2.x) - 1);
        maxX = Math.min(Math.pow(2, z) - 1, Math.max(p1.x, p2.x) + 1);
        minY = Math.max(0, Math.min(p1.y, p2.y) - 1);
        maxY = Math.min(Math.pow(2, z) - 1, Math.max(p1.y, p2.y) + 1);
      } else {
        const startLat = mapData?.mapConfig?.start_lat ?? mapData?.map?.start_lat ?? 0;
        const startLng = mapData?.mapConfig?.start_lng ?? mapData?.map?.start_lng ?? 0;
        const centerTile = latLngToTile(startLat, startLng, z);
        minX = Math.max(0, centerTile.x - 2);
        maxX = Math.min(Math.pow(2, z) - 1, centerTile.x + 2);
        minY = Math.max(0, centerTile.y - 2);
        maxY = Math.min(Math.pow(2, z) - 1, centerTile.y + 2);
      }
    }

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `tile_v2_${gameSlug}_${mapSlug}_${z}_${x}_${y}`;
        const rawUrls: string[] = [];

        if (mapData?.mapConfig?.tilePattern) {
          rawUrls.push(
            mapData.mapConfig.tilePattern
              .replace(/\{z\}/g, String(z))
              .replace(/\{y\}/g, String(y))
              .replace(/\{x\}/g, String(x))
          );
        }
        if (primaryTileSet.pattern) {
          const pat = primaryTileSet.pattern.startsWith("http")
            ? primaryTileSet.pattern
            : `https://tiles.mapgenie.io/games/${primaryTileSet.pattern}`;
          rawUrls.push(
            pat
              .replace(/\{z\}/g, String(z))
              .replace(/\{y\}/g, String(y))
              .replace(/\{x\}/g, String(x))
          );
        }
        if (primaryTileSet.path) {
          const ext = primaryTileSet.extension || "jpg";
          rawUrls.push(
            `https://tiles.mapgenie.io/games/${primaryTileSet.path}/${z}/${x}/${y}.${ext}`,
            `https://tiles.mapgenie.io/games/${primaryTileSet.path}/${z}/${y}/${x}.${ext}`
          );
        }
        const versions = ["default-v5", "default-v4", "default-v3", "default-v2", "default-v1", "default"];
        for (const v of versions) {
          rawUrls.push(
            `https://tiles.mapgenie.io/games/${gameSlug}/${mapSlug}/${v}/${z}/${x}/${y}.jpg`,
            `https://tiles.mapgenie.io/games/${gameSlug}/${mapSlug}/${v}/${z}/${y}/${x}.jpg`
          );
        }

        const urls = Array.from(new Set(rawUrls.filter(Boolean)));
        candidateTileUrls.push({ key, urls });
      }
    }
  }

  // 2. Collect Font, CSS, and Sprite URLs
  const assetUrls: { key: string; urls: string[] }[] = [
    {
      key: `font_icomoon_${gameSlug}`,
      urls: [
        mapData?.mapConfig?.icomoonUrl || "",
        `https://cdn.mapgenie.io/fonts/${gameSlug}/icons/icomoon.woff`,
        `https://cdn.mapgenie.io/fonts/${gameSlug}/icons/icomoon.ttf`,
        `https://mapgenie.io/game-icons/${gameSlug}/icons.woff`,
      ].filter(Boolean),
    },
    {
      key: `font_mg_icons_${gameSlug}`,
      urls: [
        mapData?.mapConfig?.mgIconsUrl || "",
        `https://cdn.mapgenie.io/fonts/${gameSlug}/icons/mg-icons.woff`,
        `https://cdn.mapgenie.io/fonts/${gameSlug}/icons/icomoon.ttf`,
        `https://mapgenie.io/game-icons/${gameSlug}/icons.ttf`,
      ].filter(Boolean),
    },
    {
      key: `css_theme_${gameSlug}`,
      urls: [
        mapData?.mapConfig?.iconsCssUrl || "",
        `https://cdn.mapgenie.io/css/themes/icons/${gameSlug}-icons.css`,
        `https://mapgenie.io/game-icons/${gameSlug}/icons.css`,
        `https://media.mapgenie.io/v2/assets/prod/games/${gameSlug}/theme/theme.css`,
        `https://media.mapgenie.io/v2/assets/prod/games/${gameSlug}/theme/v3/theme.css`,
      ].filter(Boolean),
    },
    {
      key: `sprite_${gameSlug}`,
      urls: [
        mapData?.mapConfig?.markerImagesUrl || "",
        `https://cdn.mapgenie.io/images/games/${gameSlug}/markers@2x.png`,
      ].filter(Boolean),
    },
  ];

  // 3. Collect Location Media URLs (Screenshots & previews)
  locList.forEach((loc: any) => {
    if (Array.isArray(loc.media)) {
      loc.media.forEach((m: any) => {
        const url = m.url || (m.file_name ? `https://media.mapgenie.io/storage/media/${m.file_name}` : "");
        if (url) {
          assetUrls.push({
            key: `media_${encodeURIComponent(url)}`,
            urls: [url],
          });
        }
      });
    }
  });

  const allDownloadTasks = [...assetUrls, ...candidateTileUrls];
  const total = allDownloadTasks.length;
  let current = 0;
  let totalBytes = 0;

  // Save map JSON first
  await saveOfflineMapData(gameSlug, mapSlug, mapData);

  // Worker pool for parallel downloading (24 concurrent downloads)
  const CONCURRENCY = 24;
  let taskIndex = 0;

  async function worker() {
    while (taskIndex < allDownloadTasks.length) {
      if (abortSignal?.aborted) break;
      const task = allDownloadTasks[taskIndex++];
      let saved = false;

      for (const url of task.urls) {
        if (!url) continue;
        try {
          const blob = await fetchAssetBlob(url);
          if (blob && blob.size > 0) {
            await saveOfflineAsset(task.key, blob);
            totalBytes += blob.size;
            saved = true;
            break;
          }
        } catch {}
      }

      current++;
      if (onProgress) {
        const percentage = Math.round((current / total) * 100);
        onProgress({
          current,
          total,
          percentage,
          status: `Downloaded ${current}/${total} assets (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`,
        });
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  if (abortSignal?.aborted) {
    return false;
  }

  // Save metadata
  const db = await getOfflineDb();
  const meta: OfflineMapMeta = {
    key: `${gameSlug}_${mapSlug}`,
    gameSlug,
    mapSlug,
    totalItems: current,
    totalBytes,
    downloadedAt: Date.now(),
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.METADATA, "readwrite");
    const req = tx.objectStore(STORES.METADATA).put(meta);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  return true;
}
