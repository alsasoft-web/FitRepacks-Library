import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import type L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Box,
  Flex,
  Text,
  TextInput,
  UnstyledButton,
  Button,
  ActionIcon,
  Progress,
  Tooltip,
  Group,
} from "@mantine/core";
import {
  Search,
  X,
  Download,
  Check,
  Trash2,
  Loader2,
  SlidersHorizontal,
  Layers,
  PictureInPicture2,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { MapViewerProps, MapCategory, MapLocation } from "./types";
import {
  downloadFullOfflineMap,
  isMapOfflineReady,
  checkOfflineMapUpdateAvailable,
  deleteOfflineMap,
  getOfflineAsset,
  getOfflineAssetUrl,
  getOfflineAssetText,
  getValidOfflineSpriteUrl,
  saveOfflineAsset,
  fetchAssetBlob,
  fetchAndCacheOfflineAsset,
  clearOfflineMapTileCache,
  DownloadProgress,
} from "../../lib/offlineMapStore";
import { openMapOverlay } from "../../lib/mapOverlay";
import {
  saveLastOpenedMapSlug,
  resolveCanonicalMapGenieSlug,
} from "../../lib/gameMaps";
import { getMapFoundLocationIds, toggleMapFoundLocation } from "../../lib/db";
import { MapGamepadController } from "./MapGamepadController";
import { CategoryIcon } from "./CategoryIcon";

const TRANSPARENT_TILE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256' fill='none'/%3E";

function formatDescription(desc?: string | null): string {
  if (!desc) return "No additional details available.";
  return String(desc)
    .replace(
      /\[([^\]]+)\]\(([^)]*?(?:location_?ids?|location_?id|loc_?id|locations?)=(\d+)[^)]*)\)/gi,
      (_match, title, _url, locId) =>
        `<button type="button" class="loc-ref-btn" data-loc-id="${locId}" title="Jump to ${title}">${title}</button>`,
    )
    .replace(
      /\[([^\]]+)\]\((\d+)\)/gi,
      (_match, title, locId) =>
        `<button type="button" class="loc-ref-btn" data-loc-id="${locId}" title="Jump to ${title}">${title}</button>`,
    )
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/gi,
      (_match, title, url) => {
        const match = url.match(
          /[?&#](?:location_?ids?|location_?id|loc_?id|locations?)=(\d+)/i,
        );
        if (match) {
          return `<button type="button" class="loc-ref-btn" data-loc-id="${match[1]}" title="Jump to ${title}">${title}</button>`;
        }
        return `<button type="button" class="loc-ref-btn" data-loc-title="${encodeURIComponent(title)}" title="Jump to ${title}">${title}</button>`;
      },
    )
    .replace(/\[([^\]]+)\]\(\/([^\s\)]+)\)/gi, (_match, title, path) => {
      const match = path.match(
        /[?&#](?:location_?ids?|location_?id|loc_?id|locations?)=(\d+)/i,
      );
      if (match) {
        return `<button type="button" class="loc-ref-btn" data-loc-id="${match[1]}" title="Jump to ${title}">${title}</button>`;
      }
      return `<button type="button" class="loc-ref-btn" data-loc-title="${encodeURIComponent(title)}" title="Jump to ${title}">${title}</button>`;
    })
    .replace(
      /\[\[([^\]]+)\]\]/g,
      (_match, title) =>
        `<button type="button" class="loc-ref-btn" data-loc-title="${encodeURIComponent(title)}" title="Jump to ${title}">${title}</button>`,
    )
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
}

