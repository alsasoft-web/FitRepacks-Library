import Database from "@tauri-apps/plugin-sql";
import { Game, PlaySession } from "./types";
import { RepackPost } from "./repackTypes";
import { extractGameVersion, cleanGameTitle } from "./gameLinker";
import { ab } from "./alsabase";
import {
  detectGameExeLastModified,
  isGameUpToDateByDate,
  parseDateSafe,
} from "./versionDetector";

let dbInstance: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;

/**
 * Get or initialize the SQLite database instance using @tauri-apps/plugin-sql
 */
async function getDatabase(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      const db = await Database.load("sqlite:library.db");

      await db.execute(`
        CREATE TABLE IF NOT EXISTS games (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          exe_path TEXT NOT NULL,
          working_dir TEXT,
          cover_url TEXT NOT NULL,
          banner_url TEXT,
          summary TEXT,
          storyline TEXT,
          screenshots TEXT,
          videos TEXT,
          genres TEXT,
          developer TEXT,
          publisher TEXT,
          release_year INTEGER,
          release_date TEXT,
          igdb_id INTEGER,
          rating REAL,
          hours_played REAL NOT NULL DEFAULT 0.0,
          minutes_played_total INTEGER NOT NULL DEFAULT 0,
          last_played_at TEXT,
          play_sessions TEXT,
          is_favorite INTEGER NOT NULL DEFAULT 0,
          is_wishlisted INTEGER NOT NULL DEFAULT 0,
          is_installed INTEGER NOT NULL DEFAULT 0,
          is_completed INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          added_at TEXT NOT NULL,
          tags TEXT,
          notes TEXT,
          version TEXT,
          installed_version TEXT,
          installed_last_modified TEXT,
          fitgirl_version TEXT,
          steamrip_version TEXT,
          fitgirl_upload_date TEXT,
          steamrip_upload_date TEXT,
          linked_fitgirl_url TEXT,
          linked_steamrip_url TEXT,
          repack_size TEXT,
          repack_url TEXT,
          source TEXT,
          mirror_groups TEXT,
          game_updates TEXT,
          has_update INTEGER DEFAULT 0,
          update_info TEXT,
          install_directory TEXT,
          ignored_update_date TEXT
        );
      `);

      // Auto-migrate columns only if missing using PRAGMA table_info
      try {
        const existingCols = await db.select<{ name: string }[]>(
          "PRAGMA table_info(games);",
        );
        const colSet = new Set(
          (existingCols || []).map((c) => c.name.toLowerCase()),
        );
        const migrationColumns = [
          ["version", "version TEXT"],
          ["installed_version", "installed_version TEXT"],
          ["installed_last_modified", "installed_last_modified TEXT"],
          ["fitgirl_version", "fitgirl_version TEXT"],
          ["steamrip_version", "steamrip_version TEXT"],
          ["linked_fitgirl_url", "linked_fitgirl_url TEXT"],
          ["linked_steamrip_url", "linked_steamrip_url TEXT"],
          ["fitgirl_upload_date", "fitgirl_upload_date TEXT"],
          ["steamrip_upload_date", "steamrip_upload_date TEXT"],
          ["game_updates", "game_updates TEXT"],
          ["repack_size", "repack_size TEXT"],
          ["repack_url", "repack_url TEXT"],
          ["source", "source TEXT"],
          ["mirror_groups", "mirror_groups TEXT"],
          ["has_update", "has_update INTEGER DEFAULT 0"],
          ["update_info", "update_info TEXT"],
          ["install_directory", "install_directory TEXT"],
          ["is_completed", "is_completed INTEGER NOT NULL DEFAULT 0"],
          ["completed_at", "completed_at TEXT"],
          ["is_wishlisted", "is_wishlisted INTEGER NOT NULL DEFAULT 0"],
          ["release_date", "release_date TEXT"],
          ["ignored_update_date", "ignored_update_date TEXT"],
        ];
        for (const [colName, colDef] of migrationColumns) {
          if (!colSet.has(colName.toLowerCase())) {
            try {
              await db.execute(`ALTER TABLE games ADD COLUMN ${colDef};`);
            } catch (_) {}
          }
        }
      } catch (_) {}

      await db.execute(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);

      await db.execute(`
        CREATE TABLE IF NOT EXISTS read_posts (
          post_id TEXT PRIMARY KEY,
          read_at TEXT NOT NULL
        );
      `);

      dbInstance = db;
      return db;
    })();
  }
  return dbInitPromise;
}

const GAMES_STORAGE_CACHE_KEY = "fitrepacks_cached_games_v2";

function getInitialCachedGames(): Game[] {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(GAMES_STORAGE_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(sanitizeGameRecord);
        }
      }
    } catch (_) {}
  }
  return [];
}

// In-memory cache so synchronous getters work immediately for React renders
let cachedGames: Game[] = getInitialCachedGames();

function persistCachedGames(games: Game[]): void {
  cachedGames = games;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(GAMES_STORAGE_CACHE_KEY, JSON.stringify(games));
    } catch (_) {}
  }
}

let cachedWishlistIds: string[] = [];
let cachedLastScanPath: string = "";
let cachedDefaultDownloadDir: string = "C:\\Games\\Downloads";
let cachedPreferredLanguages: string[] = ["english"];
let cachedRepackNotificationsEnabled: boolean = true;
let cachedCloseToTray: boolean = false;

export interface NotificationSettings {
  masterEnabled: boolean;
  fitgirlNotifications: boolean;
  steamripNotifications: boolean;
  libraryGameUpdates: boolean;
  showUpdateBadge: boolean;
}

let cachedNotificationSettings: NotificationSettings = {
  masterEnabled: true,
  fitgirlNotifications: true,
  steamripNotifications: true,
  libraryGameUpdates: true,
  showUpdateBadge: true,
};

let isInitialized = false;
let sqliteWriteQueue: Promise<void> = Promise.resolve();

/** Check if running inside Tauri runtime environment */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Load games array from Tauri SQLite database using @tauri-apps/plugin-sql */
async function loadGamesFromSQLite(): Promise<Game[]> {
  if (!isTauri()) return cachedGames;
  try {
    await sqliteWriteQueue;
    const db = await getDatabase();
    const rows = await db.select<any[]>("SELECT * FROM games");
    if (Array.isArray(rows)) {
      const parsed: Game[] = rows.map((r: any) => {
        const isCompleted =
          Boolean(r.is_completed) ||
          (typeof r.tags === "string" && r.tags.includes("Completed"));
        const isInstalled =
          Boolean(r.is_installed) ||
          Boolean(r.exe_path && String(r.exe_path).trim() !== "");
        const isWishlisted =
          !isInstalled &&
          !isCompleted &&
          (Boolean(r.is_wishlisted) ||
            (typeof r.tags === "string" && r.tags.includes("Wishlist")));

        let rawTags: string[] =
          typeof r.tags === "string"
            ? JSON.parse(r.tags || "[]")
            : r.tags || [];
        if (isInstalled || isCompleted) {
          rawTags = rawTags.filter((t) => t !== "Wishlist");
        }

        return {
          id: r.id,
          title: r.title,
          exePath: r.exe_path,
          workingDir: r.working_dir || undefined,
          coverUrl: r.cover_url,
          bannerUrl: r.banner_url || undefined,
          summary: r.summary || undefined,
          storyline: r.storyline || undefined,
          screenshots:
            typeof r.screenshots === "string"
              ? JSON.parse(r.screenshots || "[]")
              : r.screenshots || [],
          videos:
            typeof r.videos === "string"
              ? JSON.parse(r.videos || "[]")
              : r.videos || [],
          genres:
            typeof r.genres === "string"
              ? JSON.parse(r.genres || "[]")
              : r.genres || [],
          developer: r.developer || undefined,
          publisher: r.publisher || undefined,
          releaseYear: r.release_year ?? undefined,
          releaseDate: r.release_date || undefined,
          igdbId: r.igdb_id ?? undefined,
          rating: r.rating ?? undefined,
          hoursPlayed: r.hours_played ?? 0,
          playtimeMinutes: r.minutes_played_total ?? 0,
          lastPlayed: r.last_played_at || undefined,
          playSessions:
            typeof r.play_sessions === "string"
              ? JSON.parse(r.play_sessions || "[]")
              : r.play_sessions || [],
          isFavorite: Boolean(r.is_favorite),
          isWishlisted,
          isInstalled,
          isCompleted,
          completedAt: r.completed_at || undefined,
          dateAdded: r.added_at || new Date().toISOString(),
          tags: rawTags,
          notes: r.notes || undefined,
          version: r.version || undefined,
          installedVersion: r.installed_version || undefined,
          installedLastModified: r.installed_last_modified || undefined,
          fitgirlVersion: r.fitgirl_version || undefined,
          steamripVersion: r.steamrip_version || undefined,
          fitgirlUploadDate: r.fitgirl_upload_date || undefined,
          steamripUploadDate: r.steamrip_upload_date || undefined,
          linkedFitgirlUrl: r.linked_fitgirl_url || undefined,
          linkedSteamripUrl: r.linked_steamrip_url || undefined,
          repackSize: r.repack_size || undefined,
          repackUrl: r.repack_url || undefined,
          source: r.source || undefined,
          mirrorGroups:
            typeof r.mirror_groups === "string"
              ? JSON.parse(r.mirror_groups || "[]")
              : r.mirror_groups || undefined,
          gameUpdates:
            typeof r.game_updates === "string"
              ? JSON.parse(r.game_updates || "[]")
              : r.game_updates || undefined,
          hasUpdate: Boolean(r.has_update),
          updateInfo:
            typeof r.update_info === "string" && r.update_info
              ? JSON.parse(r.update_info)
              : r.update_info || undefined,
          installDirectory: r.install_directory || undefined,
          ignoredUpdateDate: r.ignored_update_date || undefined,
        };
      });
      const sanitized = parsed.map(sanitizeGameRecord);
      persistCachedGames(sanitized);
      isInitialized = true;
      return sanitized;
    }
  } catch (err) {
    console.error("Error loading games from SQLite via plugin-sql:", err);
  }
  return cachedGames;
}

/** Serialize and queue a single game upsert into SQLite */
async function upsertGameToSQLite(g: Game, db: Database): Promise<void> {
  const query = `
    INSERT INTO games (
      id, title, exe_path, working_dir, cover_url, banner_url, summary, storyline,
      screenshots, videos, genres, developer, publisher, release_year, release_date, igdb_id, rating,
      hours_played, minutes_played_total, last_played_at, play_sessions, is_favorite,
      is_wishlisted, is_installed, is_completed, completed_at, added_at, tags, notes, version,
      installed_version, installed_last_modified, fitgirl_version, steamrip_version, fitgirl_upload_date,
      steamrip_upload_date, linked_fitgirl_url, linked_steamrip_url, repack_size,
      repack_url, source, mirror_groups, game_updates, has_update, update_info, install_directory,
      ignored_update_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
      $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47
    ) ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      exe_path = excluded.exe_path,
      working_dir = excluded.working_dir,
      cover_url = excluded.cover_url,
      banner_url = excluded.banner_url,
      summary = excluded.summary,
      storyline = excluded.storyline,
      screenshots = excluded.screenshots,
      videos = excluded.videos,
      genres = excluded.genres,
      developer = excluded.developer,
      publisher = excluded.publisher,
      release_year = excluded.release_year,
      release_date = excluded.release_date,
      igdb_id = excluded.igdb_id,
      rating = excluded.rating,
      hours_played = excluded.hours_played,
      minutes_played_total = excluded.minutes_played_total,
      last_played_at = excluded.last_played_at,
      play_sessions = excluded.play_sessions,
      is_favorite = excluded.is_favorite,
      is_wishlisted = excluded.is_wishlisted,
      is_installed = excluded.is_installed,
      is_completed = excluded.is_completed,
      completed_at = excluded.completed_at,
      added_at = excluded.added_at,
      tags = excluded.tags,
      notes = excluded.notes,
      version = excluded.version,
      installed_version = excluded.installed_version,
      installed_last_modified = excluded.installed_last_modified,
      fitgirl_version = excluded.fitgirl_version,
      steamrip_version = excluded.steamrip_version,
      fitgirl_upload_date = excluded.fitgirl_upload_date,
      steamrip_upload_date = excluded.steamrip_upload_date,
      linked_fitgirl_url = excluded.linked_fitgirl_url,
      linked_steamrip_url = excluded.linked_steamrip_url,
      repack_size = excluded.repack_size,
      repack_url = excluded.repack_url,
      source = excluded.source,
      mirror_groups = excluded.mirror_groups,
      game_updates = excluded.game_updates,
      has_update = excluded.has_update,
      update_info = excluded.update_info,
      install_directory = excluded.install_directory,
      ignored_update_date = excluded.ignored_update_date
  `;

  await db.execute(query, [
    g.id,
    g.title || "",
    g.exePath || "",
    g.workingDir || null,
    g.coverUrl || "",
    g.bannerUrl || null,
    g.summary || null,
    g.storyline || null,
    JSON.stringify(g.screenshots || []),
    JSON.stringify(g.videos || []),
    JSON.stringify(g.genres || []),
    g.developer || null,
    g.publisher || null,
    g.releaseYear || null,
    g.releaseDate || null,
    g.igdbId || null,
    g.rating || null,
    g.hoursPlayed ?? (g.playtimeMinutes || 0) / 60,
    g.playtimeMinutes ?? 0,
    g.lastPlayed || null,
    JSON.stringify(g.playSessions || []),
    g.isFavorite ? 1 : 0,
    g.isWishlisted ? 1 : 0,
    g.isInstalled ? 1 : 0,
    g.isCompleted ? 1 : 0,
    g.completedAt || null,
    g.dateAdded || new Date().toISOString(),
    JSON.stringify(g.tags || []),
    (g as any).notes || null,
    g.version || null,
    g.installedVersion || null,
    g.installedLastModified || null,
    g.fitgirlVersion || null,
    g.steamripVersion || null,
    g.fitgirlUploadDate || null,
    g.steamripUploadDate || null,
    g.linkedFitgirlUrl || null,
    g.linkedSteamripUrl || null,
    g.repackSize || null,
    g.repackUrl || null,
    g.source || null,
    JSON.stringify(g.mirrorGroups || []),
    JSON.stringify(g.gameUpdates || []),
    g.hasUpdate ? 1 : 0,
    g.updateInfo ? JSON.stringify(g.updateInfo) : null,
    g.installDirectory || null,
    g.ignoredUpdateDate || null,
  ]);
}

