import { IgdbGameMetadata } from "./types";

const DEFAULT_CLIENT_ID = process.env.NEXT_PUBLIC_IGDB_CLIENT_ID || "";
const DEFAULT_CLIENT_SECRET = process.env.NEXT_PUBLIC_IGDB_CLIENT_SECRET || "";

function getCredentials() {
  const clientId = process.env.NEXT_PUBLIC_IGDB_CLIENT_ID || DEFAULT_CLIENT_ID;
  const clientSecret =
    process.env.NEXT_PUBLIC_IGDB_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;
  return { clientId, clientSecret };
}

const IGDB_GAMES_URL = "https://api.igdb.com/v4/games";

let cachedAccessToken: string | null = null;
let tokenExpiryTime = 0;
const igdbMemoryCache = new Map<string, IgdbGameMetadata[]>();

async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      return await tauriFetch(url, init);
    } catch (err) {
      console.warn(
        "Tauri http plugin fetch error, trying standard fetch:",
        err,
      );
    }
  }
  return await fetch(url, init);
}

async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < tokenExpiryTime) {
    return cachedAccessToken;
  }

  const { clientId, clientSecret } = getCredentials();
  const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;

  try {
    const res = await httpFetch(tokenUrl, { method: "POST" });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Token fetch error [${res.status}]: ${errText}`);
      throw new Error(`Token fetch error: ${res.statusText}`);
    }
    const data = await res.json();
    cachedAccessToken = data.access_token;
    tokenExpiryTime = Date.now() + (data.expires_in - 300) * 1000;
    return cachedAccessToken;
  } catch (err) {
    console.error("Failed to get IGDB access token:", err);
    return null;
  }
}

function getFallbackCover(title: string): string {
  const encoded = encodeURIComponent(title || "Game");
  return `https://placehold.co/600x800/0f172a/3b82f6?text=${encoded}`;
}

function getFallbackBanner(title: string): string {
  const encoded = encodeURIComponent(title || "Game");
  return `https://placehold.co/1920x1080/020617/1e293b?text=${encoded}`;
}

interface RawIgdbGame {
  id: number;
  name: string;
  summary?: string;
  storyline?: string;
  rating?: number;
  first_release_date?: number;
  cover?: { image_id: string };
  screenshots?: { image_id: string }[];
  artworks?: { image_id: string }[];
  videos?: { video_id: string }[];
  genres?: { id: number; name: string }[];
  involved_companies?: { developer?: boolean; company?: { name: string } }[];
}

function parseIgdbResponse(rawGames: RawIgdbGame[]): IgdbGameMetadata[] {
  return rawGames.map((g) => {
    const coverUrl = g.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
      : getFallbackCover(g.name);

    const bannerImageId =
      g.screenshots?.[0]?.image_id || g.artworks?.[0]?.image_id;
    const bannerUrl = bannerImageId
      ? `https://images.igdb.com/igdb/image/upload/t_1080p/${bannerImageId}.jpg`
      : coverUrl;

    const screenshots =
      g.screenshots?.map(
        (s) =>
          `https://images.igdb.com/igdb/image/upload/t_720p/${s.image_id}.jpg`,
      ) || [];

    const alternateCovers: string[] = [];
    if (coverUrl && !coverUrl.includes("placehold.co"))
      alternateCovers.push(coverUrl);

    // Repurpose screenshots and artworks as alternate covers
    g.artworks?.forEach((a) => {
      alternateCovers.push(
        `https://images.igdb.com/igdb/image/upload/t_cover_big/${a.image_id}.jpg`,
      );
    });
    g.screenshots?.forEach((s) => {
      alternateCovers.push(
        `https://images.igdb.com/igdb/image/upload/t_cover_big/${s.image_id}.jpg`,
      );
    });

    const videos =
      g.videos?.map((v) => `https://www.youtube.com/embed/${v.video_id}`) || [];
    const genres = g.genres ? g.genres.map((gn) => gn.name) : ["Action"];
    const devCompany = g.involved_companies?.find((ic) => ic.developer)?.company
      ?.name;
    const releaseDate = g.first_release_date
      ? new Date(g.first_release_date * 1000).toISOString()
      : undefined;
    const releaseYear = g.first_release_date
      ? new Date(g.first_release_date * 1000).getFullYear()
      : undefined;

    return {
      id: g.id,
      name: g.name,
      summary: g.summary || `${g.name} - Action-packed gaming experience.`,
      storyline: g.storyline,
      coverUrl,
      bannerUrl,
      alternateCovers,
      screenshots,
      videos,
      genres,
      rating: g.rating ? Math.round(g.rating) : undefined,
      releaseYear,
      releaseDate,
      developer: devCompany,
    };
  });
}

