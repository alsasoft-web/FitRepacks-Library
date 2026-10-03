import { ab } from "./alsabase";
import {
  getNotificationSettings,
  getRepackNotificationsEnabled,
  getStoredGames,
  updateGameInStorage,
  isIgnoredRepackTitle,
  normalizeGameTitle,
} from "./db";
import {
  sendDesktopNotification,
  requestNotificationPermission,
} from "./notification";
import { Game } from "./types";
import {
  detectGameExeLastModified,
  isGameUpToDateByDate,
} from "./versionDetector";

let isSubscribed = false;
let subscribePromise: Promise<() => void> | null = null;

// In-memory de-duplication cache to prevent duplicate notifications
const recentNotifications = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10000; // 10 seconds dedupe window

// Cache to track the latest release content signature of games to detect real game updates vs ranking/metadata changes
const knownReleaseSignatures = new Map<string, string>();

function getReleaseSignature(record: any): string {
  const title = String(record.title || "").trim();
  const size = String(record.repack_size || "").trim();
  const postDate = String(record.post_date || "").trim();
  const mirrorGroups =
    typeof record.mirror_groups === "string"
      ? record.mirror_groups
      : JSON.stringify(record.mirror_groups || []);
  const gameUpdates =
    typeof record.game_updates === "string"
      ? record.game_updates
      : JSON.stringify(record.game_updates || []);

  return `${title}|${size}|${postDate}|${mirrorGroups}|${gameUpdates}`;
}

function isGameReleaseUpdate(
  record: any,
  gameKey: string,
  action: string,
): boolean {
  const currentSignature = getReleaseSignature(record);
  const previousSignature = knownReleaseSignatures.get(gameKey);

  // Store the updated signature
  knownReleaseSignatures.set(gameKey, currentSignature);

  if (knownReleaseSignatures.size > 3000) {
    const keysToDelete = Array.from(knownReleaseSignatures.keys()).slice(
      0,
      500,
    );
    for (const k of keysToDelete) {
      knownReleaseSignatures.delete(k);
    }
  }

  if (action === "create") {
    return true;
  }

  // If we have seen this game before and its release signature didn't change (e.g. only popular ranking changed), do not notify
  if (previousSignature && previousSignature === currentSignature) {
    return false;
  }

  return true;
}

/**
 * Determine the origin/source of a game in library
 */
function getGameSource(
  game: Game,
): "fitgirl" | "steamrip" | "manual" | "unknown" {
  if (game.source) {
    const s = game.source.toLowerCase();
    if (s.includes("steamrip")) return "steamrip";
    if (s.includes("fitgirl")) return "fitgirl";
    if (s.includes("manual") || s.includes("imported")) return "manual";
  }
  if (game.tags && Array.isArray(game.tags)) {
    for (const tag of game.tags) {
      const lower = tag.toLowerCase();
      if (lower === "steamrip" || lower.includes("steamrip")) return "steamrip";
      if (lower === "fitgirl" || lower.includes("fitgirl")) return "fitgirl";
      if (lower === "manual" || lower === "imported") return "manual";
    }
  }
  if (game.id && game.id.startsWith("repack-")) {
    if (game.id.includes("steamrip")) return "steamrip";
    return "fitgirl";
  }
  return "unknown";
}

/**
 * Extract version string from post title
 */
function extractVersion(title: string): string | undefined {
  const match = title.match(
    /\b(v\d+(\.\d+)+[a-z0-9_]*|\bv\d+\b|Build\s*\d+|v\d{4}\.\d{2}\.\d{2})\b/i,
  );
  return match ? match[0] : undefined;
}

/**
 * Match an incoming repack/game record with a library game
 * STRICT RULE: Must match source! If added from fitgirl, only fitgirl update matches.
 */
