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
    .replace(
      /\b(fitgirl|steamrip|dodi|elamigos|codex|tenoke|rune|flt|skidrow)\b/gi,
      "",
    )
    .replace(
      /\b(repack|remastered|remake|definitive|edition|goty|deluxe|complete|cut|director's|bundle|v\d+[\w._-]*)\b/gi,
      "",
    )
    .replace(
      /\b(game of the year|enhanced edition|anniversary edition)\b/gi,
      "",
    )
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
      if (
        rawClean === mgNorm ||
        rawClean.startsWith(mgNorm + " ") ||
        mgNorm.startsWith(rawClean + " ")
      ) {
        return game;
      }
    }
  }

  // 4. Special cases & aliases
  const aliases: Record<string, string> = {
    rdr2: "red-dead-redemption-2",
    "rdr 2": "red-dead-redemption-2",
    "gta 5": "grand-theft-auto-5",
    "gta v": "grand-theft-auto-5",
    "gta 4": "grand-theft-auto-iv",
    "gta iv": "grand-theft-auto-iv",
    cp2077: "cyberpunk-2077",
    botw: "the-legend-of-zelda-breath-of-the-wild",
    totk: "the-legend-of-zelda-tears-of-the-kingdom",
    bg3: "baldurs-gate-3",
  };

  const aliasSlug = aliases[rawClean];
  if (aliasSlug) {
    const found = mapGenieCache.find(
      (g) => g.slug === aliasSlug || g.slug.startsWith(aliasSlug),
    );
    if (found) return found;
  }

  return null;
}

/**
 * React hook to get the MapGenie map for a game title, automatically re-rendering
 * when the maps finish loading from PocketBase or local cache.
 */
export function useMapGenieMap(
  gameTitle: string | undefined,
): MapGenieGame | null {
  const [map, setMap] = useState<MapGenieGame | null>(() =>
    gameTitle ? getMapGenieMap(gameTitle) : null,
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

export { MAPGENIE_FMG_INJECTED_SCRIPT, mapgenieScript } from "./mapgenieScript";
