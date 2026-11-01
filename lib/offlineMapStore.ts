/**
 * Pure File-System Offline Map Storage Manager.
 * All downloaded maps, tiles, fonts, styles, sprites, and media are saved ONLY
 * as standard files inside the "maps" folder in the application folder.
 * Zero database / webview storage is used.
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

// Clean up any legacy webview IndexedDB if present
if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
  try {
    indexedDB.deleteDatabase("fitrepacks_maps_offline_db");
  } catch (_) {}
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * Maps an internal asset cache key to a clean relative path inside the "maps/" directory:
 * - Tile: <gameSlug>/<mapSlug>/tiles/<z>/<x>/<y>.jpg
 * - Sprite: <gameSlug>/assets/markers@2x.png
 * - Fonts: <gameSlug>/assets/icomoon.woff, <gameSlug>/assets/mg-icons.woff
 * - CSS: <gameSlug>/assets/theme.css
 * - Media: <gameSlug>/media/<safeFilename>.jpg
 */
export function keyToRelativePath(key: string): string {
  if (!key) return "misc/unknown.bin";

  // 1. Tile keys: tile_v3_game_map_z_x_y or tile_v2_... or tile_...
  const tileMatch = key.match(/^tile(?:_v\d+)?_([^_]+)_([^_]+)_(\d+)_(\d+)_(\d+)$/);
  if (tileMatch) {
    const [, gameSlug, mapSlug, z, x, y] = tileMatch;
    return `${gameSlug}/${mapSlug}/tiles/${z}/${x}/${y}.jpg`;
  }

  // 2. Sprite sheet
  const spriteMatch = key.match(/^sprite_([^_]+)$/);
  if (spriteMatch) {
    return `${spriteMatch[1]}/assets/markers@2x.png`;
  }

  const spriteUrlMatch = key.match(/^sprite_url_([^_]+)$/);
  if (spriteUrlMatch) {
    return `${spriteUrlMatch[1]}/assets/sprite_url.txt`;
  }

  // 3. Fonts
  const icomoonMatch = key.match(/^font_icomoon_([^_]+)$/);
  if (icomoonMatch) {
    return `${icomoonMatch[1]}/assets/icomoon.woff`;
  }

  const mgIconsMatch = key.match(/^font_mg_icons_([^_]+)$/);
  if (mgIconsMatch) {
    return `${mgIconsMatch[1]}/assets/mg-icons.woff`;
  }

  // 4. CSS Themes
  const cssMatch = key.match(/^css_theme_([^_]+)$/);
  if (cssMatch) {
    return `${cssMatch[1]}/assets/theme.css`;
  }

  // 5. Media previews
  if (key.startsWith("media_")) {
    const rawUrl = decodeURIComponent(key.replace(/^media_/, ""));
    let safeName = rawUrl.split("/").pop() || "";
    safeName = safeName.split("?")[0].replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!safeName || safeName.length < 3) {
      safeName = `media_${Math.abs(hashString(rawUrl))}.jpg`;
    }
    const gameMatch = rawUrl.match(/games\/([^/]+)/);
    const gameSlug = gameMatch ? gameMatch[1] : "shared";
    return `${gameSlug}/media/${safeName}`;
  }

  const sanitized = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `misc/${sanitized}`;
}

export async function getMapsFolder(): Promise<string> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string>("get_maps_folder");
    } catch (_) {}
  }
  return "maps";
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
    } catch (_) {}
  }

  try {
    const res = await fetch(url);
    if (res.ok) {
      return await res.blob();
    }
  } catch (_) {}
  return null;
}

export async function fetchAndCacheOfflineAsset(
  key: string,
  url: string,
  force: boolean = false,
): Promise<Blob | null> {
  if (!key || !url) return null;
  if (!force) {
    const existing = await getOfflineAsset(key);
    if (existing) return existing;
  }

  const blob = await fetchAssetBlob(url);
  if (blob && blob.size > 0) {
    try {
      await saveOfflineAsset(key, blob);
      const spriteMatch = key.match(/^sprite_([^_]+)$/);
      if (spriteMatch) {
        await saveOfflineAsset(`sprite_url_${spriteMatch[1]}`, url.trim());
      }
    } catch (_) {}
    return blob;
  }
  return null;
}

