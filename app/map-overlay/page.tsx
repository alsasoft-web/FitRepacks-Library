"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  Suspense,
  useRef,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  Box,
  Flex,
  Group,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  Popover,
  Menu,
  UnstyledButton,
  Loader,
  Center,
  Stack,
  Button,
  TextInput,
  ScrollArea,
  Divider,
} from "@mantine/core";
import {
  Pin,
  PinOff,
  Minimize2,
  Maximize2,
  X,
  Minus,
  GripHorizontal,
  Layers,
  ChevronDown,
  AlertCircle,
  RotateCcw,
  Gamepad2,
  Search,
  Check,
  Sparkles,
  MapPin,
} from "lucide-react";
import { MapViewer } from "../../components/maps/MapViewer";
import { MapData, MapItem } from "../../components/maps/types";
import {
  loadMapsFromMapGenie,
  getMapGenieGameBySlug,
  fetchRawMapGenieMapFull,
  fetchRawMapGenieHtml,
  getLastOpenedMapSlug,
  saveLastOpenedMapSlug,
  findMatchingMap,
  resolveCanonicalMapGenieSlug,
  STATIC_POPULAR_MAPS,
} from "../../lib/gameMaps";
import {
  getOfflineMapData,
  saveOfflineMapData,
  fetchAndCacheOfflineAsset,
  isMapOfflineReady,
} from "../../lib/offlineMapStore";
import { getStoredGames, syncTauriLibraryData } from "../../lib/db";
import { Game } from "../../lib/types";
import { isTauriEnvironment } from "../../lib/mapOverlay";
import { useOverlayShortcuts } from "../../lib/useOverlayShortcuts";
import { invoke } from "@tauri-apps/api/core";

async function getOverlayWindow() {
  if (isTauriEnvironment()) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      return getCurrentWindow();
    } catch (_) {}
  }
  return null;
}