/**
 * Clean a game title for UI display and IGDB searching:
 * - Strips DLCs ("+ 5 DLCs", "+ All DLCs", "+ DLC", "Incl. DLCs")
 * - Strips bonus tags ("+ Bonus Soundtrack", "+ Bonus Content", "+ Artbook", "+ Yuzu/Ryujinx Emus")
 * - Strips build numbers ("Build 24657362", "Build 12345", ", Build 24657362")
 * - Strips version tags ("v1.0.4", "v2.12", "– v3.7", ", v1.13.3")
 * - Strips scene / repack tags ("[FitGirl Repack]", "[SteamRIP]", "DODI", "Repack")
 * - PRESERVES game editions ("Definitive Edition", "Deluxe Edition", "GOTY", "Remastered", etc.)
 */
export function cleanGameTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  let clean = rawTitle;

  // 1. Remove bracketed / parenthesized repack tags
  clean = clean.replace(
    /\[(?:FitGirl|SteamRIP|DODI|ElAmigos|CODEX|RUNE|TENOKE|SKIDROW|FLT|Repack|Portable|P2P|Multi\d*|Razor1911|GOG).*?\]/gi,
    "",
  );
  clean = clean.replace(
    /\((?:FitGirl|SteamRIP|DODI|ElAmigos|CODEX|RUNE|TENOKE|SKIDROW|FLT|Repack|Portable|P2P|Multi\d*|Razor1911|GOG|Denuvoless).*?\)/gi,
    "",
  );

  // 2. Remove parenthesized/bracketed versions, builds, updates, revisions e.g. (v2.0.1.0), (Build 1234), (Rev.14804)
  clean = clean.replace(
    /\s*\(\s*(?:v|ver\.?|build|update|rev\.?|patch)\b[^)]*\)/gi,
    "",
  );
  clean = clean.replace(
    /\s*\[\s*(?:v|ver\.?|build|update|rev\.?|patch)\b[^\]]*\]/gi,
    "",
  );

  // 3. Remove DLC tags (+ 5 DLCs, + All DLCs, + DLC, + Bonus Content, Incl. DLC)
  clean = clean.replace(
    /\+\s*(?:All\s*)?\d*\s*(?:Bonus\s*)?DLCs?\b[^\n,]*/gi,
    "",
  );
  clean = clean.replace(
    /\+\s*(?:Bonus|Soundtrack|Artbook|OST|Content|Wallpaper|Emus?|Fix|Crack|Pack)[^\n,]*/gi,
    "",
  );
  clean = clean.replace(/\+\s*[A-Za-z0-9\s/]+(?:Emus?|DLCs?|Fix)[^\n,]*/gi, "");
  clean = clean.replace(
    /\b(?:Incl\.?|Includes?|With)\s*(?:All\s*)?(?:\d+\s*)?DLCs?\b/gi,
    "",
  );
  clean = clean.replace(/\+\s*All\s*Expansions?\b/gi, "");

  // 4. Remove build numbers with preceding comma, dash or whitespace (, Build 24657362, - Build 123)
  clean = clean.replace(/[,–—\-]?\s*\bBuild[\s#.:_-]*\d+\b/gi, "");

  // 5. Remove version tags (, v1.0.4, - v2.12, , v2024.03.15, - v.0210429.72w-cb)
  clean = clean.replace(/[,–—\-]\s*\b(?:v|ver\.?)\s*\d+[a-z0-9._-]*/gi, "");
  clean = clean.replace(/\b(?:v|ver\.?)\s*\d+(?:\.\d+)+[a-z0-9._-]*/gi, "");

  // 6. Remove update / hotfix / patch numbers (, Update 12, - Hotfix 3)
  clean = clean.replace(/[,–—\-]?\s*\b(?:Update|Hotfix|Patch)\s*#?\d+\b/gi, "");

  // 7. Remove standalone repack / source tags
  clean = clean.replace(
    /\b(?:FitGirl Repack|SteamRIP|DODI Repack|ElAmigos|Repack|Free Download)\b/gi,
    "",
  );

  // 8. Remove empty / orphan parentheses, brackets, and braces
  clean = clean.replace(/\(\s*\)/g, "");
  clean = clean.replace(/\[\s*\]/g, "");
  clean = clean.replace(/\{\s*\}/g, "");

  // 9. Remove any trailing or leading dangling brackets, commas, pluses, dashes, slashes, or colons
  clean = clean.replace(/[,\-+–—:/\\|(\[{]+\s*$/g, "").trim();
  clean = clean.replace(/^[,\-+–—:/\\|)}\]]+\s*/g, "").trim();
  clean = clean.replace(/\(\s*\)/g, "").replace(/\[\s*\]/g, "");
  clean = clean.replace(/\s+/g, " ");

  return clean.trim() || rawTitle.trim();
}

export function cleanTitleForIgdb(rawTitle: string): string {
  return cleanGameTitle(rawTitle);
}

/**
 * Perform live API query to IGDB endpoint via @tauri-apps/plugin-http (bypasses browser CORS)
 */
export async function searchIgdbMetadata(
  titleQuery: string,
): Promise<IgdbGameMetadata[]> {
  const cleaned = cleanTitleForIgdb(titleQuery);
  const cleanQuery = cleaned.replace(/["\\]/g, "").trim();
  if (!cleanQuery) {
    return [];
  }

  const cacheKey = cleanQuery.toLowerCase();
  if (igdbMemoryCache.has(cacheKey)) {
    return igdbMemoryCache.get(cacheKey)!;
  }

  const isNumericId = /^\d+$/.test(cleanQuery);
  const bodyQuery = isNumericId
    ? `where id = ${cleanQuery}; fields name, summary, storyline, rating, first_release_date, cover.image_id, screenshots.image_id, artworks.image_id, videos.video_id, genres.name, involved_companies.company.name, involved_companies.developer; limit 1;`
    : `search "${cleanQuery}"; fields name, summary, storyline, rating, first_release_date, cover.image_id, screenshots.image_id, artworks.image_id, videos.video_id, genres.name, involved_companies.company.name, involved_companies.developer; limit 8;`;

  const { clientId } = getCredentials();
  const token = await getAccessToken();
  if (!token) {
    console.warn("No IGDB token available for query:", cleanQuery);
    return [];
  }

  try {
    const response = await httpFetch(IGDB_GAMES_URL, {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: bodyQuery,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`IGDB search error [${response.status}]: ${errText}`);
      return [];
    }

    const rawGames: RawIgdbGame[] = await response.json();
    const parsed = parseIgdbResponse(rawGames || []);
    igdbMemoryCache.set(cacheKey, parsed);
    return parsed;
  } catch (err) {
    console.error("IGDB search exception:", err);
    return [];
  }
}

async function fetchBestMetadata(
  gameTitle: string,
): Promise<IgdbGameMetadata | null> {
  const matches = await searchIgdbMetadata(gameTitle);
  return matches.length > 0 ? matches[0] : null;
}
