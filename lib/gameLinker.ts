import { Game } from "./types";
import { searchIgdbMetadata, cleanTitleForIgdb, cleanGameTitle } from "./igdb";
import {
  updateGameInStorage,
  loadRepacksPaginated,
  getStoredGames,
} from "./db";
import { RepackMirrorGroup, RepackPost } from "./repackTypes";

export { cleanGameTitle };

/**
 * Convert any RiotPixels image URL into its optimized 240p thumbnail URL for fast card/carousel loading.
 */
export function getRiotpixels240pUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/\.gif(?:\?.*)?$/i.test(url)) return url;
  if (!url.includes("riotpixels.net")) return url;

  let clean = url
    .trim()
    .replace(/^http:\/\//i, "https://")
    .replace(/riotpixels\.net\/data\.s\//gi, "riotpixels.net/data/");

  if (!clean.endsWith(".240p.jpg")) {
    if (/\.png\.jpg$/i.test(clean)) {
      return clean.replace(/\.png\.jpg$/i, ".png.240p.jpg");
    } else if (/\.jpg\.jpg$/i.test(clean)) {
      return clean.replace(/\.jpg\.jpg$/i, ".jpg.240p.jpg");
    } else if (/\.png$/i.test(clean)) {
      return clean.replace(/\.png$/i, ".png.240p.jpg");
    } else if (/\.jpg$/i.test(clean)) {
      return clean.replace(/\.jpg$/i, ".jpg.240p.jpg");
    } else {
      return `${clean}.jpg.240p.jpg`;
    }
  } else if (
    clean.endsWith(".240p.jpg") &&
    !clean.endsWith(".png.240p.jpg") &&
    !clean.endsWith(".jpg.240p.jpg")
  ) {
    return clean.replace(/\.240p\.jpg$/i, ".jpg.240p.jpg");
  }
  return clean;
}

/**
 * Convert any RiotPixels thumbnail URL (with .240p.jpg or .png.jpg) into its high-resolution original image URL for modal / lightbox viewing.
 */
export function getRiotpixelsFullResUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/\.gif(?:\?.*)?$/i.test(url)) return url;
  if (!url.includes("riotpixels.net")) return url;

  let clean = url
    .trim()
    .replace(/^http:\/\//i, "https://")
    .replace(/riotpixels\.net\/data\.s\//gi, "riotpixels.net/data/");

  if (/\.png\.240p\.jpg$/i.test(clean)) {
    return clean.replace(/\.png\.240p\.jpg$/i, ".png");
  }
  if (/\.jpg\.240p\.jpg$/i.test(clean)) {
    return clean.replace(/\.jpg\.240p\.jpg$/i, ".jpg");
  }
  if (/\.240p\.jpg$/i.test(clean)) {
    return clean.replace(/\.240p\.jpg$/i, ".jpg");
  }
  if (/\.png\.jpg$/i.test(clean)) {
    return clean.replace(/\.png\.jpg$/i, ".png");
  }
  if (/\.jpg\.jpg$/i.test(clean)) {
    return clean.replace(/\.jpg\.jpg$/i, ".jpg");
  }
  return clean;
}

export interface LinkResults {
  igdbSuccess: boolean;
  fitgirlSuccess: boolean;
  steamripSuccess: boolean;
  game: Game;
}

export interface SourceCandidate {
  id: string;
  source: "igdb" | "fitgirl" | "steamrip";
  title: string;
  coverUrl?: string;
  version?: string;
  repackSize?: string;
  uploadDate?: string;
  url?: string;
  genres?: string[];
  rating?: number;
  releaseYear?: number;
  releaseDate?: string;
  developer?: string;
  summary?: string;
  magnetCount?: number;
  directLinkCount?: number;
  rawItem: any;
}

/**
 * Clean game title for searching (removes build/DLCs/repack tags, keeps editions)
 */
export function cleanSearchTitle(rawTitle: string): string {
  return cleanGameTitle(rawTitle);
}

/**
 * Extract version string from title/description (e.g. "v1.0.12", "Build 24657362", "v2.12", "v6.66 Rev 2.1")
 */
export function extractGameVersion(
  title: string,
  description?: string,
): string | undefined {
  if (!title && !description) return undefined;
  const target = `${title || ""} ${description || ""}`;

  // 1. Version + Build combo e.g. "v1.0.12, Build 8813492" or "1.0.0.0 (Build 4838612)"
  const comboMatch = target.match(
    /\b((?:v|ver\.?)?\s*\d+(?:\.\d+)+(?:[a-z0-9_.]*)?(?:\s*,\s*|\s*\/\s*|\s*\(\s*|\s*-\s*)(?:Update\s*\d+\s*)?(?:Build\s*#?\d+)\)?)\b/i,
  );
  if (comboMatch) {
    return comboMatch[0].replace(/[()]/g, "").trim();
  }

  // 2. Build string e.g. "Build 24657362", "Build.12345", "Build 4838612"
  const buildMatch = target.match(/\bBuild[\s#.:_-]*\d+\b/i);

  // 3. Explicit version string e.g. "v2.12", "v1.0.4", "v2024.03.15", "v1.13.3", "v3.7", "v6.66"
  const stdMatch = target.match(
    /\b(?:v|ver\.?)\s*\d+(?:\.\d+)*[a-z0-9._-]*\b/i,
  );

  // 4. Update string e.g. "Update 13", "Update 6.66", "Update 2"
  const updateMatch = target.match(/\bUpdate\s*#?\d+(?:\.\d+)*\b/i);

  // 5. Bare semantic version e.g. "1.0.0.0" or "6.66"
  const bareVersionMatch = title ? title.match(/\b\d+\.\d+(?:\.\d+)+\b/) : null;

  if (stdMatch && buildMatch) {
    return `${stdMatch[0]} (${buildMatch[0]})`;
  }
  if (updateMatch && buildMatch) {
    return `${updateMatch[0]} (${buildMatch[0]})`;
  }
  if (bareVersionMatch && buildMatch) {
    return `v${bareVersionMatch[0]} (${buildMatch[0]})`;
  }
  if (buildMatch) {
    return buildMatch[0];
  }
  if (stdMatch) {
    return stdMatch[0];
  }
  if (updateMatch) {
    return updateMatch[0];
  }
  if (bareVersionMatch) {
    return `v${bareVersionMatch[0]}`;
  }

  return undefined;
}

/**
 * Search candidates across IGDB, FitGirl, or SteamRIP
 */
export async function searchSourceCandidates(
  query: string,
  source: "all" | "igdb" | "fitgirl" | "steamrip" = "all",
): Promise<SourceCandidate[]> {
  const cleanQ = (cleanSearchTitle(query) || query).trim();
  if (!cleanQ) return [];

  const results: SourceCandidate[] = [];

  // 1. IGDB
  if (source === "all" || source === "igdb") {
    try {
      const igdbMatches = await searchIgdbMetadata(cleanQ);
      for (const m of igdbMatches) {
        results.push({
          id: `igdb-${m.id}`,
          source: "igdb",
          title: m.name,
          coverUrl: m.coverUrl,
          rating: m.rating,
          releaseYear: m.releaseYear,
          releaseDate: m.releaseDate,
          genres: m.genres,
          developer: m.developer,
          summary: m.summary,
          rawItem: m,
        });
      }
    } catch {
      // ignore
    }
  }

  // 2. FitGirl
  if (source === "all" || source === "fitgirl") {
    try {
      const fgMatches = await loadRepacksPaginated({
        searchQuery: cleanQ,
        dataSource: "fitgirl",
        perPage: 6,
      });
      for (const item of fgMatches.items) {
        const magnets = extractMagnetLinks(item.mirrorGroups);
        const directs = extractDirectDownloadLinks(item.mirrorGroups);
        const version = extractGameVersion(item.title, item.description);
        results.push({
          id: `fg-${item.id}`,
          source: "fitgirl",
          title: item.title,
          coverUrl: item.coverUrl,
          repackSize: item.repackSize,
          uploadDate: item.date,
          url: item.url,
          genres: item.genres,
          version,
          magnetCount: magnets.length,
          directLinkCount: directs.length,
          rawItem: item,
        });
      }
    } catch {
      // ignore
    }
  }

  // 3. SteamRIP
  if (source === "all" || source === "steamrip") {
    try {
      const srMatches = await loadRepacksPaginated({
        searchQuery: cleanQ,
        dataSource: "steamrip",
        perPage: 6,
      });
      for (const item of srMatches.items) {
        const magnets = extractMagnetLinks(item.mirrorGroups);
        const directs = extractDirectDownloadLinks(item.mirrorGroups);
        const version = extractGameVersion(item.title, item.description);
        results.push({
          id: `sr-${item.id}`,
          source: "steamrip",
          title: item.title,
          coverUrl: item.coverUrl,
          repackSize: item.repackSize,
          uploadDate: item.date,
          url: item.url,
          genres: item.genres,
          version,
          magnetCount: magnets.length,
          directLinkCount: directs.length,
          rawItem: item,
        });
      }
    } catch {
      // ignore
    }
  }

  return results;
}

/**
 * Extract numeric build or semver sequence from a version string
 */
function parseVersionTokens(ver: string): { build?: number; semver: number[] } {
  const clean = ver.trim();
  let build: number | undefined;

  // Look for Build 12345 or Build.12345
  const bMatch = clean.match(/\bBuild[\s#.:_-]*(\d+)\b/i);
  if (bMatch) {
    build = parseInt(bMatch[1], 10);
  }

  // Look for semver digits e.g. 1.0.4.7534 or v2.12
  const vMatch = clean.match(/\b\d+(?:\.\d+)+\b/);
  const semver: number[] = [];
  if (vMatch) {
    const parts = vMatch[0].split(".");
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (!isNaN(n)) semver.push(n);
    }
  }

  return { build, semver };
}

/**
 * Compares two version strings:
 * > 0 if verA > verB
 * < 0 if verA < verB
 * 0 if equal
 */
function compareTwoVersions(verA?: string, verB?: string): number {
  if (!verA && !verB) return 0;
  if (verA && !verB) return 1;
  if (!verA && verB) return -1;
  if (verA!.trim().toLowerCase() === verB!.trim().toLowerCase()) return 0;

  const tA = parseVersionTokens(verA!);
  const tB = parseVersionTokens(verB!);

  // Compare build numbers
  if (tA.build !== undefined && tB.build !== undefined) {
    if (tA.build > tB.build) return 1;
    if (tA.build < tB.build) return -1;
    return 0;
  }

  // Compare semver
  if (tA.semver.length > 0 && tB.semver.length > 0) {
    const maxLen = Math.max(tA.semver.length, tB.semver.length);
    for (let i = 0; i < maxLen; i++) {
      const a = tA.semver[i] || 0;
      const b = tB.semver[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  return 0;
}

/**
 * Safe date parser for FitGirl and SteamRIP date formats (e.g. "August 10, 2024", "2024-08-10", "10.08.2024", etc.)
 */
export function parseReleaseDate(rawDate?: string): number | null {
  if (!rawDate) return null;
  const clean = rawDate.trim();
  if (!clean) return null;

  const parsed = Date.parse(clean);
  if (!isNaN(parsed)) return parsed;

  // Try parsing DD.MM.YYYY
  const partsDot = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (partsDot) {
    const d = new Date(
      parseInt(partsDot[3], 10),
      parseInt(partsDot[2], 10) - 1,
      parseInt(partsDot[1], 10),
    );
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // Try parsing YYYY.MM.DD or YYYY/MM/DD
  const partsYear = clean.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (partsYear) {
    const d = new Date(
      parseInt(partsYear[1], 10),
      parseInt(partsYear[2], 10) - 1,
      parseInt(partsYear[3], 10),
    );
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return null;
}

/**
 * Compare two source releases considering version strings and release upload dates.
 * If version formats mismatch (e.g. semver v6.66 vs Build 22500424) or version comparison is tied,
 * the newer upload date determines the latest release.
 */
export function compareReleaseSources(
  sourceA: { version?: string; date?: string },
  sourceB: { version?: string; date?: string },
): number {
  const verCmp = compareTwoVersions(sourceA.version, sourceB.version);

  const tA = sourceA.version ? parseVersionTokens(sourceA.version) : null;
  const tB = sourceB.version ? parseVersionTokens(sourceB.version) : null;

  const sameFormat = Boolean(
    (tA?.build !== undefined && tB?.build !== undefined) ||
    (tA?.semver && tA.semver.length > 0 && tB?.semver && tB.semver.length > 0),
  );

  // If both have the same format and clear winner, use version
  if (sameFormat && verCmp !== 0) {
    return verCmp;
  }

  // Otherwise, use release dates
  const dateA = parseReleaseDate(sourceA.date);
  const dateB = parseReleaseDate(sourceB.date);

  if (dateA !== null && dateB !== null) {
    if (dateA > dateB) return 1;
    if (dateA < dateB) return -1;
  } else if (dateA !== null && dateB === null) {
    return 1;
  } else if (dateA === null && dateB !== null) {
    return -1;
  }

  return verCmp;
}

/**
 * Returns true if targetVer is >= all other valid version strings in the list
 */
export function isHighestVersion(
  targetVer?: string,
  otherVersions: (string | undefined)[] = [],
): boolean {
  if (!targetVer) return false;
  const validOthers = otherVersions.filter((v): v is string =>
    Boolean(v && v.trim()),
  );
  if (validOthers.length === 0) return true;

  for (const other of validOthers) {
    const cmp = compareTwoVersions(targetVer, other);
    if (cmp < 0) return false;
  }
  return true;
}

/**
 * Returns true if remoteVersion is strictly newer than installedVersion
 */
export function isNewerVersion(
  installedVersion?: string,
  remoteVersion?: string,
): boolean {
  return compareTwoVersions(remoteVersion, installedVersion) > 0;
}

/**
 * Apply a chosen candidate match onto a Game
 */
export function applyCandidateMatch(
  game: Game,
  candidate: SourceCandidate,
): Game {
  const hasHypervisorTag = Boolean(
    candidate.rawItem?.isHypervisor ||
    game.isHypervisor ||
    game.tags?.includes("Hypervisor"),
  );

  if (candidate.source === "igdb") {
    const top = candidate.rawItem;
    const mergedGenres = top.genres?.length ? top.genres : game.genres;
    const finalGenres =
      hasHypervisorTag && mergedGenres && !mergedGenres.includes("Hypervisor")
        ? [...mergedGenres, "Hypervisor"]
        : mergedGenres;
    const finalTags = Array.from(
      new Set([
        ...(game.tags || []),
        ...(hasHypervisorTag ? ["Hypervisor"] : []),
        "IGDB",
      ]),
    );

    const updated: Game = {
      ...game,
      igdbId: top.id,
      summary: top.summary || game.summary,
      storyline: top.storyline || game.storyline,
      coverUrl: top.coverUrl || game.coverUrl,
      bannerUrl: top.bannerUrl || game.bannerUrl,
      screenshots: top.screenshots?.length ? top.screenshots : game.screenshots,
      videos: top.videos?.length ? top.videos : game.videos,
      genres: finalGenres,
      tags: finalTags,
      rating: top.rating ?? game.rating,
      releaseYear: top.releaseYear ?? game.releaseYear,
      releaseDate: top.releaseDate ?? game.releaseDate,
      developer: top.developer || game.developer,
    };
    updateGameInStorage(updated);
    return updated;
  }

  const match: RepackPost = candidate.rawItem;
  const existingMirrors: RepackMirrorGroup[] = game.mirrorGroups || [];
  const newMirrors = match.mirrorGroups || [];

  const mergedMirrors = [...existingMirrors];
  for (const group of newMirrors) {
    const found = mergedMirrors.find((m) => m.category === group.category);
    if (!found) {
      mergedMirrors.push(group);
    }
  }

  const existingUpdates = game.gameUpdates || [];
  const newUpdates = match.gameUpdates || [];
  const mergedUpdates = [...existingUpdates];
  for (const u of newUpdates) {
    if (!mergedUpdates.some((x) => x.url === u.url)) {
      mergedUpdates.push(u);
    }
  }

  const detectedVersion =
    candidate.version || extractGameVersion(match.title, match.description);

  const mergedGenres = game.genres || match.genres;
  const finalGenres =
    hasHypervisorTag && mergedGenres && !mergedGenres.includes("Hypervisor")
      ? [...mergedGenres, "Hypervisor"]
      : mergedGenres;

  const finalTags = Array.from(
    new Set([
      ...(game.tags || []),
      ...(hasHypervisorTag ? ["Hypervisor"] : []),
      candidate.source === "fitgirl" ? "FitGirl" : "SteamRIP",
    ]),
  );

  const updated: Game = {
    ...game,
    mirrorGroups: mergedMirrors.length > 0 ? mergedMirrors : undefined,
    gameUpdates: mergedUpdates.length > 0 ? mergedUpdates : undefined,
    repackSize: match.repackSize || game.repackSize,
    repackUrl: match.url || game.repackUrl,
    fitgirlVersion:
      candidate.source === "fitgirl"
        ? detectedVersion || game.fitgirlVersion
        : game.fitgirlVersion,
    steamripVersion:
      candidate.source === "steamrip"
        ? detectedVersion || game.steamripVersion
        : game.steamripVersion,
    fitgirlUploadDate:
      candidate.source === "fitgirl"
        ? match.date || candidate.uploadDate || game.fitgirlUploadDate
        : game.fitgirlUploadDate,
    steamripUploadDate:
      candidate.source === "steamrip"
        ? match.date || candidate.uploadDate || game.steamripUploadDate
        : game.steamripUploadDate,
    linkedFitgirlUrl:
      candidate.source === "fitgirl" ? match.url : game.linkedFitgirlUrl,
    linkedSteamripUrl:
      candidate.source === "steamrip" ? match.url : game.linkedSteamripUrl,
    coverUrl: game.coverUrl || match.coverUrl,
    screenshots: game.screenshots?.length
      ? game.screenshots
      : match.screenshots,
    videos: game.videos?.length ? game.videos : match.videos,
    genres: finalGenres,
    tags: finalTags,
  };

  updateGameInStorage(updated);
  return updated;
}

/**
 * Link a game to IGDB metadata
 */
export async function linkGameToIgdb(
  game: Game,
  customQuery?: string,
): Promise<{ success: boolean; game: Game }> {
  const query = (
    customQuery ||
    cleanSearchTitle(game.title) ||
    game.title
  ).trim();
  try {
    const matches = await searchIgdbMetadata(query);
    if (matches && matches.length > 0) {
      const top = matches[0];
      const hasHypervisorTag = Boolean(
        game.isHypervisor ||
        game.tags?.includes("Hypervisor"),
      );
      const mergedGenres = top.genres?.length ? top.genres : game.genres;
      const finalGenres =
        hasHypervisorTag && mergedGenres && !mergedGenres.includes("Hypervisor")
          ? [...mergedGenres, "Hypervisor"]
          : mergedGenres;
      const finalTags = Array.from(
        new Set([
          ...(game.tags || []),
          ...(hasHypervisorTag ? ["Hypervisor"] : []),
          "IGDB",
        ]),
      );

      const updated: Game = {
        ...game,
        igdbId: top.id,
        summary: top.summary || game.summary,
        storyline: top.storyline || game.storyline,
        coverUrl: top.coverUrl || game.coverUrl,
        bannerUrl: top.bannerUrl || game.bannerUrl,
        screenshots: top.screenshots?.length
          ? top.screenshots
          : game.screenshots,
        videos: top.videos?.length ? top.videos : game.videos,
        genres: finalGenres,
        tags: finalTags,
        rating: top.rating ?? game.rating,
        releaseYear: top.releaseYear ?? game.releaseYear,
        releaseDate: top.releaseDate ?? game.releaseDate,
        developer: top.developer || game.developer,
      };
      updateGameInStorage(updated);
      return { success: true, game: updated };
    }
  } catch (err) {
    console.error("Error linking game to IGDB:", err);
  }
  return { success: false, game };
}

/**
 * Link a game to FitGirl repacks (attaches torrent magnets, direct links, version & updates)
 */
export async function linkGameToFitGirl(
  game: Game,
  customQuery?: string,
): Promise<{ success: boolean; game: Game }> {
  const query = (
    customQuery ||
    cleanSearchTitle(game.title) ||
    game.title
  ).trim();
  try {
    const res = await loadRepacksPaginated({
      searchQuery: query,
      dataSource: "fitgirl",
      perPage: 5,
    });
    if (res && res.items.length > 0) {
      const match = res.items[0];
      const version = extractGameVersion(match.title, match.description);
      const existingMirrors: RepackMirrorGroup[] = game.mirrorGroups || [];
      const newMirrors = match.mirrorGroups || [];

      const mergedMirrors = [...existingMirrors];
      for (const group of newMirrors) {
        const idx = mergedMirrors.findIndex(
          (m) => m.category === group.category,
        );
        if (idx >= 0) {
          mergedMirrors[idx] = group;
        } else {
          mergedMirrors.push(group);
        }
      }

      const existingUpdates = game.gameUpdates || [];
      const newUpdates = match.gameUpdates || [];
      const mergedUpdates = [...existingUpdates];
      for (const u of newUpdates) {
        const idx = mergedUpdates.findIndex((x) => x.url === u.url);
        if (idx >= 0) {
          mergedUpdates[idx] = u;
        } else {
          mergedUpdates.push(u);
        }
      }

      const hasHypervisorTag = Boolean(
        match.isHypervisor ||
        game.isHypervisor ||
        game.tags?.includes("Hypervisor"),
      );
      const mergedGenres = game.genres || match.genres;
      const finalGenres =
        hasHypervisorTag && mergedGenres && !mergedGenres.includes("Hypervisor")
          ? [...mergedGenres, "Hypervisor"]
          : mergedGenres;
      const finalTags = Array.from(
        new Set([
          ...(game.tags || []),
          ...(hasHypervisorTag ? ["Hypervisor"] : []),
          "FitGirl",
        ]),
      );

      const updated: Game = {
        ...game,
        mirrorGroups: mergedMirrors.length > 0 ? mergedMirrors : undefined,
        gameUpdates: mergedUpdates.length > 0 ? mergedUpdates : undefined,
        repackSize: match.repackSize || game.repackSize,
        repackUrl: match.url || game.repackUrl,
        fitgirlVersion: version || game.fitgirlVersion,
        fitgirlUploadDate: match.date || game.fitgirlUploadDate,
        linkedFitgirlUrl: match.url,
        coverUrl: game.coverUrl || match.coverUrl,
        screenshots: game.screenshots?.length
          ? game.screenshots
          : match.screenshots,
        videos: game.videos?.length ? game.videos : match.videos,
        genres: finalGenres,
        tags: finalTags,
      };
      updateGameInStorage(updated);
      return { success: true, game: updated };
    }
  } catch (err) {
    console.error("Error linking game to FitGirl:", err);
  }
  return { success: false, game };
}

/**
 * Link a game to SteamRIP (attaches direct download mirrors, version & updates)
 */
export async function linkGameToSteamRIP(
  game: Game,
  customQuery?: string,
): Promise<{ success: boolean; game: Game }> {
  const query = (
    customQuery ||
    cleanSearchTitle(game.title) ||
    game.title
  ).trim();
  try {
    const res = await loadRepacksPaginated({
      searchQuery: query,
      dataSource: "steamrip",
      perPage: 5,
    });
    if (res && res.items.length > 0) {
      const match = res.items[0];
      const version = extractGameVersion(match.title, match.description);
      const existingMirrors: RepackMirrorGroup[] = game.mirrorGroups || [];
      const newMirrors = match.mirrorGroups || [];

      const mergedMirrors = [...existingMirrors];
      for (const group of newMirrors) {
        const idx = mergedMirrors.findIndex(
          (m) => m.category === group.category,
        );
        if (idx >= 0) {
          mergedMirrors[idx] = group;
        } else {
          mergedMirrors.push(group);
        }
      }

      const existingUpdates = game.gameUpdates || [];
      const newUpdates = match.gameUpdates || [];
      const mergedUpdates = [...existingUpdates];
      for (const u of newUpdates) {
        const idx = mergedUpdates.findIndex((x) => x.url === u.url);
        if (idx >= 0) {
          mergedUpdates[idx] = u;
        } else {
          mergedUpdates.push(u);
        }
      }

      const hasHypervisorTag = Boolean(
        match.isHypervisor ||
        game.isHypervisor ||
        game.tags?.includes("Hypervisor"),
      );
      const mergedGenres = game.genres || match.genres;
      const finalGenres =
        hasHypervisorTag && mergedGenres && !mergedGenres.includes("Hypervisor")
          ? [...mergedGenres, "Hypervisor"]
          : mergedGenres;
      const finalTags = Array.from(
        new Set([
          ...(game.tags || []),
          ...(hasHypervisorTag ? ["Hypervisor"] : []),
          "SteamRIP",
        ]),
      );

      const updated: Game = {
        ...game,
        mirrorGroups: mergedMirrors.length > 0 ? mergedMirrors : undefined,
        gameUpdates: mergedUpdates.length > 0 ? mergedUpdates : undefined,
        repackSize: match.repackSize || game.repackSize,
        repackUrl: match.url || game.repackUrl,
        steamripVersion: version || game.steamripVersion,
        steamripUploadDate: match.date || game.steamripUploadDate,
        linkedSteamripUrl: match.url,
        coverUrl: game.coverUrl || match.coverUrl,
        genres: finalGenres,
        tags: finalTags,
      };
      updateGameInStorage(updated);
      return { success: true, game: updated };
    }
  } catch (err) {
    console.error("Error linking game to SteamRIP:", err);
  }
  return { success: false, game };
}

/**
 * Link a game to IGDB, FitGirl, and SteamRIP all at once
 */
export async function linkGameToAllSources(
  game: Game,
  customQuery?: string,
): Promise<LinkResults> {
  const [igdbRes, fitgirlRes, steamripRes] = await Promise.allSettled([
    linkGameToIgdb(game, customQuery),
    linkGameToFitGirl(game, customQuery),
    linkGameToSteamRIP(game, customQuery),
  ]);

  let current = { ...game };
  let igdbSuccess = false;
  let fitgirlSuccess = false;
  let steamripSuccess = false;

  if (igdbRes.status === "fulfilled" && igdbRes.value.success) {
    current = { ...current, ...igdbRes.value.game };
    igdbSuccess = true;
  }
  if (fitgirlRes.status === "fulfilled" && fitgirlRes.value.success) {
    current = { ...current, ...fitgirlRes.value.game };
    fitgirlSuccess = true;
  }
  if (steamripRes.status === "fulfilled" && steamripRes.value.success) {
    current = { ...current, ...steamripRes.value.game };
    steamripSuccess = true;
  }

  return {
    igdbSuccess,
    fitgirlSuccess,
    steamripSuccess,
    game: current,
  };
}

/**
 * Extract magnet torrent URLs from mirror groups
 */
export function extractMagnetLinks(
  mirrorGroups?: RepackMirrorGroup[],
): { name: string; url: string; groupName: string }[] {
  if (!mirrorGroups || mirrorGroups.length === 0) return [];
  const magnets: { name: string; url: string; groupName: string }[] = [];

  for (const group of mirrorGroups) {
    if (!group.links) continue;
    for (const link of group.links) {
      if (link.url && link.url.startsWith("magnet:")) {
        magnets.push({
          name: link.name || "Torrent Magnet",
          url: link.url,
          groupName: group.category || "Torrents",
        });
      }
    }
  }
  return magnets;
}

/**
 * Extract direct download links from mirror groups
 */
export function extractDirectDownloadLinks(
  mirrorGroups?: RepackMirrorGroup[],
): { name: string; url: string; groupName: string }[] {
  if (!mirrorGroups || mirrorGroups.length === 0) return [];
  const directs: { name: string; url: string; groupName: string }[] = [];

  for (const group of mirrorGroups) {
    if (!group.links) continue;
    for (const link of group.links) {
      if (link.url && !link.url.startsWith("magnet:")) {
        directs.push({
          name: link.name || "Download Link",
          url: link.url,
          groupName: group.category || "Direct Mirrors",
        });
      }
    }
  }
  return directs;
}

/**
 * Automatically sync library games with their latest repack posts from AlsaBase (e.g. on app startup)
 */
export async function syncLibraryGamesWithLatestRepacks(force = false): Promise<void> {
  try {
    if (typeof window === "undefined") return;

    const lastSyncKey = "fitrepacks_last_library_repacks_sync";
    const lastSync = localStorage.getItem(lastSyncKey);
    const now = Date.now();
    // Throttle automatic background library sync to once every 24 hours
    if (!force && lastSync && now - parseInt(lastSync, 10) < 24 * 60 * 60 * 1000) {
      return;
    }

    const games = getStoredGames();
    if (!games || games.length === 0) return;

    // Process only unlinked games or games without mirrors (max 10 at startup)
    const candidateGames = games
      .filter(
        (g) =>
          !g.mirrorGroups ||
          g.mirrorGroups.length === 0 ||
          (!g.linkedFitgirlUrl && !g.linkedSteamripUrl),
      )
      .slice(0, 10);

    localStorage.setItem(lastSyncKey, String(now));

    if (candidateGames.length === 0) return;

    let updatedCount = 0;
    for (const g of candidateGames) {
      const source = (g.source || "").toLowerCase();
      const isFitgirlLinked =
        Boolean(g.linkedFitgirlUrl) ||
        source.includes("fitgirl") ||
        g.tags?.includes("FitGirl");
      const isSteamripLinked =
        Boolean(g.linkedSteamripUrl) ||
        source.includes("steamrip") ||
        g.tags?.includes("SteamRIP");

      if (isFitgirlLinked || (!g.linkedFitgirlUrl && !g.linkedSteamripUrl)) {
        await linkGameToFitGirl(g).catch(() => {});
        updatedCount++;
      }
      if (isSteamripLinked) {
        await linkGameToSteamRIP(g).catch(() => {});
        updatedCount++;
      }
    }

    if (updatedCount > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("fitrepacks-games-updated"));
    }
  } catch (err) {
    console.warn("Failed to sync library games with latest repacks:", err);
  }
}
