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

export async function openMapOverlay(options: OpenMapOverlayOptions): Promise<boolean> {
  const { gameSlug, mapSlug = "default", gameTitle = "", minZoom, maxZoom } = options;

  const queryParams = new URLSearchParams();
  if (gameSlug) queryParams.set("gameSlug", gameSlug);
  if (mapSlug) queryParams.set("mapSlug", mapSlug);
  if (gameTitle) queryParams.set("gameTitle", gameTitle);
  if (minZoom !== undefined) queryParams.set("minZoom", String(minZoom));
  if (maxZoom !== undefined) queryParams.set("maxZoom", String(maxZoom));

  const queryString = queryParams.toString();

  if (isTauriEnvironment()) {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

      const existingOverlay = await WebviewWindow.getByLabel("map-overlay");
      if (existingOverlay) {
        // Overlay window is already open: bring it to focus and update route
        await existingOverlay.show();
        if (await existingOverlay.isMinimized()) {
          await existingOverlay.unminimize();
        }
        await existingOverlay.setFocus();
        await existingOverlay.setAlwaysOnTop(true);

        const targetPath = `/map-overlay?${queryString}`;
        try {
          // Send navigation event or navigate directly
          const { emit } = await import("@tauri-apps/api/event");
          await emit("map-overlay-change", {
            gameSlug,
            mapSlug,
            gameTitle,
            minZoom,
            maxZoom,
          });
        } catch (_) {}

        return true;
      }

      const cleanSlug = gameSlug.includes("--") ? gameSlug.split("--")[0] : gameSlug;
      let initialWidth = 780;
      let initialHeight = 560;
      let initialX: number | undefined;
      let initialY: number | undefined;

      if (typeof window !== "undefined") {
        try {
          const savedShape =
            (cleanSlug && localStorage.getItem(`fitrepacks_overlay_${cleanSlug}_shape`)) ||
            localStorage.getItem("fitrepacks_overlay_shape") ||
            "rounded";
          const savedSizeStr =
            (cleanSlug && localStorage.getItem(`fitrepacks_overlay_${cleanSlug}_${savedShape}_size`)) ||
            (cleanSlug && localStorage.getItem(`fitrepacks_overlay_${cleanSlug}_size`)) ||
            localStorage.getItem(`fitrepacks_overlay_${savedShape}_size`) ||
            localStorage.getItem("fitrepacks_overlay_size");

          if (savedSizeStr) {
            const s = JSON.parse(savedSizeStr);
            if (s.width && s.height) {
              initialWidth = s.width;
              initialHeight = s.height;
            }
          } else if (savedShape === "circle") {
            initialWidth = 500;
            initialHeight = 500;
          }

          const savedPosStr =
            (cleanSlug && localStorage.getItem(`fitrepacks_overlay_${cleanSlug}_pos`)) ||
            localStorage.getItem("fitrepacks_overlay_pos");
          if (savedPosStr) {
            const p = JSON.parse(savedPosStr);
            if (typeof p.x === "number" && typeof p.y === "number") {
              initialX = p.x;
              initialY = p.y;
            }
          }
        } catch (_) {}
      }

      const isDev = window.location.port === "3000" || window.location.hostname === "localhost";
      const targetUrl = isDev
        ? `/map-overlay?${queryString}`
        : `map-overlay.html?${queryString}`;

      const overlay = new WebviewWindow("map-overlay", {
        url: targetUrl,
        title: gameTitle ? `${gameTitle} - Map Overlay` : "Game Map Overlay",
        width: initialWidth,
        height: initialHeight,
        x: initialX,
        y: initialY,
        minWidth: 160,
        minHeight: 160,
        resizable: true,
        alwaysOnTop: true,
        decorations: false,
        transparent: true,
        shadow: false,
        focus: true,
      });

      overlay.once("tauri://error", (e) => {
        console.error("Failed to create map overlay window:", e);
      });

      return true;
    } catch (err) {
      console.warn("Tauri WebviewWindow creation failed, falling back to popup window:", err);
    }
  }

  // Web / Browser Fallback
  const popupUrl = `/map-overlay?${queryString}`;
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
