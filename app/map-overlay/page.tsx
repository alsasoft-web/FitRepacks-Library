"use client";

import React, { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Box,
  Flex,
  Group,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  Slider,
  Popover,
  Menu,
  UnstyledButton,
  Loader,
  Center,
  Stack,
  Button,
} from "@mantine/core";
import {
  Pin,
  PinOff,
  Eye,
  Minimize2,
  Maximize2,
  X,
  Minus,
  GripHorizontal,
  Layers,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  AlertCircle,
  RotateCcw,
  Circle,
  Square,
  AppWindow,
  SlidersHorizontal,
} from "lucide-react";
import { MapViewer } from "../../components/maps/MapViewer";
import { MapData, MapItem } from "../../components/maps/types";
import {
  loadMapsFromMapGenie,
  getMapGenieGameBySlug,
  fetchRawMapGenieMapFull,
  fetchRawMapGenieHtml,
} from "../../lib/gameMaps";
import {
  getOfflineMapData,
  saveOfflineMapData,
  fetchAndCacheOfflineAsset,
} from "../../lib/offlineMapStore";
import { isTauriEnvironment } from "../../lib/mapOverlay";

const RADAR_SIZE_PRESETS = [
  { label: "Micro", size: 200 },
  { label: "Mini", size: 280 },
  { label: "Compact", size: 380 },
  { label: "Standard", size: 500 },
  { label: "Tactical", size: 650 },
  { label: "Giant", size: 800 },
];

const WINDOW_SIZE_PRESETS = [
  { label: "Mini HUD", width: 400, height: 300 },
  { label: "Compact Widget", width: 580, height: 420 },
  { label: "Standard Overlay", width: 800, height: 560 },
  { label: "Wide View", width: 1050, height: 700 },
  { label: "Maxi View", width: 1300, height: 840 },
];

const OPACITY_PRESETS = [
  { label: "Solid", value: 100 },
  { label: "Subtle (85%)", value: 85 },
  { label: "Semi-Glass (65%)", value: 65 },
  { label: "Ghost (45%)", value: 45 },
  { label: "Ultra Ghost (30%)", value: 30 },
];

async function getOverlayWindow() {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      return getCurrentWebviewWindow();
    } catch (_) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        return getCurrentWindow();
      } catch (_) {}
    }
  }
  return null;
}