// ----------------- File-based Asset Storage -----------------

export async function saveOfflineAsset(key: string, data: Blob | string | Uint8Array | ArrayBuffer): Promise<void> {
  const relPath = keyToRelativePath(key);

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (typeof data === "string") {
        await invoke("save_map_text_file", { relativePath: relPath, content: data });
      } else if (data instanceof Blob) {
        const buffer = await data.arrayBuffer();
        await invoke("save_map_file", { relativePath: relPath, data: new Uint8Array(buffer) });
      } else if (data instanceof Uint8Array) {
        await invoke("save_map_file", { relativePath: relPath, data });
      } else if (data instanceof ArrayBuffer) {
        await invoke("save_map_file", { relativePath: relPath, data: new Uint8Array(data) });
      }
    } catch (e) {
      console.warn(`Failed to save map asset file: ${relPath}`, e);
    }
  }
}

export async function getOfflineAsset(key: string): Promise<Blob | null> {
  if (!key) return null;
  const relPath = keyToRelativePath(key);

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const exists = await invoke<boolean>("map_file_exists", { relativePath: relPath });
      if (exists) {
        const bytes = await invoke<number[]>("read_map_file", { relativePath: relPath });
        if (bytes && bytes.length > 0) {
          return new Blob([new Uint8Array(bytes)]);
        }
      }
    } catch (_) {}
  }
  return null;
}

export async function getOfflineAssetUrl(key: string): Promise<string | null> {
  if (!key) return null;
  const blob = await getOfflineAsset(key);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  return null;
}

export async function getOfflineAssetText(key: string): Promise<string | null> {
  if (!key) return null;
  const relPath = keyToRelativePath(key);

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const exists = await invoke<boolean>("map_file_exists", { relativePath: relPath });
      if (exists) {
        const text = await invoke<string>("read_map_text_file", { relativePath: relPath });
        if (text) return text;
      }
    } catch (_) {}
  }
  return null;
}

export async function getValidOfflineSpriteUrl(
  gameSlug: string,
  targetUrl?: string,
): Promise<string | null> {
  if (!gameSlug) return null;
  const spriteKey = `sprite_${gameSlug}`;
  const spriteUrlKey = `sprite_url_${gameSlug}`;

  if (targetUrl && targetUrl.trim()) {
    const cachedSourceUrl = await getOfflineAssetText(spriteUrlKey);
    const isStale = !cachedSourceUrl || cachedSourceUrl.trim() !== targetUrl.trim();

    if (isStale) {
      const freshBlob = await fetchAndCacheOfflineAsset(spriteKey, targetUrl, true);
      if (freshBlob) {
        return URL.createObjectURL(freshBlob);
      }
    }
  }

  return await getOfflineAssetUrl(spriteKey);
}

// ----------------- File-based Map JSON Storage -----------------

export async function saveOfflineMapData(gameSlug: string, mapSlug: string, data: any): Promise<void> {
  if (!gameSlug || !mapSlug || !data) return;
  const relPath = `${gameSlug}/${mapSlug}/map.json`;

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const jsonStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
      await invoke("save_map_text_file", { relativePath: relPath, content: jsonStr });
    } catch (e) {
      console.warn(`Failed to save map.json to maps folder: ${relPath}`, e);
    }
  }
}

export async function getOfflineMapData(gameSlug: string, mapSlug: string): Promise<any | null> {
  if (!gameSlug || !mapSlug) return null;
  const relPath = `${gameSlug}/${mapSlug}/map.json`;

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const exists = await invoke<boolean>("map_file_exists", { relativePath: relPath });
      if (exists) {
        const text = await invoke<string>("read_map_text_file", { relativePath: relPath });
        if (text) {
          return JSON.parse(text);
        }
      }
    } catch (_) {}
  }
  return null;
}

// ----------------- Metadata & Readiness -----------------

