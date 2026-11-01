export interface OpenMapOverlayOptions {
  gameSlug: string;
  mapSlug?: string;
  gameTitle?: string;
  minZoom?: number;
  maxZoom?: number;
}

export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

import { getLastOpenedMapSlug } from "./gameMaps";

export async function openMapOverlay(options: OpenMapOverlayOptions): Promise<boolean> {
  const { gameSlug, gameTitle = "", minZoom, maxZoom } = options;
  let mapSlug = options.mapSlug || "default";

  if ((!mapSlug || mapSlug === "default") && gameSlug) {
    const lastMap = getLastOpenedMapSlug(gameSlug);
    if (lastMap) {
      mapSlug = lastMap;
    }
  }

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_map_overlay_cmd", {
        gameSlug: gameSlug || null,
        mapSlug: mapSlug || "default",
        gameTitle: gameTitle || null,
      });
      setTimeout(() => {
        invoke("force_overlay_focus", { label: "map-overlay" }).catch(() => {});
      }, 50);
      return true;
    } catch (err) {
      console.warn("Tauri open_map_overlay_cmd error:", err);
    }
  }

  // Web / Browser Fallback
  const queryParams = new URLSearchParams();
  if (gameSlug) queryParams.set("gameSlug", gameSlug);
  if (mapSlug) queryParams.set("mapSlug", mapSlug);
  if (gameTitle) queryParams.set("gameTitle", gameTitle);
  if (minZoom !== undefined) queryParams.set("minZoom", String(minZoom));
  if (maxZoom !== undefined) queryParams.set("maxZoom", String(maxZoom));

  const popupUrl = `/map-overlay?${queryParams.toString()}`;
  const popup = window.open(
    popupUrl,
    "map-overlay",
    "width=780,height=560,resizable=yes,scrollbars=no,status=no,toolbar=no,menubar=no,location=no"
  );
  if (popup) {
    popup.focus();
    return true;
  }

  return false;
}

export async function isMapOverlayOpen(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const existingOverlay = await WebviewWindow.getByLabel("map-overlay");
      return existingOverlay !== null && existingOverlay !== undefined;
    } catch (_) {}
  }
  return false;
}

export async function closeMapOverlay(): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { WebviewWindow, getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      try {
        const currentWin = getCurrentWebviewWindow();
        if (currentWin && currentWin.label === "map-overlay") {
          await currentWin.close();
          return true;
        }
      } catch (_) {}

      const existingOverlay = await WebviewWindow.getByLabel("map-overlay");
      if (existingOverlay) {
        await existingOverlay.close();
        return true;
      }
    } catch (_) {}
  }
  return false;
}

export async function toggleMapOverlay(
  options?: Partial<OpenMapOverlayOptions>
): Promise<boolean> {
  const now = Date.now();
  if (typeof window !== "undefined") {
    try {
      const lastTs = Number(localStorage.getItem("fitrepacks_last_overlay_toggle_ts") || 0);
      if (now - lastTs < 350) {
        return false;
      }
      localStorage.setItem("fitrepacks_last_overlay_toggle_ts", String(now));
    } catch (_) {}
  }

  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (options?.gameSlug) {
        let targetMapSlug = options.mapSlug || "default";
        if (!options.mapSlug || options.mapSlug === "default") {
          const lastMap = getLastOpenedMapSlug(options.gameSlug);
          if (lastMap) targetMapSlug = lastMap;
        }
        await invoke("set_active_overlay_game", {
          gameSlug: options.gameSlug,
          mapSlug: targetMapSlug,
          gameTitle: options.gameTitle || "",
        }).catch(() => {});
      }
      await invoke("toggle_map_overlay_cmd");
      setTimeout(() => {
        invoke("force_overlay_focus", { label: "map-overlay" }).catch(() => {});
      }, 50);
      return true;
    } catch (err) {
      console.warn("Tauri toggle_map_overlay_cmd error:", err);
    }
  }

  // Web / Browser Fallback
  let resolvedGameSlug = options?.gameSlug;
  let resolvedMapSlug = options?.mapSlug;
  let resolvedGameTitle = options?.gameTitle;

  if (!resolvedGameSlug && typeof window !== "undefined") {
    try {
      const activeSlug = localStorage.getItem("fitrepacks_active_game_slug");
      const activeTitle = localStorage.getItem("fitrepacks_active_game_title");
      if (activeSlug || activeTitle) {
        const { findMatchingMap } = await import("./gameMaps");
        const matched = findMatchingMap(activeTitle || undefined, activeSlug || undefined);
        if (matched) {
          resolvedGameSlug = matched.game_slug || matched.slug;
          resolvedMapSlug = matched.map_slug || "default";
          resolvedGameTitle = matched.game_title || matched.title;
        } else if (activeSlug) {
          resolvedGameSlug = activeSlug;
          resolvedMapSlug = "default";
          resolvedGameTitle = activeTitle || activeSlug;
        }
      }
    } catch (_) {}
  }

  if (!resolvedGameSlug) {
    resolvedGameSlug = "mafia-2";
    resolvedMapSlug = "empire-bay";
    resolvedGameTitle = "Mafia II";
  }

  return await openMapOverlay({
    gameSlug: resolvedGameSlug,
    mapSlug: resolvedMapSlug || "default",
    gameTitle: resolvedGameTitle,
    minZoom: options?.minZoom,
    maxZoom: options?.maxZoom,
  });
}