/** Non-destructive queued save to SQLite database */
function saveGamesToSQLite(games: Game[]): void {
  persistCachedGames(games);
  if (!isTauri()) return;

  sqliteWriteQueue = sqliteWriteQueue
    .then(async () => {
      const db = await getDatabase();
      for (const g of games) {
        await upsertGameToSQLite(g, db);
      }
    })
    .catch((err) => {
      console.error("Error saving games to SQLite via plugin-sql:", err);
    });
}

/** Delete a single game from SQLite */
function deleteSingleGameFromSQLite(id: string): void {
  persistCachedGames(cachedGames.filter((g) => g.id !== id));
  if (!isTauri()) return;

  sqliteWriteQueue = sqliteWriteQueue
    .then(async () => {
      const db = await getDatabase();
      await db.execute("DELETE FROM games WHERE id = $1", [id]);
    })
    .catch((err) => {
      console.error(`Error deleting game ${id} from SQLite:`, err);
    });
}

/** Synchronous getter returns in-memory cached games (cloned to guarantee React re-render triggers) */
export function getStoredGames(): Game[] {
  return [...cachedGames];
}

/**
 * Generic SQLite Setting Saver using @tauri-apps/plugin-sql
 */
export async function saveAppSetting(
  key: string,
  value: string,
): Promise<void> {
  if (!isTauri()) return;
  sqliteWriteQueue = sqliteWriteQueue
    .then(async () => {
      const db = await getDatabase();
      await db.execute(
        "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
    })
    .catch((err) => {
      console.error(`Error saving setting '${key}' via plugin-sql:`, err);
    });
  await sqliteWriteQueue;
}

/**
 * Generic SQLite Setting Getter using @tauri-apps/plugin-sql
 */
export async function getAppSetting(key: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const db = await getDatabase();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [key],
    );
    if (rows && rows.length > 0) {
      return rows[0].value;
    }
  } catch (err) {
    console.error(`Error getting setting '${key}' via plugin-sql:`, err);
  }
  return null;
}

/** Async entry point called on app mount to load SQLite data */
export async function syncTauriLibraryData(): Promise<Game[]> {
  const games = await loadGamesFromSQLite();

  if (isTauri()) {
    try {
      const downloadDir = await getAppSetting("default_download_dir");
      if (downloadDir && downloadDir.trim()) {
        cachedDefaultDownloadDir = downloadDir;
      }

      const languagesJson = await getAppSetting("preferred_languages");
      if (languagesJson) {
        try {
          const parsed = JSON.parse(languagesJson);
          if (Array.isArray(parsed) && parsed.length > 0) {
            cachedPreferredLanguages = parsed;
          }
        } catch (_) {}
      }

      const torrentSettingsJson = await getAppSetting("torrent_settings");
      if (torrentSettingsJson) {
        try {
          const parsed = JSON.parse(torrentSettingsJson);
          cachedTorrentSettings = {
            downloadLimitKbps:
              typeof parsed.downloadLimitKbps === "number"
                ? parsed.downloadLimitKbps
                : 0,
            uploadLimitKbps:
              typeof parsed.uploadLimitKbps === "number"
                ? parsed.uploadLimitKbps
                : 0,
            maxActiveDownloads:
              typeof parsed.maxActiveDownloads === "number"
                ? parsed.maxActiveDownloads
                : 3,
            seedAfterComplete:
              typeof parsed.seedAfterComplete === "boolean"
                ? parsed.seedAfterComplete
                : false,
            applyFolderCoverIcon:
              typeof parsed.applyFolderCoverIcon === "boolean"
                ? parsed.applyFolderCoverIcon
                : true,
          };
          if (isTauri()) {
            try {
              const { invoke } = await import("@tauri-apps/api/core");
              await invoke("set_torrent_speed_limits", {
                downloadKbps: cachedTorrentSettings.downloadLimitKbps,
                uploadKbps: cachedTorrentSettings.uploadLimitKbps,
              });
            } catch (_) {}
          }
        } catch (_) {}
      }

      const notifSetting = await getAppSetting("repack_notifications_enabled");
      if (notifSetting !== null && notifSetting !== undefined) {
        const val = notifSetting === "true" || notifSetting === "1";
        cachedRepackNotificationsEnabled = val;
        cachedNotificationSettings.masterEnabled = val;
      }

      const fitgirlNotif = await getAppSetting("notification_fitgirl_enabled");
      if (fitgirlNotif !== null && fitgirlNotif !== undefined) {
        cachedNotificationSettings.fitgirlNotifications =
          fitgirlNotif === "true" || fitgirlNotif === "1";
      }

      const steamripNotif = await getAppSetting(
        "notification_steamrip_enabled",
      );
      if (steamripNotif !== null && steamripNotif !== undefined) {
        cachedNotificationSettings.steamripNotifications =
          steamripNotif === "true" || steamripNotif === "1";
      }

      const libraryUpdatesNotif = await getAppSetting(
        "notification_library_updates_enabled",
      );
      if (libraryUpdatesNotif !== null && libraryUpdatesNotif !== undefined) {
        cachedNotificationSettings.libraryGameUpdates =
          libraryUpdatesNotif === "true" || libraryUpdatesNotif === "1";
      }

      const showBadgeNotif = await getAppSetting(
        "notification_show_update_badge",
      );
      if (showBadgeNotif !== null && showBadgeNotif !== undefined) {
        cachedNotificationSettings.showUpdateBadge =
          showBadgeNotif === "true" || showBadgeNotif === "1";
      }

      const excludedJson = await getAppSetting("excluded_genres");
      if (excludedJson) {
        try {
          const parsed = JSON.parse(excludedJson);
          if (Array.isArray(parsed)) {
            cachedExcludedGenres = parsed;
          }
        } catch (_) {}
      }

      const videoPos = await getAppSetting("carousel_video_position");
      if (videoPos === "first" || videoPos === "last") {
        cachedCarouselVideoPosition = videoPos;
      }

      const closeToTrayVal = await getAppSetting("close_to_tray");
      if (closeToTrayVal !== null && closeToTrayVal !== undefined) {
        cachedCloseToTray = closeToTrayVal === "true" || closeToTrayVal === "1";
      }
      if (isTauri()) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("set_close_to_tray", { enabled: cachedCloseToTray });
        } catch (_) {}
      }

      // Sync read posts from SQLite read_posts table
      await syncReadPostsFromSQLite();

      // Proactively detect installedLastModified and clear false updates for installed games
      let anyModified = false;
      for (const g of games) {
        if (g.exePath) {
          if (!g.installedLastModified) {
            try {
              const lastMod = await detectGameExeLastModified(g.exePath);
              if (lastMod) {
                g.installedLastModified = lastMod.toISOString();
                anyModified = true;
              }
            } catch (_) {}
          }

          const targetPostDate =
            g.fitgirlUploadDate ||
            g.steamripUploadDate ||
            g.updateInfo?.date ||
            g.releaseDate;

          const isIgnored = Boolean(
            g.ignoredUpdateDate &&
            targetPostDate &&
            (g.ignoredUpdateDate === targetPostDate ||
              (parseDateSafe(g.ignoredUpdateDate) ?? 0) >=
                (parseDateSafe(targetPostDate) ?? Infinity)),
          );

          if (isIgnored && g.hasUpdate) {
            g.hasUpdate = false;
            g.updateInfo = undefined;
            anyModified = true;
          } else if (g.installedLastModified && targetPostDate) {
            const isUpToDate = isGameUpToDateByDate(
              g.installedLastModified,
              targetPostDate,
              10,
            );
            if (isUpToDate && g.hasUpdate) {
              g.hasUpdate = false;
              g.updateInfo = undefined;
              anyModified = true;
            }
          } else if (g.hasUpdate && !targetPostDate) {
            g.hasUpdate = false;
            g.updateInfo = undefined;
            anyModified = true;
          }
        }
      }
      if (anyModified) {
        saveGamesToSQLite(games);
      }
    } catch (err) {
      console.error("Error syncing settings from SQLite via plugin-sql:", err);
    }
  }

  return games;
}

let cachedExcludedGenres: string[] = [];
let cachedCarouselVideoPosition: "first" | "last" = "first";

export function getExcludedGenres(): string[] {
  return [...cachedExcludedGenres];
}

export async function saveExcludedGenres(genres: string[]): Promise<void> {
  cachedExcludedGenres = genres;
  invalidateRepacksCache();
  await saveAppSetting("excluded_genres", JSON.stringify(genres));
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fitrepacks-settings-updated", {
        detail: { key: "excluded_genres", value: genres },
      }),
    );
  }
}

export function getCarouselVideoPosition(): "first" | "last" {
  return cachedCarouselVideoPosition;
}

export async function saveCarouselVideoPosition(
  position: "first" | "last",
): Promise<void> {
  cachedCarouselVideoPosition = position;
  await saveAppSetting("carousel_video_position", position);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fitrepacks-settings-updated", {
        detail: { key: "carousel_video_position", value: position },
      }),
    );
  }
}

export function getDefaultDownloadDir(): string {
  return cachedDefaultDownloadDir || "C:\\Games\\Downloads";
}

export async function saveDefaultDownloadDir(dir: string): Promise<void> {
  cachedDefaultDownloadDir = dir;
  await saveAppSetting("default_download_dir", dir);
}

export async function getAutostartStatus(): Promise<boolean> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<boolean>("get_autostart_status");
    } catch (err) {
      console.warn("Failed to query autostart status:", err);
    }
  }
  return false;
}

export async function setAutostartStatus(enabled: boolean): Promise<boolean> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<boolean>("set_autostart", { enabled });
      await saveAppSetting("autostart_enabled", enabled ? "true" : "false");
      return res;
    } catch (err) {
      console.error("Failed to update autostart setting:", err);
      throw err;
    }
  }
  return enabled;
}

export function getCloseToTraySetting(): boolean {
  if (typeof window !== "undefined") {
    const local = localStorage.getItem("fitrepacks_close_to_tray");
    if (local !== null) {
      return local === "true" || local === "1";
    }
  }
  return cachedCloseToTray;
}