export interface OfflineMapMeta {
  key: string;
  gameSlug: string;
  mapSlug: string;
  totalItems: number;
  totalBytes: number;
  downloadedAt: number;
  locationsCount?: number;
  categoriesCount?: number;
  markerImagesUrl?: string;
  markerImagesWidth?: number;
  markerImagesHeight?: number;
  spritePositionsCount?: number;
  tilePath?: string;
}

export interface OfflineMapUpdateCheckResult {
  hasUpdate: boolean;
  reason?: string;
  latestSpriteUrl?: string;
  diffLocations?: number;
  offlineLocationsCount?: number;
  onlineLocationsCount?: number;
}

export async function isMapOfflineReady(gameSlug: string, mapSlug: string): Promise<boolean> {
  if (!gameSlug || !mapSlug) return false;
  // A map is fully offline ready only if its offline download metadata (meta.json) exists,
  // indicating all map tiles & assets were actually downloaded (not merely that map.json was viewed/cached).
  const relPath = `${gameSlug}/${mapSlug}/meta.json`;

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<boolean>("map_file_exists", { relativePath: relPath });
    } catch (_) {}
  }
  return false;
}

export async function listOfflineMaps(): Promise<string[]> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string[]>("list_downloaded_maps");
    } catch (_) {}
  }
  return [];
}

