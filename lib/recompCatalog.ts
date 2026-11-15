import type { RepackPost, RepackMirrorGroup } from "./repackTypes";

const RECOMP_CATALOG_URL = "https://recomplauncher.com/pc-catalog.json";
const RECOMP_CACHE_KEY = "recomp_catalog_cache_v2";
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