export async function saveCloseToTraySetting(
  enabled: boolean,
): Promise<boolean> {
  cachedCloseToTray = enabled;
  if (typeof window !== "undefined") {
    localStorage.setItem(
      "fitrepacks_close_to_tray",
      enabled ? "true" : "false",
    );
    window.dispatchEvent(
      new CustomEvent("fitrepacks-settings-updated", {
        detail: { key: "close_to_tray", value: enabled },
      }),
    );
  }
  await saveAppSetting("close_to_tray", enabled ? "true" : "false");
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_close_to_tray", { enabled });
    } catch (err) {
      console.warn("Failed to sync close_to_tray with Tauri backend:", err);
    }
  }
  return enabled;
}

export interface TorrentSettings {
  downloadLimitKbps: number; // 0 = unlimited
  uploadLimitKbps: number; // 0 = unlimited
  maxActiveDownloads: number; // default: 3
  seedAfterComplete: boolean; // default: false
  applyFolderCoverIcon: boolean; // default: true
}

let cachedTorrentSettings: TorrentSettings = {
  downloadLimitKbps: 0,
  uploadLimitKbps: 0,
  maxActiveDownloads: 3,
  seedAfterComplete: false,
  applyFolderCoverIcon: true,
};

export function getPreferredLanguages(): string[] {
  return cachedPreferredLanguages.length > 0
    ? cachedPreferredLanguages
    : ["english"];
}

export async function savePreferredLanguages(
  languages: string[],
): Promise<void> {
  cachedPreferredLanguages = languages;
  await saveAppSetting("preferred_languages", JSON.stringify(languages));
}

export function getTorrentSettings(): TorrentSettings {
  return cachedTorrentSettings;
}

export async function saveTorrentSettings(
  settings: TorrentSettings,
): Promise<void> {
  cachedTorrentSettings = settings;
  const json = JSON.stringify(settings);
  await saveAppSetting("torrent_settings", json);

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_torrent_speed_limits", {
        downloadKbps: settings.downloadLimitKbps,
        uploadKbps: settings.uploadLimitKbps,
      });
    } catch (err) {
      console.warn("Failed to set torrent speed limits in backend:", err);
    }
  }
}

export function getNotificationSettings(): NotificationSettings {
  return { ...cachedNotificationSettings };
}

export async function saveNotificationSettings(
  settings: Partial<NotificationSettings>,
): Promise<void> {
  cachedNotificationSettings = {
    ...cachedNotificationSettings,
    ...settings,
  };
  if (typeof settings.masterEnabled === "boolean") {
    cachedRepackNotificationsEnabled = settings.masterEnabled;
    await saveAppSetting(
      "repack_notifications_enabled",
      String(settings.masterEnabled),
    );
  }
  if (typeof settings.fitgirlNotifications === "boolean") {
    await saveAppSetting(
      "notification_fitgirl_enabled",
      String(settings.fitgirlNotifications),
    );
  }
  if (typeof settings.steamripNotifications === "boolean") {
    await saveAppSetting(
      "notification_steamrip_enabled",
      String(settings.steamripNotifications),
    );
  }
  if (typeof settings.libraryGameUpdates === "boolean") {
    await saveAppSetting(
      "notification_library_updates_enabled",
      String(settings.libraryGameUpdates),
    );
  }
  if (typeof settings.showUpdateBadge === "boolean") {
    await saveAppSetting(
      "notification_show_update_badge",
      String(settings.showUpdateBadge),
    );
  }
}

export function getRepackNotificationsEnabled(): boolean {
  return cachedNotificationSettings.masterEnabled;
}

/**
 * Clear the update badge from a specific library game
 */
export function clearGameUpdate(gameId: string): Game[] {
  return ignoreGameUpdate(gameId);
}

/**
 * Ignore an update for a specific library game (persisting the ignored post date)
 */
export function ignoreGameUpdate(gameId: string, postDate?: string): Game[] {
  const games = getStoredGames();
  const updated = games.map((g) => {
    if (g.id === gameId) {
      const dateToIgnore =
        postDate ||
        g.updateInfo?.date ||
        g.fitgirlUploadDate ||
        g.steamripUploadDate ||
        g.releaseDate ||
        new Date().toISOString();
      return {
        ...g,
        ignoredUpdateDate: dateToIgnore,
        hasUpdate: false,
        updateInfo: undefined,
      };
    }
    return g;
  });
  saveGamesToSQLite(updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fitrepacks-games-updated"));
  }
  return updated;
}

/**
 * Restore update checking for a previously ignored game
 */
export function unignoreGameUpdate(gameId: string): Game[] {
  const games = getStoredGames();
  const updated = games.map((g) => {
    if (g.id === gameId) {
      return {
        ...g,
        ignoredUpdateDate: undefined,
      };
    }
    return g;
  });
  saveGamesToSQLite(updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fitrepacks-games-updated"));
  }
  return updated;
}

/**
 * Normalize game title for accurate cross-source and scanner matching
 */
export function normalizeGameTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  return rawTitle
    .replace(/^#\d+\s*/i, "")
    .replace(/\bUpdated\b/gi, "")
    .replace(/\+\s*\d*\s*DLC.*$/i, "")
    .replace(/\+\s*Bonus.*$/i, "")
    .replace(/\[.*?\]/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(
      /\b(v\d+(\.\d+)*[a-z0-9_]*|Build\s*\d+|v\d{4}\.\d{2}\.\d{2})\b/gi,
      "",
    )
    .replace(
      /\b(repack|fitgirl|dodi|steamrip|gog|steam|free download|deluxe edition|edition|remastered|remake|complete edition|digital deluxe)\b/gi,
      "",
    )
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Find an existing library game that corresponds to the given game (by ID, exe path, IGDB ID, or title)
 */
export function findMatchingGameInLibrary(
  game: Game,
  existingGames: Game[],
): Game | null {
  if (!existingGames || existingGames.length === 0) return null;

  // 1. Direct ID match
  const directId = existingGames.find((g) => g.id === game.id);
  if (directId) return directId;

  // 2. Executable path match (case-insensitive on Windows)
  if (game.exePath && game.exePath.trim()) {
    const cleanExe = game.exePath.trim().toLowerCase();
    const exeMatch = existingGames.find(
      (g) => g.exePath && g.exePath.trim().toLowerCase() === cleanExe,
    );
    if (exeMatch) return exeMatch;
  }

  // 3. Direct IGDB ID match
  if (game.igdbId) {
    const igdbMatch = existingGames.find(
      (g) => g.igdbId && g.igdbId === game.igdbId,
    );
    if (igdbMatch) return igdbMatch;
  }

  // 4. Exact normalized title match
  const normNew = normalizeGameTitle(game.title);
  if (normNew && normNew.length >= 2) {
    const exactTitleMatch = existingGames.find((g) => {
      const normExisting = normalizeGameTitle(g.title);
      return normExisting === normNew;
    });
    if (exactTitleMatch) return exactTitleMatch;
  }

  return null;
}

/**
 * Deduplicate play sessions that were recorded concurrently due to race conditions or duplicate exit triggers.
 */
export function deduplicatePlaySessions(sessions: PlaySession[]): PlaySession[] {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];
  const deduplicated: PlaySession[] = [];
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
  );

  for (const session of sorted) {
    if (!session || !session.startTime) continue;
    const sessionTime = new Date(session.startTime).getTime();
    if (isNaN(sessionTime)) continue;

    // Check if another session was recorded within 120 seconds of this session
    const existingIndex = deduplicated.findIndex((s) => {
      const existingTime = new Date(s.startTime).getTime();
      return Math.abs(existingTime - sessionTime) <= 120000;
    });

    if (existingIndex === -1) {
      deduplicated.push({
        id: session.id || `session_${sessionTime}`,
        startTime: session.startTime,
        durationMinutes: Math.max(session.durationMinutes || 1, 1),
      });
    } else {
      // Keep the longer duration recorded during the burst
      deduplicated[existingIndex].durationMinutes = Math.max(
        deduplicated[existingIndex].durationMinutes,
        session.durationMinutes || 1,
      );
    }
  }

  return deduplicated.slice(0, 50);
}

/**
 * Sanitize and heal game records with corrupted, duplicated, or drifted playtime data.
 */
export function sanitizeGameRecord(g: Game): Game {
  const existingSessions = Array.isArray(g.playSessions) ? g.playSessions : [];
  const cleanSessions = deduplicatePlaySessions(existingSessions);

  let finalMinutes = g.playtimeMinutes || 0;
  if (cleanSessions.length > 0) {
    const sessionTotal = cleanSessions.reduce(
      (acc, s) => acc + (s.durationMinutes || 0),
      0,
    );
    finalMinutes = sessionTotal;
  } else if (g.hoursPlayed !== undefined && g.hoursPlayed > 0 && finalMinutes === 0) {
    finalMinutes = g.hoursPlayed * 60;
  }

  const finalHours = finalMinutes / 60;

  return {
    ...g,
    playtimeMinutes: finalMinutes,
    hoursPlayed: finalHours,
    playSessions: cleanSessions,
  };
}

/**
 * Merge an incoming game (e.g. from scanning / installation) into an existing library game
 */
export function mergeGameRecords(existing: Game, incoming: Game): Game {
  const isNowInstalled = Boolean(
    existing.isInstalled ||
    incoming.isInstalled ||
    (incoming.exePath && incoming.exePath.trim() !== "") ||
    (existing.exePath && existing.exePath.trim() !== ""),
  );

  let updatedTags = Array.isArray(existing.tags) ? [...existing.tags] : [];
  if (isNowInstalled) {
    updatedTags = updatedTags.filter((t) => t.toLowerCase() !== "wishlist");
    if (
      !updatedTags.includes("Imported") &&
      !updatedTags.includes("Installed")
    ) {
      updatedTags.push("Imported");
    }
  }
  if (Array.isArray(incoming.tags)) {
    for (const tag of incoming.tags) {
      if (tag.toLowerCase() !== "wishlist" && !updatedTags.includes(tag)) {
        updatedTags.push(tag);
      }
    }
  }

  const isEffectivelyInstalled =
    isNowInstalled ||
    Boolean(existing.isInstalled) ||
    Boolean(incoming.isInstalled);
  const isEffectivelyCompleted = Boolean(
    incoming.isCompleted ?? existing.isCompleted,
  );

  if (isEffectivelyInstalled || isEffectivelyCompleted) {
    updatedTags = updatedTags.filter((t) => t.toLowerCase() !== "wishlist");
  }

  const mergedSessions = deduplicatePlaySessions([
    ...(Array.isArray(existing.playSessions) ? existing.playSessions : []),
    ...(Array.isArray(incoming.playSessions) ? incoming.playSessions : []),
  ]);

  const maxPlaytimeMinutes = Math.max(
    existing.playtimeMinutes || 0,
    incoming.playtimeMinutes || 0,
  );

  const rawMerged: Game = {
    ...existing,
    ...incoming,
    id: existing.id,
    isInstalled: isEffectivelyInstalled,
    isWishlisted:
      isEffectivelyInstalled || isEffectivelyCompleted
        ? false
        : Boolean(incoming.isWishlisted ?? existing.isWishlisted),
    exePath: incoming.exePath || existing.exePath,
    workingDir: incoming.workingDir || existing.workingDir,
    installDirectory: incoming.installDirectory || existing.installDirectory,
    uninstallerPath: incoming.uninstallerPath || existing.uninstallerPath,
    version: incoming.version || existing.version,
    installedVersion:
      incoming.installedVersion ||
      incoming.version ||
      existing.installedVersion ||
      existing.version,
    playtimeMinutes: maxPlaytimeMinutes,
    hoursPlayed: Math.max(
      existing.hoursPlayed || 0,
      incoming.hoursPlayed || 0,
      maxPlaytimeMinutes / 60,
    ),
    playSessions: mergedSessions,
    isFavorite: existing.isFavorite ?? incoming.isFavorite,
    isCompleted: isEffectivelyCompleted,
    completedAt: existing.completedAt || incoming.completedAt,
    notes: existing.notes || incoming.notes,
    dateAdded: existing.dateAdded || incoming.dateAdded,
    coverUrl:
      incoming.coverUrl && !incoming.coverUrl.includes("placehold.co")
        ? incoming.coverUrl
        : existing.coverUrl || incoming.coverUrl,
    bannerUrl: incoming.bannerUrl || existing.bannerUrl,
    summary: incoming.summary || existing.summary,
    storyline: incoming.storyline || existing.storyline,
    screenshots:
      incoming.screenshots && incoming.screenshots.length > 0
        ? incoming.screenshots
        : existing.screenshots,
    videos:
      incoming.videos && incoming.videos.length > 0
        ? incoming.videos
        : existing.videos,
    genres:
      incoming.genres && incoming.genres.length > 0
        ? incoming.genres
        : existing.genres,
    developer: incoming.developer || existing.developer,
    publisher: incoming.publisher || existing.publisher,
    releaseYear: incoming.releaseYear || existing.releaseYear,
    releaseDate: incoming.releaseDate || existing.releaseDate,
    rating: incoming.rating || existing.rating,
    igdbId: incoming.igdbId || existing.igdbId,
    tags: updatedTags,
    source: existing.source || incoming.source || "manual",
    linkedFitgirlUrl: existing.linkedFitgirlUrl || incoming.linkedFitgirlUrl,
    linkedSteamripUrl: existing.linkedSteamripUrl || incoming.linkedSteamripUrl,
    repackSize: existing.repackSize || incoming.repackSize,
    repackUrl: existing.repackUrl || incoming.repackUrl,
    mirrorGroups: existing.mirrorGroups || incoming.mirrorGroups,
    gameUpdates: existing.gameUpdates || incoming.gameUpdates,
  };
  return sanitizeGameRecord(rawMerged);
}