function findMatchingLibraryGame(
  record: any,
  source: string,
  games: Game[],
): Game | null {
  if (!games || games.length === 0) return null;

  const recordId = String(record.id || record.repack_id || "").trim();
  const recordTitle = String(record.title || "").trim();
  const normRecordTitle = normalizeGameTitle(recordTitle);

  for (const g of games) {
    const gameSource = getGameSource(g);

    // If game has a known source, it must match incoming source
    if (gameSource === "fitgirl" && source !== "fitgirl") {
      continue; // Strictly ignore steamrip updates for fitgirl games
    }
    if (gameSource === "steamrip" && source !== "steamrip") {
      continue; // Strictly ignore fitgirl updates for steamrip games
    }

    // Direct ID match
    if (recordId) {
      if (
        g.id === `repack-${recordId}` ||
        g.id === recordId ||
        g.id === `steamrip-${recordId}` ||
        g.id === `fitgirl-${recordId}`
      ) {
        return g;
      }
    }

    // Normalized title match (exact)
    const normGameTitle = normalizeGameTitle(g.title);
    if (normGameTitle && normRecordTitle && normGameTitle === normRecordTitle) {
      return g;
    }
  }

  return null;
}

interface PendingRepackNotification {
  action: "create" | "update";
  title: string;
  source: string;
  repackSize?: string;
  originalSize?: string;
}

let pendingBatch: PendingRepackNotification[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
let batchStartTime: number | null = null;

const BATCH_DEBOUNCE_MS = 1500; // Wait 1.5s after the last event to group incoming updates
const BATCH_MAX_WAIT_MS = 4000; // Max wait of 4s before forcing flush during continuous stream

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const lastTime = recentNotifications.get(key);
  if (lastTime && now - lastTime < DEDUPE_WINDOW_MS) {
    return true;
  }

  recentNotifications.set(key, now);

  // Clean old keys if map grows large
  if (recentNotifications.size > 200) {
    for (const [k, v] of recentNotifications.entries()) {
      if (now - v > DEDUPE_WINDOW_MS) {
        recentNotifications.delete(k);
      }
    }
  }
  return false;
}

/**
 * Flush accumulated notifications. If 1 or 2, sends individually.
 * If more than 2, sends a single aggregated summary notification.
 */
async function flushNotificationBatch(): Promise<void> {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  batchStartTime = null;

  const batch = [...pendingBatch];
  pendingBatch = [];

  if (batch.length === 0) return;

  try {
    if (batch.length <= 2) {
      // 1 or 2 notifications: send individually
      for (const item of batch) {
        const isUpdate = item.action === "update";
        const size = item.repackSize ? ` [${item.repackSize}]` : "";
        const originalSize =
          item.originalSize && item.originalSize !== "N/A"
            ? ` (Original: ${item.originalSize})`
            : "";
        const sourceName =
          item.source === "steamrip" ? "SteamRIP" : "FitGirl Repacks";

        const notificationTitle = isUpdate
          ? item.source === "steamrip"
            ? `SteamRIP Game Updated: ${item.title}`
            : `FitGirl Repack Updated: ${item.title}`
          : item.source === "steamrip"
            ? `New SteamRIP Game: ${item.title}`
            : `New FitGirl Repack: ${item.title}`;

        const bodyText = isUpdate
          ? `${item.title}${size} has been updated on ${sourceName}!`
          : `${item.title}${size}${originalSize} is now available on ${sourceName}!`;

        await sendDesktopNotification({
          title: notificationTitle,
          body: bodyText,
        });
      }
    } else {
      // More than 2 notifications: consolidate into a single summary notification
      const newGames = batch.filter((item) => item.action === "create");
      const updatedGames = batch.filter((item) => item.action === "update");

      const newCount = newGames.length;
      const updateCount = updatedGames.length;

      let summaryBody = "";
      if (newCount > 0 && updateCount > 0) {
        summaryBody = `${newCount} new game${newCount > 1 ? "s" : ""} added and ${updateCount} game${updateCount > 1 ? "s" : ""} updated.`;
      } else if (newCount > 0) {
        summaryBody = `${newCount} new games are now available!`;
      } else {
        summaryBody = `${updateCount} games have been updated!`;
      }

      // Add preview of game titles
      const sampleTitles = batch.slice(0, 3).map((item) => item.title);
      const remainingCount = batch.length - sampleTitles.length;
      const previewText =
        `\n• ${sampleTitles.join("\n• ")}` +
        (remainingCount > 0 ? `\n...and ${remainingCount} more` : "");

      await sendDesktopNotification({
        title: "🎮 FitRepacks Library Updates",
        body: `${summaryBody}${previewText}`,
      });
    }
  } catch (err) {
    console.error("Failed to send notification batch:", err);
  }
}