export async function getOfflineMetadata(gameSlug: string, mapSlug: string): Promise<OfflineMapMeta | null> {
  if (!gameSlug || !mapSlug) return null;
  const relPath = `${gameSlug}/${mapSlug}/meta.json`;

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const exists = await invoke<boolean>("map_file_exists", { relativePath: relPath });
      if (exists) {
        const text = await invoke<string>("read_map_text_file", { relativePath: relPath });
        if (text) {
          return JSON.parse(text);
        }
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Checks whether an offline downloaded map has an update available on MapGenie
 * by comparing local metadata / map snapshot with live online map data.
 */
export async function checkOfflineMapUpdateAvailable(
  gameSlug: string,
  mapSlug: string,
  onlineMapData?: any | null
): Promise<OfflineMapUpdateCheckResult> {
  if (!gameSlug || !mapSlug) return { hasUpdate: false };

  // 1. Must be downloaded / offline ready
  const isReady = await isMapOfflineReady(gameSlug, mapSlug);
  if (!isReady) return { hasUpdate: false };

  // 2. Fetch local metadata and/or local map.json
  const meta = await getOfflineMetadata(gameSlug, mapSlug);
  const localMap = await getOfflineMapData(gameSlug, mapSlug);

  if (!meta && !localMap) return { hasUpdate: false };

  const offlineLocCount =
    meta?.locationsCount ?? (Array.isArray(localMap?.locations) ? localMap.locations.length : 0);
  const offlineCatCount =
    meta?.categoriesCount ?? (Array.isArray(localMap?.categories) ? localMap.categories.length : 0);
  const offlineSpriteUrl =
    meta?.markerImagesUrl || localMap?.mapConfig?.markerImagesUrl || "";
  const offlineSpriteWidth =
    meta?.markerImagesWidth || localMap?.mapConfig?.markerImagesWidth;
  const offlineSpriteHeight =
    meta?.markerImagesHeight || localMap?.mapConfig?.markerImagesHeight;
  const offlineSpriteCount =
    meta?.spritePositionsCount ??
    (localMap?.mapConfig?.markerSpritePositions
      ? Object.keys(localMap.mapConfig.markerSpritePositions).length
      : 0);
  const offlineDownloadedAt = meta?.downloadedAt || 0;

  // 3. Online Data Comparison
  let onlineData = onlineMapData;

  // If onlineMapData was not passed directly, try to get from global map cache
  if (!onlineData && typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem("fitrepacks_mapgenie_maps_v3");
      if (cached) {
        const allMaps = JSON.parse(cached);
        if (Array.isArray(allMaps)) {
          const matched = allMaps.find(
            (m: any) =>
              (m.game_slug?.toLowerCase() === gameSlug.toLowerCase() ||
                m.slug?.toLowerCase() === gameSlug.toLowerCase() ||
                m.slug?.toLowerCase().startsWith(`${gameSlug.toLowerCase()}--`)) &&
              (m.map_slug?.toLowerCase() === mapSlug.toLowerCase() ||
                m.slug?.toLowerCase().endsWith(`--${mapSlug.toLowerCase()}`) ||
                m.slug?.toLowerCase() === mapSlug.toLowerCase())
          );
          if (matched && typeof matched.locations_count === "number" && matched.locations_count > 0) {
            if (matched.locations_count !== offlineLocCount) {
              const diff = matched.locations_count - offlineLocCount;
              return {
                hasUpdate: true,
                reason:
                  offlineLocCount === 0
                    ? `${matched.locations_count} locations available (current: 0)`
                    : diff > 0
                      ? `${diff} new location(s) available (${offlineLocCount} -> ${matched.locations_count})`
                      : `Location count updated (${offlineLocCount} -> ${matched.locations_count})`,
                diffLocations: diff,
                offlineLocationsCount: offlineLocCount,
                onlineLocationsCount: matched.locations_count,
              };
            }
          }
        }
      }
    } catch (_) {}
    return { hasUpdate: false };
  }

  if (!onlineData) return { hasUpdate: false };

  const onlineLocCount = Array.isArray(onlineData?.locations) ? onlineData.locations.length : 0;
  const onlineCatCount = Array.isArray(onlineData?.categories) ? onlineData.categories.length : 0;
  const onlineSpriteUrl = onlineData?.mapConfig?.markerImagesUrl || "";
  const onlineSpriteWidth = onlineData?.mapConfig?.markerImagesWidth;
  const onlineSpriteHeight = onlineData?.mapConfig?.markerImagesHeight;
  const onlineSpriteCount = onlineData?.mapConfig?.markerSpritePositions
    ? Object.keys(onlineData.mapConfig.markerSpritePositions).length
    : 0;

  // A. Locations count difference
  if (onlineLocCount > 0 && onlineLocCount !== offlineLocCount) {
    const diff = onlineLocCount - offlineLocCount;
    return {
      hasUpdate: true,
      reason:
        offlineLocCount === 0
          ? `${onlineLocCount} locations available (current: 0)`
          : diff > 0
            ? `${diff} new location(s) available (${offlineLocCount} -> ${onlineLocCount})`
            : `Location count updated (${offlineLocCount} -> ${onlineLocCount})`,
      diffLocations: diff,
      offlineLocationsCount: offlineLocCount,
      onlineLocationsCount: onlineLocCount,
    };
  }

  // B. Marker Sprite URL or version changed
  if (onlineSpriteUrl && offlineSpriteUrl && onlineSpriteUrl !== offlineSpriteUrl) {
    return {
      hasUpdate: true,
      reason: "Updated marker icon sprite sheet available",
      latestSpriteUrl: onlineSpriteUrl,
      offlineLocationsCount: offlineLocCount,
      onlineLocationsCount: onlineLocCount,
    };
  }

  // C. Marker Sprite dimensions changed
  if (
    onlineSpriteWidth &&
    offlineSpriteWidth &&
    (onlineSpriteWidth !== offlineSpriteWidth || onlineSpriteHeight !== offlineSpriteHeight)
  ) {
    return {
      hasUpdate: true,
      reason: `Updated marker sprite format (${offlineSpriteWidth}x${offlineSpriteHeight} -> ${onlineSpriteWidth}x${onlineSpriteHeight})`,
      offlineLocationsCount: offlineLocCount,
      onlineLocationsCount: onlineLocCount,
    };
  }

  // D. Sprite Positions count changed
  if (onlineSpriteCount > 0 && offlineSpriteCount > 0 && onlineSpriteCount !== offlineSpriteCount) {
    const diff = onlineSpriteCount - offlineSpriteCount;
    return {
      hasUpdate: true,
      reason: `${Math.abs(diff)} marker icons updated`,
      offlineLocationsCount: offlineLocCount,
      onlineLocationsCount: onlineLocCount,
    };
  }

  // E. Categories count changed
  if (onlineCatCount > 0 && offlineCatCount > 0 && onlineCatCount !== offlineCatCount) {
    return {
      hasUpdate: true,
      reason: "Map categories updated on MapGenie",
      offlineLocationsCount: offlineLocCount,
      onlineLocationsCount: onlineLocCount,
    };
  }

  // F. Timestamp / Revision
  const onlineUpdatedAtStr =
    onlineData?.map?.updated_at ||
    onlineData?.mapConfig?.updated_at ||
    onlineData?.updated_at;
  if (onlineUpdatedAtStr && offlineDownloadedAt > 0) {
    const onlineTime = new Date(onlineUpdatedAtStr).getTime();
    if (!isNaN(onlineTime) && onlineTime > offlineDownloadedAt) {
      return {
        hasUpdate: true,
        reason: "Newer map revision available online",
        offlineLocationsCount: offlineLocCount,
        onlineLocationsCount: onlineLocCount,
      };
    }
  }

  return { hasUpdate: false };
}

export async function deleteOfflineMap(gameSlug: string, mapSlug: string): Promise<void> {
  if (!gameSlug || !mapSlug) return;

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_map_folder", { gameSlug, mapSlug });
    } catch (e) {
      console.warn("Failed to delete map folder on disk:", e);
    }
  }
}