export function MapViewer({
  gameSlug = "",
  mapSlug = "",
  mapData,
  storageKey,
  gameTitle = "",
  style,
  className,
  availableMaps,
  currentMapSlug,
  minZoom: customMinZoom,
  maxZoom: customMaxZoom,
  isOverlay = false,
  isSidebarOpen: externalIsSidebarOpen,
  onSelectMap,
  onOpenOverlay,
  onToggleSidebar,
  onCloseSidebar,
  onClose,
}: MapViewerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  const markersMapRef = useRef<Map<string | number, L.Marker>>(new Map());
  const leafletModuleRef = useRef<typeof import("leaflet") | null>(null);
  const discoveredWorkingPatternRef = useRef<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [hideFound, setHideFound] = useState(false);
  const [foundIds, setFoundIds] = useState<Set<number | string>>(new Set());
  const cleanSlug = gameSlug
    ? gameSlug.includes("--")
      ? gameSlug.split("--")[0]
      : gameSlug
    : "";

  const [categoryState, setCategoryState] = useState<Record<string, boolean>>(
    {},
  );
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(0);
  const [internalIsSidebarOpen, setInternalIsSidebarOpen] = useState<boolean>(
    () => {
      if (typeof window !== "undefined" && cleanSlug) {
        try {
          const saved = localStorage.getItem(
            `fitrepacks_map_sidebar_${cleanSlug}`,
          );
          if (saved !== null) {
            return JSON.parse(saved);
          }
        } catch (_) {}
      }
      return !isOverlay;
    },
  );

  const isSidebarOpen =
    externalIsSidebarOpen !== undefined
      ? externalIsSidebarOpen
      : internalIsSidebarOpen;

  // Restore saved per-game sidebar state when game changes
  useEffect(() => {
    if (!cleanSlug || typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(`fitrepacks_map_sidebar_${cleanSlug}`);
      if (saved !== null) {
        setInternalIsSidebarOpen(JSON.parse(saved));
      }
    } catch (_) {}
  }, [cleanSlug]);

  // Persist per-game sidebar state on change
  useEffect(() => {
    if (!cleanSlug || typeof window === "undefined") return;
    try {
      localStorage.setItem(
        `fitrepacks_map_sidebar_${cleanSlug}`,
        JSON.stringify(isSidebarOpen),
      );
    } catch (_) {}
  }, [cleanSlug, isSidebarOpen]);

  const handleToggleSidebar = useCallback(() => {
    if (onToggleSidebar) {
      onToggleSidebar();
    } else {
      setInternalIsSidebarOpen((v) => !v);
    }
  }, [onToggleSidebar]);

  const handleCloseSidebar = useCallback(() => {
    if (onCloseSidebar) {
      onCloseSidebar();
    } else if (onToggleSidebar && isSidebarOpen) {
      onToggleSidebar();
    } else {
      setInternalIsSidebarOpen(false);
    }
  }, [onCloseSidebar, onToggleSidebar, isSidebarOpen]);

  // Invalidate Leaflet map size when sidebar opens or closes
  useEffect(() => {
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [isSidebarOpen]);

  // Offline Download & Update State
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [hasOfflineUpdate, setHasOfflineUpdate] = useState(false);
  const [updateReason, setUpdateReason] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [offlineSpriteUrl, setOfflineSpriteUrl] = useState<string | null>(null);
  const [detectedSpriteDimensions, setDetectedSpriteDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const iconCacheRef = useRef<Map<string, L.DivIcon>>(new Map());
  const allMarkersRef = useRef<
    Array<{
      id: number | string;
      cId: string;
      loc: MapLocation;
      marker: L.Marker;
    }>
  >([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const effectiveGameSlug = resolveCanonicalMapGenieSlug(
    mapData?.game?.slug || gameSlug || "",
    mapData?.game?.title || gameTitle || "",
  );
  const effectiveMapSlug =
    mapData?.map?.slug || mapData?.mapConfig?.slug || mapSlug || "default";
  const finalStorageKey =
    storageKey ||
    (effectiveGameSlug
      ? `map_progress_${effectiveGameSlug}_${effectiveMapSlug}`
      : "");
  const categoryStorageKey = effectiveGameSlug
    ? `map_categories_${effectiveGameSlug}_${effectiveMapSlug}`
    : "";
  const hideFoundStorageKey = effectiveGameSlug
    ? `map_hide_found_${effectiveGameSlug}_${effectiveMapSlug}`
    : "";

  // Check offline readiness and update availability
  useEffect(() => {
    let isMounted = true;
    if (effectiveGameSlug && effectiveMapSlug) {
      isMapOfflineReady(effectiveGameSlug, effectiveMapSlug).then(async (ready) => {
        if (!isMounted) return;
        setIsOfflineReady(ready);

        if (ready && mapData) {
          const updateResult = await checkOfflineMapUpdateAvailable(
            effectiveGameSlug,
            effectiveMapSlug,
            mapData
          );
          if (isMounted) {
            setHasOfflineUpdate(updateResult.hasUpdate);
            setUpdateReason(updateResult.reason || null);
          }
        } else {
          if (isMounted) {
            setHasOfflineUpdate(false);
            setUpdateReason(null);
          }
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [effectiveGameSlug, effectiveMapSlug, mapData]);

  // Normalization
  const categoriesById = useMemo(() => {
    const dict: Record<string, MapCategory> = {};
    if (Array.isArray(mapData?.categories)) {
      mapData.categories.forEach((c) => {
        dict[String(c.id)] = c;
      });
    }
    if (Array.isArray(mapData?.groups)) {
      mapData.groups.forEach((g) => {
        g.categories?.forEach((c) => {
          dict[String(c.id)] = c;
        });
      });
    }
    return dict;
  }, [mapData?.categories, mapData?.groups]);

  const { normalizedLocations, categoryCounts } = useMemo(() => {
    const locs: MapLocation[] = [];
    const counts: Record<string, number> = {};

    if (Array.isArray(mapData?.locations) && mapData.locations.length > 0) {
      locs.push(...mapData.locations);
    } else if (Array.isArray(mapData?.groups)) {
      mapData.groups.forEach((g) => {
        g.categories?.forEach((c) => {
          if (Array.isArray(c.locations)) locs.push(...c.locations);
        });
      });
    }

    const validLocs = locs.filter((l) => {
      const lat =
        typeof l.latitude === "string" ? parseFloat(l.latitude) : l.latitude;
      const lng =
        typeof l.longitude === "string" ? parseFloat(l.longitude) : l.longitude;
      if (isNaN(lat) || isNaN(lng)) return false;
      const cId = String(l.category_id);
      counts[cId] = (counts[cId] || 0) + 1;
      return true;
    });

    return { normalizedLocations: validLocs, categoryCounts: counts };
  }, [mapData?.locations, mapData?.groups]);

  // Helper to populate both string and number representations in Set for robust matching
  const populateIds = (ids: (string | number)[]) => {
    const next = new Set<string | number>();
    if (Array.isArray(ids)) {
      ids.forEach((id) => {
        next.add(id);
        next.add(String(id));
        const num = Number(id);
        if (!isNaN(num)) next.add(num);
      });
    }
    return next;
  };

  // Load Saved Found Progress from SQLite Database & Sync across windows
  useEffect(() => {
    let isCancelled = false;
    if (!effectiveGameSlug) return;

    // 1. Initial quick load from localStorage for instant display
    if (finalStorageKey) {
      try {
        const saved = localStorage.getItem(finalStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          setFoundIds(populateIds(parsed));
        }
      } catch {}
    }

    // 2. Authoritative load from SQLite database
    getMapFoundLocationIds(effectiveGameSlug, effectiveMapSlug).then((ids) => {
      if (!isCancelled && Array.isArray(ids)) {
        setFoundIds(populateIds(ids));
        if (finalStorageKey) {
          try {
            localStorage.setItem(finalStorageKey, JSON.stringify(ids));
          } catch {}
        }
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === finalStorageKey && e.newValue) {
        try {
          setFoundIds(populateIds(JSON.parse(e.newValue)));
        } catch {}
      }
      if (e.key === categoryStorageKey && e.newValue) {
        try {
          setCategoryState(JSON.parse(e.newValue));
        } catch {}
      }
      if (e.key === hideFoundStorageKey && e.newValue) {
        try {
          setHideFound(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      isCancelled = true;
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [
    effectiveGameSlug,
    effectiveMapSlug,
    finalStorageKey,
    categoryStorageKey,
    hideFoundStorageKey,
  ]);



  // Load Saved Category Visibility State or apply default rule (>100 markers if map > 1000)
  useEffect(() => {
    if (!categoryStorageKey && !effectiveGameSlug) return;
    try {
      const saved =
        (categoryStorageKey && localStorage.getItem(categoryStorageKey)) ||
        (effectiveGameSlug &&
          localStorage.getItem(`map_categories_${effectiveGameSlug}`));
      if (saved) {
        setCategoryState(JSON.parse(saved));
      } else if (normalizedLocations.length > 0) {
        const defaultState: Record<string, boolean> = {};
        if (normalizedLocations.length > 1000) {
          Object.entries(categoryCounts).forEach(([catId, count]) => {
            if (count > 100) {
              defaultState[catId] = false;
            }
          });
        }
        setCategoryState(defaultState);
      }
    } catch {}
  }, [
    categoryStorageKey,
    effectiveGameSlug,
    normalizedLocations.length,
    categoryCounts,
  ]);

  // Load Saved Hide Found Toggle
  useEffect(() => {
    if (!hideFoundStorageKey && !effectiveGameSlug) return;
    try {
      const saved =
        (hideFoundStorageKey && localStorage.getItem(hideFoundStorageKey)) ||
        (effectiveGameSlug &&
          localStorage.getItem(`map_hide_found_${effectiveGameSlug}`));
      if (saved !== null) setHideFound(JSON.parse(saved));
      else setHideFound(false);
    } catch {}
  }, [hideFoundStorageKey, effectiveGameSlug]);

  // Found counts per category
  const categoryFoundCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    normalizedLocations.forEach((l) => {
      if (foundIds.has(l.id) || foundIds.has(String(l.id))) {
        const cId = String(l.category_id);
        counts[cId] = (counts[cId] || 0) + 1;
      }
    });
    return counts;
  }, [normalizedLocations, foundIds]);

  const toggleLocationFound = useCallback(
    (locId: number | string) => {
      setFoundIds((prev) => {
        const next = new Set(prev);
        const strId = String(locId);
        const numId = Number(locId);
        const isCurrentlyFound =
          next.has(locId) ||
          next.has(strId) ||
          (!isNaN(numId) && next.has(numId));
        const isNowFound = !isCurrentlyFound;

        if (isNowFound) {
          next.add(locId);
          next.add(strId);
          if (!isNaN(numId)) next.add(numId);
        } else {
          next.delete(locId);
          next.delete(strId);
          if (!isNaN(numId)) next.delete(numId);
        }

        // 1. Save to SQLite database
        if (effectiveGameSlug) {
          toggleMapFoundLocation(
            effectiveGameSlug,
            effectiveMapSlug,
            locId,
            isNowFound,
          ).catch((err) => {
            console.warn("Failed to persist map found location to DB:", err);
          });
        }

        // 2. Sync to localStorage for fast cross-window synchronization
        if (finalStorageKey) {
          try {
            const canonicalIds = Array.from(next).map(String);
            const uniqueCanonical = Array.from(new Set(canonicalIds));
            localStorage.setItem(
              finalStorageKey,
              JSON.stringify(uniqueCanonical),
            );
          } catch {}
        }
        return next;
      });
    },
    [effectiveGameSlug, effectiveMapSlug, finalStorageKey],
  );

  const toggleHideFound = useCallback(() => {
    setHideFound((prev) => {
      const next = !prev;
      if (hideFoundStorageKey) {
        try {
          localStorage.setItem(hideFoundStorageKey, JSON.stringify(next));
        } catch {}
      }
      if (effectiveGameSlug) {
        try {
          localStorage.setItem(
            `map_hide_found_${effectiveGameSlug}`,
            JSON.stringify(next),
          );
        } catch {}
      }
      return next;
    });
  }, [hideFoundStorageKey, effectiveGameSlug]);

  const updateCategoryState = useCallback(
    (updater: React.SetStateAction<Record<string, boolean>>) => {
      setCategoryState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (categoryStorageKey) {
          try {
            localStorage.setItem(categoryStorageKey, JSON.stringify(next));
          } catch {}
        }
        if (effectiveGameSlug) {
          try {
            localStorage.setItem(
              `map_categories_${effectiveGameSlug}`,
              JSON.stringify(next),
            );
          } catch {}
        }
        return next;
      });
    },
    [categoryStorageKey, effectiveGameSlug],
  );

  const toggleCategory = useCallback(
    (categoryId: number | string) => {
      updateCategoryState((prev) => ({
        ...prev,
        [String(categoryId)]: prev[String(categoryId)] === false ? true : false,
      }));
    },
    [updateCategoryState],
  );

  const toggleGroupCategories = useCallback(
    (categories?: MapCategory[]) => {
      if (!categories || categories.length === 0) return;
      updateCategoryState((prev) => {
        const isAnyVisible = categories.some(
          (c) => prev[String(c.id)] !== false,
        );
        const nextTarget = !isAnyVisible;
        const next = { ...prev };
        categories.forEach((c) => {
          next[String(c.id)] = nextTarget;
        });
        return next;
      });
    },
    [updateCategoryState],
  );

  const showAllCategories = useCallback(() => {
    const allVisible: Record<string, boolean> = {};
    Object.keys(categoriesById).forEach((id) => {
      allVisible[id] = true;
    });
    if (Array.isArray(mapData?.groups)) {
      mapData.groups.forEach((g) => {
        g.categories?.forEach((c) => {
          allVisible[String(c.id)] = true;
        });
      });
    }
    normalizedLocations.forEach((l) => {
      if (l.category_id != null) allVisible[String(l.category_id)] = true;
    });
    updateCategoryState(allVisible);
  }, [
    categoriesById,
    mapData?.groups,
    normalizedLocations,
    updateCategoryState,
  ]);

  const hideAllCategories = useCallback(() => {
    const allHidden: Record<string, boolean> = {};
    Object.keys(categoriesById).forEach((id) => {
      allHidden[id] = false;
    });
    if (Array.isArray(mapData?.groups)) {
      mapData.groups.forEach((g) => {
        g.categories?.forEach((c) => {
          allHidden[String(c.id)] = false;
        });
      });
    }
    normalizedLocations.forEach((l) => {
      if (l.category_id != null) allHidden[String(l.category_id)] = false;
    });
    updateCategoryState(allHidden);
  }, [
    categoriesById,
    mapData?.groups,
    normalizedLocations,
    updateCategoryState,
  ]);

  const jumpToLocation = useCallback(
    (targetIdOrTitle: string | number) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const raw = String(targetIdOrTitle).trim();
      const rawLower = raw.toLowerCase();
      let decodedRaw = rawLower;
      try {
        decodedRaw = decodeURIComponent(raw).toLowerCase().trim();
      } catch {}

      // Find the location object
      let targetLoc = normalizedLocations.find(
        (l) =>
          String(l.id) === raw ||
          (l.title && l.title.toLowerCase().trim() === rawLower) ||
          (l.title && l.title.toLowerCase().trim() === decodedRaw) ||
          (l.title && l.title.toLowerCase().includes(decodedRaw)) ||
          (l.title && decodedRaw.includes(l.title.toLowerCase().trim())),
      );

      if (!targetLoc) {
        for (const item of allMarkersRef.current) {
          if (
            String(item.id) === raw ||
            (item.loc.title &&
              item.loc.title.toLowerCase().trim() === decodedRaw) ||
            (item.loc.title &&
              item.loc.title.toLowerCase().includes(decodedRaw))
          ) {
            targetLoc = item.loc;
            break;
          }
        }
      }

      if (!targetLoc) return;

      const lat =
        typeof targetLoc.latitude === "string"
          ? parseFloat(targetLoc.latitude)
          : targetLoc.latitude;
      const lng =
        typeof targetLoc.longitude === "string"
          ? parseFloat(targetLoc.longitude)
          : targetLoc.longitude;
      if (isNaN(lat) || isNaN(lng)) return;

      // Ensure category is visible
      const cId = String(targetLoc.category_id);
      updateCategoryState((prev) => {
        if (prev[cId] === false) {
          return { ...prev, [cId]: true };
        }
        return prev;
      });

      // Fly to marker location
      const currentZoom = map.getZoom();
      const targetZoom = Math.max(currentZoom, 13);
      map.flyTo([lat, lng], Math.min(targetZoom, map.getMaxZoom()), {
        animate: true,
        duration: 0.6,
      });

      // Open target popup
      setTimeout(() => {
        const marker =
          markersMapRef.current.get(targetLoc!.id) ||
          markersMapRef.current.get(String(targetLoc!.id)) ||
          (targetLoc!.title
            ? markersMapRef.current.get(targetLoc!.title.toLowerCase().trim())
            : undefined);

        if (marker) {
          if (
            markerGroupRef.current &&
            !markerGroupRef.current.hasLayer(marker)
          ) {
            markerGroupRef.current.addLayer(marker);
          }
          marker.openPopup();
        }
      }, 350);
    },
    [normalizedLocations, updateCategoryState],
  );

  const handleStartDownload = async () => {
    if (downloading || !mapData || !effectiveGameSlug || !effectiveMapSlug)
      return;
    setDownloading(true);
    abortRef.current = { aborted: false };
    setDownloadProgress({
      current: 0,
      total: 100,
      percentage: 0,
      status: "Preparing offline map...",
    });

    try {
      const ok = await downloadFullOfflineMap(
        effectiveGameSlug,
        effectiveMapSlug,
        mapData,
        (p) => setDownloadProgress(p),
        abortRef.current,
      );
      if (ok) {
        setIsOfflineReady(true);
        setHasOfflineUpdate(false);
        setUpdateReason(null);
        if (effectiveGameSlug) {
          const freshUrl = await getOfflineAssetUrl(`sprite_${effectiveGameSlug}`);
          if (freshUrl) {
            setOfflineSpriteUrl(freshUrl);
          }
        }
        iconCacheRef.current.clear();
      }
    } catch (err) {
      console.error("Offline download failed:", err);
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleCancelDownload = () => {
    abortRef.current.aborted = true;
    setDownloading(false);
    setDownloadProgress(null);
  };

  const handleDeleteOffline = async () => {
    if (!effectiveGameSlug || !effectiveMapSlug) return;
    await deleteOfflineMap(effectiveGameSlug, effectiveMapSlug);
    setIsOfflineReady(false);
    setOfflineSpriteUrl(null);
    iconCacheRef.current.clear();
  };

  const toggleFoundRef = useRef(toggleLocationFound);
  toggleFoundRef.current = toggleLocationFound;

  const jumpToLocRef = useRef(jumpToLocation);
  jumpToLocRef.current = jumpToLocation;

  const foundIdsRef = useRef(foundIds);
  foundIdsRef.current = foundIds;

  const getIcon = useCallback(
    (cId: string, isFound: boolean, L: typeof import("leaflet")): L.DivIcon => {
      const cacheKey = `${cId}_${isFound ? "found" : "normal"}`;
      const cached = iconCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const spriteMap = mapData?.mapConfig?.markerSpritePositions || {};
      const spriteImgUrl =
        offlineSpriteUrl ||
        mapData?.mapConfig?.markerImagesUrl ||
        (effectiveGameSlug
          ? `https://cdn.mapgenie.io/images/games/${effectiveGameSlug}/markers@2x.png`
          : "");
      const spriteWidth =
        detectedSpriteDimensions?.width ??
        (mapData?.mapConfig?.markerImagesWidth
          ? mapData.mapConfig.markerImagesWidth / 2
          : 132);
      const spriteHeight =
        detectedSpriteDimensions?.height ??
        (mapData?.mapConfig?.markerImagesHeight
          ? mapData.mapConfig.markerImagesHeight / 2
          : 220);

      const cat = categoriesById[cId];
      const rawIcon = cat?.icon || "";
      const rawTitle = cat?.title || "";

      const sprite =
        spriteMap[cId] ||
        (rawIcon
          ? spriteMap[rawIcon] ||
            spriteMap[rawIcon.toLowerCase()] ||
            spriteMap[rawIcon.replace(/-/g, "_")] ||
            spriteMap[rawIcon.replace(/_/g, "-")]
          : undefined) ||
        (rawTitle
          ? spriteMap[rawTitle.toLowerCase().trim()] ||
            spriteMap[rawTitle.toLowerCase().trim().replace(/\s+/g, "_")] ||
            spriteMap[rawTitle.toLowerCase().trim().replace(/\s+/g, "-")] ||
            spriteMap[
              rawTitle
                .toLowerCase()
                .trim()
                .replace(/['’]/g, "")
                .replace(/\s+/g, "_")
            ] ||
            spriteMap[
              rawTitle
                .toLowerCase()
                .trim()
                .replace(/['’]/g, "")
                .replace(/\s+/g, "-")
            ]
          : undefined);

      let icon: L.DivIcon;

      const liveSpriteUrl =
        mapData?.mapConfig?.markerImagesUrl ||
        (effectiveGameSlug
          ? `https://media.mapgenie.io/v2/assets/prod/games/${effectiveGameSlug}/markers@2x.png`
          : "");

      const effectiveSpriteUrl = isOfflineReady
        ? (offlineSpriteUrl || liveSpriteUrl)
        : (liveSpriteUrl || offlineSpriteUrl);

      if (sprite && effectiveSpriteUrl && spriteWidth && spriteHeight) {
        const pr = sprite.pixelRatio || 2;
        const posX = sprite.x / pr;
        const posY = sprite.y / pr;
        const iconW = (sprite.width || 66) / pr;
        const iconH = (sprite.height || 88) / pr;

        icon = L.divIcon({
          className: "custom-div-icon",
          html: `<div class="marker-icon ${isFound ? "is-found" : ""}" style="background-image: url('${effectiveSpriteUrl}'); background-position: -${posX}px -${posY}px; width: ${iconW}px; height: ${iconH}px; background-repeat: no-repeat; background-size: ${spriteWidth}px ${spriteHeight}px; cursor: pointer;"></div>`,
          iconSize: [iconW, iconH],
          iconAnchor: [iconW / 2, iconH],
          popupAnchor: [0, -(iconH - 2)],
        });
      } else {
        const iconDash = (rawIcon || "miscellaneous").replace(/_/g, "-");
        const iconUnder = (rawIcon || "miscellaneous").replace(/-/g, "_");
        const pinColor = cat?.color || cat?.icon_color || "#e03131";
        const iconW = 28;
        const iconH = 36;
        const fallbackInitial = (rawTitle || "?").charAt(0).toUpperCase();

        const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="${iconW}" height="${iconH}" style="display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));"><path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 14.2 24.8 14.8 25.4a1.7 1.7 0 0 0 2.4 0C17.8 40.8 32 26.5 32 16 32 7.163 24.837 0 16 0z" fill="${pinColor}"/><circle cx="16" cy="15" r="10" fill="#ffffff"/></svg>`;

        icon = L.divIcon({
          className: "custom-div-icon",
          html: `
            <div class="mg-marker-pin ${isFound ? "is-found" : ""}" style="position: relative; width: ${iconW}px; height: ${iconH}px; cursor: pointer;">
              ${pinSvg}
              <div style="position: absolute; top: 0; left: 0; width: ${iconW}px; height: 30px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                <span class="cat-icon icon-${iconDash} icon-${iconUnder}" style="font-size: 13px; color: ${pinColor}; line-height: 1;">${fallbackInitial}</span>
              </div>
            </div>
          `,
          iconSize: [iconW, iconH],
          iconAnchor: [iconW / 2, iconH],
          popupAnchor: [0, -(iconH - 2)],
        });
      }

      iconCacheRef.current.set(cacheKey, icon);
      return icon;
    },
    [
      mapData?.mapConfig,
      effectiveGameSlug,
      categoriesById,
      offlineSpriteUrl,
      detectedSpriteDimensions,
      isOfflineReady,
    ],
  );

  // Load Fonts & CSS
  useEffect(() => {
    let isCancelled = false;

    async function loadFontsAndStyles() {
      if (typeof window === "undefined") return;

      const loadFont = async (
        name: string,
        urls: string[],
        offlineKey?: string,
      ) => {
        if (offlineKey) {
          const offlineBlob = await getOfflineAsset(offlineKey);
          if (offlineBlob) {
            try {
              const font = new FontFace(name, await offlineBlob.arrayBuffer());
              const loaded = await font.load();
              document.fonts.add(loaded);
              return;
            } catch (_) {}
          }
        }
        for (const url of urls) {
          if (isCancelled || !url) continue;
          try {
            const font = new FontFace(name, `url("${url}")`);
            const loaded = await font.load();
            document.fonts.add(loaded);
            if (offlineKey) {
              fetchAndCacheOfflineAsset(offlineKey, url).catch(() => {});
            }
            break;
          } catch (_) {}
        }
      };

      // Check offline sprite, validating against remote markerImagesUrl
      if (effectiveGameSlug) {
        const remoteSpriteUrl =
          mapData?.mapConfig?.markerImagesUrl ||
          `https://media.mapgenie.io/v2/assets/prod/games/${effectiveGameSlug}/markers@2x.png`;

        getValidOfflineSpriteUrl(effectiveGameSlug, remoteSpriteUrl).then((url) => {
          if (!isCancelled) {
            setOfflineSpriteUrl(url || null);
            iconCacheRef.current.clear();
          }
        });
      }

      await Promise.all([
        loadFont(
          "icomoon",
          [
            mapData?.mapConfig?.icomoonUrl || "",
            effectiveGameSlug
              ? `https://cdn.mapgenie.io/fonts/${effectiveGameSlug}/icons/icomoon.woff`
              : "",
            effectiveGameSlug
              ? `https://cdn.mapgenie.io/fonts/${effectiveGameSlug}/icons/icomoon.ttf`
              : "",
            effectiveGameSlug
              ? `https://mapgenie.io/game-icons/${effectiveGameSlug}/icons.woff`
              : "",
          ].filter(Boolean),
          `font_icomoon_${effectiveGameSlug}`,
        ),
        loadFont(
          "mg-icons",
          [
            mapData?.mapConfig?.mgIconsUrl || "",
            effectiveGameSlug
              ? `https://cdn.mapgenie.io/fonts/${effectiveGameSlug}/icons/mg-icons.woff`
              : "",
            effectiveGameSlug
              ? `https://cdn.mapgenie.io/fonts/${effectiveGameSlug}/icons/icomoon.ttf`
              : "",
            effectiveGameSlug
              ? `https://mapgenie.io/game-icons/${effectiveGameSlug}/icons.ttf`
              : "",
          ].filter(Boolean),
          `font_mg_icons_${effectiveGameSlug}`,
        ),
      ]);

      const candidateCssUrls = [
        mapData?.mapConfig?.iconsCssUrl || "",
        ...(effectiveGameSlug
          ? [
              `https://cdn.mapgenie.io/css/themes/icons/${effectiveGameSlug}-icons.css`,
              `https://cdn.mapgenie.io/css/themes/games/${effectiveGameSlug}.css`,
              `https://cdn.mapgenie.io/css/themes/${effectiveGameSlug}.css`,
              `https://cdn.mapgenie.io/css/themes/icons/${effectiveGameSlug}.css`,
              `https://mapgenie.io/game-icons/${effectiveGameSlug}/icons.css`,
              `https://media.mapgenie.io/v2/assets/prod/games/${effectiveGameSlug}/theme/theme.css`,
              `https://media.mapgenie.io/v2/assets/prod/games/${effectiveGameSlug}/theme/v3/theme.css`,
            ]
          : []),
      ].filter(Boolean);

      let cssText =
        (await getOfflineAssetText(`css_theme_${effectiveGameSlug}`)) || "";
      if (!cssText) {
        for (const url of candidateCssUrls) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const text = await res.text();
              if (text && text.trim().length > 0) {
                cssText = text;
                if (effectiveGameSlug) {
                  saveOfflineAsset(
                    `css_theme_${effectiveGameSlug}`,
                    cssText,
                  ).catch(() => {});
                }
                break;
              }
            }
          } catch (_) {}
        }
      }

      if (isCancelled) return;

      let iconRules = "";
      if (cssText) {
        iconRules += `\n${cssText}\n`;
        const pathRegex =
          /\.icon-([a-zA-Z0-9_\-]+)\s+([.a-zA-Z0-9_\-]+:before)\s*\{([^}]+)\}/g;
        let pathMatch;
        while ((pathMatch = pathRegex.exec(cssText)) !== null) {
          const rawName = pathMatch[1];
          const subSelector = pathMatch[2];
          const body = pathMatch[3];
          const dashed = rawName.replace(/_/g, "-");
          const underscored = rawName.replace(/-/g, "_");
          if (dashed !== rawName) {
            iconRules += `\n.icon-${dashed} ${subSelector} { ${body} }`;
          }
          if (underscored !== rawName) {
            iconRules += `\n.icon-${underscored} ${subSelector} { ${body} }`;
          }
        }

        const iconRegex = /\.icon-([a-zA-Z0-9_\-]+):before\s*\{([^}]+)\}/g;
        let match;
        while ((match = iconRegex.exec(cssText)) !== null) {
          const rawName = match[1];
          const body = match[2];
          const dashed = rawName.replace(/_/g, "-");
          const underscored = rawName.replace(/-/g, "_");
          if (dashed !== rawName) {
            iconRules += `\n.icon-${dashed}:before { ${body} }`;
          }
          if (underscored !== rawName) {
            iconRules += `\n.icon-${underscored}:before { ${body} }`;
          }
        }
      }

      const fontOverrides = `
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap');
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        .icon, .cat-icon, [class^="icon-"], [class*=" icon-"] {
          font-family: 'icomoon', 'mg-icons' !important;
          speak: never;
          font-style: normal;
          font-weight: normal;
          font-variant: normal;
          text-transform: none;
          line-height: 1;
          display: inline-block;
          text-align: center;
          position: relative;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .icon [class^="path"], .icon [class*=" path"],
        [class^="icon-"] [class^="path"], [class^="icon-"] [class*=" path"],
        [class*=" icon-"] [class^="path"], [class*=" icon-"] [class*=" path"] {
          font-family: 'icomoon', 'mg-icons' !important;
          speak: never;
          font-style: normal;
          font-weight: normal;
          font-variant: normal;
          text-transform: none;
          line-height: 1;
          display: inline-block;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        .icon [class*="path2"]:before, [class^="icon-"] [class*="path2"]:before, [class*=" icon-"] [class*="path2"]:before,
        .icon [class*="path3"]:before, [class^="icon-"] [class*="path3"]:before, [class*=" icon-"] [class*="path3"]:before,
        .icon [class*="path4"]:before, [class^="icon-"] [class*="path4"]:before, [class*=" icon-"] [class*="path4"]:before,
        .icon [class*="path5"]:before, [class^="icon-"] [class*="path5"]:before, [class*=" icon-"] [class*="path5"]:before,
        .icon [class*="path6"]:before, [class^="icon-"] [class*="path6"]:before, [class*=" icon-"] [class*="path6"]:before,
        .icon [class*="path7"]:before, [class^="icon-"] [class*="path7"]:before, [class*=" icon-"] [class*="path7"]:before,
        .icon [class*="path8"]:before, [class^="icon-"] [class*="path8"]:before, [class*=" icon-"] [class*="path8"]:before {
          margin-left: -1em;
        }
        .marker-icon {
          transition: transform 0.12s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease;
          will-change: transform;
        }
        .marker-icon:hover {
          transform: scale(1.22) translateY(-3px);
          z-index: 9999 !important;
        }
        .marker-icon.is-found {
          opacity: 0.55;
          filter: grayscale(0.6);
        }
        .mg-marker-pin {
          transition: transform 0.12s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease;
          will-change: transform;
        }
        .mg-marker-pin:hover {
          transform: scale(1.28) translateY(-4px);
          z-index: 9999 !important;
        }
        .loc-ref-btn {
          display: inline-flex;
          align-items: center;
          padding: 2px 7px;
          margin: 2px 2px;
          font-size: 11.5px;
          font-weight: 700;
          color: #93c5fd;
          background: rgba(37, 99, 235, 0.25);
          border: 1px solid rgba(96, 165, 250, 0.5);
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .loc-ref-btn:hover {
          background: rgba(37, 99, 235, 0.55);
          color: #ffffff;
          border-color: #93c5fd;
          transform: translateY(-1px);
        }
        .loc-ref-btn.is-gamepad-selected {
          background: #2563eb !important;
          color: #ffffff !important;
          border-color: #93c5fd !important;
          box-shadow: 0 0 0 2px rgba(147, 197, 253, 0.85), 0 0 12px rgba(37, 99, 235, 0.8) !important;
          transform: scale(1.08) translateY(-1px) !important;
          outline: none !important;
        }
        .leaflet-container {
          background: #000000 !important;
          background-color: #000000 !important;
          user-select: none;
          -webkit-user-select: none;
          cursor: grab;
        }
        .leaflet-container:active {
          cursor: grabbing;
        }
        .leaflet-tile-container img, .leaflet-tile {
          -webkit-user-drag: none;
          user-drag: none;
          user-select: none;
          pointer-events: none;
        }
        .leaflet-control-zoom {
          border: 1px solid #262b36 !important;
          border-radius: 8px !important;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6) !important;
        }
        .leaflet-control-zoom a {
          background-color: rgba(12, 14, 18, 0.95) !important;
          color: #fff !important;
          border-color: #262b36 !important;
        }
        .leaflet-control-zoom a:hover {
          background-color: #1e2433 !important;
          color: #fff !important;
        }
        .leaflet-pane.leaflet-popup-pane {
          z-index: 1500 !important;
        }
        .leaflet-popup {
          z-index: 1500 !important;
        }
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: #0f121a !important;
          color: #ffffff !important;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.9), 0 0 0 1px #222938 !important;
          border-radius: 8px !important;
        }
        .leaflet-popup-content {
          margin: 12px 14px !important;
          line-height: 1.4 !important;
        }
        .leaflet-container a.leaflet-popup-close-button {
          color: #718096 !important;
          padding: 8px 10px 0 0 !important;
          font-size: 16px !important;
          font-weight: 700 !important;
        }
        .leaflet-container a.leaflet-popup-close-button:hover {
          color: #ffffff !important;
        }
        .popup-media-container {
          transition: transform 0.15s ease, outline 0.15s ease, box-shadow 0.15s ease;
        }
        .popup-media-container.is-gamepad-selected {
          outline: 2px solid #38bdf8 !important;
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.75), inset 0 0 8px rgba(56, 189, 248, 0.3) !important;
          border-color: #38bdf8 !important;
          transform: scale(1.02);
        }
        .popup-media-container.is-gamepad-selected::after {
          content: "X  ENLARGE";
          position: absolute;
          bottom: 6px;
          right: 6px;
          background: rgba(14, 165, 233, 0.95);
          color: #ffffff;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.5px;
          padding: 3px 8px;
          border-radius: 4px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.5);
          pointer-events: none;
        }
        .loc-ref-btn.is-gamepad-selected {
          outline: 2px solid #38bdf8 !important;
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.6) !important;
          border-color: #38bdf8 !important;
        }
      `;

      const styleId = "fitrepacks-map-icons-style";
      let styleTag = document.getElementById(
        styleId,
      ) as HTMLStyleElement | null;
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML =
        (cssText || "") + "\n" + fontOverrides + "\n" + iconRules;
    }

    loadFontsAndStyles();
    return () => {
      isCancelled = true;
    };
  }, [mapData?.mapConfig, effectiveGameSlug]);

  // Dynamically detect natural dimensions of the sprite image to prevent squished/sliced icons
  useEffect(() => {
    const activeSpriteUrl =
      offlineSpriteUrl ||
      mapData?.mapConfig?.markerImagesUrl ||
      (effectiveGameSlug
        ? `https://cdn.mapgenie.io/images/games/${effectiveGameSlug}/markers@2x.png`
        : "");

    if (!activeSpriteUrl) {
      setDetectedSpriteDimensions(null);
      return;
    }

    let isCancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!isCancelled && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const expectedWidth = mapData?.mapConfig?.markerImagesWidth;
        const expectedHeight = mapData?.mapConfig?.markerImagesHeight;

        // Auto-detect if cached offline sprite sheet is stale (e.g. MapGenie revision or expanded columns)
        const targetMarkerUrl = mapData?.mapConfig?.markerImagesUrl;
        if (targetMarkerUrl && effectiveGameSlug) {
          getOfflineAssetText(`sprite_url_${effectiveGameSlug}`).then((cachedUrl) => {
            const urlChanged = cachedUrl && cachedUrl.trim() !== targetMarkerUrl.trim();
            const dimChanged =
              expectedWidth &&
              expectedHeight &&
              (img.naturalWidth !== expectedWidth || img.naturalHeight !== expectedHeight);

            if ((urlChanged || dimChanged) && !isCancelled) {
              fetchAndCacheOfflineAsset(
                `sprite_${effectiveGameSlug}`,
                targetMarkerUrl,
                true,
              )
                .then(async () => {
                  const freshUrl = await getOfflineAssetUrl(`sprite_${effectiveGameSlug}`);
                  if (freshUrl && !isCancelled) {
                    setOfflineSpriteUrl(freshUrl);
                    iconCacheRef.current.clear();
                  }
                })
                .catch(() => {});
            }
          }).catch(() => {});
        }

        // MapGenie sprite coordinates are configured for 2x retina sheets
        setDetectedSpriteDimensions({
          width: img.naturalWidth / 2,
          height: img.naturalHeight / 2,
        });
        iconCacheRef.current.clear();
      }
    };
    img.onerror = () => {
      if (!isCancelled) {
        setDetectedSpriteDimensions(null);
      }
    };
    img.src = activeSpriteUrl;

    return () => {
      isCancelled = true;
    };
  }, [
    offlineSpriteUrl,
    mapData?.mapConfig?.markerImagesUrl,
    effectiveGameSlug,
  ]);

  // Leaflet Map Initialization
  useEffect(() => {
    let isCancelled = false;

    const onWindowRelease = (e?: any) => {
      if (mapInstanceRef.current?.dragging?.enabled()) {
        const draggable = (mapInstanceRef.current.dragging as any)?._draggable;
        if (draggable) {
          draggable._moving = false;
          draggable._moved = false;
          try {
            draggable._onUp?.(e);
          } catch (_) {}
        }
      }
    };

    const onPointerMoveCheck = (e: PointerEvent) => {
      if (e.buttons === 0 && mapInstanceRef.current?.dragging?.enabled()) {
        const draggable = (mapInstanceRef.current.dragging as any)?._draggable;
        if (draggable && (draggable._moving || draggable._moved)) {
          draggable._moving = false;
          draggable._moved = false;
          try {
            draggable._onUp?.(e);
          } catch (_) {}
        }
      }
    };

    window.addEventListener("mouseup", onWindowRelease, {
      passive: true,
      capture: true,
    });
    window.addEventListener("pointerup", onWindowRelease, {
      passive: true,
      capture: true,
    });
    window.addEventListener("touchend", onWindowRelease, {
      passive: true,
      capture: true,
    });
    window.addEventListener("pointermove", onPointerMoveCheck, {
      passive: true,
      capture: true,
    });

    let resizeObserver: ResizeObserver | null = null;

    async function initMap() {
      if (
        typeof window === "undefined" ||
        !mapContainerRef.current ||
        mapInstanceRef.current
      )
        return;

      const leaflet = await import("leaflet");
      const L = ((leaflet as any).default ||
        leaflet) as typeof import("leaflet");
      if (isCancelled || !mapContainerRef.current) return;
      leafletModuleRef.current = L;

      const tileSets =
        (mapData as any)?.tile_sets ||
        mapData?.map?.tile_sets ||
        mapData?.mapConfig?.tile_sets ||
        (mapData?.map?.config as any)?.tile_sets ||
        (mapData?.map as any)?.config?.tile_sets ||
        [];
      const primaryTileSet = (Array.isArray(tileSets) && tileSets[0]) || {};

      const minZoom =
        customMinZoom ??
        primaryTileSet.min_zoom ??
        mapData?.mapConfig?.min_zoom ??
        (mapData?.map?.config as any)?.min_zoom ??
        (mapData?.map as any)?.min_zoom ??
        (mapData?.map as any)?.config?.min_zoom ??
        0;
      const maxNativeZoom =
        customMaxZoom ??
        primaryTileSet.tiles_max_zoom ??
        primaryTileSet.max_zoom ??
        (mapData?.mapConfig as any)?.tiles_max_zoom ??
        mapData?.mapConfig?.max_zoom ??
        (mapData?.map?.config as any)?.tiles_max_zoom ??
        (mapData?.map?.config as any)?.max_zoom ??
        (mapData?.map as any)?.tiles_max_zoom ??
        (mapData?.map as any)?.max_zoom ??
        16;
      const maxZoom = maxNativeZoom + 3;

      let startLat =
        mapData?.mapConfig?.start_lat ??
        (mapData?.map?.config as any)?.start_lat ??
        mapData?.map?.start_lat ??
        (mapData?.map as any)?.initial_latitude ??
        (mapData?.map as any)?.config?.start_lat;
      let startLng =
        mapData?.mapConfig?.start_lng ??
        (mapData?.map?.config as any)?.start_lng ??
        mapData?.map?.start_lng ??
        (mapData?.map as any)?.initial_longitude ??
        (mapData?.map as any)?.config?.start_lng;

      if (
        (startLat == null || startLat === 0) &&
        normalizedLocations.length > 0
      ) {
        let sumLat = 0;
        let sumLng = 0;
        let validCount = 0;
        for (const loc of normalizedLocations) {
          const lLat =
            typeof loc.latitude === "string"
              ? parseFloat(loc.latitude)
              : loc.latitude;
          const lLng =
            typeof loc.longitude === "string"
              ? parseFloat(loc.longitude)
              : loc.longitude;
          if (!isNaN(lLat) && !isNaN(lLng) && (lLat !== 0 || lLng !== 0)) {
            sumLat += lLat;
            sumLng += lLng;
            validCount++;
          }
        }
        if (validCount > 0) {
          startLat = sumLat / validCount;
          startLng = sumLng / validCount;
        } else {
          startLat = Number(normalizedLocations[0].latitude) || 0;
          startLng = Number(normalizedLocations[0].longitude) || 0;
        }
      }
      if (startLat == null) startLat = 0;
      if (startLng == null) startLng = 0;

      const initialZoom = Math.max(
        minZoom,
        Math.min(
          maxZoom,
          mapData?.mapConfig?.initial_zoom ??
            (mapData?.map?.config as any)?.initial_zoom ??
            (mapData?.map as any)?.initial_zoom ??
            (mapData?.map as any)?.config?.initial_zoom ??
            Math.round((minZoom + maxNativeZoom) / 2),
        ),
      );

      let activeStartLat = startLat;
      let activeStartLng = startLng;
      let activeZoom = initialZoom;

      if (effectiveGameSlug && typeof window !== "undefined") {
        try {
          const savedViewStr = localStorage.getItem(
            `map_view_${effectiveGameSlug}_${effectiveMapSlug}`,
          );
          if (savedViewStr) {
            const savedView = JSON.parse(savedViewStr);
            if (
              typeof savedView.lat === "number" &&
              typeof savedView.lng === "number"
            ) {
              activeStartLat = savedView.lat;
              activeStartLng = savedView.lng;
            }
            if (typeof savedView.zoom === "number") {
              activeZoom = Math.max(
                minZoom,
                Math.min(maxZoom + 4, savedView.zoom),
              );
            }
          }
        } catch (_) {}
      }

      // Calculate location-based content bounds with 35% padding to allow reticle to center border markers while enforcing strict boundaries
      let initialAllowedBounds: L.LatLngBounds | null = null;
      let locMinLat = Infinity,
        locMaxLat = -Infinity,
        locMinLng = Infinity,
        locMaxLng = -Infinity;
      let validLocCount = 0;
      for (const loc of normalizedLocations) {
        const lLat =
          typeof loc.latitude === "string"
            ? parseFloat(loc.latitude)
            : loc.latitude;
        const lLng =
          typeof loc.longitude === "string"
            ? parseFloat(loc.longitude)
            : loc.longitude;
        if (!isNaN(lLat) && !isNaN(lLng) && (lLat !== 0 || lLng !== 0)) {
          locMinLat = Math.min(locMinLat, lLat);
          locMaxLat = Math.max(locMaxLat, lLat);
          locMinLng = Math.min(locMinLng, lLng);
          locMaxLng = Math.max(locMaxLng, lLng);
          validLocCount++;
        }
      }

      if (validLocCount > 0 && locMinLat < locMaxLat && locMinLng < locMaxLng) {
        initialAllowedBounds = L.latLngBounds(
          [locMinLat, locMinLng],
          [locMaxLat, locMaxLng],
        ).pad(0.35);
      }

      if (!initialAllowedBounds) {
        initialAllowedBounds = L.latLngBounds([
          [-80, -170],
          [80, 170],
        ]);
      }

      const allowedCenterBounds = initialAllowedBounds;

      if (
        allowedCenterBounds.isValid() &&
        !allowedCenterBounds.contains([activeStartLat, activeStartLng])
      ) {
        const center = allowedCenterBounds.getCenter();
        activeStartLat = center.lat;
        activeStartLng = center.lng;
      }

      const map = L.map(mapContainerRef.current, {
        minZoom,
        maxZoom: maxZoom + 4,
        zoomSnap: 0,
        zoomDelta: 0.25,
        wheelPxPerZoomLevel: 60,
        attributionControl: false,
        zoomControl: false,
        preferCanvas: true,
        inertia: true,
        inertiaDeceleration: 3000,
      }).setView([activeStartLat, activeStartLng], activeZoom);

      (map as any)._allowedCenterBounds = allowedCenterBounds;

      // Real-time boundary clamping during active mouse drag
      map.on("drag", () => {
        const allowed = (map as any)._allowedCenterBounds as
          | L.LatLngBounds
          | undefined;
        if (allowed && typeof allowed.contains === "function") {
          const center = map.getCenter();
          if (!allowed.contains(center)) {
            const clampedLat = Math.max(
              allowed.getSouth(),
              Math.min(allowed.getNorth(), center.lat),
            );
            const clampedLng = Math.max(
              allowed.getWest(),
              Math.min(allowed.getEast(), center.lng),
            );
            map.setView([clampedLat, clampedLng], map.getZoom(), {
              animate: false,
            });
          }
        }
      });

      // Ensure center bounces back inside bounds on drag release
      map.on("dragend", () => {
        const allowed = (map as any)._allowedCenterBounds as
          | L.LatLngBounds
          | undefined;
        if (allowed && typeof allowed.contains === "function") {
          const center = map.getCenter();
          if (!allowed.contains(center)) {
            map.panInsideBounds(allowed, { animate: true });
          }
        }
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      const DatabaseTileLayer = L.TileLayer.extend({
        createTile: function (coords: any, done: any) {
          const tile = document.createElement("img");
          tile.alt = "";
          tile.setAttribute("role", "presentation");
          tile.draggable = false;

          const rawCandidates: string[] = [];

          // 1. Explicit tilePattern from mapConfig (Top priority - authoritative)
          if (mapData?.mapConfig?.tilePattern) {
            rawCandidates.push(
              mapData.mapConfig.tilePattern
                .replace(/\{z\}/g, String(coords.z))
                .replace(/\{y\}/g, String(coords.y))
                .replace(/\{x\}/g, String(coords.x)),
            );
            rawCandidates.push(
              mapData.mapConfig.tilePattern
                .replace(/\{z\}/g, String(coords.z))
                .replace(/\{y\}/g, String(coords.x))
                .replace(/\{x\}/g, String(coords.y)),
            );
          }

          // 2. Explicit pattern from primaryTileSet
          if (primaryTileSet.pattern) {
            const pat = primaryTileSet.pattern.startsWith("http")
              ? primaryTileSet.pattern
              : `https://tiles.mapgenie.io/games/${primaryTileSet.pattern}`;
            rawCandidates.push(
              pat
                .replace(/\{z\}/g, String(coords.z))
                .replace(/\{y\}/g, String(coords.y))
                .replace(/\{x\}/g, String(coords.x)),
            );
            rawCandidates.push(
              pat
                .replace(/\{z\}/g, String(coords.z))
                .replace(/\{y\}/g, String(coords.x))
                .replace(/\{x\}/g, String(coords.y)),
            );
          }

          // 3. Dynamic discovered pattern (only used as fallback when no explicit pattern was configured)
          if (discoveredWorkingPatternRef.current) {
            rawCandidates.push(
              discoveredWorkingPatternRef.current
                .replace(/\{z\}/g, String(coords.z))
                .replace(/\{y\}/g, String(coords.y))
                .replace(/\{x\}/g, String(coords.x)),
            );
          }

          // 4. Primary tile set path (defaults to standard {z}/{x}/{y}, followed by {z}/{y}/{x})
          if (primaryTileSet.path) {
            const ext = primaryTileSet.extension || "jpg";
            rawCandidates.push(
              `https://tiles.mapgenie.io/games/${primaryTileSet.path}/${coords.z}/${coords.x}/${coords.y}.${ext}`,
              `https://tiles.mapgenie.io/games/${primaryTileSet.path}/${coords.z}/${coords.y}/${coords.x}.${ext}`,
            );
          }

          // 5. Versioned fallbacks for effectiveGameSlug / effectiveMapSlug
          const slugsToTry = Array.from(
            new Set(
              [
                effectiveGameSlug,
                gameSlug
                  ? gameSlug.includes("--")
                    ? gameSlug.split("--")[0]
                    : gameSlug
                  : "",
              ].filter(Boolean),
            ),
          );

          if (effectiveMapSlug) {
            const versions = [
              "default-v5",
              "default-v4",
              "default-v3",
              "default-v2",
              "default-v1",
              "default",
            ];
            for (const s of slugsToTry) {
              for (const v of versions) {
                rawCandidates.push(
                  `https://tiles.mapgenie.io/games/${s}/${effectiveMapSlug}/${v}/${coords.z}/${coords.x}/${coords.y}.jpg`,
                  `https://tiles.mapgenie.io/games/${s}/${effectiveMapSlug}/${v}/${coords.z}/${coords.y}/${coords.x}.jpg`,
                );
              }
            }
          }

          // Deduplicate candidate URLs
          const candidateUrls = Array.from(
            new Set(rawCandidates.filter(Boolean)),
          );

          let candidateIdx = 0;
          const tryNextUrl = () => {
            if (candidateIdx < candidateUrls.length) {
              const nextUrl = candidateUrls[candidateIdx++];
              tile.src = nextUrl;
              // On-the-fly caching: download blob and save to IndexedDB so it's permanently ready offline
              fetchAssetBlob(nextUrl)
                .then((blob) => {
                  if (blob && blob.size > 0) {
                    saveOfflineAsset(offlineKey, blob).catch(() => {});
                  }
                })
                .catch(() => {});
            } else {
              tile.src = TRANSPARENT_TILE;
              done(null, tile);
            }
          };

          const handleTileLoad = () => {
            if (
              tile.src &&
              tile.src.startsWith("http") &&
              !mapData?.mapConfig?.tilePattern &&
              !primaryTileSet.pattern &&
              coords.x !== coords.y
            ) {
              const url = tile.src;
              const xyRegex = new RegExp(
                `/${coords.z}/${coords.x}/${coords.y}\\b`,
              );
              const yxRegex = new RegExp(
                `/${coords.z}/${coords.y}/${coords.x}\\b`,
              );
              if (xyRegex.test(url)) {
                discoveredWorkingPatternRef.current = url.replace(
                  xyRegex,
                  `/{z}/{x}/{y}`,
                );
              } else if (yxRegex.test(url)) {
                discoveredWorkingPatternRef.current = url.replace(
                  yxRegex,
                  `/{z}/{y}/{x}`,
                );
              }
            }
            if (tile.src.startsWith("blob:")) {
              const blobUrl = tile.src;
              setTimeout(() => {
                try {
                  URL.revokeObjectURL(blobUrl);
                } catch (_) {}
              }, 1500);
            }
            L.Util.bind(this._tileOnLoad, this, done, tile)();
          };

          L.DomEvent.on(tile, "load", handleTileLoad);
          L.DomEvent.on(tile, "error", tryNextUrl);

          const offlineKey = `tile_v3_${effectiveGameSlug}_${effectiveMapSlug}_${coords.z}_${coords.x}_${coords.y}`;
          getOfflineAssetUrl(offlineKey)
            .then((url) => {
              if (url && !isCancelled) {
                tile.src = url;
              } else {
                tryNextUrl();
              }
            })
            .catch(() => {
              tryNextUrl();
            });

          return tile;
        },
        _removeTile: function (key: string) {
          const tile = (this as any)._tiles?.[key]?.el;
          if (tile && tile.src && tile.src.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(tile.src);
            } catch (_) {}
          }
          return (L.GridLayer.prototype as any)._removeTile.call(this, key);
        },
      });

      new (DatabaseTileLayer as any)("", {
        minZoom,
        maxZoom: maxZoom + 4,
        minNativeZoom: minZoom,
        maxNativeZoom,
        tileSize: 256,
        noWrap: true,
        keepBuffer: 12,
        updateWhenIdle: false,
        updateWhenZooming: true,
        updateInterval: 25,
      }).addTo(map);

      markerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      setMapReady((v) => v + 1);

      // Save map position & zoom on move/zoom with debounce
      let saveViewTimer: any = null;
      map.on("moveend zoomend", () => {
        if (!effectiveGameSlug || typeof window === "undefined") return;
        clearTimeout(saveViewTimer);
        saveViewTimer = setTimeout(() => {
          try {
            const center = map.getCenter();
            const z = map.getZoom();
            localStorage.setItem(
              `map_view_${effectiveGameSlug}_${effectiveMapSlug}`,
              JSON.stringify({ lat: center.lat, lng: center.lng, zoom: z }),
            );
          } catch (_) {}
        }, 400);
      });

      map.on("popupopen popupclose", () => {
        if (map.dragging) {
          const draggable = (map.dragging as any)._draggable;
          if (draggable) {
            draggable._moving = false;
            draggable._moved = false;
          }
        }
      });

      if (typeof ResizeObserver !== "undefined" && mapContainerRef.current) {
        resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            if (
              entry.contentRect.width > 0 &&
              entry.contentRect.height > 0 &&
              mapInstanceRef.current
            ) {
              mapInstanceRef.current.invalidateSize({ pan: false });
            }
          }
        });
        resizeObserver.observe(mapContainerRef.current);
      }

      [50, 150, 300, 500, 800].forEach((delay) => {
        setTimeout(() => {
          if (!isCancelled && mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize({ pan: false });
          }
        }, delay);
      });
    }

    initMap();

    return () => {
      isCancelled = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      window.removeEventListener("mouseup", onWindowRelease, true);
      window.removeEventListener("pointerup", onWindowRelease, true);
      window.removeEventListener("touchend", onWindowRelease, true);
      window.removeEventListener("pointermove", onPointerMoveCheck, true);

      if (markerGroupRef.current) {
        markerGroupRef.current.clearLayers();
        markerGroupRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      setMapReady(0);
    };
  }, [mapData?.mapConfig, effectiveGameSlug, effectiveMapSlug]);

  // 1. Build all markers once when map and data are ready
  useEffect(() => {
    const L = leafletModuleRef.current;
    if (!mapReady || !L) return;

    iconCacheRef.current.clear();
    markersMapRef.current.clear();
    const created: typeof allMarkersRef.current = [];

    // Dynamically calculate and update content boundaries based on all loaded locations
    let locMinLat = Infinity,
      locMaxLat = -Infinity,
      locMinLng = Infinity,
      locMaxLng = -Infinity;
    let validLocCount = 0;

    normalizedLocations.forEach((loc) => {
      const lat =
        typeof loc.latitude === "string"
          ? parseFloat(loc.latitude)
          : loc.latitude;
      const lng =
        typeof loc.longitude === "string"
          ? parseFloat(loc.longitude)
          : loc.longitude;
      if (isNaN(lat) || isNaN(lng)) return;

      if (lat !== 0 || lng !== 0) {
        locMinLat = Math.min(locMinLat, lat);
        locMaxLat = Math.max(locMaxLat, lat);
        locMinLng = Math.min(locMinLng, lng);
        locMaxLng = Math.max(locMaxLng, lng);
        validLocCount++;
      }

      const cId = String(loc.category_id);
      const isFound = foundIdsRef.current.has(loc.id);
      const icon = getIcon(cId, isFound, L);

      const marker = L.marker([lat, lng], { icon, riseOnHover: true });
      markersMapRef.current.set(loc.id, marker);
      markersMapRef.current.set(String(loc.id), marker);
      if (loc.title) {
        markersMapRef.current.set(loc.title.toLowerCase().trim(), marker);
      }

      marker.on("contextmenu", (e) => {
        if (e.originalEvent) {
          L.DomEvent.preventDefault(e.originalEvent);
          L.DomEvent.stopPropagation(e.originalEvent);
        }
        toggleFoundRef.current(loc.id);
      });

      marker.on("click", () => {
        const map = mapInstanceRef.current;
        if (map?.dragging) {
          const draggable = (map.dragging as any)._draggable;
          if (draggable) {
            draggable._moving = false;
            draggable._moved = false;
          }
        }
      });

      marker.bindPopup(
        () => {
          const container = document.createElement("div");
          L.DomEvent.disableClickPropagation(container);
          L.DomEvent.disableScrollPropagation(container);
          container.style.cssText =
            "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 210px; max-width: 290px; color: #ffffff;";

          const cat = categoriesById[cId];
          const categoryTitle = cat?.title || "Location";
          const catColor = cat?.color || "#3b82f6";
          const formattedDesc = formatDescription(loc.description);
          const currentIsFound = foundIdsRef.current.has(loc.id);

          let mediaHtml = "";
          if (loc.media && loc.media.length > 0) {
            const firstMedia = loc.media[0];
            const imgUrl =
              firstMedia.url ||
              (firstMedia.file_name
                ? `https://media.mapgenie.io/storage/media/${firstMedia.file_name}`
                : "");
            if (imgUrl) {
              mediaHtml = `
                <div class="popup-media-container" style="position: relative; margin-bottom: 8px; border-radius: 6px; overflow: hidden; max-height: 130px; background: #06080c; border: 1px solid #232a3b; cursor: pointer;">
                  <img class="popup-media-img" data-img-url="${imgUrl}" src="${imgUrl}" alt="${firstMedia.title || "Preview"}" style="width: 100%; height: 100%; object-fit: cover; display: block;"/>
                </div>
              `;
            }
          }

          container.innerHTML = `
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                <span style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: ${catColor}; letter-spacing: 0.8px; font-family: 'Oswald', sans-serif;">
                  ${categoryTitle}
                </span>
                <span style="font-size: 10px; color: #64748b; font-weight: 700;">#${loc.id}</span>
              </div>
              <div style="font-size: 15px; font-weight: 700; color: #ffffff; line-height: 1.25; margin-bottom: 8px; font-family: 'Oswald', sans-serif; letter-spacing: 0.3px;">
                ${loc.title || "Location"}
              </div>
              ${mediaHtml}
              ${loc.description ? `<div class="popup-desc-container" style="font-size: 12px; color: #cbd5e1; line-height: 1.45; background: #161a24; border: 1px solid #232a3b; border-radius: 6px; padding: 8px 10px; max-height: 140px; overflow-y: auto;">${formattedDesc}</div>` : ""}
              <div style="margin-top: 10px;">
                <button class="toggle-found-btn" style="width: 100%; padding: 6px 12px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; border-radius: 4px; border: 1px solid ${currentIsFound ? "#e03131" : "#242c3d"}; cursor: pointer; background: ${currentIsFound ? "#e03131" : "#171c26"}; color: #ffffff; transition: all 0.15s ease;">
                  ${currentIsFound ? "MARKED AS FOUND" : "FOUND"}
                </button>
              </div>
            </div>
          `;

          const mediaImgEl = container.querySelector(
            ".popup-media-img",
          ) as HTMLImageElement | null;
          if (mediaImgEl) {
            const rawUrl = mediaImgEl.getAttribute("data-img-url");
            if (rawUrl) {
              getOfflineAsset(`media_${encodeURIComponent(rawUrl)}`).then(
                (blob) => {
                  if (blob) {
                    mediaImgEl.src = URL.createObjectURL(blob);
                  }
                },
              );
            }
          }

          const btn = container.querySelector(".toggle-found-btn");
          if (btn) {
            btn.addEventListener("click", () => {
              toggleFoundRef.current(loc.id);
              const nextFound = !foundIdsRef.current.has(loc.id);
              (btn as HTMLButtonElement).style.background = nextFound
                ? "#e03131"
                : "#171c26";
              (btn as HTMLButtonElement).style.borderColor = nextFound
                ? "#e03131"
                : "#242c3d";
              (btn as HTMLButtonElement).innerText = nextFound
                ? "MARKED AS FOUND"
                : "FOUND";
            });
          }

          const refBtns = container.querySelectorAll(".loc-ref-btn");
          refBtns.forEach((refBtn) => {
            refBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              const locId = refBtn.getAttribute("data-loc-id");
              const rawTitle = refBtn.getAttribute("data-loc-title");
              const locTitle = rawTitle ? decodeURIComponent(rawTitle) : null;
              jumpToLocRef.current(
                locId || locTitle || refBtn.textContent || "",
              );
            });
          });

          if (loc.media && loc.media.length > 0) {
            const mediaEl = container.querySelector(".popup-media-container");
            if (mediaEl) {
              mediaEl.addEventListener("click", () => {
                const activeImg = container.querySelector(
                  ".popup-media-img",
                ) as HTMLImageElement | null;
                const firstMedia = loc.media![0];
                const imgUrl =
                  activeImg?.src ||
                  firstMedia.url ||
                  (firstMedia.file_name
                    ? `https://media.mapgenie.io/storage/media/${firstMedia.file_name}`
                    : "");
                if (imgUrl) setLightboxImage(imgUrl);
              });
            }
          }

          return container;
        },
        {
          minWidth: 220,
          maxWidth: 300,
          autoPan: false,
        },
      );

      created.push({ id: loc.id, cId, loc, marker });
    });

    allMarkersRef.current = created;

    if (validLocCount > 0 && locMinLat < locMaxLat && locMinLng < locMaxLng) {
      const allowed = L.latLngBounds(
        [locMinLat, locMinLng],
        [locMaxLat, locMaxLng],
      ).pad(0.35);
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as any)._allowedCenterBounds = allowed;
      }
    }

    // Immediately add markers to the layerGroup so they appear instantly
    const layerGroup = markerGroupRef.current;
    if (layerGroup) {
      layerGroup.clearLayers();
      const term = debouncedSearch.trim().toLowerCase();
      created.forEach((item) => {
        if (categoryState[item.cId] === false) return;
        const isFound = foundIds.has(item.id);
        if (hideFound && isFound) return;
        if (term) {
          const title = item.loc.title || "";
          const desc = item.loc.description || "";
          if (
            !title.toLowerCase().includes(term) &&
            !desc.toLowerCase().includes(term)
          )
            return;
        }
        layerGroup.addLayer(item.marker);
      });
    }
  }, [mapReady, normalizedLocations, getIcon, categoriesById]);

  // 2. High-speed visibility / filter sync without re-allocating markers
  useEffect(() => {
    const layerGroup = markerGroupRef.current;
    const L = leafletModuleRef.current;
    if (!layerGroup || !L) return;

    layerGroup.clearLayers();
    const term = debouncedSearch.trim().toLowerCase();

    allMarkersRef.current.forEach((item) => {
      if (categoryState[item.cId] === false) return;
      const isFound = foundIds.has(item.id);
      if (hideFound && isFound) return;
      if (term) {
        const title = item.loc.title || "";
        const desc = item.loc.description || "";
        if (
          !title.toLowerCase().includes(term) &&
          !desc.toLowerCase().includes(term)
        )
          return;
      }

      // Ensure icon reflects current found status
      const icon = getIcon(item.cId, isFound, L);
      item.marker.setIcon(icon);

      layerGroup.addLayer(item.marker);
    });
  }, [categoryState, foundIds, hideFound, debouncedSearch, mapReady, getIcon]);

  const totalLocations = normalizedLocations.length;
  const totalFound = useMemo(() => {
    let count = 0;
    normalizedLocations.forEach((l) => {
      if (foundIds.has(l.id)) count++;
    });
    return count;
  }, [normalizedLocations, foundIds]);

  const spriteMap = useMemo(
    () => mapData?.mapConfig?.markerSpritePositions || {},
    [mapData?.mapConfig?.markerSpritePositions],
  );
  const spriteImgUrl =
    offlineSpriteUrl ||
    mapData?.mapConfig?.markerImagesUrl ||
    (effectiveGameSlug
      ? `https://cdn.mapgenie.io/images/games/${effectiveGameSlug}/markers@2x.png`
      : "");
  const spriteWidth = useMemo(
    () =>
      detectedSpriteDimensions?.width ??
      (mapData?.mapConfig?.markerImagesWidth
        ? mapData.mapConfig.markerImagesWidth / 2
        : undefined),
    [detectedSpriteDimensions?.width, mapData?.mapConfig?.markerImagesWidth],
  );
  const spriteHeight = useMemo(
    () =>
      detectedSpriteDimensions?.height ??
      (mapData?.mapConfig?.markerImagesHeight
        ? mapData.mapConfig.markerImagesHeight / 2
        : undefined),
    [detectedSpriteDimensions?.height, mapData?.mapConfig?.markerImagesHeight],
  );

  const progressPercent =
    totalLocations > 0 ? Math.round((totalFound / totalLocations) * 100) : 0;

  const groupsList = useMemo(() => {
    const allCats: MapCategory[] = [];
    if (Array.isArray(mapData?.categories)) {
      allCats.push(...mapData.categories);
    }
    if (Array.isArray(mapData?.groups)) {
      mapData.groups.forEach((g) => {
        if (Array.isArray(g.categories)) {
          g.categories.forEach((c) => {
            if (
              !allCats.some((existing) => String(existing.id) === String(c.id))
            ) {
              allCats.push({ ...c, group_id: c.group_id || g.id });
            }
          });
        }
      });
    }

    if (Array.isArray(mapData?.groups) && mapData.groups.length > 0) {
      return mapData.groups.map((g) => {
        let cats =
          Array.isArray(g.categories) && g.categories.length > 0
            ? [...g.categories]
            : [];
        if (cats.length === 0) {
          cats = allCats.filter(
            (c) =>
              String(c.group_id) === String(g.id) ||
              (c as any).group_title === g.title ||
              ((c as any).group &&
                String((c as any).group.id) === String(g.id)),
          );
        }
        return {
          ...g,
          categories: cats,
        };
      });
    }

    if (allCats.length > 0) {
      const grouped: Record<
        string,
        { id: number | string; title: string; categories: MapCategory[] }
      > = {};
      allCats.forEach((c) => {
        const gKey =
          (c as any).group_title ||
          (c.group_id ? `Group ${c.group_id}` : "Locations");
        if (!grouped[gKey]) {
          grouped[gKey] = {
            id: c.group_id || 1,
            title: gKey,
            categories: [],
          };
        }
        grouped[gKey].categories.push(c);
      });
      return Object.values(grouped);
    }
    return [];
  }, [mapData?.groups, mapData?.categories]);

  return (
    <Flex
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        backgroundColor: isOverlay ? "transparent" : "#000000",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* MapGenie Styled Sidebar */}
      {isSidebarOpen && (
        <Box
          style={{
            width: isOverlay ? 300 : 360,
            minWidth: isOverlay ? 300 : 360,
            maxWidth: isOverlay ? "85vw" : undefined,
            height: "100%",
            backgroundColor: isOverlay ? "rgba(8, 10, 15, 0.98)" : "#000000",
            backdropFilter: isOverlay ? "blur(16px)" : undefined,
            borderRight: "1px solid #1a1a1a",
            display: "flex",
            flexDirection: "column",
            position: isOverlay ? "absolute" : "relative",
            left: isOverlay ? 0 : undefined,
            top: isOverlay ? 0 : undefined,
            bottom: isOverlay ? 0 : undefined,
            zIndex: 1200,
            fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
            color: "#ffffff",
            userSelect: "none",
            boxShadow: isOverlay ? "5px 0 28px rgba(0,0,0,0.85)" : undefined,
            overflowY: "hidden",
            overflowX: "hidden",
          }}
        >
          {/* Top Header & Logo */}
          <Box
            data-tauri-drag-region={isOverlay ? "" : undefined}
            onMouseDown={
              isOverlay
                ? async (e) => {
                    if (e.button !== 0 && e.button !== 1) return;
                    if (
                      (e.target as HTMLElement).closest(
                        "button, [role='button'], input, [data-tauri-drag-region='false']",
                      )
                    )
                      return;
                    if (
                      typeof window !== "undefined" &&
                      (window as any).__TAURI_INTERNALS__
                    ) {
                      try {
                        const { getCurrentWindow } = await import(
                          "@tauri-apps/api/window"
                        );
                        await getCurrentWindow().startDragging();
                      } catch (_) {}
                    }
                  }
                : undefined
            }
            style={{
              padding: "14px 16px 10px",
              borderBottom: "1px solid #141414",
              textAlign: "center",
              position: "relative",
              flexShrink: 0,
              cursor: isOverlay ? "grab" : undefined,
            }}
          >
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              pos="absolute"
              top={8}
              right={8}
              onClick={handleCloseSidebar}
              title="Close Sidebar"
              style={{ cursor: "pointer", zIndex: 10, color: "#cbd5e1" }}
            >
              <X size={15} color="#cbd5e1" />
            </ActionIcon>

            <Text
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 1.2,
                lineHeight: 1.1,
                textTransform: "uppercase",
                color: "#ffffff",
                fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
              }}
            >
              {gameTitle || effectiveGameSlug.replace(/-/g, " ")} MAP
            </Text>

            <Text
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                letterSpacing: 1,
                color: "#a0a0a0",
                textTransform: "uppercase",
                marginTop: 4,
                fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
              }}
            >
              {gameTitle || effectiveGameSlug.replace(/-/g, " ")} INTERACTIVE
              MAP
            </Text>

            {/* Offline Download Status / Progress / Button */}
            <Box style={{ marginTop: 10 }}>
              {downloading ? (
                <Box
                  style={{
                    backgroundColor: "#091428",
                    border: "1px solid #1e3a8a",
                    borderRadius: 4,
                    padding: "8px 10px",
                  }}
                >
                  <Flex
                    justify="space-between"
                    align="center"
                    style={{ marginBottom: 5 }}
                  >
                    <Flex align="center" gap={6}>
                      <Loader2 size={12} className="spin" color="#60a5fa" />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#60a5fa",
                          letterSpacing: 0.5,
                        }}
                      >
                        DOWNLOADING ({downloadProgress?.percentage || 0}%)
                      </Text>
                    </Flex>
                    <UnstyledButton
                      onClick={handleCancelDownload}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#f87171",
                        cursor: "pointer",
                        letterSpacing: 0.5,
                      }}
                    >
                      CANCEL
                    </UnstyledButton>
                  </Flex>
                  <Progress
                    value={downloadProgress?.percentage || 0}
                    size="xs"
                    color="blue"
                    animated
                  />
                  <Text
                    style={{
                      fontSize: 9.5,
                      color: "#94a3b8",
                      marginTop: 4,
                      textAlign: "center",
                      textTransform: "none",
                    }}
                  >
                    {downloadProgress?.status ||
                      "Downloading tiles & assets..."}
                  </Text>
                </Box>
              ) : isOfflineReady ? (
                hasOfflineUpdate ? (
                  <Box
                    style={{
                      backgroundColor: "rgba(245, 158, 11, 0.08)",
                      border: "1px solid rgba(245, 158, 11, 0.4)",
                      borderRadius: 4,
                      padding: "8px 10px",
                    }}
                  >
                    <Flex
                      justify="space-between"
                      align="center"
                      style={{ marginBottom: 6 }}
                    >
                      <Flex align="center" gap={6}>
                        <RefreshCw size={12} color="#fbbf24" />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#fbbf24",
                            letterSpacing: 0.6,
                          }}
                        >
                          UPDATE AVAILABLE
                        </Text>
                      </Flex>
                      <UnstyledButton
                        onClick={handleDeleteOffline}
                        title="Remove offline downloaded map files"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#f87171",
                          letterSpacing: 0.5,
                          cursor: "pointer",
                        }}
                      >
                        REMOVE
                      </UnstyledButton>
                    </Flex>
                    {updateReason && (
                      <Text
                        style={{
                          fontSize: 10,
                          color: "#d1d5db",
                          marginBottom: 8,
                          lineHeight: 1.3,
                          textTransform: "none",
                        }}
                      >
                        {updateReason}
                      </Text>
                    )}
                    <Button
                      variant="filled"
                      size="xs"
                      fullWidth
                      leftSection={<RefreshCw size={12} />}
                      onClick={handleStartDownload}
                      style={{
                        backgroundColor: "#d97706",
                        color: "#ffffff",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        height: 28,
                        borderRadius: 4,
                        fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                      }}
                    >
                      UPDATE DOWNLOADED MAP
                    </Button>
                  </Box>
                ) : (
                  <Flex
                    justify="space-between"
                    align="center"
                    style={{
                      backgroundColor: "#062817",
                      border: "1px solid #166534",
                      borderRadius: 4,
                      padding: "4px 10px",
                    }}
                  >
                    <Flex align="center" gap={6}>
                      <Check size={12} color="#4ade80" />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#4ade80",
                          letterSpacing: 0.6,
                        }}
                      >
                        OFFLINE READY
                      </Text>
                    </Flex>
                    <UnstyledButton
                      onClick={handleDeleteOffline}
                      title="Remove offline downloaded map files"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#f87171",
                        letterSpacing: 0.5,
                        cursor: "pointer",
                      }}
                    >
                      REMOVE
                    </UnstyledButton>
                  </Flex>
                )
              ) : (
                <Button
                  variant="filled"
                  size="xs"
                  fullWidth
                  leftSection={<Download size={13} />}
                  onClick={handleStartDownload}
                  style={{
                    backgroundColor: "#0c1424",
                    border: "1px solid #243454",
                    color: "#93c5fd",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    height: 28,
                    borderRadius: 4,
                    fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                  }}
                >
                  DOWNLOAD OFFLINE MAP
                </Button>
              )}
            </Box>
          </Box>

          {/* SHOW ALL / HIDE ALL / HIDE FOUND Bar */}
          <Flex
            justify="center"
            align="center"
            gap={16}
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid #141414",
              backgroundColor: "#050505",
            }}
          >
            <UnstyledButton
              onClick={showAllCategories}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: 1,
                textTransform: "uppercase",
                fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
              }}
            >
              SHOW ALL
            </UnstyledButton>

            <UnstyledButton
              onClick={hideAllCategories}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: 1,
                textTransform: "uppercase",
                fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
              }}
            >
              HIDE ALL
            </UnstyledButton>

            <UnstyledButton
              onClick={toggleHideFound}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: hideFound ? "#f87171" : "#94a3b8",
                letterSpacing: 1,
                textTransform: "uppercase",
                fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                borderLeft: "1px solid #222",
                paddingLeft: 12,
              }}
            >
              {hideFound ? "SHOW FOUND" : "HIDE FOUND"}
            </UnstyledButton>
          </Flex>

          {/* Search Bar + Button */}
          <Box
            style={{
              padding: "12px 16px 8px",
              borderBottom: "1px solid #141414",
            }}
          >
            <Flex gap={4}>
              <TextInput
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                styles={{
                  root: { flex: 1 },
                  input: {
                    backgroundColor: "#080808",
                    borderColor: "#222222",
                    color: "#ffffff",
                    fontSize: 13,
                    borderRadius: 2,
                    fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                    letterSpacing: 0.5,
                    height: 32,
                  },
                }}
              />
              <Button
                variant="default"
                size="xs"
                style={{
                  backgroundColor: "#080808",
                  borderColor: "#222222",
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 1,
                  borderRadius: 2,
                  height: 32,
                  padding: "0 12px",
                  fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                }}
                onClick={() => {}}
              >
                SEARCH
              </Button>
            </Flex>

            <Text
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "#e5b95f",
                letterSpacing: 0.3,
                marginTop: 6,
                textAlign: "center",
                fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
              }}
            >
              Tip: Right-click any marker to mark as found!
            </Text>
          </Box>

          {/* Categories 2-Column List */}
          <Box
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
            }}
          >
            {groupsList.map((g) => (
              <Box key={g.id} style={{ marginBottom: 18 }}>
                {/* Group Title - Click to toggle all categories in this group */}
                {(() => {
                  const groupCats = g.categories || [];
                  const isGroupVisible =
                    groupCats.length > 0
                      ? groupCats.some(
                          (c) => categoryState[String(c.id)] !== false,
                        )
                      : true;
                  return (
                    <Text
                      onClick={() => toggleGroupCategories(groupCats)}
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: isGroupVisible ? "#ffffff" : "#718096",
                        textTransform: "uppercase",
                        letterSpacing: 1,
                        marginBottom: 8,
                        borderBottom: `1px solid ${isGroupVisible ? "#262b36" : "#141414"}`,
                        paddingBottom: 4,
                        fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        userSelect: "none",
                        opacity: isGroupVisible ? 1 : 0.45,
                      }}
                      title={
                        isGroupVisible
                          ? "Click to hide all items in this category group"
                          : "Click to show all items in this category group"
                      }
                    >
                      {g.title}
                    </Text>
                  );
                })()}

                {/* 2-Column Grid */}
                <Box
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    columnGap: 14,
                    rowGap: 6,
                  }}
                >
                  {g.categories?.map((c) => {
                    const sId = String(c.id);
                    const isVisible = categoryState[sId] !== false;
                    const total = categoryCounts[sId] || c.locations_count || 0;
                    const found = categoryFoundCounts[sId] || 0;
                    const isComplete = total > 0 && found >= total;
                    const rawIcon = c.icon || "miscellaneous";
                    const iconDash = rawIcon.replace(/_/g, "-");
                    const iconUnder = rawIcon.replace(/-/g, "_");

                    return (
                      <Box
                        key={c.id}
                        onClick={() => toggleCategory(c.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "3px 2px",
                          cursor: "pointer",
                          opacity: isVisible ? 1 : 0.28,
                          transition: "opacity 0.12s",
                        }}
                      >
                        <Flex
                          align="center"
                          gap={6}
                          style={{ overflow: "hidden", minWidth: 0, flex: 1 }}
                        >
                          <CategoryIcon
                            category={c}
                            spriteMap={spriteMap}
                            spriteImgUrl={spriteImgUrl}
                            spriteWidth={spriteWidth}
                            spriteHeight={spriteHeight}
                            isVisible={isVisible}
                            size={18}
                          />
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: isVisible ? "#e2e8f0" : "#666666",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              textTransform: "uppercase",
                              letterSpacing: 0.4,
                              fontFamily:
                                "'Oswald', 'Arial Narrow', sans-serif",
                            }}
                            title={c.title}
                          >
                            {c.title}
                          </Text>
                        </Flex>

                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            color: isComplete
                              ? "#4ade80"
                              : isVisible
                                ? "#ffffff"
                                : "#666666",
                            flexShrink: 0,
                            marginLeft: 4,
                            fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                          }}
                        >
                          {found > 0 ? (
                            <>
                              <span
                                style={{
                                  color: isComplete ? "#4ade80" : "#e5b95f",
                                }}
                              >
                                {found}
                              </span>
                              /{total}
                            </>
                          ) : (
                            `0/${total}`
                          )}
                        </Text>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Box>

          {/* Bottom Bar: Progress & Found Toggle */}
          <Box
            style={{
              padding: "8px 16px",
              borderTop: "1px solid #141414",
              backgroundColor: "#040404",
              flexShrink: 0,
            }}
          >
            <Flex justify="space-between" align="center">
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#888",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                }}
              >
                TRACKER:{" "}
                <span style={{ color: "#e5b95f" }}>
                  {totalFound} / {totalLocations} ({progressPercent}%)
                </span>
              </Text>

              <UnstyledButton
                onClick={toggleHideFound}
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 2,
                  backgroundColor: hideFound ? "#c92a2a" : "#141414",
                  color: "#ffffff",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                }}
              >
                {hideFound ? "SHOW FOUND" : "HIDE FOUND"}
              </UnstyledButton>
            </Flex>
          </Box>
        </Box>
      )}

      {/* Map Container + Floating Overlays */}
      <Box
        style={{
          flex: 1,
          height: "100%",
          position: "relative",
          backgroundColor: isOverlay ? "transparent" : "#000000",
        }}
      >
        <style>{`
          .leaflet-container {
            background-color: ${isOverlay ? "transparent" : "#000000"} !important;
            background: ${isOverlay ? "transparent" : "#000000"} !important;
          }
        `}</style>
        <Box
          ref={mapContainerRef}
          style={{
            width: "100%",
            height: "100%",
            zIndex: 1,
            backgroundColor: isOverlay ? "transparent" : "#000000",
          }}
        />

        {/* Gamepad / Controller Integration */}
        <MapGamepadController
          map={mapInstanceRef.current}
          allMarkersRef={allMarkersRef}
          foundIds={foundIds}
          hideFound={hideFound}
          onToggleHideFound={toggleHideFound}
          categoriesById={categoriesById}
          groupsList={groupsList}
          categoryState={categoryState}
          spriteMap={spriteMap}
          spriteImgUrl={spriteImgUrl}
          spriteWidth={spriteWidth}
          spriteHeight={spriteHeight}
          onToggleFound={toggleLocationFound}
          onToggleCategory={toggleCategory}
          onToggleGroupCategories={toggleGroupCategories}
          onShowAllCategories={showAllCategories}
          onHideAllCategories={hideAllCategories}
          onToggleSidebar={handleToggleSidebar}
          minZoom={customMinZoom ?? 0}
          maxZoom={customMaxZoom ?? 20}
          isOverlay={isOverlay}
          availableMaps={availableMaps}
          currentMapSlug={currentMapSlug || effectiveMapSlug}
          onSelectMap={onSelectMap}
          isLightboxOpen={Boolean(lightboxImage)}
          onCloseLightbox={() => setLightboxImage(null)}
        />

        {/* Top Floating Header Controls */}
        <Flex
          justify="space-between"
          align="center"
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          {/* Left: Sidebar Toggle & Sub-map Switcher */}
          <Group
            gap="xs"
            style={{
              pointerEvents: "auto",
              flex: 1,
              minWidth: 0,
              marginRight: 16,
            }}
          >
            <Tooltip
              label={
                isSidebarOpen
                  ? "Hide Filters & Categories"
                  : "Show Filters & Categories"
              }
              withArrow
            >
              <ActionIcon
                variant="filled"
                color="dark"
                size="lg"
                radius="xl"
                onClick={handleToggleSidebar}
                style={{
                  flexShrink: 0,
                  backgroundColor: "rgba(12, 14, 18, 0.92)",
                  border: "1px solid #262b36",
                  color: isSidebarOpen ? "#60a5fa" : "#ffffff",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <SlidersHorizontal size={17} />
              </ActionIcon>
            </Tooltip>

            {/* Offline Map Update Available Button in Floating Bar */}
            {isOfflineReady && hasOfflineUpdate && (
              <Tooltip
                label={
                  updateReason
                    ? `Update available: ${updateReason}. Click to update.`
                    : "Map update available online. Click to update offline map."
                }
                withArrow
              >
                <Button
                  size="xs"
                  variant="filled"
                  leftSection={
                    <RefreshCw
                      size={12}
                      className={downloading ? "spin" : undefined}
                    />
                  }
                  onClick={handleStartDownload}
                  loading={downloading}
                  style={{
                    backgroundColor: "#d97706",
                    color: "#ffffff",
                    height: 32,
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: 0.6,
                    borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(217, 119, 6, 0.45)",
                    fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                  }}
                >
                  UPDATE AVAILABLE
                </Button>
              </Tooltip>
            )}

            {/* Sub-map Switcher (In normal modal view) */}
            {!isOverlay && availableMaps && availableMaps.length > 1 && (
              <Box
                onWheel={(e) => {
                  if (e.deltaY !== 0) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: "rgba(12, 14, 18, 0.92)",
                  padding: "3px 4px",
                  borderRadius: 8,
                  border: "1px solid #262b36",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(8px)",
                  overflowX: "auto",
                  maxWidth: "calc(100vw - 260px)",
                  scrollbarWidth: "none",
                }}
              >
                {availableMaps.map((m) => {
                  const isSelected =
                    (currentMapSlug || effectiveMapSlug) === m.slug;
                  return (
                    <UnstyledButton
                      key={m.slug}
                      onClick={() => {
                        if (effectiveGameSlug) {
                          saveLastOpenedMapSlug(effectiveGameSlug, m.slug);
                        }
                        onSelectMap?.(m.slug);
                      }}
                      style={{
                        whiteSpace: "nowrap",
                        padding: "5px 12px",
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
                        backgroundColor: isSelected ? "#c92a2a" : "transparent",
                        backgroundImage: isSelected
                          ? "linear-gradient(135deg, #e03131 0%, #b91c1c 100%)"
                          : "none",
                        color: isSelected ? "#ffffff" : "#94a3b8",
                        boxShadow: isSelected
                          ? "0 2px 8px rgba(224, 49, 49, 0.4)"
                          : "none",
                        border: isSelected
                          ? "1px solid rgba(255, 255, 255, 0.2)"
                          : "1px solid transparent",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor =
                            "rgba(255, 255, 255, 0.08)";
                          e.currentTarget.style.color = "#ffffff";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "#94a3b8";
                        }
                      }}
                    >
                      {m.title}
                    </UnstyledButton>
                  );
                })}
              </Box>
            )}
          </Group>

          {/* When in overlay mode, let empty space in floating controls drag the window */}
          {isOverlay && (
            <Box
              data-tauri-drag-region
              onMouseDown={async (e) => {
                if (e.button !== 0 && e.button !== 1) return;
                if (
                  (e.target as HTMLElement).closest(
                    "button, [role='button'], input, [data-tauri-drag-region='false']",
                  )
                )
                  return;
                if (
                  typeof window !== "undefined" &&
                  (window as any).__TAURI_INTERNALS__
                ) {
                  try {
                    const { getCurrentWindow } = await import(
                      "@tauri-apps/api/window"
                    );
                    await getCurrentWindow().startDragging();
                  } catch (_) {}
                }
              }}
              style={{
                flex: 1,
                height: 36,
                cursor: "grab",
                pointerEvents: "auto",
              }}
            />
          )}

          {/* Top Right Actions: Hide Found, Overlay Popout & Close */}
          <Group gap="xs" style={{ pointerEvents: "auto" }}>
            {!isOverlay && (onOpenOverlay || gameSlug) && (
              <Tooltip label="Pop out to floating in-game overlay" withArrow>
                <ActionIcon
                  variant="filled"
                  color="dark"
                  size="lg"
                  radius="xl"
                  onClick={() => {
                    if (onOpenOverlay) {
                      onOpenOverlay();
                    } else {
                      openMapOverlay({
                        gameSlug,
                        mapSlug: currentMapSlug || effectiveMapSlug,
                        gameTitle,
                        minZoom: customMinZoom,
                        maxZoom: customMaxZoom,
                      });
                      if (onClose) onClose();
                    }
                  }}
                  style={{
                    backgroundColor: "rgba(12, 14, 18, 0.92)",
                    border: "1px solid #262b36",
                    color: "#60a5fa",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <PictureInPicture2 size={18} />
                </ActionIcon>
              </Tooltip>
            )}

            {onClose && (
              <ActionIcon
                variant="filled"
                color="dark"
                size="lg"
                radius="xl"
                onClick={onClose}
                style={{
                  backgroundColor: "rgba(12, 14, 18, 0.92)",
                  border: "1px solid #262b36",
                  color: "#fff",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <X size={18} />
              </ActionIcon>
            )}
          </Group>
        </Flex>
      </Box>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <Box
          onClick={() => setLightboxImage(null)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            cursor: "zoom-out",
          }}
        >
          <img
            src={lightboxImage}
            alt="Preview"
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: 6,
              objectFit: "contain",
            }}
          />
        </Box>
      )}
    </Flex>
  );
}