function isRepackSubscriptionActive(): boolean {
  return isSubscribed;
}

/**
 * Handle new game/repack created or updated event from AlsaBase (FitGirl or SteamRIP)
 */
async function handleRepackEvent(
  e: { action: string; record: any },
  forcedSource?: "fitgirl" | "steamrip",
) {
  console.log("[handleRepackEvent] Event received:", e);

  if (!e || (e.action !== "create" && e.action !== "update") || !e.record)
    return;

  const record = e.record;
  const title = String(record.title || "").trim();

  if (!title || isIgnoredRepackTitle(title)) {
    return;
  }

  const source =
    forcedSource ||
    record.source ||
    (record.collectionName === "steamrip" ? "steamrip" : "fitgirl");

  const isTestNotification =
    record.is_test === true ||
    title.toLowerCase().startsWith("[test]") ||
    title.toLowerCase().includes("[dev test]");

  const isDev =
    process.env.NODE_ENV === "development" ||
    (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.port === "3000" ||
        window.location.port === "1420"));

  console.log("[handleRepackEvent] Context:", {
    title,
    source,
    isTestNotification,
    isDev,
    nodeEnv: process.env.NODE_ENV,
  });

  // In production mode, completely ignore test posts
  if (isTestNotification && !isDev) {
    console.log(
      "[handleRepackEvent] Ignored test notification in production mode",
    );
    return;
  }

  // In development mode, immediately show a test notification
  if (isTestNotification) {
    const sourceName = source === "steamrip" ? "SteamRIP" : "FitGirl Repacks";
    console.log("[handleRepackEvent] Triggering test notification for:", title);
    await sendDesktopNotification({
      title: `[DEV TEST] ${sourceName} Test Insert`,
      body: `${title} (${record.repack_size || "N/A"}) was successfully inserted!`,
    });
    return;
  }

  // 1. Notify UI components that a repack/game was published or updated immediately
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fitrepacks-repack-created", {
        detail: { record, source, action: e.action },
      }),
    );
  }

  // 2. Load current Notification Settings
  const notifSettings = getNotificationSettings();

  // 3. Check if this record matches any game in user's library (with strict source matching)
  const storedGames = getStoredGames();
  const matchedLibraryGame = findMatchingLibraryGame(
    record,
    source,
    storedGames,
  );

  if (matchedLibraryGame) {
    const version = extractVersion(title);
    const cleanUrl = record.url
      ? String(record.url)
          .replace(/-repack-updated\/?$/i, "/")
          .replace(/-updated\/?$/i, "/")
      : undefined;

    // Parse incoming mirror groups and game updates
    let newMirrors: any[] = [];
    if (Array.isArray(record.mirror_groups)) {
      newMirrors = record.mirror_groups;
    } else if (
      typeof record.mirror_groups === "string" &&
      record.mirror_groups
    ) {
      try {
        newMirrors = JSON.parse(record.mirror_groups);
      } catch (_) {}
    }

    let newUpdates: any[] = [];
    if (Array.isArray(record.game_updates)) {
      newUpdates = record.game_updates;
    } else if (typeof record.game_updates === "string" && record.game_updates) {
      try {
        newUpdates = JSON.parse(record.game_updates);
      } catch (_) {}
    }

    // Merge mirror groups into matchedLibraryGame
    const existingMirrors = matchedLibraryGame.mirrorGroups || [];
    const mergedMirrors = [...existingMirrors];
    for (const group of newMirrors) {
      const idx = mergedMirrors.findIndex((m) => m.category === group.category);
      if (idx >= 0) {
        mergedMirrors[idx] = group;
      } else {
        mergedMirrors.push(group);
      }
    }

    // Merge game updates into matchedLibraryGame
    const existingUpdates = matchedLibraryGame.gameUpdates || [];
    const mergedUpdates = [...existingUpdates];
    for (const u of newUpdates) {
      const idx = mergedUpdates.findIndex((x) => x.url === u.url);
      if (idx >= 0) {
        mergedUpdates[idx] = u;
      } else {
        mergedUpdates.push(u);
      }
    }

    matchedLibraryGame.mirrorGroups =
      mergedMirrors.length > 0
        ? mergedMirrors
        : matchedLibraryGame.mirrorGroups;
    matchedLibraryGame.gameUpdates =
      mergedUpdates.length > 0 ? mergedUpdates : matchedLibraryGame.gameUpdates;
    if (cleanUrl) matchedLibraryGame.repackUrl = cleanUrl;
    if (record.repack_size) matchedLibraryGame.repackSize = record.repack_size;

    if (source === "fitgirl") {
      if (cleanUrl) matchedLibraryGame.linkedFitgirlUrl = cleanUrl;
      if (record.post_date)
        matchedLibraryGame.fitgirlUploadDate = record.post_date;
      if (version) matchedLibraryGame.fitgirlVersion = version;
    } else if (source === "steamrip") {
      if (cleanUrl) matchedLibraryGame.linkedSteamripUrl = cleanUrl;
      if (record.post_date)
        matchedLibraryGame.steamripUploadDate = record.post_date;
      if (version) matchedLibraryGame.steamripVersion = version;
    }

    // Check if game is already installed and whether this repack is genuinely newer by date
    let isRealUpdate = false;
    if (matchedLibraryGame.exePath && record.post_date) {
      const lastMod = matchedLibraryGame.installedLastModified
        ? new Date(matchedLibraryGame.installedLastModified)
        : await detectGameExeLastModified(matchedLibraryGame.exePath);

      if (lastMod) {
        if (!matchedLibraryGame.installedLastModified) {
          matchedLibraryGame.installedLastModified = lastMod.toISOString();
        }
        // If repack post date is newer than game exe last modified date by MORE than 10 days, it is a real update
        if (!isGameUpToDateByDate(lastMod, record.post_date, 10)) {
          isRealUpdate = true;
        }
      }
    }

    if (isRealUpdate) {
      matchedLibraryGame.hasUpdate = true;
      matchedLibraryGame.updateInfo = {
        hasUpdate: true,
        version: version,
        source: source,
        postTitle: title,
        date: record.post_date || new Date().toISOString(),
        url: cleanUrl || record.url,
      };
    } else {
      matchedLibraryGame.hasUpdate = false;
      matchedLibraryGame.updateInfo = undefined;
    }

    updateGameInStorage(matchedLibraryGame);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("fitrepacks-games-updated"));
    }

    // Check if notifications are enabled for library game updates
    if (
      isRealUpdate &&
      notifSettings.masterEnabled &&
      notifSettings.libraryGameUpdates
    ) {
      const dedupeKey = `lib_update_${source}_${matchedLibraryGame.id}_${record.id || record.repack_id}`;
      if (!isDuplicate(dedupeKey)) {
        const sourceName =
          source === "steamrip" ? "SteamRIP" : "FitGirl Repacks";
        const verStr = version ? ` (${version})` : "";
        await sendDesktopNotification({
          title: `Library Game Updated: ${matchedLibraryGame.title}`,
          body: `${matchedLibraryGame.title}${verStr} has a new update available on ${sourceName}!`,
        });
      }
    }
    // Library update handled
    return;
  }

  // 4. If not a library game, check general notification settings
  if (!notifSettings.masterEnabled) {
    return;
  }
  if (source === "fitgirl" && !notifSettings.fitgirlNotifications) {
    return;
  }
  if (source === "steamrip" && !notifSettings.steamripNotifications) {
    return;
  }

  // 5. For updates only, skip notifications for historical entries (> 7 days)
  if (e.action === "update" && record.post_date) {
    const postTime = new Date(record.post_date).getTime();
    if (!isNaN(postTime)) {
      const postAgeMs = Date.now() - postTime;
      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
      if (postAgeMs > SEVEN_DAYS_MS) {
        return;
      }
    }
  }

  // 6. De-duplicate identical events
  const dedupeKey = `${source}_${record.id || record.repack_id}_${e.action}`;
  if (isDuplicate(dedupeKey)) {
    return;
  }

  // 7. Skip if release signature is unchanged (for updates)
  const gameKey = `${source}_${record.id || record.repack_id}`;
  if (
    e.action === "update" &&
    !isGameReleaseUpdate(record, gameKey, e.action)
  ) {
    return;
  }

  // 8. Add to batch queue and schedule flush
  pendingBatch.push({
    action: e.action as "create" | "update",
    title,
    source,
    repackSize: record.repack_size,
    originalSize: record.original_size,
  });

  const now = Date.now();
  if (!batchStartTime) {
    batchStartTime = now;
  }

  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  const elapsed = now - batchStartTime;
  const delay = elapsed >= BATCH_MAX_WAIT_MS ? 0 : BATCH_DEBOUNCE_MS;

  batchTimer = setTimeout(() => {
    flushNotificationBatch().catch((err) =>
      console.error("Error flushing notification batch:", err),
    );
  }, delay);
}

