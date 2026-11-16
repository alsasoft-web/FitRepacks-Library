import type { RepackPost, RepackMirrorGroup } from "./repackTypes";

const RECOMP_CATALOG_URL = "https://recomplauncher.com/pc-catalog.json";
const RECOMP_CACHE_KEY = "recomp_catalog_cache_v4";
const RECOMP_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function toRecompThumbUrl(url?: string): string {
  if (!url) return "";
  const prefix = "https://recompstore.com/media/";
  if (url.startsWith(prefix)) {
    const file = url.slice(prefix.length).split("?")[0];
    if (file && !file.includes("/")) {
      return `https://recompstore.com/api/thumb.php?f=${encodeURIComponent(file)}&w=400`;
    }
  }
  return url;
}

interface RecompRawApp {
  id: string;
  name?: string;
  game?: string;
  origin?: string;
  repo?: string;
  version?: string;
  tag?: string;
  released?: string;
  added?: string;
  first?: string;
  size?: string;
  blurb?: string;
  description?: string;
  needs?: string;
  author?: string;
  icon?: string;
  cover?: string;
  hero?: string;
  logo?: string;
  tags?: string[];
  features?: string[];
  license?: string;
  genre?: string;
  media?: unknown[];
  files?: Record<string, { name?: string; sha256?: string }>;
  about?: {
    developer?: string;
    publisher?: string;
    genres?: string[];
    summary?: string;
    released?: string;
  };
}

let inMemoryPosts: RepackPost[] | null = null;
let inMemoryFetchedAt = 0;
let inFlightFetch: Promise<RepackPost[]> | null = null;

function resolveRepoUrl(repo?: string): string {
  if (!repo) return "https://recomplauncher.com/";
  const trimmed = repo.trim();
  if (trimmed.startsWith("gitlab:")) {
    return `https://gitlab.com/${trimmed.slice("gitlab:".length)}`;
  }
  if (trimmed.startsWith("sourceforge:")) {
    return `https://sourceforge.net/projects/${trimmed.slice("sourceforge:".length)}`;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.includes("/")) {
    return `https://github.com/${trimmed}`;
  }
  return "https://recomplauncher.com/";
}

function titleCase(str: string): string {
  return str
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const ROMSFUN_CONSOLE_PATTERNS: Record<string, RegExp> = {
  n64: /\b(n64|nintendo 64)\b/i,
  ps1: /\b(ps1|psx|playstation \(ps\)|playstation)\b/i,
  psx: /\b(ps1|psx|playstation \(ps\)|playstation)\b/i,
  ps2: /\b(ps2|playstation 2)\b/i,
  psp: /\b(psp|playstation portable)\b/i,
  xbox360: /\b(xbox 360|x360)\b/i,
  xbox: /\bxbox\b/i,
  gc: /\b(gc|gamecube|ngc)\b/i,
  gamecube: /\b(gc|gamecube|ngc)\b/i,
  wii: /\bwii\b/i,
  dreamcast: /\b(dc|dreamcast)\b/i,
  saturn: /\bsaturn\b/i,
  gba: /\b(gba|game boy advance)\b/i,
  nds: /\b(nds|nintendo ds|ds)\b/i,
  snes: /\b(snes|super nintendo)\b/i,
  nes: /\bnes\b/i,
};

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function searchRomsFunArchive(
  gameName: string,
  origin?: string,
): Promise<{ name: string; url: string }[]> {
  const cleanQuery = gameName.replace(/\s+Recomp(iled)?$/i, "").trim();
  if (!cleanQuery) return [];

  const apiUrl = `https://romsfun.com/api/search?s=${encodeURIComponent(cleanQuery)}`;
  let items: Array<{ title?: string; url?: string; console?: string; size?: string }> = [];

  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { invoke } = await import("@tauri-apps/api/core");
      const resp = await invoke<{ status: number; body: string }>("fetch_http_url", {
        url: apiUrl,
        headers: { Accept: "application/json, text/plain, */*" },
      });
      if (resp.status >= 200 && resp.status < 300 && resp.body) {
        const parsed = JSON.parse(resp.body);
        if (Array.isArray(parsed)) items = parsed;
      }
    } else {
      const resp = await fetch(apiUrl, { headers: { Accept: "application/json" } });
      if (resp.ok) {
        const parsed = await resp.json();
        if (Array.isArray(parsed)) items = parsed;
      }
    }
  } catch (err) {
    console.warn("[RomsFun] search failed:", err);
  }

  if (items.length === 0) return [];

  const originKey = (origin || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const consolePattern = ROMSFUN_CONSOLE_PATTERNS[originKey];

  const valid = items.filter((it) => it && typeof it.url === "string" && it.url.startsWith("http"));
  const consoleMatches = consolePattern
    ? valid.filter((it) => consolePattern.test(it.console || ""))
    : [];
  const chosen = (consoleMatches.length > 0 ? consoleMatches : valid).slice(0, 4);

  return chosen.map((it) => {
    const cleanTitle = decodeHtmlEntities(it.title || cleanQuery);
    const meta = [it.console?.trim(), it.size?.trim()].filter(Boolean).join(" • ");
    return {
      name: meta ? `${cleanTitle} (${meta})` : cleanTitle,
      url: it.url!,
    };
  });
}