export function addGameToStorage(game: Game): Game[] {
  const games = getStoredGames();
  const existing = findMatchingGameInLibrary(game, games);

  let finalGame: Game;
  let updated: Game[];

  if (existing) {
    finalGame = mergeGameRecords(existing, game);
    updated = games.map((g) => (g.id === existing.id ? finalGame : g));
  } else {
    finalGame = { ...game };
    if (
      finalGame.isInstalled ||
      finalGame.isCompleted ||
      (finalGame.exePath && finalGame.exePath.trim() !== "")
    ) {
      finalGame.isWishlisted = false;
      if (finalGame.tags) {
        finalGame.tags = finalGame.tags.filter(
          (t) => t.toLowerCase() !== "wishlist",
        );
      }
    }
    updated = [...games, finalGame];
  }

  saveGamesToSQLite(updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fitrepacks-games-updated"));
  }
  return updated;
}

export function addGamesBatchToStorage(newGames: Game[]): Game[] {
  if (!newGames || newGames.length === 0) return getStoredGames();
  const updated = [...getStoredGames()];

  for (const newGame of newGames) {
    const existingIndex = updated.findIndex((g) => {
      const match = findMatchingGameInLibrary(newGame, [g]);
      return Boolean(match);
    });

    if (existingIndex !== -1) {
      const merged = mergeGameRecords(updated[existingIndex], newGame);
      updated[existingIndex] = merged;
    } else {
      const cleanGame = { ...newGame };
      if (
        cleanGame.isInstalled ||
        cleanGame.isCompleted ||
        (cleanGame.exePath && cleanGame.exePath.trim() !== "")
      ) {
        cleanGame.isWishlisted = false;
        if (cleanGame.tags) {
          cleanGame.tags = cleanGame.tags.filter(
            (t) => t.toLowerCase() !== "wishlist",
          );
        }
      }
      updated.push(cleanGame);
    }
  }

  saveGamesToSQLite(updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fitrepacks-games-updated"));
  }
  return updated;
}

export function updateGameInStorage(game: Game): Game[] {
  const isInstalledOrCompleted =
    Boolean(game.isInstalled) ||
    Boolean(game.isCompleted) ||
    Boolean(game.exePath && game.exePath.trim() !== "");

  if (isInstalledOrCompleted) {
    game.isWishlisted = false;
    if (game.tags) {
      game.tags = game.tags.filter((t) => t.toLowerCase() !== "wishlist");
    }
  }

  const games = getStoredGames();
  const updated = games.map((g) => (g.id === game.id ? { ...g, ...game } : g));
  persistCachedGames(updated);
  if (isTauri()) {
    sqliteWriteQueue = sqliteWriteQueue
      .then(async () => {
        const db = await getDatabase();
        await upsertGameToSQLite(game, db);
      })
      .catch((err) => {
        console.error("Error updating game in SQLite:", err);
      });
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fitrepacks-games-updated"));
  }
  return updated;
}

export function deleteGameFromStorage(id: string): Game[] {
  const games = getStoredGames();
  const updated = games.filter((g) => g.id !== id);
  persistCachedGames(updated);
  deleteSingleGameFromSQLite(id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fitrepacks-games-updated"));
  }
  return updated;
}

function autoMarkRepackAsReadForGame(game?: Game): void {
  if (!game) return;
  const rawId = game.id.startsWith("repack-")
    ? game.id.replace("repack-", "")
    : game.id;
  const date = game.fitgirlUploadDate || game.steamripUploadDate;
  if (rawId) {
    markPostAsRead(rawId, date);
  }
}

export function toggleFavoriteGame(id: string): Game[] {
  const games = getStoredGames();
  const target = games.find((g) => g.id === id);
  if (!target) return games;

  const nextFavorite = !target.isFavorite;
  const updatedGame = { ...target, isFavorite: nextFavorite };

  if (nextFavorite) {
    autoMarkRepackAsReadForGame(target);
  }

  if (!nextFavorite) {
    const keepable =
      Boolean(
        updatedGame.isInstalled &&
        updatedGame.exePath &&
        updatedGame.exePath.trim() !== "",
      ) ||
      Boolean(updatedGame.isCompleted) ||
      Boolean(updatedGame.isWishlisted);

    if (!keepable) {
      return deleteGameFromStorage(id);
    }
  }

  return updateGameInStorage(updatedGame);
}

export function toggleCompletedGame(id: string): Game[] {
  const games = getStoredGames();
  const target = games.find((g) => g.id === id);
  if (!target) return games;

  const now = new Date().toISOString();
  const nextCompleted = !target.isCompleted;
  let nextTags = target.tags || [];

  if (nextCompleted) {
    autoMarkRepackAsReadForGame(target);
    nextTags = Array.from(
      new Set([
        ...nextTags.filter((t) => t.toLowerCase() !== "wishlist"),
        "Completed",
      ]),
    );
  } else {
    nextTags = nextTags.filter((t) => t !== "Completed");
  }

  const updatedGame = {
    ...target,
    isCompleted: nextCompleted,
    isWishlisted: nextCompleted ? false : target.isWishlisted,
    completedAt: nextCompleted ? now : undefined,
    tags: nextTags,
  };

  if (!nextCompleted) {
    const keepable =
      Boolean(
        updatedGame.isInstalled &&
        updatedGame.exePath &&
        updatedGame.exePath.trim() !== "",
      ) ||
      Boolean(updatedGame.isFavorite) ||
      Boolean(updatedGame.isWishlisted);

    if (!keepable) {
      return deleteGameFromStorage(id);
    }
  }

  return updateGameInStorage(updatedGame);
}

export function toggleWishlistGame(id: string): Game[] {
  const games = getStoredGames();
  const target = games.find((g) => g.id === id);
  if (!target) return games;

  const nextWishlist = !target.isWishlisted;
  let nextTags = target.tags || [];
  let nextCompleted = target.isCompleted;
  let nextInstalled = target.isInstalled;

  if (nextWishlist) {
    autoMarkRepackAsReadForGame(target);
    nextCompleted = false;
    nextInstalled = false;
    nextTags = nextTags.filter(
      (t) =>
        t.toLowerCase() !== "completed" &&
        t.toLowerCase() !== "installed" &&
        t.toLowerCase() !== "downloaded",
    );
    nextTags.push("Wishlist");
  } else {
    nextTags = nextTags.filter((t) => t.toLowerCase() !== "wishlist");
  }

  const updatedGame = {
    ...target,
    isWishlisted: nextWishlist,
    isCompleted: nextCompleted,
    isInstalled: nextInstalled,
    tags: Array.from(new Set(nextTags)),
  };

  if (!nextWishlist) {
    const keepable =
      Boolean(
        updatedGame.isInstalled &&
        updatedGame.exePath &&
        updatedGame.exePath.trim() !== "",
      ) ||
      Boolean(updatedGame.isFavorite) ||
      Boolean(updatedGame.isCompleted);

    if (!keepable) {
      return deleteGameFromStorage(id);
    }
  }

  return updateGameInStorage(updatedGame);
}

export function setGameStatus(
  id: string,
  status: "installed" | "wishlist" | "completed" | "none",
): Game[] {
  const games = getStoredGames();
  const target = games.find((g) => g.id === id);
  if (!target) return games;

  const now = new Date().toISOString();
  let nextWishlisted = false;
  let nextCompleted = false;
  let nextInstalled = false;
  let nextCompletedAt = target.completedAt;
  let nextTags = (target.tags || []).filter(
    (t) =>
      t !== "Wishlist" &&
      t !== "Completed" &&
      t !== "Playing" &&
      t !== "Downloaded" &&
      t !== "Installed",
  );

  if (status === "installed") {
    nextInstalled = true;
    nextTags.push("Installed");
    autoMarkRepackAsReadForGame(target);
  } else if (status === "wishlist") {
    nextWishlisted = true;
    nextTags.push("Wishlist");
    autoMarkRepackAsReadForGame(target);
  } else if (status === "completed") {
    nextCompleted = true;
    nextCompletedAt = nextCompletedAt || now;
    nextTags.push("Completed");
    autoMarkRepackAsReadForGame(target);
  }

  const updatedGame: Game = {
    ...target,
    isWishlisted: nextWishlisted,
    isCompleted: nextCompleted,
    isInstalled: nextInstalled,
    completedAt: nextCompleted ? nextCompletedAt : undefined,
    tags: Array.from(new Set(nextTags)),
  };

  return updateGameInStorage(updatedGame);
}

export function updateGamePlaytime(
  id: string,
  additionalMinutes: number,
): Game[] {
  if (!additionalMinutes || additionalMinutes <= 0) return getStoredGames();
  const games = getStoredGames();
  const now = new Date().toISOString();
  const sessionDuration = Math.max(Math.round(additionalMinutes), 1);

  const updated = games.map((g) => {
    if (g.id === id) {
      const existingSessions = Array.isArray(g.playSessions) ? [...g.playSessions] : [];

      // Check if another session was recorded within the last 120 seconds for this game
      const lastSession = existingSessions[0];
      if (
        lastSession &&
        Math.abs(new Date(now).getTime() - new Date(lastSession.startTime).getTime()) < 120000
      ) {
        lastSession.durationMinutes = Math.max(
          lastSession.durationMinutes || 1,
          sessionDuration,
        );
        const cleanSessions = deduplicatePlaySessions(existingSessions);
        const totalMins = cleanSessions.reduce(
          (acc, s) => acc + (s.durationMinutes || 0),
          0,
        );
        return {
          ...g,
          playtimeMinutes: totalMins,
          hoursPlayed: totalMins / 60,
          lastPlayed: now,
          playSessions: cleanSessions,
        };
      }

      const newSession: PlaySession = {
        id: `session_${Date.now()}`,
        startTime: now,
        durationMinutes: sessionDuration,
      };

      const cleanSessions = deduplicatePlaySessions([
        newSession,
        ...existingSessions,
      ]);
      const totalMins = cleanSessions.reduce(
        (acc, s) => acc + (s.durationMinutes || 0),
        0,
      );

      return {
        ...g,
        playtimeMinutes: totalMins,
        hoursPlayed: totalMins / 60,
        lastPlayed: now,
        playSessions: cleanSessions,
      };
    }
    return g;
  });

  const sanitized = updated.map(sanitizeGameRecord);
  saveGamesToSQLite(sanitized);
  syncRecentGamesToTrayAndTaskbar(sanitized);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fitrepacks-games-updated"));
  }
  return sanitized;
}

export interface RecentGamePayload {
  id: string;
  title: string;
  exe_path: string;
  working_dir?: string | null;
  cover_url?: string | null;
}

export function getRecentInstalledGames(
  limit: number = 5,
  customList?: Game[],
): Game[] {
  const allGames = customList || getStoredGames();
  const installed = allGames.filter(
    (g) => g.isInstalled && g.exePath && g.exePath.trim() !== "",
  );

  installed.sort((a, b) => {
    const timeA = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
    const timeB = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    const addedA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
    const addedB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
    return addedB - addedA;
  });

  return installed.slice(0, limit);
}