export async function clearOfflineMapTileCache(gameSlug?: string, mapSlug?: string): Promise<void> {
  if (isTauri() && gameSlug && mapSlug) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_map_folder", { gameSlug, mapSlug: `${mapSlug}/tiles` });
    } catch (_) {}
  }
}

export interface DownloadProgress {
  current: number;
  total: number;
  percentage: number;
  status: string;
}

/**
 * Downloads all tiles, styles, fonts, marker icons, and media images for a map
 * and saves them as plain files in the "maps/" folder.
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

  const minZoom = Math.max(0, Math.min(8, primaryTileSet.min_zoom ?? 8));
  const maxZoom = Math.max(15, primaryTileSet.tiles_max_zoom ?? primaryTileSet.max_zoom ?? 15);

  const bounds = primaryTileSet.bounds || (mapData?.mapConfig?.tile_sets?.[0]?.bounds) || {};

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
        const key = `tile_v3_${gameSlug}_${mapSlug}_${z}_${x}_${y}`;
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
        `https://cdn.mapgenie.io/css/themes/games/${gameSlug}.css`,
        `https://cdn.mapgenie.io/css/themes/${gameSlug}.css`,
        `https://cdn.mapgenie.io/css/themes/icons/${gameSlug}.css`,
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

  // 3. Collect Location Media URLs
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

  // Save map.json directly to disk in maps/<gameSlug>/<mapSlug>/map.json
  await saveOfflineMapData(gameSlug, mapSlug, mapData);

  const CONCURRENCY = 24;
  let taskIndex = 0;

  async function worker() {
    while (taskIndex < allDownloadTasks.length) {
      if (abortSignal?.aborted) break;
      const task = allDownloadTasks[taskIndex++];
      if (!task) continue;

      for (const url of task.urls) {
        if (!url) continue;
        try {
          const blob = await fetchAssetBlob(url);
          if (blob && blob.size > 0) {
            await saveOfflineAsset(task.key, blob);
            totalBytes += blob.size;
            break;
          }
        } catch (_) {}
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

  // Save metadata to disk in maps/<gameSlug>/<mapSlug>/meta.json
  const meta: OfflineMapMeta = {
    key: `${gameSlug}_${mapSlug}`,
    gameSlug,
    mapSlug,
    totalItems: current,
    totalBytes,
    downloadedAt: Date.now(),
    locationsCount: locList.length,
    categoriesCount: Array.isArray(mapData?.categories) ? mapData.categories.length : 0,
    markerImagesUrl: mapData?.mapConfig?.markerImagesUrl,
    markerImagesWidth: mapData?.mapConfig?.markerImagesWidth,
    markerImagesHeight: mapData?.mapConfig?.markerImagesHeight,
    spritePositionsCount: mapData?.mapConfig?.markerSpritePositions
      ? Object.keys(mapData.mapConfig.markerSpritePositions).length
      : 0,
    tilePath: primaryTileSet?.path,
  };

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_map_text_file", {
        relativePath: `${gameSlug}/${mapSlug}/meta.json`,
        content: JSON.stringify(meta, null, 2),
      });
    } catch (_) {}
  }

  return true;
}