function MapOverlayContent() {
  const searchParams = useSearchParams();
  const initialGameSlug = searchParams.get("gameSlug") || "";
  const initialMapSlug = searchParams.get("mapSlug") || "default";
  const initialGameTitle = searchParams.get("gameTitle") || "";
  const initialMinZoom = searchParams.get("minZoom")
    ? Number(searchParams.get("minZoom"))
    : undefined;
  const initialMaxZoom = searchParams.get("maxZoom")
    ? Number(searchParams.get("maxZoom"))
    : undefined;

  const [gameSlug, setGameSlug] = useState(initialGameSlug);
  const [gameTitle, setGameTitle] = useState(initialGameTitle);
  const cleanGameSlug = resolveCanonicalMapGenieSlug(gameSlug, gameTitle);

  const [activeMapSlug, setActiveMapSlug] = useState(() => {
    const saved = getLastOpenedMapSlug(cleanGameSlug);
    if (initialMapSlug && initialMapSlug !== "default") return initialMapSlug;
    return saved || initialMapSlug || "default";
  });
  const [availableMaps, setAvailableMaps] = useState<MapItem[]>([]);
  const [loadedMapData, setLoadedMapData] = useState<MapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Library games for game switcher
  const [libraryGames, setLibraryGames] = useState<Game[]>([]);
  const [gameSearchQuery, setGameSearchQuery] = useState("");

  // Hydration safety flag
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    async function loadLibrary() {
      try {
        const g = await syncTauriLibraryData();
        if (Array.isArray(g) && g.length > 0) {
          setLibraryGames(g);
        } else {
          const stored = getStoredGames();
          if (stored.length > 0) setLibraryGames(stored);
        }
      } catch (_) {
        const stored = getStoredGames();
        if (stored.length > 0) setLibraryGames(stored);
      }
    }
    loadLibrary();
  }, []);

  useEffect(() => {
    console.log("[MapOverlayPage] Mounted. Initial params:", {
      initialGameSlug,
      initialMapSlug,
      initialGameTitle,
    });
    setMounted(true);
    if (isTauriEnvironment()) {
      import("@tauri-apps/api/core").then(async ({ invoke }) => {
        if (typeof window !== "undefined") {
          window.focus();
        }
        invoke("force_overlay_focus", { label: "map-overlay" }).catch(() => {});
        try {
          const info = await invoke<{
            game_slug: string;
            map_slug: string;
            game_title: string;
          }>("get_active_overlay_game");
          console.log(
            "[MapOverlayPage] Received active overlay game from Rust:",
            info,
          );
          if (info?.game_slug) {
            const gSlug = info.game_slug.includes("--")
              ? info.game_slug.split("--")[0]
              : info.game_slug;
            const savedMap = getLastOpenedMapSlug(gSlug);
            setGameSlug((prev) => prev || gSlug);
            setActiveMapSlug((prev) =>
              prev === "default" || !prev
                ? info.map_slug && info.map_slug !== "default"
                  ? info.map_slug
                  : savedMap || "default"
                : prev,
            );
            setGameTitle((prev) => prev || info.game_title);
          }
        } catch (err) {
          console.error("[MapOverlayPage] get_active_overlay_game error:", err);
        }
      });
    } else if (typeof window !== "undefined") {
      window.focus();
      try {
        const storedSlug = localStorage.getItem("fitrepacks_active_game_slug");
        const storedTitle = localStorage.getItem(
          "fitrepacks_active_game_title",
        );
        console.log("[MapOverlayPage] Browser fallback storage:", {
          storedSlug,
          storedTitle,
        });
        if (storedSlug) {
          const clean = storedSlug.includes("--")
            ? storedSlug.split("--")[0]
            : storedSlug;
          const savedMap = getLastOpenedMapSlug(clean);
          setGameSlug((prev) => prev || clean);
          setGameTitle((prev) => prev || storedTitle || storedSlug);
          if (savedMap) {
            setActiveMapSlug((prev) =>
              prev === "default" || !prev ? savedMap : prev,
            );
          }
        }
      } catch (_) {}
    }
  }, [initialGameSlug]);

  // Installed games in user library matching MapGenie maps
  const installedGamesWithMaps = useMemo(() => {
    const result: Array<{
      id: string;
      title: string;
      gameSlug: string;
      mapSlug: string;
      gameTitle: string;
      isInstalled: boolean;
    }> = [];
    const seenSlugs = new Set<string>();

    libraryGames.forEach((g) => {
      const isInstalled = Boolean(
        g.isInstalled || (g.exePath && g.exePath.trim() !== ""),
      );
      if (!isInstalled) return;

      const matched = findMatchingMap(g.title, g.id);
      if (matched) {
        const gSlug =
          matched.game_slug ||
          (matched.slug.includes("--")
            ? matched.slug.split("--")[0]
            : matched.slug);
        const cleanSlug = gSlug.toLowerCase();
        if (!seenSlugs.has(cleanSlug)) {
          seenSlugs.add(cleanSlug);
          const lastMap =
            getLastOpenedMapSlug(gSlug) || matched.map_slug || "default";
          result.push({
            id: g.id,
            title: g.title,
            gameSlug: gSlug,
            mapSlug: lastMap,
            gameTitle: g.title,
            isInstalled: true,
          });
        }
      }
    });

    return result;
  }, [libraryGames]);

  // Popular games from catalog
  const popularGamesWithMaps = useMemo(() => {
    const result: Array<{
      title: string;
      gameSlug: string;
      mapSlug: string;
      gameTitle: string;
      isInstalled: boolean;
    }> = [];
    const seenSlugs = new Set<string>();

    STATIC_POPULAR_MAPS.forEach((m) => {
      const gSlug =
        m.game_slug ||
        (m.slug.includes("--") ? m.slug.split("--")[0] : m.slug);
      const cleanSlug = gSlug.toLowerCase();
      if (!seenSlugs.has(cleanSlug)) {
        seenSlugs.add(cleanSlug);
        const gTitle = m.game_title || m.title.split(" - ")[0] || gSlug;
        const isInstalled = libraryGames.some(
          (lg) =>
            Boolean(
              lg.isInstalled || (lg.exePath && lg.exePath.trim() !== ""),
            ) &&
            findMatchingMap(lg.title, lg.id)?.game_slug?.toLowerCase() ===
              cleanSlug,
        );
        const lastMap = getLastOpenedMapSlug(gSlug) || m.map_slug || "default";
        result.push({
          title: gTitle,
          gameSlug: gSlug,
          mapSlug: lastMap,
          gameTitle: gTitle,
          isInstalled,
        });
      }
    });

    return result;
  }, [libraryGames]);

  const filteredInstalledGames = useMemo(() => {
    const query = gameSearchQuery.trim().toLowerCase();
    if (!query) return installedGamesWithMaps;
    return installedGamesWithMaps.filter(
      (g) =>
        g.title.toLowerCase().includes(query) ||
        g.gameSlug.toLowerCase().includes(query),
    );
  }, [installedGamesWithMaps, gameSearchQuery]);

  const filteredPopularGames = useMemo(() => {
    const query = gameSearchQuery.trim().toLowerCase();
    const installedSlugSet = new Set(
      installedGamesWithMaps.map((g) => g.gameSlug.toLowerCase()),
    );
    const others = popularGamesWithMaps.filter(
      (g) => !installedSlugSet.has(g.gameSlug.toLowerCase()),
    );
    if (!query) return others;
    return others.filter(
      (g) =>
        g.title.toLowerCase().includes(query) ||
        g.gameSlug.toLowerCase().includes(query),
    );
  }, [popularGamesWithMaps, installedGamesWithMaps, gameSearchQuery]);

  // Switch overlay to a chosen game
  const handleSwitchGame = useCallback(
    async (newGameSlug: string, newGameTitle: string) => {
      const clean = newGameSlug.includes("--")
        ? newGameSlug.split("--")[0]
        : newGameSlug;
      const savedLastMap = getLastOpenedMapSlug(clean) || "default";

      setGameSlug(clean);
      setGameTitle(newGameTitle);
      setActiveMapSlug(savedLastMap);
      setLoadedMapData(null);
      setIsLoading(true);

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("fitrepacks_active_game_slug", clean);
          localStorage.setItem("fitrepacks_active_game_title", newGameTitle);
        } catch (_) {}
      }

      if (isTauriEnvironment()) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("set_active_overlay_game", {
            gameSlug: clean,
            mapSlug: savedLastMap,
            gameTitle: newGameTitle,
          });
        } catch (_) {}
      }
    },
    [],
  );

  // Switch active sub-map
  const handleSelectSubMap = useCallback(
    (newMapSlug: string) => {
      setActiveMapSlug(newMapSlug);
      if (cleanGameSlug) {
        saveLastOpenedMapSlug(cleanGameSlug, newMapSlug);
      }
      if (isTauriEnvironment()) {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("set_active_overlay_game", {
            gameSlug: cleanGameSlug,
            mapSlug: newMapSlug,
            gameTitle: gameTitle,
          }).catch(() => {});
        });
      }
    },
    [cleanGameSlug, gameTitle],
  );

  // Overlay Window State
  const [isPinned, setIsPinned] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const clean = initialGameSlug.includes("--")
          ? initialGameSlug.split("--")[0]
          : initialGameSlug;
        if (clean) {
          const saved = localStorage.getItem(`fitrepacks_map_sidebar_${clean}`);
          if (saved !== null) return JSON.parse(saved);
        }
      } catch (_) {}
    }
    return false;
  });
  const isRestoredRef = useRef(false);

  // Window Edge Resize Dragging
  const handleResize = useCallback(
    async (
      e: React.MouseEvent,
      direction:
        | "East"
        | "North"
        | "NorthEast"
        | "NorthWest"
        | "South"
        | "SouthEast"
        | "SouthWest"
        | "West",
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const win = await getOverlayWindow();
      if (win && typeof win.startResizeDragging === "function") {
        try {
          await win.startResizeDragging(direction);
        } catch (err) {
          console.error("[MapOverlay] startResizeDragging error:", err);
        }
      }
    },
    [],
  );

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
            if (event.payload.gameSlug) {
              const nextGameSlug = event.payload.gameSlug.includes("--")
                ? event.payload.gameSlug.split("--")[0]
                : event.payload.gameSlug;
              const savedMap = getLastOpenedMapSlug(nextGameSlug);
              setGameSlug(nextGameSlug);
              if (event.payload.mapSlug && event.payload.mapSlug !== "default") {
                setActiveMapSlug(event.payload.mapSlug);
                saveLastOpenedMapSlug(nextGameSlug, event.payload.mapSlug);
              } else if (savedMap) {
                setActiveMapSlug(savedMap);
              }
            }
            if (event.payload.gameTitle) setGameTitle(event.payload.gameTitle);
          }
          if (typeof window !== "undefined") {
            window.focus();
          }
          invoke("force_overlay_focus", { label: "map-overlay" }).catch(
            () => {},
          );
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
  const handleStartDrag = useCallback(async (e?: React.MouseEvent | MouseEvent) => {
    if (e) {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.target) {
        const target = e.target as HTMLElement;
        if (
          target.closest(
            "button, [role='button'], input, select, textarea, a, .leaflet-control, [data-tauri-drag-region='false']",
          )
        ) {
          return;
        }
      }
    }
    const win = await getOverlayWindow();
    if (win) {
      try {
        await win.startDragging();
      } catch (_) {}
    }
  }, []);

  // Allow dragging window from anywhere on the overlay when Alt is held or with Middle-click
  useEffect(() => {
    const onWindowMouseDown = (e: MouseEvent) => {
      if ((e.altKey && e.button === 0) || e.button === 1) {
        handleStartDrag(e);
      }
    };
    window.addEventListener("mousedown", onWindowMouseDown);
    return () => {
      window.removeEventListener("mousedown", onWindowMouseDown);
    };
  }, [handleStartDrag]);

  // Load and apply per-game / global saved settings
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // 1. Pinned
      const savedPinned = cleanGameSlug
        ? localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_pinned`)
        : localStorage.getItem("fitrepacks_overlay_pinned");
      if (savedPinned !== null) {
        const pinVal = JSON.parse(savedPinned);
        setIsPinned(pinVal);
        getOverlayWindow().then((win) => {
          win?.setAlwaysOnTop(pinVal).catch(() => {});
        });
      }

      // 2. Window Size (Restore saved size)
      const savedSizeStr =
        (cleanGameSlug &&
          localStorage.getItem(`fitrepacks_overlay_${cleanGameSlug}_size`)) ||
        localStorage.getItem("fitrepacks_overlay_size");
      if (savedSizeStr) {
        const sizeObj = JSON.parse(savedSizeStr);
        if (sizeObj && sizeObj.width && sizeObj.height) {
          getOverlayWindow().then(async (win) => {
            if (win) {
              try {
                const { LogicalSize } = await import("@tauri-apps/api/dpi");
                await win.setSize(
                  new LogicalSize(sizeObj.width, sizeObj.height),
                );
              } catch (_) {
                try {
                  const { LogicalSize } =
                    await import("@tauri-apps/api/window");
                  await win.setSize(
                    new LogicalSize(sizeObj.width, sizeObj.height),
                  );
                } catch (_) {}
              }
            }
          });
        }
      }

      // 3. Sidebar Open State
      if (cleanGameSlug) {
        const savedSidebar = localStorage.getItem(
          `fitrepacks_map_sidebar_${cleanGameSlug}`,
        );
        if (savedSidebar !== null) {
          setIsSidebarOpen(JSON.parse(savedSidebar));
        }
      }
    } catch (_) {}
  }, [cleanGameSlug]);

  // Persist sidebar state when changed
  useEffect(() => {
    if (
      !cleanGameSlug ||
      typeof window === "undefined" ||
      !isRestoredRef.current
    )
      return;
    try {
      localStorage.setItem(
        `fitrepacks_map_sidebar_${cleanGameSlug}`,
        JSON.stringify(isSidebarOpen),
      );
    } catch (_) {}
  }, [cleanGameSlug, isSidebarOpen]);

  // Track initial restore
  useEffect(() => {
    const timer = setTimeout(() => {
      isRestoredRef.current = true;
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Window resize listeners
  useEffect(() => {
    let unlistenResize: (() => void) | undefined;

    getOverlayWindow().then(async (win) => {
      if (!win) return;
      try {
        if (typeof (win as any).onResized === "function") {
          unlistenResize = await (win as any).onResized((event: any) => {
            if (!isRestoredRef.current) return;
            const size = event?.payload || event;
            if (
              size &&
              typeof size.width === "number" &&
              typeof size.height === "number"
            ) {
              const scale = window.devicePixelRatio || 1;
              const logicalW = Math.round(size.width / scale);
              const logicalH = Math.round(size.height / scale);

              if (logicalW >= 160 && logicalH >= 160) {
                try {
                  localStorage.setItem(
                    "fitrepacks_overlay_size",
                    JSON.stringify({ width: logicalW, height: logicalH }),
                  );
                  if (cleanGameSlug) {
                    localStorage.setItem(
                      `fitrepacks_overlay_${cleanGameSlug}_size`,
                      JSON.stringify({ width: logicalW, height: logicalH }),
                    );
                  }
                } catch (_) {}

                if (isTauriEnvironment()) {
                  import("@tauri-apps/api/core").then(({ invoke }) => {
                    invoke("save_overlay_size", {
                      width: logicalW,
                      height: logicalH,
                    }).catch(() => {});
                  });
                }
              }
            }
          });
        }
      } catch (_) {}
    });

    return () => {
      if (unlistenResize) {
        try {
          unlistenResize();
        } catch (_) {}
      }
    };
  }, [cleanGameSlug]);

  // Always-On-Top Toggle
  const toggleAlwaysOnTop = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const nextState = !isPinned;
      setIsPinned(nextState);
      if (cleanGameSlug && typeof window !== "undefined") {
        try {
          localStorage.setItem(
            `fitrepacks_overlay_${cleanGameSlug}_pinned`,
            JSON.stringify(nextState),
          );
        } catch (_) {}
      }
      const win = await getOverlayWindow();
      if (win) {
        try {
          await win.setAlwaysOnTop(nextState);
        } catch (_) {}
      }
    },
    [isPinned, cleanGameSlug],
  );

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
        await win.hide();
      } catch (_) {
        try {
          await win.close();
        } catch (_) {}
      }
    } else {
      window.close();
    }
  }, []);

  // Map Data Loading
  useEffect(() => {
    if (!gameSlug) {
      return;
    }

    let isMounted = true;

    async function fetchOnlineMapData() {
      const cleanGameSlug = resolveCanonicalMapGenieSlug(gameSlug, gameTitle);
      let resolvedMapSlug = activeMapSlug || "default";
      let hadOfflineData = false;
      let offlineCached: any = null;
      let discoveredItems: MapItem[] = [];

      try {
        offlineCached = await getOfflineMapData(cleanGameSlug, resolvedMapSlug);
        if (!offlineCached && cleanGameSlug) {
          offlineCached =
            (await getOfflineMapData(cleanGameSlug, "default")) ||
            (await getOfflineMapData(cleanGameSlug, "world")) ||
            (await getOfflineMapData(cleanGameSlug, "empire-bay"));
        }
        if (offlineCached && isMounted) {
          const hasLocations =
            Array.isArray(offlineCached.locations) &&
            offlineCached.locations.length > 0;
          hadOfflineData = true;
          setLoadedMapData(offlineCached);
          if (hasLocations) {
            setIsLoading(false);
          } else {
            setIsLoading(true);
          }
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
            m.slug
              ?.toLowerCase()
              .startsWith(`${cleanGameSlug.toLowerCase()}--`),
        );

        const gameData = getMapGenieGameBySlug(cleanGameSlug);

        if (matched.length > 0 && isMounted) {
          const mapItemsMap = new Map<string, MapItem>();
          matched.forEach((item) => {
            const s =
              item.map_slug ||
              (item.slug ? item.slug.replace(`${cleanGameSlug}--`, "") : "");
            if (s) {
              const cleanTitle =
                item.title?.replace(
                  new RegExp(`^${item.game_title || ""}\\s*-\\s*`, "i"),
                  "",
                ) || s;
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
            discoveredItems = Array.from(mapItemsMap.values());
            setAvailableMaps((prev) => {
              if (
                prev.length === discoveredItems.length &&
                prev.every(
                  (p, idx) =>
                    p.slug === discoveredItems[idx]?.slug &&
                    p.id === discoveredItems[idx]?.id,
                )
              ) {
                return prev;
              }
              return discoveredItems;
            });
            const isCurrentSlugValid = discoveredItems.some(
              (i) => i.slug.toLowerCase() === resolvedMapSlug.toLowerCase(),
            );
            if (!isCurrentSlugValid || resolvedMapSlug === "default") {
              const savedMap = getLastOpenedMapSlug(cleanGameSlug);
              if (
                savedMap &&
                discoveredItems.some(
                  (i) => i.slug.toLowerCase() === savedMap.toLowerCase(),
                )
              ) {
                resolvedMapSlug = savedMap;
              } else if (discoveredItems.length > 0 && discoveredItems[0].slug) {
                resolvedMapSlug = discoveredItems[0].slug;
              }
              if (resolvedMapSlug !== activeMapSlug) {
                setActiveMapSlug(resolvedMapSlug);
              }
            }
          }
        }

        const targetMapSlug = resolvedMapSlug;
        if (cleanGameSlug && targetMapSlug && targetMapSlug !== "default") {
          saveLastOpenedMapSlug(cleanGameSlug, targetMapSlug);
        }
        const currentMapItem =
          matched.find(
            (m) => m.map_slug?.toLowerCase() === targetMapSlug.toLowerCase(),
          ) || matched[0];

        let targetMapId = currentMapItem?.id;
        if (!targetMapId && gameData?.maps && gameData.maps.length > 0) {
          const foundInGame =
            gameData.maps.find(
              (m) => m.slug.toLowerCase() === targetMapSlug.toLowerCase(),
            ) || gameData.maps[0];
          if (foundInGame) {
            targetMapId = String(foundInGame.id);
          }
        }

        if (!targetMapId && !hadOfflineData) {
          throw new Error(
            `Map '${targetMapSlug}' for game '${cleanGameSlug}' not found.`,
          );
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
            mapHtml.match(
              /window\.mapData\s*=\s*(\{[\s\S]*?\});(?:\s*window\.|\s*<\/script>)/,
            ) || mapHtml.match(/window\.mapData\s*=\s*(\{[\s\S]*?\});/);
          if (mapDataMatch) {
            try {
              htmlMapData = JSON.parse(mapDataMatch[1]);
            } catch (_) {}
          }
        }

        if (!rawData) {
          rawData =
            htmlMapData ||
            (await getOfflineMapData(cleanGameSlug, targetMapSlug));
        }

        if (!rawData && !hadOfflineData) {
          throw new Error(
            `Failed to load map data for '${cleanGameSlug}'. Please check internet connection or download map for offline use.`,
          );
        }

        if (!isMounted || !rawData) return;

        let extractedSpritePositions: Record<string, any> = {};
        let extractedMarkerUrl = "";
        let extractedMarkerWidth: number | undefined;
        let extractedMarkerHeight: number | undefined;

        if (mapHtml) {
          const spriteMatch =
            mapHtml.match(
              /const\s+MARKER_SPRITE_POSITIONS(?:_V\d+)?\s*=\s*(\{[\s\S]*?\});/,
            ) ||
            mapHtml.match(
              /MARKER_SPRITE_POSITIONS(?:_V\d+)?\s*=\s*(\{[\s\S]*?\});/,
            );
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
          extractedSpritePositions =
            offlineCached.mapConfig.markerSpritePositions;
          extractedMarkerUrl =
            extractedMarkerUrl || offlineCached.mapConfig.markerImagesUrl || "";
          extractedMarkerWidth =
            extractedMarkerWidth || offlineCached.mapConfig.markerImagesWidth;
          extractedMarkerHeight =
            extractedMarkerHeight || offlineCached.mapConfig.markerImagesHeight;
        }

        const rawMap = rawData.map || htmlMapData?.map || rawData;
        const groups = Array.isArray(rawData.groups)
          ? rawData.groups
          : Array.isArray(htmlMapData?.groups)
            ? htmlMapData.groups
            : [];

        const categories: any[] = [];
        const rawCategories =
          Array.isArray(rawData?.categories) && rawData.categories.length > 0
            ? rawData.categories
            : Array.isArray(htmlMapData?.categories) &&
                htmlMapData.categories.length > 0
              ? htmlMapData.categories
              : null;

        if (rawCategories) {
          categories.push(...rawCategories);
        } else if (htmlMapData?.categories && typeof htmlMapData.categories === "object") {
          categories.push(...Object.values(htmlMapData.categories));
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
        if (Array.isArray(rawData?.locations) && rawData.locations.length > 0) {
          locations.push(...rawData.locations);
        } else if (Array.isArray(htmlMapData?.locations) && htmlMapData.locations.length > 0) {
          locations.push(...htmlMapData.locations);
        } else if (categories.length > 0) {
          for (const cat of categories) {
            if (Array.isArray(cat.locations)) {
              for (const loc of cat.locations) {
                locations.push({
                  ...loc,
                  category_id: loc.category_id || cat.id,
                });
              }
            }
          }
        }

        const tileSets =
          htmlMapData?.mapConfig?.tile_sets ||
          htmlMapData?.tile_sets ||
          rawData.config?.tile_sets ||
          rawMap.config?.tile_sets ||
          rawMap.tile_sets ||
          rawData.tile_sets ||
          [];
        const primaryTileSet = tileSets[0] || {};
        const tilePattern = primaryTileSet.pattern
          ? primaryTileSet.pattern.startsWith("http")
            ? primaryTileSet.pattern
            : `https://tiles.mapgenie.io/games/${primaryTileSet.pattern}`
          : undefined;

        const resolvedGame =
          rawData.game || htmlMapData?.game || gameData || {};
        const gameConfig = resolvedGame.config || {};

        const startLat =
          htmlMapData?.mapConfig?.start_lat ??
          rawData.config?.start_lat ??
          rawMap.initial_latitude ??
          0;
        const startLng =
          htmlMapData?.mapConfig?.start_lng ??
          rawData.config?.start_lng ??
          rawMap.initial_longitude ??
          0;
        const initialZoom =
          htmlMapData?.mapConfig?.initial_zoom ??
          rawData.config?.initial_zoom ??
          rawMap.initial_zoom ??
          10;

        const mapConfig = {
          id: targetMapId || rawData.mapConfig?.id || "0",
          title: rawMap.title || currentMapItem?.title || targetMapSlug,
          gameTitle: resolvedGame.title || gameTitle || cleanGameSlug,
          slug: targetMapSlug,
          tile_sets: tileSets,
          tilePattern,
          initial_zoom: initialZoom,
          min_zoom: primaryTileSet.min_zoom ?? rawMap.min_zoom ?? 1,
          max_zoom:
            primaryTileSet.tiles_max_zoom ??
            primaryTileSet.max_zoom ??
            rawMap.max_zoom ??
            16,
          start_lat: startLat,
          start_lng: startLng,
          center: [startLat, startLng] as [number, number],
          markerSpritePositions:
            Object.keys(extractedSpritePositions).length > 0
              ? extractedSpritePositions
              : undefined,
          markerImagesUrl:
            extractedMarkerUrl ||
            (gameConfig.marker_sprite_url
              ? gameConfig.marker_sprite_url.startsWith("http")
                ? gameConfig.marker_sprite_url
                : `https://cdn.mapgenie.io${gameConfig.marker_sprite_url}`
              : `https://cdn.mapgenie.io/images/games/${cleanGameSlug}/markers@2x.png`),
          markerImagesWidth: extractedMarkerWidth,
          markerImagesHeight: extractedMarkerHeight,
          iconsCssUrl: `https://cdn.mapgenie.io/css/themes/icons/${cleanGameSlug}-icons.css`,
          icomoonUrl: `https://cdn.mapgenie.io/fonts/${cleanGameSlug}/icons/icomoon.woff`,
          mgIconsUrl: `https://cdn.mapgenie.io/fonts/${cleanGameSlug}/icons/icomoon.ttf`,
        };

        const finalMapData: MapData = {
          game: {
            id: resolvedGame.id,
            title: resolvedGame.title || gameTitle || cleanGameSlug,
            slug: cleanGameSlug,
            config: gameConfig,
          },
          map: {
            id: targetMapId || rawData.map?.id || "0",
            title: rawMap.title || currentMapItem?.title || targetMapSlug,
            slug: targetMapSlug,
            config: mapConfig,
            tile_sets: tileSets,
            start_lat: startLat,
            start_lng: startLng,
          },
          mapConfig,
          maps: discoveredItems.length > 0 ? discoveredItems : availableMaps,
          groups: groups.map((g: any) => ({
            id: g.id,
            title: g.title,
            color: g.color,
            categories: (g.categories || []).map((c: any) => ({
              id: c.id,
              group_id: c.group_id || g.id,
              title: c.title,
              icon: c.icon,
              color: c.color,
              locations_count: c.locations_count,
            })),
          })),
          categories: categories.map((c: any) => ({
            id: c.id,
            group_id: c.group_id,
            title: c.title,
            icon: c.icon,
            color: c.color,
            locations_count: c.locations_count,
          })),
          locations: locations.map((loc: any) => ({
            id: loc.id,
            map_id: loc.map_id,
            region_id: loc.region_id,
            category_id: loc.category_id,
            title: loc.title,
            description: loc.description,
            latitude: loc.latitude,
            longitude: loc.longitude,
            features: loc.features,
            ign_object_id: loc.ign_object_id,
            ign_wiki_slug: loc.ign_wiki_slug,
            media: loc.media,
            tags: loc.tags,
          })),
        };

        // Only pre-cache map.json if not already offline ready
        isMapOfflineReady(cleanGameSlug, targetMapSlug).then(async (ready) => {
          if (!ready) {
            saveOfflineMapData(cleanGameSlug, targetMapSlug, finalMapData).catch(
              () => {},
            );
          } else {
            // Auto-repair offline maps that were previously saved with 0 locations
            const localData = await getOfflineMapData(cleanGameSlug, targetMapSlug);
            const localLocsCount = Array.isArray(localData?.locations) ? localData.locations.length : 0;
            const finalLocs = finalMapData.locations || [];
            if (localLocsCount === 0 && finalLocs.length > 0) {
              const repairedData = {
                ...localData,
                locations: finalLocs,
                categories: (finalMapData.categories && finalMapData.categories.length > 0) ? finalMapData.categories : localData.categories,
                groups: (finalMapData.groups && finalMapData.groups.length > 0) ? finalMapData.groups : localData.groups,
                regions: (finalMapData.regions && finalMapData.regions.length > 0) ? finalMapData.regions : localData.regions,
                mapConfig: {
                  ...(localData.mapConfig || {}),
                  ...(finalMapData.mapConfig || {}),
                },
              };
              saveOfflineMapData(cleanGameSlug, targetMapSlug, repairedData).catch(() => {});
            }
          }
        });

        if (mapConfig.markerImagesUrl) {
          fetchAndCacheOfflineAsset(
            `sprite_${cleanGameSlug}`,
            mapConfig.markerImagesUrl,
          ).catch(() => {});
        }
        if (mapConfig.icomoonUrl) {
          fetchAndCacheOfflineAsset(
            `font_icomoon_${cleanGameSlug}`,
            mapConfig.icomoonUrl,
          ).catch(() => {});
        }

        if (isMounted) {
          setLoadedMapData(finalMapData);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          if (!hadOfflineData) {
            setError(err?.message || "Failed to load map data.");
          }
          setIsLoading(false);
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

  const allAvailableMaps: MapItem[] = useMemo(() => {
    if (loadedMapData?.maps && loadedMapData.maps.length > 0) {
      return loadedMapData.maps;
    }
    return availableMaps;
  }, [loadedMapData?.maps, availableMaps]);

  const currentActiveMapTitle = useMemo(() => {
    const found = allAvailableMaps.find(
      (m) => m.slug.toLowerCase() === activeMapSlug.toLowerCase(),
    );
    if (found?.title) return found.title;
    if (loadedMapData?.mapConfig?.title) return loadedMapData.mapConfig.title;
    return activeMapSlug || "Select Map";
  }, [allAvailableMaps, activeMapSlug, loadedMapData?.mapConfig?.title]);

  if (!mounted) {
    return (
      <Center
        style={{ width: "100vw", height: "100vh", backgroundColor: "#07080b" }}
      >
        <Loader color="blue" size="md" />
      </Center>
    );
  }

  return (
    <>
      <style>{`
        html, body, #__next {
          background: #07080b !important;
          background-color: #07080b !important;
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
          flexDirection: "column",
          backgroundColor: "#07080b",
          overflow: "hidden",
          position: "relative",
          userSelect: "none",
          border: isMaximized ? "none" : "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: isMaximized ? 0 : 8,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.85)",
        }}
      >
        {/* Resize Edge Handles (active when not maximized) */}
        {!isMaximized && (
          <>
            <Box
              data-tauri-drag-region="false"
              onMouseDown={(e) => handleResize(e, "North")}
              style={{
                position: "absolute",
                top: 0,
                left: 16,
                right: 16,
                height: 8,
                cursor: "ns-resize",
                zIndex: 9999,
              }}
            />
            <Box
              data-tauri-drag-region="false"
              onMouseDown={(e) => handleResize(e, "South")}
              style={{
                position: "absolute",
                bottom: 0,
                left: 16,
                right: 16,
                height: 8,
                cursor: "ns-resize",
                zIndex: 9999,
              }}
            />
            <Box
              data-tauri-drag-region="false"
              onMouseDown={(e) => handleResize(e, "West")}
              style={{
                position: "absolute",
                top: 16,
                bottom: 16,
                left: 0,
                width: 8,
                cursor: "ew-resize",
                zIndex: 9999,
              }}
            />
            <Box
              data-tauri-drag-region="false"
              onMouseDown={(e) => handleResize(e, "East")}
              style={{
                position: "absolute",
                top: 16,
                bottom: 16,
                right: 0,
                width: 8,
                cursor: "ew-resize",
                zIndex: 9999,
              }}
            />
            <Box
              data-tauri-drag-region="false"
              onMouseDown={(e) => handleResize(e, "NorthWest")}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: 16,
                height: 16,
                cursor: "nwse-resize",
                zIndex: 10000,
              }}
            />
            <Box
              data-tauri-drag-region="false"
              onMouseDown={(e) => handleResize(e, "NorthEast")}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 16,
                height: 16,
                cursor: "nesw-resize",
                zIndex: 10000,
              }}
            />
            <Box
              data-tauri-drag-region="false"
              onMouseDown={(e) => handleResize(e, "SouthWest")}
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                width: 16,
                height: 16,
                cursor: "nesw-resize",
                zIndex: 10000,
              }}
            />
            <Box
              data-tauri-drag-region="false"
              onMouseDown={(e) => handleResize(e, "SouthEast")}
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 16,
                height: 16,
                cursor: "nwse-resize",
                zIndex: 10000,
              }}
            />
          </>
        )}

        {/* Standard Fixed Top Bar */}
        <Box
          data-tauri-drag-region
          onMouseDown={handleStartDrag}
          style={{
            height: 40,
            minHeight: 40,
            backgroundColor: "#0c0f16",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 10px",
            zIndex: 1000,
            position: "relative",
            gap: 6,
            cursor: "grab",
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
              marginRight: 2,
              flexShrink: 0,
            }}
          >
            <GripHorizontal
              size={14}
              color="#8892b0"
              style={{ pointerEvents: "none", flexShrink: 0 }}
            />
            <Text
              size="10.5px"
              fw={800}
              style={{
                letterSpacing: 0.8,
                textTransform: "uppercase",
                fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                color: "#94a3b8",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                flexShrink: 0,
              }}
            >
              OVERLAY
            </Text>
          </Box>

          {/* Game Selector Menu (Change overlay to one of the installed games) */}
          <Menu shadow="xl" width={280} position="bottom-start" withinPortal>
            <Menu.Target>
              <UnstyledButton
                data-tauri-drag-region="false"
                title="Change overlay game"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 6,
                  backgroundColor: "rgba(15, 23, 42, 0.95)",
                  border: "1px solid rgba(59, 130, 246, 0.45)",
                  color: "#93c5fd",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 1,
                  maxWidth: 160,
                  transition: "all 0.15s ease",
                }}
              >
                <Gamepad2 size={13} color="#60a5fa" style={{ flexShrink: 0 }} />
                <Text
                  size="11px"
                  fw={700}
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    color: "#f1f5f9",
                  }}
                >
                  {gameTitle || cleanGameSlug || "Select Game"}
                </Text>
                <ChevronDown
                  size={11}
                  color="#94a3b8"
                  style={{ flexShrink: 0 }}
                />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown
              style={{
                backgroundColor: "#0b0f19",
                borderColor: "#1e293b",
                padding: 6,
                zIndex: 9999,
                maxHeight: 380,
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
              }}
            >
              {/* Search Box */}
              <Box p={4} pb={6}>
                <TextInput
                  size="xs"
                  placeholder="Search games..."
                  value={gameSearchQuery}
                  onChange={(e) => setGameSearchQuery(e.currentTarget.value)}
                  leftSection={<Search size={12} color="#64748b" />}
                  styles={{
                    input: {
                      backgroundColor: "#131824",
                      borderColor: "#1e293b",
                      color: "#f1f5f9",
                      fontSize: 11,
                    },
                  }}
                />
              </Box>

              <ScrollArea.Autosize mah={280} scrollbarSize={6} offsetScrollbars>
                {/* Installed Games Section */}
                {filteredInstalledGames.length > 0 && (
                  <>
                    <Menu.Label
                      style={{
                        color: "#38bdf8",
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Sparkles size={11} /> Installed Games ({filteredInstalledGames.length})
                    </Menu.Label>
                    {filteredInstalledGames.map((g) => {
                      const isCurrent =
                        g.gameSlug.toLowerCase() === cleanGameSlug.toLowerCase();
                      return (
                        <Menu.Item
                          key={`installed-${g.gameSlug}-${g.title}`}
                          onClick={() => handleSwitchGame(g.gameSlug, g.title)}
                          leftSection={
                            isCurrent ? (
                              <Check size={12} color="#60a5fa" />
                            ) : (
                              <Gamepad2 size={12} color="#64748b" />
                            )
                          }
                          style={{
                            fontSize: 11.5,
                            fontWeight: isCurrent ? 700 : 500,
                            color: isCurrent ? "#60a5fa" : "#e2e8f0",
                            backgroundColor: isCurrent
                              ? "rgba(59, 130, 246, 0.15)"
                              : "transparent",
                            borderRadius: 4,
                            padding: "6px 8px",
                            margin: "1px 0",
                          }}
                        >
                          <Group justify="space-between" wrap="nowrap" gap={6}>
                            <Text size="11.5px" truncate style={{ flex: 1 }}>
                              {g.title}
                            </Text>
                            <Badge
                              size="xs"
                              variant="light"
                              color="teal"
                              style={{ fontSize: 9, height: 16, padding: "0 4px" }}
                            >
                              Installed
                            </Badge>
                          </Group>
                        </Menu.Item>
                      );
                    })}
                  </>
                )}

                {/* Other Available Maps Section */}
                {filteredPopularGames.length > 0 && (
                  <>
                    {filteredInstalledGames.length > 0 && <Menu.Divider style={{ borderColor: "#1e293b" }} />}
                    <Menu.Label
                      style={{
                        color: "#94a3b8",
                        fontSize: 10,
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <MapPin size={11} /> Other Available Maps ({filteredPopularGames.length})
                    </Menu.Label>
                    {filteredPopularGames.map((g) => {
                      const isCurrent =
                        g.gameSlug.toLowerCase() === cleanGameSlug.toLowerCase();
                      return (
                        <Menu.Item
                          key={`popular-${g.gameSlug}-${g.title}`}
                          onClick={() => handleSwitchGame(g.gameSlug, g.title)}
                          leftSection={
                            isCurrent ? (
                              <Check size={12} color="#60a5fa" />
                            ) : (
                              <MapPin size={12} color="#64748b" />
                            )
                          }
                          style={{
                            fontSize: 11.5,
                            fontWeight: isCurrent ? 700 : 500,
                            color: isCurrent ? "#60a5fa" : "#cbd5e1",
                            backgroundColor: isCurrent
                              ? "rgba(59, 130, 246, 0.15)"
                              : "transparent",
                            borderRadius: 4,
                            padding: "6px 8px",
                            margin: "1px 0",
                          }}
                        >
                          <Text size="11.5px" truncate>
                            {g.title}
                          </Text>
                        </Menu.Item>
                      );
                    })}
                  </>
                )}

                {filteredInstalledGames.length === 0 &&
                  filteredPopularGames.length === 0 && (
                    <Box p="sm" style={{ textAlign: "center" }}>
                      <Text size="xs" c="dimmed">
                        No games or maps found matching &quot;{gameSearchQuery}&quot;
                      </Text>
                    </Box>
                  )}
              </ScrollArea.Autosize>
            </Menu.Dropdown>
          </Menu>

          {/* Map Selector Dropdown (Sub-maps for current game) */}
          {allAvailableMaps.length > 0 && (
            <Menu shadow="md" width={220} position="bottom-end" withinPortal>
              <Menu.Target>
                <UnstyledButton
                  data-tauri-drag-region="false"
                  title="Select Sub-Map"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 8px",
                    borderRadius: 6,
                    backgroundColor: "rgba(30, 41, 59, 0.95)",
                    border: "1px solid rgba(59, 130, 246, 0.4)",
                    color: "#f1f5f9",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 1,
                    maxWidth: 160,
                  }}
                >
                  <Layers size={12} color="#60a5fa" style={{ flexShrink: 0 }} />
                  <Text
                    size="11px"
                    fw={700}
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                    }}
                  >
                    {currentActiveMapTitle}
                  </Text>
                  <ChevronDown
                    size={11}
                    color="#94a3b8"
                    style={{ flexShrink: 0 }}
                  />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown
                style={{
                  backgroundColor: "#0b0f19",
                  borderColor: "#1e293b",
                  zIndex: 9999,
                }}
              >
                <Menu.Label
                  style={{
                    color: "#94a3b8",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Select Map
                </Menu.Label>
                {allAvailableMaps.map((m) => {
                  const isCur =
                    m.slug.toLowerCase() === activeMapSlug.toLowerCase();
                  return (
                    <Menu.Item
                      key={m.slug}
                      onClick={() => handleSelectSubMap(m.slug)}
                      leftSection={
                        isCur ? (
                          <Check size={12} color="#60a5fa" />
                        ) : (
                          <Layers size={12} color="#64748b" />
                        )
                      }
                      style={{
                        fontSize: 12,
                        color: isCur ? "#60a5fa" : "#e2e8f0",
                        fontWeight: isCur ? 700 : 500,
                        backgroundColor: isCur
                          ? "rgba(59, 130, 246, 0.12)"
                          : "transparent",
                      }}
                    >
                      {m.title}
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>
          )}

          {/* Draggable Header Middle Region (Spans entire available space across the title bar) */}
          <Box
            data-tauri-drag-region
            onMouseDown={handleStartDrag}
            style={{
              flex: 1,
              height: "100%",
              cursor: "grab",
              minWidth: 40,
            }}
          />

          {/* Right Toolbar Actions */}
          <Group
            gap={4}
            style={{ flexShrink: 0, marginLeft: "auto" }}
            data-tauri-drag-region="false"
          >
            {/* Always-on-Top Pin */}
            <Tooltip
              label={
                isPinned ? "Always On Top: Pinned" : "Always On Top: Unpinned"
              }
              withArrow
            >
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
                {isPinned ? (
                  <Pin size={12} color="#ffffff" />
                ) : (
                  <PinOff size={12} color="#cbd5e1" />
                )}
              </ActionIcon>
            </Tooltip>

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
              {isMaximized ? (
                <Minimize2 size={11} color="#cbd5e1" />
              ) : (
                <Maximize2 size={11} color="#cbd5e1" />
              )}
            </ActionIcon>

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

        {/* Main Map Viewer Canvas */}
        <Box
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {isLoading ? (
            <Center
              style={{
                height: "100%",
                width: "100%",
                backgroundColor: "#07080b",
              }}
            >
              <Stack align="center" gap="sm">
                <Loader color="blue" size="md" />
                <Text size="xs" c="dimmed">
                  Loading interactive map...
                </Text>
              </Stack>
            </Center>
          ) : error ? (
            <Center
              style={{
                height: "100%",
                width: "100%",
                backgroundColor: "#07080b",
              }}
            >
              <Stack
                align="center"
                gap="sm"
                style={{ maxWidth: 360, textAlign: "center", padding: 20 }}
              >
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
              availableMaps={allAvailableMaps}
              currentMapSlug={activeMapSlug}
              minZoom={initialMinZoom}
              maxZoom={initialMaxZoom}
              isOverlay={true}
              isSidebarOpen={isSidebarOpen}
              onSelectMap={handleSelectSubMap}
              onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
              onCloseSidebar={() => setIsSidebarOpen(false)}
              style={{ height: "100%", width: "100%" }}
            />
          ) : null}
        </Box>
      </Box>
    </>
  );
}

export default function MapOverlayPage() {
  return (
    <Suspense
      fallback={
        <Center
          style={{
            width: "100vw",
            height: "100vh",
            backgroundColor: "#07080b",
          }}
        >
          <Loader color="blue" size="md" />
        </Center>
      }
    >
      <MapOverlayContent />
    </Suspense>
  );
}