export async function syncRecentGamesToTrayAndTaskbar(
  customList?: Game[],
): Promise<void> {
  if (!isTauri()) return;
  try {
    const recent = getRecentInstalledGames(5, customList);
    const payload: RecentGamePayload[] = recent.map((g) => ({
      id: g.id,
      title: g.title,
      exe_path: g.exePath!,
      working_dir: g.workingDir || null,
      cover_url: g.coverUrl || null,
    }));
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_recent_games", { games: payload });
  } catch (err) {
    console.warn("Failed to sync recent games to tray/jump list:", err);
  }
}

export function getLastScannedPath(): string {
  if (typeof window !== "undefined") {
    return (
      localStorage.getItem("fitrepacks_last_scan_path") ||
      cachedLastScanPath ||
      ""
    );
  }
  return cachedLastScanPath;
}

export function saveLastScannedPath(path: string): void {
  cachedLastScanPath = path;
  if (typeof window !== "undefined") {
    localStorage.setItem("fitrepacks_last_scan_path", path);
  }
}

function getWishlistIds(): string[] {
  const games = getStoredGames();
  const wIds = new Set<string>();

  games.forEach((g) => {
    if (g.isWishlisted) {
      wIds.add(g.id);
      const rawId = String(g.id).replace("repack-", "");
      if (rawId !== g.id) {
        wIds.add(rawId);
      }
    }
  });

  return Array.from(wIds);
}

export function isWishlistedInStorage(id: string, post?: RepackPost): boolean {
  const game = getGameForRepack(id, post);
  return Boolean(game?.isWishlisted);
}

export {
  detectInstalledGameVersion,
  detectGameExeLastModified,
  isGameUpToDateByDate,
} from "./versionDetector";

/** Convert a RepackPost into a minimal Game entry for the library. */
function repackToGame(post: RepackPost): Game {
  const source = post.source === "steamrip" ? "steamrip" : "fitgirl";
  const version = extractGameVersion(post.title, post.description);
  return {
    id: `repack-${post.id}`,
    title: post.title,
    exePath: "",
    version: version || undefined,
    fitgirlVersion: source === "fitgirl" ? version : undefined,
    steamripVersion: source === "steamrip" ? version : undefined,
    fitgirlUploadDate: source === "fitgirl" ? post.date : undefined,
    steamripUploadDate: source === "steamrip" ? post.date : undefined,
    coverUrl: post.coverUrl || undefined,
    bannerUrl: post.screenshots?.[0] || undefined,
    screenshots: post.screenshots?.slice(0, 6),
    videos: post.videos?.slice(0, 3),
    genres: post.genres,
    developer: post.companies || undefined,
    summary: post.description ? post.description.slice(0, 1500) : undefined,
    playtimeMinutes: 0,
    dateAdded: new Date().toISOString(),
    isInstalled: false,
    source,
    mirrorGroups: post.mirrorGroups,
    gameUpdates: post.gameUpdates,
    repackSize: post.repackSize,
    repackUrl: post.url,
    linkedFitgirlUrl: source === "fitgirl" ? post.url : undefined,
    linkedSteamripUrl: source === "steamrip" ? post.url : undefined,
    isWishlisted: false,
    tags: [source === "steamrip" ? "SteamRIP" : "FitGirl"],
  };
}

/**
 * Toggle wishlist state for a repack.
 * If `post` is provided and the repack is being wishlisted, it is also added
 * to the game library. When un-wishlisted the library entry is removed.
 */
export function toggleWishlistRepack(id: string, post?: RepackPost): boolean {
  const game = getGameForRepack(id, post);
  if (game) {
    const nextWishlisted = !game.isWishlisted;
    if (
      !nextWishlisted &&
      !game.isFavorite &&
      !game.isCompleted &&
      !game.isInstalled &&
      !game.exePath
    ) {
      deleteGameFromStorage(game.id);
    } else {
      setGameStatus(game.id, nextWishlisted ? "wishlist" : "none");
    }
    if (nextWishlisted) {
      markPostAsRead(id, post?.date || game.fitgirlUploadDate || game.steamripUploadDate);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("fitrepacks-games-updated"));
    }
    return nextWishlisted;
  }
  if (post) {
    setRepackStatus(id, post, "wishlist");
    markPostAsRead(id, post.date);
    return true;
  }
  return false;
}

export function isCompletedRepackInStorage(
  id: string,
  post?: RepackPost,
): boolean {
  const game = getGameForRepack(id, post);
  return Boolean(game?.isCompleted);
}

export function toggleCompletedRepack(id: string, post?: RepackPost): boolean {
  const game = getGameForRepack(id, post);
  if (game) {
    const nextCompleted = !game.isCompleted;
    if (
      !nextCompleted &&
      !game.isFavorite &&
      !game.isWishlisted &&
      !game.isInstalled &&
      !game.exePath
    ) {
      deleteGameFromStorage(game.id);
    } else {
      setGameStatus(game.id, nextCompleted ? "completed" : "none");
    }
    if (nextCompleted) {
      markPostAsRead(id, post?.date || game.fitgirlUploadDate || game.steamripUploadDate);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("fitrepacks-games-updated"));
    }
    return nextCompleted;
  }
  if (post) {
    setRepackStatus(id, post, "completed");
    markPostAsRead(id, post.date);
    return true;
  }
  return false;
}

export function getGameForRepack(
  id: string,
  post?: RepackPost,
): Game | undefined {
  const games = getStoredGames();
  const rawId = String(id || "").trim();
  const cleanPostId = post?.id ? String(post.id).trim() : "";
  const postTitle = post?.title ? post.title.toLowerCase().trim() : "";
  const postUrl = post?.url || "";

  return games.find((g) => {
    if (g.id === rawId || g.id === `repack-${rawId}`) return true;
    if (
      cleanPostId &&
      (g.id === cleanPostId || g.id === `repack-${cleanPostId}`)
    ) {
      return true;
    }
    if (
      postUrl &&
      (g.repackUrl === postUrl ||
        g.linkedFitgirlUrl === postUrl ||
        g.linkedSteamripUrl === postUrl)
    ) {
      return true;
    }
    if (postTitle && g.title) {
      // Only match by title if the library game is repack-linked.
      // This prevents IGDB-sourced library games (e.g. a Steam-owned game
      // marked Completed) from leaking Wishlist/Completed onto repack posts.
      const hasRepackLink = Boolean(
        g.repackUrl || g.linkedFitgirlUrl || g.linkedSteamripUrl,
      );
      if (!hasRepackLink) return false;

      if (g.title.toLowerCase().trim() === postTitle) return true;
      const gClean = cleanGameTitle(g.title).toLowerCase().trim();
      const pClean = cleanGameTitle(post ? post.title : "")
        .toLowerCase()
        .trim();
      if (
        gClean &&
        pClean &&
        gClean.length >= 3 &&
        pClean.length >= 3 &&
        gClean === pClean
      ) {
        return true;
      }
    }
    return false;
  });
}

export function isFavoriteRepackInStorage(
  id: string,
  post?: RepackPost,
): boolean {
  const game = getGameForRepack(id, post);
  return Boolean(game?.isFavorite);
}

export function isInstalledRepackInStorage(
  id: string,
  post?: RepackPost,
): boolean {
  const game = getGameForRepack(id, post);
  return Boolean(
    game?.isInstalled || (game?.exePath && game.exePath.trim() !== ""),
  );
}

export function toggleFavoriteRepack(id: string, post?: RepackPost): boolean {
  const game = getGameForRepack(id, post);
  if (game) {
    const updated = toggleFavoriteGame(game.id);
    const isFav = updated.find((g) => g.id === game.id)?.isFavorite ?? false;
    if (isFav) {
      markPostAsRead(id, post?.date || game.fitgirlUploadDate || game.steamripUploadDate);
    }
    return isFav;
  }
  if (post) {
    const base = repackToGame(post);
    base.isFavorite = true;
    base.isWishlisted = false;
    addGameToStorage(base);
    markPostAsRead(id, post.date);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("fitrepacks-games-updated"));
    }
    return true;
  }
  return false;
}

export function setRepackStatus(
  id: string,
  post: RepackPost | undefined,
  status: "installed" | "wishlist" | "completed" | "none",
): void {
  const existing = getGameForRepack(id, post);
  if (existing) {
    if (status === "none" && !existing.isFavorite && !existing.exePath) {
      deleteGameFromStorage(existing.id);
    } else {
      setGameStatus(existing.id, status);
    }
  } else if (post && status !== "none") {
    const base = repackToGame(post);
    if (status === "installed") {
      base.isInstalled = true;
      base.isWishlisted = false;
      base.isCompleted = false;
      base.tags = Array.from(new Set([...(base.tags || []), "Installed"]));
    } else if (status === "completed") {
      base.isCompleted = true;
      base.isWishlisted = false;
      base.isInstalled = false;
      base.completedAt = new Date().toISOString();
      base.tags = Array.from(new Set([...(base.tags || []), "Completed"]));
    } else if (status === "wishlist") {
      base.isWishlisted = true;
      base.isInstalled = false;
      base.isCompleted = false;
      base.tags = Array.from(new Set([...(base.tags || []), "Wishlist"]));
    }
    addGameToStorage(base);
  }
  if (status !== "none") {
    markPostAsRead(id, post?.date || existing?.fitgirlUploadDate || existing?.steamripUploadDate);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("fitrepacks-games-updated"));
  }
}

/* ==========================================================================
   REPACK POSTS, ALSABASE & READ STATE MANAGEMENT
   ========================================================================== */

export function isIgnoredRepackTitle(title: string): boolean {
  if (!title) return true;
  const lower = title.toLowerCase().trim();
  const ignoredKeywords = [
    "upcoming repacks",
    "updates digest",
    "troubleshooting",
    "call for donations",
    "donations",
    "donate",
    "donation",
    "faq",
    "discussion",
    "how to download",
    "rules for comments",
    "comments",
    "telegram channel",
    "repack updated",
    "repack update",
    "repacks updated",
    "repack re-upload",
    "repack reuploaded",
  ];
  if (ignoredKeywords.some((keyword) => lower.includes(keyword))) {
    return true;
  }
  if (
    lower.endsWith(" updated") ||
    lower.endsWith(" - updated") ||
    lower.endsWith(" – updated") ||
    lower.endsWith(" — updated") ||
    lower.endsWith("[updated]") ||
    lower.endsWith("(updated)")
  ) {
    return true;
  }
  return false;
}

/** Build composite key using post ID and date (format: id-date) */
function buildPostCompositeId(id: string, date?: string): string {
  if (!id) return "";
  const cleanId = id.trim();
  const cleanDate = (date || "").trim();
  return cleanDate ? `${cleanId}-${cleanDate}` : cleanId;
}

function sanitizeStringArray(raw: any): string[] {
  if (!raw) return [];

  // Check if raw is a byte array (e.g. [91, 57, 49, ...])
  if (Array.isArray(raw)) {
    const numberCount = raw.filter((x) => typeof x === "number").length;
    if (numberCount > 0 && numberCount >= raw.length / 2) {
      try {
        let current = raw;
        for (let iter = 0; iter < 5; iter++) {
          const numbers = current.filter((x) => typeof x === "number");
          if (numbers.length === 0) break;
          const decoded = String.fromCharCode.apply(null, numbers);
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed)) {
            current = parsed;
          } else {
            break;
          }
        }
        if (Array.isArray(current)) {
          return sanitizeStringArray(current);
        }
      } catch (_) {}
    }

    return raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (typeof item === "object" && item !== null) {
          return String(item.name || item.title || item.value || "").trim();
        }
        return String(item || "").trim();
      })
      .filter((s) => Boolean(s) && isNaN(Number(s))); // Filter out pure numbers
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return sanitizeStringArray(parsed);
      }
    } catch (_) {}
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => Boolean(s) && isNaN(Number(s)));
  }
  return [];
}

function sanitizeMediaArray(raw: any): string[] {
  if (!raw) return [];

  // Check if raw is a byte array (e.g. [91, 57, 49, ...])
  if (Array.isArray(raw)) {
    const numberCount = raw.filter((x) => typeof x === "number").length;
    if (numberCount > 0 && numberCount >= raw.length / 2) {
      try {
        let current = raw;
        for (let iter = 0; iter < 5; iter++) {
          const numbers = current.filter((x) => typeof x === "number");
          if (numbers.length === 0) break;
          const decoded = String.fromCharCode.apply(null, numbers);
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed)) {
            current = parsed;
          } else {
            break;
          }
        }
        if (Array.isArray(current)) {
          return sanitizeMediaArray(current);
        }
      } catch (_) {}
    }

    return raw
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (typeof item === "object" && item !== null) {
          return String(item.url || item.src || item.id || item.video_id || "").trim();
        }
        return String(item || "").trim();
      })
      .filter((s) => Boolean(s));
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return sanitizeMediaArray(parsed);
      }
    } catch (_) {}
    return [raw.trim()].filter(Boolean);
  }
  return [];
}