/**
 * Initialize AlsaBase realtime subscriptions for both 'repacks' and 'steamrip' collections
 */
export async function initRepackSubscription(): Promise<() => void> {
  if (typeof window === "undefined") return () => {};
  if (isSubscribed) return unsubscribeRepackSubscription;
  if (subscribePromise) return subscribePromise;

  subscribePromise = (async () => {
    try {
      // Clean up any existing listeners first
      await ab
        .collection("repacks")
        .unsubscribe("*")
        .catch(() => {});
      await ab
        .collection("steamrip")
        .unsubscribe("*")
        .catch(() => {});

      // Proactively request notification permission on startup if notifications are enabled
      if (getRepackNotificationsEnabled()) {
        requestNotificationPermission().catch(() => {});
      }

      await ab
        .collection("repacks")
        .subscribe("*", (e) => handleRepackEvent(e, "fitgirl"));
      await ab
        .collection("steamrip")
        .subscribe("*", (e) => handleRepackEvent(e, "steamrip"));
      isSubscribed = true;
      console.log(
        "[AlsaBase] Successfully subscribed to 'repacks' and 'steamrip' collections realtime events.",
      );
    } catch (err) {
      console.error("[AlsaBase] Failed to subscribe to collections:", err);
    } finally {
      subscribePromise = null;
    }

    return unsubscribeRepackSubscription;
  })();

  return subscribePromise;
}

/**
 * Unsubscribe from AlsaBase realtime events
 */
export async function unsubscribeRepackSubscription(): Promise<void> {
  try {
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
      pendingBatch = [];
      batchStartTime = null;
    }

    await ab
      .collection("repacks")
      .unsubscribe("*")
      .catch(() => {});
    await ab
      .collection("steamrip")
      .unsubscribe("*")
      .catch(() => {});
    isSubscribed = false;
    subscribePromise = null;
    console.log(
      "[AlsaBase] Unsubscribed from 'repacks' and 'steamrip' collections.",
    );
  } catch (err) {
    console.error("[AlsaBase] Failed to unsubscribe:", err);
  }
}