function buildRomArchiveLinks(app: RecompRawApp, fallbackTitle: string): { name: string; url: string }[] {
  const originKey = (app.origin || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (originKey === "pc" || originKey === "windows" || originKey === "dos") {
    return [];
  }

  const gameName = (app.game || fallbackTitle.replace(/\s+Recomp(iled)?$/i, "")).trim();
  const originLabel = app.origin ? app.origin.toUpperCase() : "ROM";

  return [
    {
      name: `Search RomsFun (${gameName} ${originLabel})`,
      url: `https://romsfun.com/?s=${encodeURIComponent(gameName)}`,
    },
  ];
}

function mapRecompAppToPost(app: RecompRawApp): RepackPost | null {
  if (!app || !app.id) return null;
  const id = `recomp-${app.id}`;
  const repoUrl = resolveRepoUrl(app.repo);
  const title = (app.name || app.game || app.id).trim();

  const genres: string[] =
    Array.isArray(app.about?.genres) && app.about.genres.length > 0
      ? app.about.genres.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
      : app.genre
        ? [titleCase(app.genre)]
        : [];

  const descParts: string[] = [];
  if (app.blurb) descParts.push(app.blurb.trim());
  const summary = app.about?.summary || app.description;
  if (summary && summary.trim() !== app.blurb?.trim()) {
    descParts.push(summary.trim());
  }
  if (app.needs) descParts.push(`Requires: ${app.needs.trim()}`);
  if (Array.isArray(app.features) && app.features.length > 0) {
    descParts.push(`Features:\n• ${app.features.join("\n• ")}`);
  }

  const screenshots: string[] = [];
  if (app.hero && typeof app.hero === "string") screenshots.push(app.hero);
  if (Array.isArray(app.media)) {
    for (const item of app.media) {
      if (typeof item === "string" && item.startsWith("http") && !screenshots.includes(item)) {
        screenshots.push(item);
      }
    }
  }

  const mirrorGroups: RepackMirrorGroup[] = [];
  const directLinks: { name: string; url: string }[] = [];

  const winFile = app.files?.windows?.name;
  if (winFile && app.tag && app.repo && !app.repo.includes(":")) {
    directLinks.push({
      name: `Windows (${winFile})`,
      url: `https://github.com/${app.repo}/releases/download/${encodeURIComponent(app.tag)}/${encodeURIComponent(winFile)}`,
    });
  }

  if (app.repo) {
    const releasesUrl = app.repo.startsWith("sourceforge:")
      ? `${repoUrl}/files/`
      : app.repo.startsWith("gitlab:")
        ? `${repoUrl}/-/releases`
        : `${repoUrl}/releases`;
    directLinks.push({
      name: app.version ? `Releases (${app.version})` : "Releases",
      url: releasesUrl,
    });
    directLinks.push({
      name: "Source Repository",
      url: repoUrl,
    });
  }

  if (directLinks.length > 0) {
    mirrorGroups.push({
      category: "Direct Links",
      links: directLinks,
    });
  }

  const romArchiveLinks = buildRomArchiveLinks(app, title);
  if (romArchiveLinks.length > 0) {
    mirrorGroups.push({
      category: "ROM / ISO Archive",
      links: romArchiveLinks,
    });
  }

  const date = app.released || app.added || app.first || "";

  return {
    id,
    title,
    url: repoUrl,
    coverUrl: toRecompThumbUrl(app.cover || app.hero || app.icon),
    repackSize: app.size || "",
    originalSize: app.origin ? String(app.origin).toUpperCase() : "",
    genres,
    companies: app.author || app.about?.developer || "Recomp",
    languages: app.license ? `License: ${app.license}` : "",
    description: descParts.join("\n\n"),
    screenshots,
    videos: [],
    mirrorGroups,
    gameUpdates: [],
    date,
    isRead: false,
    scrapedAt: app.added || date,
    source: "recomp",
  };
}

async function fetchRecompCatalogJson(): Promise<any> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const resp = await invoke<{ status: number; body: string }>("fetch_http_url", {
        url: RECOMP_CATALOG_URL,
        headers: { Accept: "application/json, text/plain, */*" },
      });
      if (resp.status >= 200 && resp.status < 300 && resp.body) {
        return JSON.parse(resp.body);
      }
    } catch (err) {
      console.warn("[RecompCatalog] fetch_http_url failed, trying fallback:", err);
    }

    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      const resp = await tauriFetch(RECOMP_CATALOG_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (resp.ok) {
        return await resp.json();
      }
    } catch (err) {
      console.warn("[RecompCatalog] tauriFetch failed, trying browser fetch:", err);
    }
  }

  const resp = await fetch(RECOMP_CATALOG_URL, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!resp.ok) {
    throw new Error(`Recomp catalog HTTP ${resp.status}`);
  }
  return await resp.json();
}