/** Map an AlsaBase 'repacks' record to the frontend RepackPost model */
function mapRecordToRepackPost(rec: any): RepackPost {
  const rawTitle = String(rec.title || "");
  const cleanTitle = rawTitle
    .replace(/\s*[\-\–\—\(\[\{]?\s*Updated\s*[\)\}\]]?$/i, "")
    .trim();
  const rawUrl = String(rec.url || "");
  const cleanUrl = rawUrl
    .replace(/-repack-updated\/?$/i, "/")
    .replace(/-updated\/?$/i, "/");

  return {
    id: rec.repack_id || rec.id,
    title: cleanTitle || rawTitle,
    url: cleanUrl || rawUrl,
    coverUrl: String(rec.cover_url || ""),
    repackSize: String(rec.repack_size || "N/A"),
    originalSize: String(rec.original_size || "N/A"),
    genres: sanitizeStringArray(rec.genres),
    companies: String(rec.companies || ""),
    languages: String(rec.languages || ""),
    description: String(rec.description || rec.title || ""),
    screenshots: sanitizeMediaArray(rec.screenshots),
    videos: sanitizeMediaArray(rec.videos),
    mirrorGroups: Array.isArray(rec.mirror_groups)
      ? rec.mirror_groups
      : typeof rec.mirror_groups === "string"
        ? (() => {
            try {
              return JSON.parse(rec.mirror_groups);
            } catch (_) {
              return [];
            }
          })()
        : [],
    gameUpdates: Array.isArray(rec.game_updates)
      ? rec.game_updates
      : typeof rec.game_updates === "string"
        ? (() => {
            try {
              return JSON.parse(rec.game_updates);
            } catch (_) {
              return [];
            }
          })()
        : [],
    date: String(
      rec.post_date || (rec.created ? rec.created.split(" ")[0] : ""),
    ),
    isRead: false,
    scrapedAt: String(rec.updated || rec.created || ""),
    topMonthlyRank:
      typeof rec.popular_rank_month === "number"
        ? rec.popular_rank_month
        : undefined,
    topYearlyRank:
      typeof rec.popular_rank_year === "number"
        ? rec.popular_rank_year
        : undefined,
    isHypervisor: Boolean(
      rec.isHypervisor ||
      rec.is_hypervisor ||
      rec.ishypervisor ||
      rec.ishypervisor === 1 ||
      rec.ishypervisor === "1" ||
      false,
    ),
    source: String(rec.source || "fitgirl"),
  };
}

export interface RepackPaginationOptions {
  page?: number;
  perPage?: number;
  searchQuery?: string;
  sortBy?: "newest" | "oldest" | "title";
  popularFilter?: "all" | "popular_month" | "popular_year";
  selectedCategories?: string[];
  readFilter?: "all" | "unread" | "read";
  dataSource?: "fitgirl" | "steamrip";
  forceJson?: boolean;
}

export interface PaginatedRepacksResult {
  items: RepackPost[];
  totalItems: number;
  totalPages: number;
  page: number;
  perPage: number;
}

// In-memory TTL query cache for paginated results
const paginationCache = new Map<
  string,
  { result: PaginatedRepacksResult; timestamp: number }
>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

const matchingCandidatesCache = new Map<
  string,
  { data: any[]; timestamp: number }
>();
const CANDIDATES_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function invalidateRepacksCache(): void {
  paginationCache.clear();
  matchingCandidatesCache.clear();
  datasetStatsCache.clear();
}

export const ADULT_KEYWORDS = [
  "adult",
  "erotic",
  "hentai",
  "nsfw",
  "nudity",
  "sexual content",
  "18+",
  "porn",
];

export function isAdultContent(
  genres?: string[] | string,
  tags?: string[] | string,
  title?: string,
): boolean {
  const gStr = Array.isArray(genres) ? genres.join(" ") : String(genres || "");
  const tStr = Array.isArray(tags) ? tags.join(" ") : String(tags || "");
  const combined = `${gStr} ${tStr} ${title || ""}`.toLowerCase();
  return ADULT_KEYWORDS.some((kw) => {
    if (kw === "18+") return combined.includes("18+");
    return combined.includes(kw);
  });
}

/**
 * Fetch all records across pages from AlsaBase safely without flooding
 */