function MapOverlayContent() {
  const searchParams = useSearchParams();
  const initialGameSlug = searchParams.get("gameSlug") || "";
  const initialMapSlug = searchParams.get("mapSlug") || "default";
  const initialGameTitle = searchParams.get("gameTitle") || "";
  const initialMinZoom = searchParams.get("minZoom") ? Number(searchParams.get("minZoom")) : undefined;
  const initialMaxZoom = searchParams.get("maxZoom") ? Number(searchParams.get("maxZoom")) : undefined;

  const [gameSlug, setGameSlug] = useState(initialGameSlug);
  const [activeMapSlug, setActiveMapSlug] = useState(initialMapSlug);
  const [gameTitle, setGameTitle] = useState(initialGameTitle);
  const [availableMaps, setAvailableMaps] = useState<MapItem[]>([]);
  const [loadedMapData, setLoadedMapData] = useState<MapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cleanGameSlug = gameSlug.includes("--") ? gameSlug.split("--")[0] : gameSlug;

  // Hydration safety flag
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Overlay Window State
  const [isPinned, setIsPinned] = useState(true);
  const [opacity, setOpacity] = useState<number>(95);
  const [overlayShape, setOverlayShape] = useState<"rounded" | "square" | "circle">(() => {
    if (typeof window !== "undefined") {
      try {
        const clean = initialGameSlug.includes("--") ? initialGameSlug.split("--")[0] : initialGameSlug;
        const saved =
          (clean && localStorage.getItem(`fitrepacks_overlay_${clean}_shape`)) ||
          localStorage.getItem("fitrepacks_overlay_shape");
        if (saved === "circle" || saved === "square" || saved === "rounded") return saved;
      } catch (_) {}
    }
    return "rounded";
  });
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentDim, setCurrentDim] = useState<number>(() => {
    if (typeof window !== "undefined") {
      try {
        const clean = initialGameSlug.includes("--") ? initialGameSlug.split("--")[0] : initialGameSlug;
        const shape =
          (clean && localStorage.getItem(`fitrepacks_overlay_${clean}_shape`)) ||
          localStorage.getItem("fitrepacks_overlay_shape") ||
          "rounded";
        const savedSize =
          (clean && localStorage.getItem(`fitrepacks_overlay_${clean}_${shape}_size`)) ||
          (clean && localStorage.getItem(`fitrepacks_overlay_${clean}_size`)) ||
          localStorage.getItem(`fitrepacks_overlay_${shape}_size`) ||
          localStorage.getItem("fitrepacks_overlay_size");
        if (savedSize) {
          const s = JSON.parse(savedSize);
          if (s.width && s.height) return Math.max(s.width, s.height);
        }
      } catch (_) {}
    }
    return 500;
  });

  const isRestoredRef = useRef(false);

  // Listen for route update events from main window
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (isTauriEnvironment()) {
      import("@tauri-apps/api/event").then(({ listen }) => {
        listen<{
          gameSlug?: string;
          mapSlug?: string;
          gameTitle?: string;
          minZoom?: number;
          maxZoom?: number;
        }>("map-overlay-change", (event) => {
          if (event.payload) {
            if (event.payload.gameSlug) setGameSlug(event.payload.gameSlug);
            if (event.payload.mapSlug) setActiveMapSlug(event.payload.mapSlug);
            if (event.payload.gameTitle) setGameTitle(event.payload.gameTitle);
          }
        }).then((fn) => {
          unlisten = fn;
        });
      });
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Window drag start handler
  const handleStartDrag = useCallback(async (e: React.MouseEvent) => {
    const win = await getOverlayWindow();
    if (win) {
      try {
        await win.startDragging();
      } catch (_) {}
    }
  }, []);

  // Window Size Preset Change
  const handleApplySizePreset = useCallback(
    async (width: number, height: number, shapeOverride?: "rounded" | "square" | "circle") => {
      const activeShape = shapeOverride || overlayShape;
      setCurrentDim(Math.max(width, height));
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("fitrepacks_overlay_size", JSON.stringify({ width, height }));
          localStorage.setItem(`fitrepacks_overlay_${activeShape}_size`, JSON.stringify({ width, height }));
          if (cleanGameSlug) {
            localStorage.setItem(
              `fitrepacks_overlay_${cleanGameSlug}_${activeShape}_size`,
              JSON.stringify({ width, height })
            );
            localStorage.setItem(
              `fitrepacks_overlay_${cleanGameSlug}_size`,
              JSON.stringify({ width, height })
            );
          }
        } catch (_) {}
      }
      const win = await getOverlayWindow();
      if (win) {
        try {
          const { LogicalSize } = await import("@tauri-apps/api/dpi");
          if (await win.isMaximized()) {
            await win.unmaximize();
          }
          await win.setSize(new LogicalSize(width, height));
        } catch (_) {
          try {
            const { LogicalSize } = await import("@tauri-apps/api/window");
            await win.setSize(new LogicalSize(width, height));
          } catch (_) {}
        }
      } else {
        window.resizeTo(width, height);
      }
    },
    [cleanGameSlug, overlayShape]
  );

  // Load and apply per-game saved settings when gameSlug changes
  useEffect(() => {
    if (!cleanGameSlug || typeof window === "undefined") return;
    try {
      // 1. Shape
      const savedShape = (localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_shape`) ||
        localStorage.getItem("fitrepacks_overlay_shape")) as any;
      if (savedShape === "circle" || savedShape === "square" || savedShape === "rounded") {
        setOverlayShape(savedShape);
      }

      // 2. Opacity
      const savedOpacity =
        localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_opacity`) ||
        localStorage.getItem("fitrepacks_overlay_opacity");
      if (savedOpacity) {
        setOpacity(Number(savedOpacity));
      }

      // 3. Pinned
      const savedPinned = localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_pinned`);
      if (savedPinned !== null) {
        const pinVal = JSON.parse(savedPinned);
        setIsPinned(pinVal);
        getOverlayWindow().then((win) => {
          win?.setAlwaysOnTop(pinVal).catch(() => {});
        });
      }

      // 4. Window Size
      const shapeToUse = savedShape || overlayShape;
      const savedSizeStr =
        localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_${shapeToUse}_size`) ||
        localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_size`) ||
        localStorage.getItem(`fitrepacks_overlay_${shapeToUse}_size`) ||
        localStorage.getItem("fitrepacks_overlay_size");
      if (savedSizeStr) {
        const sizeObj = JSON.parse(savedSizeStr);
        if (sizeObj && sizeObj.width && sizeObj.height) {
          handleApplySizePreset(sizeObj.width, sizeObj.height, shapeToUse);
        }
      }

      // 5. Window Position on screen
      const savedPosStr =
        localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_pos`) ||
        localStorage.getItem("fitrepacks_overlay_pos");
      if (savedPosStr) {
        const posObj = JSON.parse(savedPosStr);
        if (typeof posObj.x === "number" && typeof posObj.y === "number") {
          getOverlayWindow().then(async (win) => {
            if (win) {
              try {
                const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
                await win.setPosition(new PhysicalPosition(posObj.x, posObj.y));
              } catch (_) {
                try {
                  const { PhysicalPosition } = await import("@tauri-apps/api/window");
                  await win.setPosition(new PhysicalPosition(posObj.x, posObj.y));
                } catch (_) {}
              }
            }
          });
        }
      }
    } catch (_) {}

    const unlockTimer = setTimeout(() => {
      isRestoredRef.current = true;
    }, 600);
    return () => clearTimeout(unlockTimer);
  }, [cleanGameSlug]);

  // Live Position & Size Listeners
  useEffect(() => {
    let unlistenMove: (() => void) | undefined;
    let unlistenResize: (() => void) | undefined;

    getOverlayWindow().then(async (win) => {
      if (!win) return;
      try {
        if (typeof (win as any).onMoved === "function") {
          unlistenMove = await (win as any).onMoved((event: any) => {
            if (!isRestoredRef.current) return;
            const pos = event?.payload || event;
            if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
              try {
                localStorage.setItem("fitrepacks_overlay_pos", JSON.stringify({ x: pos.x, y: pos.y }));
                if (cleanGameSlug) {
                  localStorage.setItem(
                    `fitrepacks_overlay_${cleanGameSlug}_pos`,
                    JSON.stringify({ x: pos.x, y: pos.y })
                  );
                }
              } catch (_) {}
            }
          });
        }
        if (typeof (win as any).onResized === "function") {
          unlistenResize = await (win as any).onResized((event: any) => {
            if (!isRestoredRef.current) return;
            const size = event?.payload || event;
            if (size && typeof size.width === "number" && typeof size.height === "number") {
              try {
                localStorage.setItem(
                  "fitrepacks_overlay_size",
                  JSON.stringify({ width: size.width, height: size.height })
                );
                localStorage.setItem(
                  `fitrepacks_overlay_${overlayShape}_size`,
                  JSON.stringify({ width: size.width, height: size.height })
                );
                if (cleanGameSlug) {
                  localStorage.setItem(
                    `fitrepacks_overlay_${cleanGameSlug}_${overlayShape}_size`,
                    JSON.stringify({ width: size.width, height: size.height })
                  );
                  localStorage.setItem(
                    `fitrepacks_overlay_${cleanGameSlug}_size`,
                    JSON.stringify({ width: size.width, height: size.height })
                  );
                }
              } catch (_) {}
            }
          });
        }
      } catch (_) {}
    });

    return () => {
      if (unlistenMove) {
        try {
          unlistenMove();
        } catch (_) {}
      }
      if (unlistenResize) {
        try {
          unlistenResize();
        } catch (_) {}
      }
    };
  }, [cleanGameSlug, overlayShape]);

  // Always-On-Top Toggle
  const toggleAlwaysOnTop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const nextState = !isPinned;
      setIsPinned(nextState);
      if (cleanGameSlug && typeof window !== "undefined") {
        try {
          localStorage.setItem(`fitrepacks_overlay_${cleanGameSlug}_pinned`, JSON.stringify(nextState));
        } catch (_) {}
      }
      const win = await getOverlayWindow();
      if (win) {
        try {
          await win.setAlwaysOnTop(nextState);
        } catch (_) {}
      }
    },
    [isPinned, cleanGameSlug]
  );

  useEffect(() => {
    let resizeTimer: any;
    const handleResize = () => {
      if (!isRestoredRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w > 120 && h > 120) {
        setCurrentDim(Math.max(w, h));
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          try {
            localStorage.setItem("fitrepacks_overlay_size", JSON.stringify({ width: w, height: h }));
            localStorage.setItem(`fitrepacks_overlay_${overlayShape}_size`, JSON.stringify({ width: w, height: h }));
            if (cleanGameSlug) {
              localStorage.setItem(
                `fitrepacks_overlay_${cleanGameSlug}_${overlayShape}_size`,
                JSON.stringify({ width: w, height: h })
              );
              localStorage.setItem(
                `fitrepacks_overlay_${cleanGameSlug}_size`,
                JSON.stringify({ width: w, height: h })
              );
            }
          } catch (_) {}
        }, 200);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        clearTimeout(resizeTimer);
      };
    }
  }, [cleanGameSlug, overlayShape]);

  // Step size delta (+/- 50px)
  const handleStepSize = useCallback(
    (delta: number) => {
      if (overlayShape === "circle") {
        const nextDim = Math.max(180, Math.min(1400, currentDim + delta));
        setCurrentDim(nextDim);
        handleApplySizePreset(nextDim, nextDim, "circle");
      } else {
        const nextW = Math.max(280, Math.min(1800, currentDim + delta));
        const nextH = Math.max(200, Math.min(1400, Math.round(nextW * 0.7)));
        setCurrentDim(nextW);
        handleApplySizePreset(nextW, nextH, overlayShape);
      }
    },
    [overlayShape, currentDim, handleApplySizePreset]
  );

  // Shape Toggle (Circular Radar <-> Rounded Window)
  const toggleShape = useCallback(() => {
    const nextShape: "rounded" | "circle" = overlayShape === "circle" ? "rounded" : "circle";
    setOverlayShape(nextShape);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("fitrepacks_overlay_shape", nextShape);
        if (cleanGameSlug) {
          localStorage.setItem(`fitrepacks_overlay_${cleanGameSlug}_shape`, nextShape);
        }
      } catch (_) {}
    }
    let targetW = nextShape === "circle" ? 500 : 780;
    let targetH = nextShape === "circle" ? 500 : 560;
    if (typeof window !== "undefined") {
      try {
        const savedSize =
          (cleanGameSlug && localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_${nextShape}_size`)) ||
          localStorage.getItem(`fitrepacks_overlay_${nextShape}_size`);
        if (savedSize) {
          const s = JSON.parse(savedSize);
          if (s.width && s.height) {
            targetW = s.width;
            targetH = s.height;
          }
        }
      } catch (_) {}
    }
    handleApplySizePreset(targetW, targetH, nextShape);
  }, [overlayShape, cleanGameSlug, handleApplySizePreset]);

  // Window Action Controls
  const handleMinimize = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const win = await getOverlayWindow();
    if (win) {
      try {
        await win.minimize();
      } catch (_) {}
    }
  }, []);

  const handleToggleMaximize = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const win = await getOverlayWindow();
    if (win) {
      try {
        await win.toggleMaximize();
        setIsMaximized(await win.isMaximized());
      } catch (_) {}
    }
  }, []);

  const handleClose = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const win = await getOverlayWindow();
    if (win) {
      try {
        await win.close();
      } catch (_) {}
    } else {
      window.close();
    }
  }, []);

  // Opacity Change
  const handleOpacityChange = useCallback((val: number) => {
    setOpacity(val);
    try {
      localStorage.setItem("fitrepacks_overlay_opacity", String(val));
    } catch (_) {}
  }, []);

  // Map Data Loading
  useEffect(() => {
    if (!gameSlug) {
      setIsLoading(false);
      setError("No game selected for map overlay.");
      return;
    }

    let isMounted = true;

    async function fetchOnlineMapData() {
      const cleanGameSlug = gameSlug.includes("--") ? gameSlug.split("--")[0] : gameSlug;
      let resolvedMapSlug = activeMapSlug || "default";
      let hadOfflineData = false;
      let offlineCached: any = null;

      try {
        offlineCached = await getOfflineMapData(cleanGameSlug, resolvedMapSlug);
        if (!offlineCached && cleanGameSlug) {
          offlineCached =
            (await getOfflineMapData(cleanGameSlug, "default")) ||
            (await getOfflineMapData(cleanGameSlug, "world")) ||
            (await getOfflineMapData(cleanGameSlug, "empire-bay"));
        }
        if (offlineCached && isMounted) {
          hadOfflineData = true;
          setLoadedMapData(offlineCached);
          setIsLoading(false);
        }
      } catch (_) {}

      if (!hadOfflineData && isMounted) {
        setIsLoading(true);
      }

      try {
        const allMaps = await loadMapsFromMapGenie();
        const matched = allMaps.filter(
          (m) =>
            m.game_slug?.toLowerCase() === cleanGameSlug.toLowerCase() ||
            m.slug?.toLowerCase() === cleanGameSlug.toLowerCase() ||
            m.slug?.toLowerCase().startsWith(`${cleanGameSlug.toLowerCase()}--`)
        );

        const gameData = getMapGenieGameBySlug(cleanGameSlug);

        if (matched.length > 0 && isMounted) {
          const mapItemsMap = new Map<string, MapItem>();
          matched.forEach((item) => {
            const s = item.map_slug || (item.slug ? item.slug.replace(`${cleanGameSlug}--`, "") : "");
            if (s) {
              const cleanTitle =
                item.title?.replace(new RegExp(`^${item.game_title || ""}\\s*-\\s*`, "i"), "") || s;
              mapItemsMap.set(s, {
                id: item.id,
                title: cleanTitle,
                slug: s,
                url: `https://mapgenie.io/${cleanGameSlug}/maps/${s}`,
                web_url: `https://mapgenie.io/${cleanGameSlug}/maps/${s}`,
                locations_count: item.locations_count,
              });
            }
          });

          if (mapItemsMap.size > 0) {
            const items = Array.from(mapItemsMap.values());
            setAvailableMaps(items);
            if (
              (resolvedMapSlug === "default" || !items.some((i) => i.slug === resolvedMapSlug)) &&
              items.length > 0 &&
              items[0].slug
            ) {
              resolvedMapSlug = items[0].slug;
              setActiveMapSlug(resolvedMapSlug);
            }
          }
        }

        const targetMapSlug = resolvedMapSlug;
        const currentMapItem =
          matched.find((m) => m.map_slug?.toLowerCase() === targetMapSlug.toLowerCase()) || matched[0];

        let targetMapId = currentMapItem?.id;
        if (!targetMapId && gameData?.maps && gameData.maps.length > 0) {
          const foundInGame =
            gameData.maps.find((m) => m.slug.toLowerCase() === targetMapSlug.toLowerCase()) ||
            gameData.maps[0];
          if (foundInGame) {
            targetMapId = String(foundInGame.id);
          }
        }

        if (!targetMapId && !hadOfflineData) {
          throw new Error(`Map '${targetMapSlug}' for game '${cleanGameSlug}' not found.`);
        }

        let rawData: any = null;
        let mapHtml = "";
        if (targetMapId) {
          [rawData, mapHtml] = await Promise.all([
            fetchRawMapGenieMapFull(targetMapId).catch(() => null),
            fetchRawMapGenieHtml(cleanGameSlug, targetMapSlug).catch(() => ""),
          ]);
        }

        let htmlMapData: any = null;
        if (mapHtml) {
          const mapDataMatch =
            mapHtml.match(/window\.mapData\s*=\s*(\{[\s\S]*?\});(?:\s*window\.|\s*<\/script>)/) ||
            mapHtml.match(/window\.mapData\s*=\s*(\{[\s\S]*?\});/);
          if (mapDataMatch) {
            try {
              htmlMapData = JSON.parse(mapDataMatch[1]);
            } catch (_) {}
          }
        }

        if (!rawData) {
          rawData = htmlMapData || (await getOfflineMapData(cleanGameSlug, targetMapSlug));
        }

        if (!rawData && !hadOfflineData) {
          throw new Error(
            `Failed to load map data for '${cleanGameSlug}'. Please check internet connection or download map for offline use.`
          );
        }

        if (!isMounted || !rawData) return;

        let extractedSpritePositions: Record<string, any> = {};
        let extractedMarkerUrl = "";
        let extractedMarkerWidth: number | undefined;
        let extractedMarkerHeight: number | undefined;

        if (mapHtml) {
          const spriteMatch =
            mapHtml.match(/const\s+MARKER_SPRITE_POSITIONS(?:_V\d+)?\s*=\s*(\{[\s\S]*?\});/) ||
            mapHtml.match(/MARKER_SPRITE_POSITIONS(?:_V\d+)?\s*=\s*(\{[\s\S]*?\});/);
          if (spriteMatch) {
            try {
              extractedSpritePositions = JSON.parse(spriteMatch[1]);
            } catch (_) {}
          }

          const urlMatch =
            mapHtml.match(/const\s+MARKER_IMAGES_URL\s*=\s*['"]([^'"]+)['"]/) ||
            mapHtml.match(/MARKER_IMAGES_URL\s*=\s*['"]([^'"]+)['"]/);
          if (urlMatch) {
            extractedMarkerUrl = urlMatch[1];
          }

          const wMatch =
            mapHtml.match(/const\s+MARKER_IMAGES_WIDTH\s*=\s*(\d+)/) ||
            mapHtml.match(/MARKER_IMAGES_WIDTH\s*=\s*(\d+)/);
          if (wMatch) {
            extractedMarkerWidth = parseInt(wMatch[1], 10);
          }

          const hMatch =
            mapHtml.match(/const\s+MARKER_IMAGES_HEIGHT\s*=\s*(\d+)/) ||
            mapHtml.match(/MARKER_IMAGES_HEIGHT\s*=\s*(\d+)/);
          if (hMatch) {
            extractedMarkerHeight = parseInt(hMatch[1], 10);
          }
        }

        if (
          Object.keys(extractedSpritePositions).length === 0 &&
          offlineCached?.mapConfig?.markerSpritePositions
        ) {
          extractedSpritePositions = offlineCached.mapConfig.markerSpritePositions;
          extractedMarkerUrl = extractedMarkerUrl || offlineCached.mapConfig.markerImagesUrl || "";
          extractedMarkerWidth = extractedMarkerWidth || offlineCached.mapConfig.markerImagesWidth;
          extractedMarkerHeight = extractedMarkerHeight || offlineCached.mapConfig.markerImagesHeight;
        }

        const rawMap = rawData.map || htmlMapData?.map || rawData;
        const groups = Array.isArray(rawData.groups)
          ? rawData.groups
          : Array.isArray(htmlMapData?.groups)
            ? htmlMapData.groups
            : [];

        const categories: any[] = [];
        const rawCategories =
          Array.isArray(rawData.categories) && rawData.categories.length > 0
            ? rawData.categories
            : Array.isArray(htmlMapData?.categories) && htmlMapData.categories.length > 0
              ? htmlMapData.categories
              : null;

        if (rawCategories) {
          categories.push(...rawCategories);
        } else if (groups.length > 0) {
          for (const g of groups) {
            if (Array.isArray(g.categories)) {
              for (const c of g.categories) {
                categories.push({ ...c, group_id: c.group_id || g.id });
              }
            }
          }
        }

        const locations: any[] = [];
        if (categories.length > 0) {
          for (const cat of categories) {
            if (Array.isArray(cat.locations)) {
              for (const loc of cat.locations) {
                locations.push({ ...loc, category_id: loc.category_id || cat.id });
              }
            }
          }
        }
        if (locations.length === 0 && Array.isArray(rawData.locations)) {
          locations.push(...rawData.locations);
        } else if (locations.length === 0 && Array.isArray(htmlMapData?.locations)) {
          locations.push(...htmlMapData.locations);
        }

        const tileSets =
          htmlMapData?.mapConfig?.tile_sets ||
          htmlMapData?.tile_sets ||
          rawData.config?.tile_sets ||
          rawMap.config?.tile_sets ||
          rawMap.tile_sets ||
          rawData.tile_sets ||
          [];

        const startLat = rawMap.initial_lat || rawMap.initial_latitude || 0;
        const startLng = rawMap.initial_lng || rawMap.initial_longitude || 0;

        const mapConfig = {
          ...rawData.config,
          ...rawMap.config,
          ...htmlMapData?.mapConfig,
          markerSpritePositions: extractedSpritePositions,
          markerImagesUrl:
            extractedMarkerUrl ||
            (gameData?.config?.marker_sprite_url
              ? gameData.config.marker_sprite_url.startsWith("http")
                ? gameData.config.marker_sprite_url
                : `https://cdn.mapgenie.io${gameData.config.marker_sprite_url}`
              : `https://cdn.mapgenie.io/images/games/${cleanGameSlug}/markers@2x.png`),
          markerImagesWidth: extractedMarkerWidth,
          markerImagesHeight: extractedMarkerHeight,
          iconsCssUrl: `https://cdn.mapgenie.io/css/themes/icons/${cleanGameSlug}-icons.css`,
          icomoonUrl: `https://cdn.mapgenie.io/fonts/${cleanGameSlug}/icons/icomoon.woff`,
          mgIconsUrl: `https://cdn.mapgenie.io/fonts/${cleanGameSlug}/icons/icomoon.ttf`,
        };

        const constructedMapData: MapData = {
          game: {
            id: gameData?.id || cleanGameSlug,
            title: gameData?.title || gameTitle || cleanGameSlug,
            slug: cleanGameSlug,
            config: gameData?.config,
          },
          map: {
            id: targetMapId || rawData.map?.id || "0",
            title: rawMap.title || currentMapItem?.title || targetMapSlug,
            slug: targetMapSlug,
            start_lat: startLat,
            start_lng: startLng,
            tile_sets: tileSets,
          },
          categories,
          groups,
          locations,
          mapConfig,
          regions: rawData.regions || [],
        };

        if (isMounted) {
          setLoadedMapData(constructedMapData);
          setIsLoading(false);
          setError(null);
        }

        // Cache for instant offline access
        try {
          await saveOfflineMapData(cleanGameSlug, targetMapSlug, constructedMapData);
          if (mapConfig.markerImagesUrl) {
            fetchAndCacheOfflineAsset(`sprite_${cleanGameSlug}`, mapConfig.markerImagesUrl).catch(() => {});
          }
        } catch (_) {}
      } catch (err: any) {
        if (isMounted && !hadOfflineData) {
          setIsLoading(false);
          setError(err.message || "Failed to load map data.");
        }
      }
    }

    fetchOnlineMapData();

    return () => {
      isMounted = false;
    };
  }, [gameSlug, activeMapSlug, gameTitle]);

  const activeStorageKey = gameSlug
    ? `map_found_${gameSlug}_${activeMapSlug || "default"}`
    : undefined;

  const isCircle = overlayShape === "circle";
  const isSquare = overlayShape === "square";

  if (!mounted) {
    return (
      <Center style={{ width: "100vw", height: "100vh", backgroundColor: "transparent" }}>
        <Loader color="blue" size="md" />
      </Center>
    );
  }

  return (
    <>
      <style>{`
        html, body, #__next {
          background: transparent !important;
          background-color: transparent !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      `}</style>

      {/* Root Window Container */}
      <Box
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "transparent",
          overflow: "hidden",
          position: "relative",
          userSelect: "none",
        }}
      >
        {/* The Geometric Overlay Card (True Circle, Rounded, or Square) */}
        <Box
          style={{
            width: isCircle ? "min(100vw, 100vh)" : "100vw",
            height: isCircle ? "min(100vw, 100vh)" : "100vh",
            aspectRatio: isCircle ? "1 / 1" : undefined,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: isCircle ? "transparent" : `rgba(7, 8, 11, 0.95)`,
            color: "#ffffff",
            opacity: opacity / 100,
            transition: "opacity 0.15s ease, border-radius 0.2s ease",
            position: "relative",
            border: isCircle ? "2px solid rgba(59, 130, 246, 0.85)" : "1px solid rgba(255, 255, 255, 0.14)",
            borderRadius: isCircle ? "50%" : isSquare || isMaximized ? 0 : 12,
            boxShadow: isCircle
              ? "0 0 0 1px rgba(59, 130, 246, 0.4), inset 0 0 25px rgba(59, 130, 246, 0.2)"
              : "0 0 20px rgba(0,0,0,0.85)",
          }}
        >
          {/* Circular Radar Mode: Curved Top-Arc Toolbar Bezel */}
          {isCircle ? (
            <>
              {/* Curved SVG Arch Bezel Track behind the arc buttons */}
              <svg
                viewBox="0 0 100 100"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  zIndex: 1350,
                }}
              >
                {/* Dark Curved Arch Track */}
                <path
                  d="M 16 26 A 41.5 41.5 0 0 1 84 26"
                  fill="none"
                  stroke="rgba(10, 14, 24, 0.88)"
                  strokeWidth="11"
                  strokeLinecap="round"
                />
                {/* Glowing Top Outer Bezel Ring */}
                <path
                  d="M 16 26 A 41.5 41.5 0 0 1 84 26"
                  fill="none"
                  stroke="rgba(59, 130, 246, 0.5)"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              </svg>

              {/* Arc Button 0: Filters / Sidebar Toggle */}
              <Box
                style={{
                  position: "absolute",
                  left: "18.6%",
                  top: "23.6%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1400,
                }}
              >
                <Tooltip label={isSidebarOpen ? "Hide Categories & Filters" : "Show Categories & Filters"} withArrow>
                  <ActionIcon
                    size="sm"
                    variant={isSidebarOpen ? "filled" : "subtle"}
                    color={isSidebarOpen ? "blue" : "gray"}
                    onClick={() => setIsSidebarOpen((v) => !v)}
                    style={{
                      cursor: "pointer",
                      backgroundColor: isSidebarOpen ? "#2563eb" : "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(59, 130, 246, 0.5)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      color: isSidebarOpen ? "#ffffff" : "#cbd5e1",
                    }}
                  >
                    <SlidersHorizontal size={12} color={isSidebarOpen ? "#ffffff" : "#cbd5e1"} />
                  </ActionIcon>
                </Tooltip>
              </Box>

              {/* Arc Button 1: Drag Grip Handle */}
              <Box
                data-tauri-drag-region
                onMouseDown={handleStartDrag}
                style={{
                  position: "absolute",
                  left: "32.0%",
                  top: "13.1%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1400,
                  cursor: "grab",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  backgroundColor: "rgba(15, 23, 42, 0.9)",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  borderRadius: 12,
                  padding: "2px 6px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                }}
              >
                <GripHorizontal size={11} color="#60a5fa" style={{ pointerEvents: "none" }} />
                <Text
                  size="9px"
                  fw={800}
                  style={{
                    letterSpacing: 0.8,
                    color: "#60a5fa",
                    fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                    pointerEvents: "none",
                  }}
                >
                  RADAR
                </Text>
              </Box>

              {/* Arc Button 2: Always On Top Pin */}
              <Box
                style={{
                  position: "absolute",
                  left: "44.3%",
                  top: "9.4%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1400,
                }}
              >
                <Tooltip label={isPinned ? "Always On Top: Pinned" : "Always On Top: Unpinned"} withArrow>
                  <ActionIcon
                    size="sm"
                    variant={isPinned ? "filled" : "subtle"}
                    color={isPinned ? "blue" : "gray"}
                    onClick={toggleAlwaysOnTop}
                    style={{
                      cursor: "pointer",
                      backgroundColor: isPinned ? "#2563eb" : "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(59, 130, 246, 0.4)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      color: isPinned ? "#ffffff" : "#cbd5e1",
                    }}
                  >
                    {isPinned ? <Pin size={12} color="#ffffff" /> : <PinOff size={12} color="#cbd5e1" />}
                  </ActionIcon>
                </Tooltip>
              </Box>

              {/* Arc Button 3: Opacity Control */}
              <Box
                style={{
                  position: "absolute",
                  left: "52.9%",
                  top: "9.1%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1400,
                }}
              >
                <Popover width={220} position="bottom" shadow="md">
                  <Popover.Target>
                    <Tooltip label={`Transparency: ${opacity}%`} withArrow>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        style={{
                          cursor: "pointer",
                          backgroundColor: "rgba(15, 23, 42, 0.9)",
                          border: "1px solid rgba(59, 130, 246, 0.4)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                          color: "#cbd5e1",
                        }}
                      >
                        <Eye size={12} color="#cbd5e1" />
                      </ActionIcon>
                    </Tooltip>
                  </Popover.Target>
                  <Popover.Dropdown
                    style={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      padding: 12,
                      zIndex: 2000,
                    }}
                  >
                    <Stack gap="xs">
                      <Flex justify="space-between" align="center">
                        <Text size="xs" fw={700} c="gray.3">
                          Overlay Opacity
                        </Text>
                        <Text size="xs" fw={800} c="blue.4">
                          {opacity}%
                        </Text>
                      </Flex>
                      <Slider
                        value={opacity}
                        onChange={handleOpacityChange}
                        min={25}
                        max={100}
                        step={5}
                        size="xs"
                        color="blue"
                      />
                      <Group gap={4} wrap="wrap" mt={4}>
                        {OPACITY_PRESETS.map((p) => (
                          <Button
                            key={p.value}
                            size="compact-xs"
                            variant={opacity === p.value ? "filled" : "default"}
                            color="blue"
                            style={{ fontSize: 9.5, height: 20, cursor: "pointer" }}
                            onClick={() => handleOpacityChange(p.value)}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </Group>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
              </Box>

              {/* Arc Button 4: Shape Toggle */}
              <Box
                style={{
                  position: "absolute",
                  left: "62.7%",
                  top: "11.0%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1400,
                }}
              >
                <Tooltip label={isCircle ? "Switch to Rounded Window" : "Switch to Circular Radar"} withArrow>
                  <ActionIcon
                    size="sm"
                    variant={isCircle ? "filled" : "subtle"}
                    color={isCircle ? "cyan" : "gray"}
                    onClick={toggleShape}
                    style={{
                      cursor: "pointer",
                      backgroundColor: isCircle ? "#0891b2" : "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(59, 130, 246, 0.6)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      color: isCircle ? "#ffffff" : "#cbd5e1",
                    }}
                  >
                    {isCircle ? <Circle size={12} color="#ffffff" /> : <AppWindow size={12} color="#cbd5e1" />}
                  </ActionIcon>
                </Tooltip>
              </Box>

              {/* Arc Button 5: Size Presets & Resizing Controls */}
              <Box
                style={{
                  position: "absolute",
                  left: "72.9%",
                  top: "16.0%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1400,
                }}
              >
                <Popover width={240} position="bottom" shadow="md">
                  <Popover.Target>
                    <Tooltip label="Resize Map & Scaling" withArrow>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        style={{
                          cursor: "pointer",
                          backgroundColor: "rgba(15, 23, 42, 0.9)",
                          border: "1px solid rgba(59, 130, 246, 0.4)",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                          color: "#cbd5e1",
                        }}
                      >
                        <LayoutGrid size={12} color="#cbd5e1" />
                      </ActionIcon>
                    </Tooltip>
                  </Popover.Target>
                  <Popover.Dropdown
                    style={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      padding: 12,
                      zIndex: 2000,
                    }}
                  >
                    <Stack gap="xs">
                      <Flex justify="space-between" align="center">
                        <Text size="xs" fw={700} c="gray.3">
                          Radar Size
                        </Text>
                        <Text size="xs" fw={800} c="cyan.4">
                          {currentDim}px
                        </Text>
                      </Flex>

                      {/* Quick Stepper Buttons */}
                      <Group gap={4} grow>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="gray"
                          onClick={() => handleStepSize(-100)}
                          style={{ fontSize: 9.5, cursor: "pointer" }}
                        >
                          -100px
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="gray"
                          onClick={() => handleStepSize(-50)}
                          style={{ fontSize: 9.5, cursor: "pointer" }}
                        >
                          -50px
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="cyan"
                          onClick={() => handleStepSize(50)}
                          style={{ fontSize: 9.5, cursor: "pointer" }}
                        >
                          +50px
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="cyan"
                          onClick={() => handleStepSize(100)}
                          style={{ fontSize: 9.5, cursor: "pointer" }}
                        >
                          +100px
                        </Button>
                      </Group>

                      {/* Presets Grid */}
                      <Text size="10px" fw={700} c="dimmed" mt={4}>
                        Radar Snap Presets
                      </Text>
                      <Group gap={4} wrap="wrap">
                        {RADAR_SIZE_PRESETS.map((p) => (
                          <Button
                            key={p.size}
                            size="compact-xs"
                            variant={currentDim === p.size ? "filled" : "default"}
                            color="cyan"
                            style={{ fontSize: 9.5, height: 20, cursor: "pointer" }}
                            onClick={() => {
                              setCurrentDim(p.size);
                              handleApplySizePreset(p.size, p.size);
                            }}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </Group>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
              </Box>

              {/* Arc Button 6: Close Overlay */}
              <Box
                style={{
                  position: "absolute",
                  left: "81.4%",
                  top: "23.6%",
                  transform: "translate(-50%, -50%)",
                  zIndex: 1400,
                }}
              >
                <Tooltip label="Close Overlay" withArrow>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={handleClose}
                    style={{
                      cursor: "pointer",
                      backgroundColor: "rgba(15, 23, 42, 0.9)",
                      border: "1px solid rgba(239, 68, 68, 0.5)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      color: "#f87171",
                    }}
                  >
                    <X size={12} color="#f87171" />
                  </ActionIcon>
                </Tooltip>
              </Box>
            </>
          ) : (
            /* Standard Rectangular / Rounded Top Bar */
            <Box
              style={{
                height: isHeaderCollapsed ? 28 : 42,
                minHeight: isHeaderCollapsed ? 28 : 42,
                backgroundColor: "rgba(12, 15, 22, 0.95)",
                backdropFilter: "blur(14px)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 10px",
                zIndex: 1000,
                position: "relative",
              }}
            >
              {/* Draggable Grip Region */}
              <Box
                data-tauri-drag-region
                onMouseDown={handleStartDrag}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "grab",
                  height: "100%",
                  overflow: "hidden",
                  marginRight: 4,
                  flex: 1,
                }}
              >
                <GripHorizontal size={14} color="#8892b0" style={{ pointerEvents: "none", flexShrink: 0 }} />
                <Text
                  size="10.5px"
                  fw={800}
                  style={{
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                    color: "#e2e8f0",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  OVERLAY
                </Text>

                {!isHeaderCollapsed && gameTitle && (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="dark"
                    style={{
                      backgroundColor: "rgba(30, 41, 59, 0.85)",
                      color: "#93c5fd",
                      border: "1px solid rgba(59, 130, 246, 0.3)",
                      maxWidth: 140,
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                    }}
                  >
                    {gameTitle}
                  </Badge>
                )}

                {!isHeaderCollapsed && availableMaps.length > 1 && (
                  <Menu shadow="md" width={180}>
                    <Menu.Target>
                      <UnstyledButton
                        data-tauri-drag-region="false"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          backgroundColor: "#1e293b",
                          color: "#f1f5f9",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Layers size={11} />
                        {activeMapSlug.toUpperCase()}
                        <ChevronDown size={10} />
                      </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown style={{ backgroundColor: "#0f172a", borderColor: "#334155", zIndex: 2000 }}>
                      <Menu.Label style={{ color: "#94a3b8", fontSize: 10 }}>Select Game Map</Menu.Label>
                      {availableMaps.map((m) => (
                        <Menu.Item
                          key={m.slug}
                          onClick={() => setActiveMapSlug(m.slug)}
                          style={{
                            fontSize: 11,
                            color: m.slug === activeMapSlug ? "#60a5fa" : "#e2e8f0",
                            fontWeight: m.slug === activeMapSlug ? 700 : 500,
                          }}
                        >
                          {m.title}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Box>

              {/* Right Toolbar Actions */}
              <Group gap={3} style={{ flexShrink: 0 }} data-tauri-drag-region="false">
                {/* Always-on-Top Pin */}
                <Tooltip label={isPinned ? "Always On Top: Pinned" : "Always On Top: Unpinned"} withArrow>
                  <ActionIcon
                    size="sm"
                    variant={isPinned ? "filled" : "subtle"}
                    color={isPinned ? "blue" : "gray"}
                    onClick={toggleAlwaysOnTop}
                    data-tauri-drag-region="false"
                    title="Toggle Always On Top"
                    style={{
                      cursor: "pointer",
                      color: isPinned ? "#ffffff" : "#cbd5e1",
                    }}
                  >
                    {isPinned ? <Pin size={12} color="#ffffff" /> : <PinOff size={12} color="#cbd5e1" />}
                  </ActionIcon>
                </Tooltip>

                {/* Opacity Control Popover */}
                <Popover width={220} position="bottom-end" shadow="md">
                  <Popover.Target>
                    <Tooltip label={`Transparency: ${opacity}%`} withArrow>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        data-tauri-drag-region="false"
                        style={{
                          cursor: "pointer",
                          color: "#cbd5e1",
                        }}
                      >
                        <Eye size={12} color="#cbd5e1" />
                      </ActionIcon>
                    </Tooltip>
                  </Popover.Target>
                  <Popover.Dropdown
                    style={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      padding: 12,
                      zIndex: 2000,
                    }}
                    data-tauri-drag-region="false"
                  >
                    <Stack gap="xs">
                      <Flex justify="space-between" align="center">
                        <Text size="xs" fw={700} c="gray.3">
                          Overlay Opacity
                        </Text>
                        <Text size="xs" fw={800} c="blue.4">
                          {opacity}%
                        </Text>
                      </Flex>
                      <Slider
                        value={opacity}
                        onChange={handleOpacityChange}
                        min={25}
                        max={100}
                        step={5}
                        size="xs"
                        color="blue"
                      />
                      <Group gap={4} wrap="wrap" mt={4}>
                        {OPACITY_PRESETS.map((p) => (
                          <Button
                            key={p.value}
                            size="compact-xs"
                            variant={opacity === p.value ? "filled" : "default"}
                            color="blue"
                            style={{ fontSize: 9.5, height: 20, cursor: "pointer" }}
                            onClick={() => handleOpacityChange(p.value)}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </Group>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>

                {/* Shape Toggle */}
                <Tooltip label={isCircle ? "Switch to Rounded Window" : "Switch to Circular Radar"} withArrow>
                  <ActionIcon
                    size="sm"
                    variant={isCircle ? "filled" : "subtle"}
                    color={isCircle ? "cyan" : "gray"}
                    onClick={toggleShape}
                    data-tauri-drag-region="false"
                    style={{
                      cursor: "pointer",
                      color: isCircle ? "#ffffff" : "#cbd5e1",
                    }}
                  >
                    {isCircle ? <Circle size={12} color="#ffffff" /> : <AppWindow size={12} color="#cbd5e1" />}
                  </ActionIcon>
                </Tooltip>

                {/* Size Controls Popover */}
                <Popover width={250} position="bottom-end" shadow="md">
                  <Popover.Target>
                    <Tooltip label="Window Size & Scaling" withArrow>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        data-tauri-drag-region="false"
                        style={{
                          cursor: "pointer",
                          color: "#cbd5e1",
                        }}
                      >
                        <LayoutGrid size={12} color="#cbd5e1" />
                      </ActionIcon>
                    </Tooltip>
                  </Popover.Target>
                  <Popover.Dropdown
                    style={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      padding: 12,
                      zIndex: 2000,
                    }}
                  >
                    <Stack gap="xs">
                      <Flex justify="space-between" align="center">
                        <Text size="xs" fw={700} c="gray.3">
                          Window Scaling
                        </Text>
                        <Text size="xs" fw={800} c="blue.4">
                          {currentDim}px
                        </Text>
                      </Flex>

                      {/* Quick Stepper Buttons */}
                      <Group gap={4} grow>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="gray"
                          onClick={() => handleStepSize(-100)}
                          style={{ fontSize: 9.5, cursor: "pointer" }}
                        >
                          -100px
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="gray"
                          onClick={() => handleStepSize(-50)}
                          style={{ fontSize: 9.5, cursor: "pointer" }}
                        >
                          -50px
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="blue"
                          onClick={() => handleStepSize(50)}
                          style={{ fontSize: 9.5, cursor: "pointer" }}
                        >
                          +50px
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
                          color="blue"
                          onClick={() => handleStepSize(100)}
                          style={{ fontSize: 9.5, cursor: "pointer" }}
                        >
                          +100px
                        </Button>
                      </Group>

                      {/* Presets List */}
                      <Text size="10px" fw={700} c="dimmed" mt={4}>
                        Window Snap Presets
                      </Text>
                      <Stack gap={4}>
                        {WINDOW_SIZE_PRESETS.map((preset) => (
                          <UnstyledButton
                            key={preset.label}
                            onClick={() => {
                              setCurrentDim(preset.width);
                              handleApplySizePreset(preset.width, preset.height);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 4,
                              backgroundColor: "rgba(255, 255, 255, 0.04)",
                              color: "#e2e8f0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              cursor: "pointer",
                              fontSize: 11,
                            }}
                          >
                            <Text size="xs" fw={600}>
                              {preset.label}
                            </Text>
                            <Text size="10px" c="dimmed">
                              {preset.width}x{preset.height}
                            </Text>
                          </UnstyledButton>
                        ))}
                      </Stack>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>

                {/* Minimal Header Toggle */}
                {!isCircle && (
                  <Tooltip label={isHeaderCollapsed ? "Expand Top Bar" : "Compact Top Bar"} withArrow>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={() => setIsHeaderCollapsed((prev) => !prev)}
                      data-tauri-drag-region="false"
                      style={{
                        cursor: "pointer",
                        color: "#cbd5e1",
                      }}
                    >
                      {isHeaderCollapsed ? <ChevronDown size={12} color="#cbd5e1" /> : <ChevronUp size={12} color="#cbd5e1" />}
                    </ActionIcon>
                  </Tooltip>
                )}

                {/* Minimize Window */}
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={handleMinimize}
                  data-tauri-drag-region="false"
                  title="Minimize"
                  style={{
                    cursor: "pointer",
                    color: "#cbd5e1",
                  }}
                >
                  <Minus size={12} color="#cbd5e1" />
                </ActionIcon>

                {/* Maximize Window */}
                {!isCircle && (
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    onClick={handleToggleMaximize}
                    data-tauri-drag-region="false"
                    title="Maximize"
                    style={{
                      cursor: "pointer",
                      color: "#cbd5e1",
                    }}
                  >
                    {isMaximized ? <Minimize2 size={11} color="#cbd5e1" /> : <Maximize2 size={11} color="#cbd5e1" />}
                  </ActionIcon>
                )}

                {/* Close Window */}
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={handleClose}
                  data-tauri-drag-region="false"
                  title="Close Overlay"
                  style={{
                    cursor: "pointer",
                    color: "#f87171",
                  }}
                >
                  <X size={12} color="#f87171" />
                </ActionIcon>
              </Group>
            </Box>
          )}

          {/* Main Map Viewer Canvas */}
          <Box
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              borderRadius: isCircle ? "50%" : undefined,
            }}
          >
            {isLoading ? (
              <Center style={{ height: "100%", width: "100%", backgroundColor: "rgba(10, 10, 14, 0.9)" }}>
                <Stack align="center" gap="sm">
                  <Loader color="blue" size="md" />
                  <Text size="xs" c="dimmed">
                    Loading interactive map...
                  </Text>
                </Stack>
              </Center>
            ) : error ? (
              <Center style={{ height: "100%", width: "100%", backgroundColor: "rgba(10, 10, 14, 0.9)" }}>
                <Stack align="center" gap="sm" style={{ maxWidth: 360, textAlign: "center", padding: 20 }}>
                  <AlertCircle size={32} color="#ef4444" />
                  <Text size="sm" fw={700} c="white">
                    Map Unavailable
                  </Text>
                  <Text size="xs" c="dimmed">
                    {error}
                  </Text>
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    leftSection={<RotateCcw size={12} />}
                    onClick={() => {
                      setError(null);
                      setIsLoading(true);
                    }}
                  >
                    Retry
                  </Button>
                </Stack>
              </Center>
            ) : loadedMapData ? (
              <MapViewer
                mapData={loadedMapData}
                storageKey={activeStorageKey}
                gameSlug={gameSlug}
                mapSlug={activeMapSlug}
                gameTitle={gameTitle}
                availableMaps={availableMaps}
                currentMapSlug={activeMapSlug}
                minZoom={initialMinZoom}
                maxZoom={initialMaxZoom}
                isOverlay={true}
                overlayShape={overlayShape}
                isSidebarOpen={isSidebarOpen}
                onSelectMap={(newSlug) => setActiveMapSlug(newSlug)}
                onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
                onCloseSidebar={() => setIsSidebarOpen(false)}
                style={{ height: "100%", width: "100%" }}
              />
            ) : null}
          </Box>
        </Box>
      </Box>
    </>
  );
}

export default function MapOverlayPage() {
  return (
    <Suspense
      fallback={
        <Center style={{ width: "100vw", height: "100vh", backgroundColor: "transparent" }}>
          <Loader color="blue" size="md" />
        </Center>
      }
    >
      <MapOverlayContent />
    </Suspense>
  );
}