function loadFromLocalStorageCache(): { posts: RepackPost[]; fetchedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(RECOMP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.posts) && typeof parsed?.fetchedAt === "number") {
      return parsed;
    }
  } catch {
    // Ignore malformed cache
  }
  return null;
}

function saveToLocalStorageCache(posts: RepackPost[], fetchedAt: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RECOMP_CACHE_KEY, JSON.stringify({ posts, fetchedAt }));
  } catch {
    // Ignore storage quota errors
  }
}

export async function getRecompCatalogPosts(forceRefresh = false): Promise<RepackPost[]> {
  const now = Date.now();
  if (!forceRefresh && inMemoryPosts && now - inMemoryFetchedAt < RECOMP_CACHE_TTL_MS) {
    return inMemoryPosts;
  }

  if (!forceRefresh && !inMemoryPosts) {
    const disk = loadFromLocalStorageCache();
    if (disk && now - disk.fetchedAt < RECOMP_CACHE_TTL_MS) {
      inMemoryPosts = disk.posts;
      inMemoryFetchedAt = disk.fetchedAt;
      return disk.posts;
    }
  }

  if (inFlightFetch && !forceRefresh) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    try {
      const json = await fetchRecompCatalogJson();
      const apps: RecompRawApp[] = Array.isArray(json?.apps) ? json.apps : [];
      const posts = apps
        .map(mapRecompAppToPost)
        .filter((p): p is RepackPost => p !== null);

      const fetchedAt = Date.now();
      inMemoryPosts = posts;
      inMemoryFetchedAt = fetchedAt;
      saveToLocalStorageCache(posts, fetchedAt);
      return posts;
    } catch (err) {
      if (inMemoryPosts) return inMemoryPosts;
      const disk = loadFromLocalStorageCache();
      if (disk) {
        inMemoryPosts = disk.posts;
        inMemoryFetchedAt = disk.fetchedAt;
        return disk.posts;
      }
      throw err;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

export function clearRecompCatalogMemoryCache(): void {
  inMemoryPosts = null;
  inMemoryFetchedAt = 0;
}