export async function fetchAllCollectionRecords(
  collectionName: string,
  options: { filter?: string; sort?: string; fields?: string } = {},
): Promise<any[]> {
  try {
    const batchSize = 200;
    const first = await ab.collection(collectionName).getList(1, batchSize, {
      ...options,
      requestKey: null,
      autoCancel: false,
    });
    const items = [...(first.items || [])];
    const totalItems =
      (first as any).total ?? (first as any).totalItems ?? items.length;
    const totalPages = Math.ceil(totalItems / batchSize);

    if (totalPages > 1) {
      for (let p = 2; p <= totalPages; p++) {
        const res = await ab.collection(collectionName).getList(p, batchSize, {
          ...options,
          requestKey: null,
          autoCancel: false,
        });
        if (res?.items) {
          items.push(...res.items);
        }
      }
    }
    return items;
  } catch (err) {
    console.warn(`fetchAllCollectionRecords failed for ${collectionName}:`, err);
    return [];
  }
}
/** Compute search relevance score to rank exact game title matches above incidental release notes */
export function computeSearchRelevance(
  title: string = "",
  companies: string = "",
  query: string,
): number {
  const cleanQ = query.toLowerCase().trim();
  if (!cleanQ) return 0;
  const tLower = title.toLowerCase();
  const cLower = companies.toLowerCase();
  const cleanT = tLower.replace(/[^a-z0-9\s]/g, " ");

  let score = 0;
  if (tLower.startsWith(cleanQ)) {
    score += 1000;
  } else if (new RegExp(`\\b${cleanQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(cleanT)) {
    score += 500;
  } else if (tLower.includes(cleanQ)) {
    score += 200;
  }

  const tokens = cleanQ.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((tok) => tLower.includes(tok))) {
    score += 300;
  }

  // Penalty for release note suffixes (e.g. "+ Controller Fix" when not searching controller)
  if (tLower.includes("controller fix") && !cleanQ.includes("controller")) {
    score -= 150;
  }

  if (cLower.includes(cleanQ)) {
    score += 50;
  }

  return score;
}

/**
 * Load paginated repacks on-demand directly from AlsaBase (or local JSON fallback)
 */
export async function loadRepacksPaginated(
  options: RepackPaginationOptions = {},
): Promise<PaginatedRepacksResult> {
  const {
    page = 1,
    perPage = 10,
    searchQuery = "",
    sortBy = "newest",
    popularFilter = "all",
    selectedCategories = ["All"],
    readFilter = "all",
    dataSource = "fitgirl",
  } = options;

  if (typeof window === "undefined") {
    return { items: [], totalItems: 0, totalPages: 1, page, perPage };
  }

  // Check in-memory query cache for instant response
  const cleanSearch = searchQuery.trim();
  const cacheKey = JSON.stringify({
    page,
    perPage,
    search: cleanSearch.toLowerCase(),
    sortBy,
    popularFilter,
    selectedCategories,
    readFilter,
    dataSource,
  });

  const cached = paginationCache.get(cacheKey);
  if (
    cached &&
    (!cleanSearch || cached.result.items.length > 0) &&
    Date.now() - cached.timestamp < CACHE_TTL_MS
  ) {
    // Re-check read state for cached items
    const freshItems = cached.result.items.map((p) => ({
      ...p,
      isRead: isPostReadInStorage(p.id, p.date, dataSource),
    }));
    return { ...cached.result, items: freshItems };
  }

  // AlsaBase on-demand pagination for FitGirl and SteamRIP
  const collectionName = dataSource === "steamrip" ? "steamrip" : "repacks";
  try {
    const filterParts: string[] = [];
    const filterParams: Record<string, any> = {};

    // Search filter - target indexable fields for speed
    if (cleanSearch) {
      const tokens = cleanSearch
        .split(/[\s:,\-_/\\|.]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (tokens.length === 1) {
        filterParams["search_0"] = tokens[0];
        filterParts.push(`title ~ {:search_0} || companies ~ {:search_0}`);
      } else if (tokens.length > 1) {
        const titleClauses = tokens.map((token, idx) => {
          const key = `search_${idx}`;
          filterParams[key] = token;
          return `title ~ {:${key}}`;
        });
        filterParts.push(titleClauses.join(" && "));
      }
    }

    // Popular filter
    if (popularFilter === "popular_month") {
      filterParts.push("popular_rank_month > 0");
    } else if (popularFilter === "popular_year") {
      filterParts.push("popular_rank_year > 0");
    }

    // Categories filter
    const isAdultSelected = Boolean(
      selectedCategories &&
      selectedCategories.some((cat) =>
        ADULT_KEYWORDS.some((kw) => cat.toLowerCase().includes(kw)),
      ),
    );

    if (
      selectedCategories &&
      selectedCategories.length > 0 &&
      !selectedCategories.includes("All")
    ) {
      const catClauses = selectedCategories.map((cat, idx) => {
        const key = `cat_${idx}`;
        filterParams[key] = cat;
        return `genres ~ {:${key}}`;
      });
      filterParts.push(catClauses.join(" || "));
    }

    const userExcluded = getExcludedGenres();
    const effectiveExcluded = userExcluded.filter(
      (ex) =>
        !selectedCategories?.some(
          (sc) => sc.toLowerCase() === ex.toLowerCase(),
        ),
    );

    // Sort expression
    let sortExpr = "-post_date";
    if (popularFilter === "popular_month") {
      sortExpr = "+popular_rank_month";
    } else if (popularFilter === "popular_year") {
      sortExpr = "+popular_rank_year";
    } else if (sortBy === "oldest") {
      sortExpr = "+post_date";
    } else if (sortBy === "title") {
      sortExpr = "+title";
    }

    // Read / Unread filter optimization - push directly to AlsaBase query
    const allReadAt = allReadAtMap[dataSource];
    if (readFilter === "unread") {
      if (allReadAt) {
        const markTime = parseDateSafe(allReadAt);
        if (markTime) {
          const isoDate = new Date(markTime).toISOString().replace("T", " ").slice(0, 19);
          filterParts.push(`post_date > "${isoDate}"`);
        }
      }
    } else if (readFilter === "read") {
      if (allReadAt) {
        const markTime = parseDateSafe(allReadAt);
        if (markTime) {
          const isoDate = new Date(markTime).toISOString().replace("T", " ").slice(0, 19);
          filterParts.push(`post_date <= "${isoDate}"`);
        }
      }
    }

    const abFilter =
      filterParts.length > 0
        ? ab.filter(filterParts.join(" && "), filterParams)
        : undefined;

    // Only route through candidate matching with relevance ranking when an active search query is typed
    if (Boolean(cleanSearch)) {
      const candCacheKey = `${collectionName}__${abFilter || "all"}__${sortExpr}`;
      const cachedCand = matchingCandidatesCache.get(candCacheKey);
      let allMatching: any[] = [];

        if (
          cachedCand &&
          Date.now() - cachedCand.timestamp < CANDIDATES_CACHE_TTL_MS
        ) {
          allMatching = cachedCand.data;
        } else {
          allMatching = await fetchAllCollectionRecords(collectionName, {
            filter: abFilter,
            sort: sortExpr,
            fields:
              "id,repack_id,title,companies,genres,post_date,created,isHypervisor,is_hypervisor,ishypervisor",
          });
          matchingCandidatesCache.set(candCacheKey, {
            data: allMatching,
            timestamp: Date.now(),
          });
          if (matchingCandidatesCache.size > 20) {
            const oldest = matchingCandidatesCache.keys().next().value;
            if (oldest) matchingCandidatesCache.delete(oldest);
          }
        }

        let candidates = (allMatching || []).filter(
          (p) => !isIgnoredRepackTitle(p.title),
        );

        if (!isAdultSelected) {
          candidates = candidates.filter(
            (p) => !isAdultContent(p.genres, [], p.title),
          );
        }

        if (effectiveExcluded.length > 0) {
          candidates = candidates.filter((p) => {
            const postGenres = Array.isArray(p.genres)
              ? p.genres
              : [String(p.genres || "")];
            return !effectiveExcluded.some((ex) =>
              postGenres.some((pg: string) =>
                pg.toLowerCase().includes(ex.toLowerCase()),
              ),
            );
          });
        }

        const filteredCandidates = candidates.filter((p) => {
          if (readFilter === "unread" || readFilter === "read") {
            const id = p.repack_id || p.id;
            const date = String(p.post_date || (p.created ? p.created.split(" ")[0] : ""));
            const isRead = isPostReadInStorage(id, date, dataSource);
            return readFilter === "unread" ? !isRead : isRead;
          }
          return true;
        });

        if (cleanSearch) {
          filteredCandidates.sort((a, b) => {
            const scoreA = computeSearchRelevance(
              a.title,
              a.companies,
              cleanSearch,
            );
            const scoreB = computeSearchRelevance(
              b.title,
              b.companies,
              cleanSearch,
            );
            if (scoreB !== scoreA) {
              return scoreB - scoreA;
            }
            const dateA = a.post_date ? new Date(a.post_date).getTime() : 0;
            const dateB = b.post_date ? new Date(b.post_date).getTime() : 0;
            return dateB - dateA;
          });
        }

        const totalItems = filteredCandidates.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
        const validPage = Math.max(1, Math.min(page, totalPages));
        const startIndex = (validPage - 1) * perPage;
        const pageSlice = filteredCandidates.slice(
          startIndex,
          startIndex + perPage,
        );

        if (pageSlice.length === 0) {
          const emptyResult: PaginatedRepacksResult = {
            items: [],
            totalItems,
            totalPages,
            page: validPage,
            perPage,
          };
          paginationCache.set(cacheKey, {
            result: emptyResult,
            timestamp: Date.now(),
          });
          return emptyResult;
        }

        const idFilter = pageSlice
          .map((_, idx) => `id = {:pid_${idx}}`)
          .join(" || ");
        const idParams: Record<string, string> = {};
        pageSlice.forEach((item, idx) => {
          idParams[`pid_${idx}`] = item.id;
        });

        const fullRes = await ab.collection(collectionName).getList(1, perPage, {
          filter: ab.filter(idFilter, idParams),
          sort: sortExpr,
          requestKey: null,
          autoCancel: false,
        });

        const mapped = (fullRes.items || []).map(mapRecordToRepackPost);
        const ordered = pageSlice
          .map((target) =>
            mapped.find(
              (p) =>
                p.id === (target.repack_id || target.id) || p.id === target.id,
            ),
          )
          .filter(Boolean) as RepackPost[];

        const enriched = ordered.map((p) => {
          return { ...p, isRead: isPostReadInStorage(p.id, p.date, dataSource) };
        });

        const finalResult: PaginatedRepacksResult = {
          items: enriched,
          totalItems,
          totalPages,
          page: validPage,
          perPage,
        };

        paginationCache.set(cacheKey, {
          result: finalResult,
          timestamp: Date.now(),
        });
        if (paginationCache.size > 150) {
          const oldest = paginationCache.keys().next().value;
          if (oldest) paginationCache.delete(oldest);
        }

        return finalResult;
    }

    const res = await ab.collection(collectionName).getList(page, perPage, {
      filter: abFilter,
      sort: sortExpr,
      requestKey: null,
      autoCancel: false,
    });

    if (res && Array.isArray(res.items)) {
      const mappedPosts: RepackPost[] = res.items
        .map(mapRecordToRepackPost)
        .filter((p: RepackPost) => !isIgnoredRepackTitle(p.title));

      // Enrich with SQLite read state
      let enriched = mappedPosts.map((p: RepackPost) => {
        const isRead = isPostReadInStorage(p.id, p.date, dataSource);
        return { ...p, isRead };
      });

      if (readFilter === "unread") {
        enriched = enriched.filter((p) => !p.isRead);
      } else if (readFilter === "read") {
        enriched = enriched.filter((p) => p.isRead);
      }

      if (
        selectedCategories &&
        selectedCategories.length > 0 &&
        !selectedCategories.includes("All")
      ) {
        enriched = enriched.filter((p) => {
          const postGenres = (p.genres || []).map((g) => g.toLowerCase());
          const postTitle = (p.title || "").toLowerCase();
          return selectedCategories.some((cat) => {
            const cLower = cat.toLowerCase();
            return (
              postGenres.some((pg) => pg.includes(cLower) || cLower.includes(pg)) ||
              postTitle.includes(cLower)
            );
          });
        });
      }

      if (!isAdultSelected) {
        enriched = enriched.filter(
          (p) => !isAdultContent(p.genres, [], p.title),
        );
      }

      if (effectiveExcluded.length > 0) {
        enriched = enriched.filter((p) => {
          const postGenres = Array.isArray(p.genres)
            ? p.genres
            : [String(p.genres || "")];
          return !effectiveExcluded.some((ex) =>
            postGenres.some((pg) =>
              pg.toLowerCase().includes(ex.toLowerCase()),
            ),
          );
        });
      }

      const perPageNum =
        (res as any).limit ?? (res as any).perPage ?? perPage;
      const totalItemsCount =
        readFilter !== "all"
          ? enriched.length
          : (res as any).total ?? (res as any).totalItems ?? 0;
      const totalPagesCount =
        readFilter !== "all"
          ? Math.max(1, Math.ceil(enriched.length / perPageNum))
          : res.totalPages ?? 1;
      const pageNum = res.page ?? 1;

      const finalResult: PaginatedRepacksResult = {
        items: enriched,
        totalItems: totalItemsCount,
        totalPages: totalPagesCount,
        page: pageNum,
        perPage: perPageNum,
      };

      // Cache the result
      paginationCache.set(cacheKey, {
        result: finalResult,
        timestamp: Date.now(),
      });
      if (paginationCache.size > 150) {
        const oldest = paginationCache.keys().next().value;
        if (oldest) paginationCache.delete(oldest);
      }

      return finalResult;
    }
  } catch (pbErr) {
    console.warn("AlsaBase getList failed:", pbErr);
  }

  return {
    items: [],
    totalItems: 0,
    totalPages: 1,
    page,
    perPage,
  };
}

let cachedReadPostIds: string[] = [];
let cachedReadPostIdsSet: Set<string> = new Set();
const explicitlyUnreadPostIdsSet: Set<string> = new Set();
const allReadAtMap: Record<string, string> = {
  fitgirl: "",
  steamrip: "",
};

/**
 * Maps cleanId -> ISO timestamp of when the post was marked read.
 * Used to detect if a post has been updated (new date) since it was read.
 */
const readPostTimestamps: Map<string, string> = new Map();

function updateCachedReadPostIds(
  list: string[],
  timestamps?: Record<string, string>,
): void {
  cachedReadPostIds = list;
  cachedReadPostIdsSet = new Set(list);
  if (timestamps) {
    for (const [id, ts] of Object.entries(timestamps)) {
      readPostTimestamps.set(id, ts);
    }
  }
}

function persistCachedReadPostsToLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      "fitrepacks_read_posts",
      JSON.stringify(cachedReadPostIds),
    );
    localStorage.setItem(
      "fitrepacks_explicitly_unread_posts",
      JSON.stringify(Array.from(explicitlyUnreadPostIdsSet)),
    );
    localStorage.setItem(
      "fitrepacks_all_read_at_fitgirl",
      allReadAtMap.fitgirl || "",
    );
    localStorage.setItem(
      "fitrepacks_all_read_at_steamrip",
      allReadAtMap.steamrip || "",
    );
    // Persist per-post read timestamps so post-date changes invalidate stale reads
    localStorage.setItem(
      "fitrepacks_read_post_timestamps",
      JSON.stringify(Object.fromEntries(readPostTimestamps)),
    );
  } catch (_) {}
}

/**
 * Check if a post is marked as read in storage (supporting composite ID, plain ID, and global all-read timestamp).
 * If the post has a date newer than when it was read, it is treated as unread (post was updated).
 */
export function isPostReadInStorage(
  id: string,
  date?: string,
  dataSource: "fitgirl" | "steamrip" = "fitgirl",
): boolean {
  if (!id) return false;
  const cleanId = String(id).trim();
  const compositeId = buildPostCompositeId(cleanId, date);

  if (
    explicitlyUnreadPostIdsSet.has(compositeId) ||
    explicitlyUnreadPostIdsSet.has(cleanId)
  ) {
    return false;
  }

  if (
    cachedReadPostIdsSet.has(compositeId) ||
    cachedReadPostIdsSet.has(cleanId)
  ) {
    // Check if the post has been updated since it was read
    if (date) {
      const readAt =
        readPostTimestamps.get(compositeId) ||
        readPostTimestamps.get(cleanId);
      if (readAt) {
        const postTime = parseDateSafe(date);
        const readTime = parseDateSafe(readAt);
        // If the post date is more than 24h after the read timestamp, it was updated
        if (postTime && readTime && postTime > readTime + 86400000) {
          return false;
        }
      }
    }
    return true;
  }

  const allReadAt = allReadAtMap[dataSource];
  if (allReadAt) {
    if (!date) return true;
    const postTime = parseDateSafe(date);
    const markTime = parseDateSafe(allReadAt);
    if (!postTime || !markTime) return true;
    // Allow 24h margin for timezone differences
    if (postTime <= markTime + 86400000) {
      // Check if the post has been updated after the global mark-all-read
      // If post date is newer than allReadAt, it should appear as unread
      return true;
    }
  }

  return false;
}

/**
 * Load read posts from SQLite read_posts & app_settings table via @tauri-apps/plugin-sql
 */
async function syncReadPostsFromSQLite(): Promise<string[]> {
  if (typeof window !== "undefined") {
    try {
      const rawRead = localStorage.getItem("fitrepacks_read_posts");
      if (rawRead) {
        const parsed = JSON.parse(rawRead);
        if (Array.isArray(parsed) && parsed.length > 0) {
          updateCachedReadPostIds(parsed);
        }
      }
      const rawUnread = localStorage.getItem(
        "fitrepacks_explicitly_unread_posts",
      );
      if (rawUnread) {
        const parsed = JSON.parse(rawUnread);
        if (Array.isArray(parsed)) {
          explicitlyUnreadPostIdsSet.clear();
          parsed.forEach((id) => explicitlyUnreadPostIdsSet.add(id));
        }
      }
      const fgAll = localStorage.getItem("fitrepacks_all_read_at_fitgirl");
      if (fgAll) allReadAtMap.fitgirl = fgAll;
      const srAll = localStorage.getItem("fitrepacks_all_read_at_steamrip");
      if (srAll) allReadAtMap.steamrip = srAll;
      // Load per-post read timestamps
      const rawTimestamps = localStorage.getItem(
        "fitrepacks_read_post_timestamps",
      );
      if (rawTimestamps) {
        const parsed = JSON.parse(rawTimestamps);
        if (parsed && typeof parsed === "object") {
          for (const [id, ts] of Object.entries(parsed)) {
            if (typeof ts === "string") readPostTimestamps.set(id, ts);
          }
        }
      }
    } catch (_) {}
  }

  if (isTauri()) {
    try {
      const db = await getDatabase();
      // Load post_id AND read_at so we can detect posts updated after being read
      const rows = await db.select<{ post_id: string; read_at: string }[]>(
        "SELECT post_id, read_at FROM read_posts",
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const list = rows.map((r) => r.post_id);
        const timestamps: Record<string, string> = {};
        for (const r of rows) {
          if (r.read_at) timestamps[r.post_id] = r.read_at;
        }
        updateCachedReadPostIds(list, timestamps);
      }

      const fgAllSetting = await getAppSetting("all_read_at_fitgirl");
      if (fgAllSetting) allReadAtMap.fitgirl = fgAllSetting;

      const srAllSetting = await getAppSetting("all_read_at_steamrip");
      if (srAllSetting) allReadAtMap.steamrip = srAllSetting;

      const unreadSetting = await getAppSetting("explicitly_unread_posts");
      if (unreadSetting) {
        try {
          const parsed = JSON.parse(unreadSetting);
          if (Array.isArray(parsed)) {
            explicitlyUnreadPostIdsSet.clear();
            parsed.forEach((id) => explicitlyUnreadPostIdsSet.add(id));
          }
        } catch (_) {}
      }

      persistCachedReadPostsToLocalStorage();
    } catch (err) {
      console.error("Error reading read_posts via plugin-sql:", err);
    }
  }

  return cachedReadPostIds;
}

// Initializer on module load
if (typeof window !== "undefined") {
  syncReadPostsFromSQLite().catch(() => {});
}

export function markPostAsRead(
  id: string,
  date?: string,
  dataSource: "fitgirl" | "steamrip" = "fitgirl",
): boolean {
  if (!id) return false;
  const cleanId = String(id).trim();
  const compositeId = buildPostCompositeId(cleanId, date);
  if (!compositeId) return false;

  explicitlyUnreadPostIdsSet.delete(compositeId);
  explicitlyUnreadPostIdsSet.delete(cleanId);

  const now = new Date().toISOString();
  // Record when this post was read so future date changes invalidate the read state
  readPostTimestamps.set(compositeId, now);
  readPostTimestamps.set(cleanId, now);

  let changed = false;
  if (!cachedReadPostIdsSet.has(compositeId)) {
    cachedReadPostIds = [...cachedReadPostIds, compositeId];
    cachedReadPostIdsSet.add(compositeId);
    changed = true;
  }
  if (!cachedReadPostIdsSet.has(cleanId)) {
    cachedReadPostIds = [...cachedReadPostIds, cleanId];
    cachedReadPostIdsSet.add(cleanId);
    changed = true;
  }

  persistCachedReadPostsToLocalStorage();
  invalidateRepacksCache();

  if (isTauri()) {
    saveAppSetting(
      "explicitly_unread_posts",
      JSON.stringify(Array.from(explicitlyUnreadPostIdsSet)),
    ).catch(() => {});
    getDatabase()
      .then((db) =>
        db.execute(
          "INSERT OR REPLACE INTO read_posts (post_id, read_at) VALUES ($1, $2), ($3, $4)",
          [compositeId, now, cleanId, now],
        ),
      )
      .catch((err) =>
        console.error("Error inserting read post via plugin-sql:", err),
      );
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fitrepacks-post-read-updated", {
        detail: { id: cleanId, date, compositeId, isRead: true },
      }),
    );
  }
  return true;
}

export function togglePostReadState(
  id: string,
  date?: string,
  dataSource: "fitgirl" | "steamrip" = "fitgirl",
): boolean {
  const cleanId = String(id).trim();
  const compositeId = buildPostCompositeId(cleanId, date);
  const isCurrentlyRead = isPostReadInStorage(cleanId, date, dataSource);
  let isRead: boolean;

  if (isCurrentlyRead) {
    cachedReadPostIds = cachedReadPostIds.filter(
      (item) => item !== compositeId && item !== cleanId,
    );
    cachedReadPostIdsSet.delete(compositeId);
    cachedReadPostIdsSet.delete(cleanId);
    explicitlyUnreadPostIdsSet.add(compositeId);
    explicitlyUnreadPostIdsSet.add(cleanId);
    isRead = false;
    persistCachedReadPostsToLocalStorage();
    if (isTauri()) {
      saveAppSetting(
        "explicitly_unread_posts",
        JSON.stringify(Array.from(explicitlyUnreadPostIdsSet)),
      ).catch(() => {});
      getDatabase()
        .then((db) =>
          db.execute(
            "DELETE FROM read_posts WHERE post_id = $1 OR post_id = $2",
            [compositeId, cleanId],
          ),
        )
        .catch((err) =>
          console.error("Error deleting read post via plugin-sql:", err),
        );
    }
  } else {
    explicitlyUnreadPostIdsSet.delete(compositeId);
    explicitlyUnreadPostIdsSet.delete(cleanId);
    const now = new Date().toISOString();
    // Record when this post was read so future date changes invalidate the read state
    readPostTimestamps.set(compositeId, now);
    readPostTimestamps.set(cleanId, now);
    cachedReadPostIds = [...cachedReadPostIds, compositeId, cleanId];
    cachedReadPostIdsSet.add(compositeId);
    cachedReadPostIdsSet.add(cleanId);
    isRead = true;
    persistCachedReadPostsToLocalStorage();
    if (isTauri()) {
      saveAppSetting(
        "explicitly_unread_posts",
        JSON.stringify(Array.from(explicitlyUnreadPostIdsSet)),
      ).catch(() => {});
      getDatabase()
        .then((db) =>
          db.execute(
            "INSERT OR REPLACE INTO read_posts (post_id, read_at) VALUES ($1, $2), ($3, $4)",
            [compositeId, now, cleanId, now],
          ),
        )
        .catch((err) =>
          console.error("Error inserting read post via plugin-sql:", err),
        );
    }
  }

  invalidateRepacksCache();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fitrepacks-post-read-updated", {
        detail: { id: cleanId, date, compositeId, isRead },
      }),
    );
  }

  return isRead;
}

export async function markPostsAsReadBatch(
  posts: { id: string; date?: string }[],
): Promise<void> {
  if (!posts || posts.length === 0) return;
  const newIds: string[] = [];
  const now = new Date().toISOString();
  for (const p of posts) {
    const cleanId = String(p.id).trim();
    const compositeId = buildPostCompositeId(cleanId, p.date);
    explicitlyUnreadPostIdsSet.delete(compositeId);
    explicitlyUnreadPostIdsSet.delete(cleanId);
    // Record when each post was read so future date changes invalidate the read state
    readPostTimestamps.set(compositeId, now);
    readPostTimestamps.set(cleanId, now);
    if (compositeId && !cachedReadPostIdsSet.has(compositeId)) {
      cachedReadPostIds.push(compositeId);
      cachedReadPostIdsSet.add(compositeId);
      newIds.push(compositeId);
    }
    if (cleanId && !cachedReadPostIdsSet.has(cleanId)) {
      cachedReadPostIds.push(cleanId);
      cachedReadPostIdsSet.add(cleanId);
      newIds.push(cleanId);
    }
  }

  persistCachedReadPostsToLocalStorage();
  invalidateRepacksCache();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fitrepacks-post-read-updated", {
        detail: { all: true, isRead: true },
      }),
    );
  }

  if (isTauri() && newIds.length > 0) {
    const now = new Date().toISOString();
    try {
      const db = await getDatabase();
      const chunkSize = 200;
      for (let i = 0; i < newIds.length; i += chunkSize) {
        const chunk = newIds.slice(i, i + chunkSize);
        const placeholders = chunk
          .map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`)
          .join(", ");
        const params: string[] = [];
        chunk.forEach((id) => {
          params.push(id, now);
        });
        await db.execute(
          `INSERT OR IGNORE INTO read_posts (post_id, read_at) VALUES ${placeholders}`,
          params,
        );
      }
    } catch (err) {
      console.error("Error saving read posts batch via plugin-sql:", err);
    }
  }
}

/**
 * Mark all repacks in the entire dataset as read
 */
export async function markAllRepacksAsRead(
  dataSource: "fitgirl" | "steamrip" = "fitgirl",
): Promise<void> {
  const now = new Date().toISOString();
  allReadAtMap[dataSource] = now;
  explicitlyUnreadPostIdsSet.clear();

  datasetStatsCache.delete(dataSource === "steamrip" ? "steamrip" : "repacks");
  matchingCandidatesCache.clear();
  paginationCache.clear();
  persistCachedReadPostsToLocalStorage();
  invalidateRepacksCache();

  if (isTauri()) {
    saveAppSetting(`all_read_at_${dataSource}`, now).catch(() => {});
    saveAppSetting("explicitly_unread_posts", "[]").catch(() => {});
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fitrepacks-post-read-updated", {
        detail: { all: true, isRead: true },
      }),
    );
  }
}

export interface RepackDatasetStats {
  totalCount: number;
  unreadCount: number;
  readCount: number;
  topMonthCount: number;
  topYearCount: number;
}

const datasetStatsCache = new Map<
  string,
  { stats: RepackDatasetStats; timestamp: number }
>();
const DATASET_STATS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Get total counts and read/unread metrics across the entire dataset via AlsaBase
 */
export async function getRepackDatasetStats(
  dataSource: "fitgirl" | "steamrip" = "fitgirl",
): Promise<RepackDatasetStats> {
  const collectionName = dataSource === "steamrip" ? "steamrip" : "repacks";
  if (cachedReadPostIds.length === 0) {
    await syncReadPostsFromSQLite();
  }

  const cached = datasetStatsCache.get(collectionName);
  if (cached && Date.now() - cached.timestamp < DATASET_STATS_CACHE_TTL_MS) {
    return cached.stats;
  }

  let totalCount = 0;
  let topMonthCount = 0;
  let topYearCount = 0;

  try {
    const [totalRes, topMonthRes, topYearRes] = await Promise.all([
      ab.collection(collectionName).getList(1, 1, {
        fields: "id",
        requestKey: null,
      }),
      ab.collection(collectionName).getList(1, 1, {
        filter: "popular_rank_month > 0",
        fields: "id",
        requestKey: null,
      }),
      ab.collection(collectionName).getList(1, 1, {
        filter: "popular_rank_year > 0",
        fields: "id",
        requestKey: null,
      }),
    ]);

    totalCount =
      (totalRes as any).total ?? (totalRes as any).totalItems ?? 0;
    topMonthCount =
      (topMonthRes as any).total ?? (topMonthRes as any).totalItems ?? 0;
    topYearCount =
      (topYearRes as any).total ?? (topYearRes as any).totalItems ?? 0;

    let readCount = 0;
    let unreadCount = 0;

    const allReadAt = allReadAtMap[dataSource];
    if (allReadAt) {
      try {
        const markTime = parseDateSafe(allReadAt);
        if (markTime) {
          const markDate = new Date(markTime);
          const isoDate = markDate.toISOString().replace("T", " ").slice(0, 19);
          const newerRes = await ab.collection(collectionName).getList(1, 100, {
            filter: `post_date > "${isoDate}"`,
            fields: "id,repack_id,post_date",
            requestKey: null,
          });
          const newerItems = newerRes.items || [];
          const actualNewerUnread = newerItems.filter((p) => {
            const id = p.repack_id || p.id;
            const date = String(p.post_date || "");
            return !isPostReadInStorage(id, date, dataSource);
          }).length;

          const distinctExplicitlyUnread = Array.from(explicitlyUnreadPostIdsSet).filter(
            (id) => !newerItems.some((n) => n.id === id || n.repack_id === id),
          ).length;

          unreadCount = Math.min(totalCount, actualNewerUnread + distinctExplicitlyUnread);
          readCount = Math.max(0, totalCount - unreadCount);
        } else {
          const distinctExplicitlyUnread = new Set(
            Array.from(explicitlyUnreadPostIdsSet).map((id) => id.split("_")[0]),
          ).size;
          unreadCount = Math.min(totalCount, distinctExplicitlyUnread);
          readCount = Math.max(0, totalCount - unreadCount);
        }
      } catch (_) {
        const distinctExplicitlyUnread = new Set(
          Array.from(explicitlyUnreadPostIdsSet).map((id) => id.split("_")[0]),
        ).size;
        unreadCount = Math.min(totalCount, distinctExplicitlyUnread);
        readCount = Math.max(0, totalCount - unreadCount);
      }
    } else {
      const distinctReadIds = new Set(
        cachedReadPostIds.map((id) => id.split("_")[0]),
      );
      readCount = Math.min(totalCount, distinctReadIds.size);
      unreadCount = Math.max(0, totalCount - readCount);
    }

    const stats: RepackDatasetStats = {
      totalCount,
      unreadCount,
      readCount,
      topMonthCount,
      topYearCount,
    };

    datasetStatsCache.set(collectionName, {
      stats,
      timestamp: Date.now(),
    });

    return stats;
  } catch (err) {
    console.warn("Could not fetch dataset stats from AlsaBase:", err);
    return {
      totalCount,
      unreadCount: 0,
      readCount: 0,
      topMonthCount,
      topYearCount,
    };
  }
}

const PINNED_GAMES_KEY = "fitrepacks_pinned_game_ids";

export function getPinnedGameIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PINNED_GAMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function togglePinnedGame(id: string): string[] {
  if (typeof window === "undefined") return [];
  const current = getPinnedGameIds();
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [id, ...current];
  try {
    localStorage.setItem(PINNED_GAMES_KEY, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent("fitrepacks-pinned-updated", { detail: next }),
    );
  } catch (err) {
    console.error("Failed to save pinned games to localStorage:", err);
  }
  return next;
}

export function isGamePinned(id: string): boolean {
  return getPinnedGameIds().includes(id);
}
