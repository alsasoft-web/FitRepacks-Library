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
  Navigation,
  Crosshair,
  Radio,
  Sliders,
  Grid,
  Maximize2,
  Copy,
  RotateCcw,
  Compass,
  MapPin,
  SlidersHorizontal,
  Target,
  RotateCw,
  ArrowLeftRight,
  Layers,
  PictureInPicture2,
} from "lucide-react";
import { MapViewerProps, MapCategory, MapLocation } from "./types";
import {
  downloadFullOfflineMap,
  isMapOfflineReady,
  deleteOfflineMap,
  getOfflineAsset,
  getOfflineAssetText,
  saveOfflineAsset,
  fetchAssetBlob,
  fetchAndCacheOfflineAsset,
  clearOfflineMapTileCache,
  DownloadProgress,
} from "../../lib/offlineMapStore";
import { useLiveGameTracker } from "../../lib/useLiveGameTracker";
import { openMapOverlay } from "../../lib/mapOverlay";

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

interface DistrictDef {
  name: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  color: string;
}

const KNOWN_GAME_DISTRICTS: Record<string, DistrictDef[]> = {
  "mafia-2": [
    {
      name: "Little Italy",
      minX: -600,
      maxX: 200,
      minY: 300,
      maxY: 1000,
      color: "#22c55e",
    },
    {
      name: "Chinatown",
      minX: -850,
      maxX: -200,
      minY: 100,
      maxY: 550,
      color: "#eab308",
    },
    {
      name: "Midtown",
      minX: -300,
      maxX: 450,
      minY: -250,
      maxY: 450,
      color: "#3b82f6",
    },
    {
      name: "East Side",
      minX: 400,
      maxX: 1300,
      minY: 0,
      maxY: 850,
      color: "#a855f7",
    },
    {
      name: "West Side",
      minX: -1400,
      maxX: -650,
      minY: -400,
      maxY: 300,
      color: "#ec4899",
    },
    {
      name: "Kingston",
      minX: -1900,
      maxX: -950,
      minY: 400,
      maxY: 1300,
      color: "#14b8a6",
    },
    {
      name: "Dipton",
      minX: -1950,
      maxX: -1200,
      minY: -350,
      maxY: 400,
      color: "#f97316",
    },
    {
      name: "Riverside",
      minX: -1250,
      maxX: -450,
      minY: 800,
      maxY: 1700,
      color: "#06b6d4",
    },
    {
      name: "Hillwood",
      minX: -250,
      maxX: 1250,
      minY: 1000,
      maxY: 2300,
      color: "#84cc16",
    },
    {
      name: "Northoak",
      minX: 600,
      maxX: 1700,
      minY: 600,
      maxY: 1650,
      color: "#6366f1",
    },
    {
      name: "Oyster Bay",
      minX: 200,
      maxX: 1300,
      minY: -1050,
      maxY: 0,
      color: "#10b981",
    },
    {
      name: "Hunters Point",
      minX: -50,
      maxX: 850,
      minY: -1500,
      maxY: -800,
      color: "#d946ef",
    },
    {
      name: "South Port",
      minX: -850,
      maxX: 250,
      minY: -2100,
      maxY: -1000,
      color: "#ef4444",
    },
    {
      name: "Sand Island",
      minX: -1900,
      maxX: -950,
      minY: -1500,
      maxY: -500,
      color: "#f59e0b",
    },
    {
      name: "Greenfield",
      minX: -1850,
      maxX: -750,
      minY: 0,
      maxY: 850,
      color: "#8b5cf6",
    },
  ],
};

function projectGameCoords(
  x: number,
  y: number,
  latCenter: number,
  lngCenter: number,
  latScale: number,
  lngScale: number,
  rotationDeg: number = 0,
  invertX: boolean = false,
  invertY: boolean = false,
  swapXY: boolean = false,
): [number, number] {
  let ix = invertX ? -x : x;
  let iy = invertY ? -y : y;
  if (swapXY) {
    const t = ix;
    ix = iy;
    iy = t;
  }

  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rx = ix * cos - iy * sin;
  const ry = ix * sin + iy * cos;

  return [latCenter + ry * latScale, lngCenter + rx * lngScale];
}

function unprojectMapCoords(
  lat: number,
  lng: number,
  latCenter: number,
  lngCenter: number,
  latScale: number,
  lngScale: number,
  rotationDeg: number = 0,
  invertX: boolean = false,
  invertY: boolean = false,
  swapXY: boolean = false,
): [number, number] {
  const dy = (lat - latCenter) / (latScale || 1);
  const dx = (lng - lngCenter) / (lngScale || 1);

  const rad = (-rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  let rx = dx * cos - dy * sin;
  let ry = dx * sin + dy * cos;

  if (swapXY) {
    const t = rx;
    rx = ry;
    ry = t;
  }
  if (invertX) rx = -rx;
  if (invertY) ry = -ry;

  return [rx, ry];
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
  overlayShape = "rounded",
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
  const calibrationLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const markersMapRef = useRef<Map<string | number, L.Marker>>(new Map());
  const leafletModuleRef = useRef<typeof import("leaflet") | null>(null);
  const discoveredWorkingPatternRef = useRef<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [hideFound, setHideFound] = useState(false);
  const [foundIds, setFoundIds] = useState<Set<number | string>>(new Set());
  const [categoryState, setCategoryState] = useState<Record<string, boolean>>(
    {},
  );
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(0);
  const [internalIsSidebarOpen, setInternalIsSidebarOpen] = useState(!isOverlay);
  const isSidebarOpen =
    externalIsSidebarOpen !== undefined
      ? externalIsSidebarOpen
      : internalIsSidebarOpen;

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

  // Live Calibration & Scale Visualizer State
  const [showCalibrationTool, setShowCalibrationTool] = useState(false);
  const showCalibrationToolRef = useRef(false);
  showCalibrationToolRef.current = showCalibrationTool;
  const [showGridOverlay, setShowGridOverlay] = useState(true);
  const [showDistrictBoxes, setShowDistrictBoxes] = useState(true);
  const [calibCenterLat, setCalibCenterLat] = useState<number>(1.177677);
  const [calibCenterLng, setCalibCenterLng] = useState<number>(-1.252454);
  const [calibScaleX, setCalibScaleX] = useState<number>(0.000453);
  const [calibScaleY, setCalibScaleY] = useState<number>(0.000453);
  const [calibRotation, setCalibRotation] = useState<number>(0.82);
  const [calibInvertX, setCalibInvertX] = useState<boolean>(false);
  const [calibInvertY, setCalibInvertY] = useState<boolean>(false);
  const [calibSwapXY, setCalibSwapXY] = useState<boolean>(false);

  // 2-Point Anchor Calibration State
  const [calibAnchorSlot, setCalibAnchorSlot] = useState<1 | 2 | null>(null);
  const calibAnchorSlotRef = useRef<1 | 2 | null>(null);
  calibAnchorSlotRef.current = calibAnchorSlot;
  const [anchorP1, setAnchorP1] = useState<{
    gameX: number;
    gameY: number;
    mapLat: number;
    mapLng: number;
    label?: string;
  } | null>(null);
  const [anchorP2, setAnchorP2] = useState<{
    gameX: number;
    gameY: number;
    mapLat: number;
    mapLng: number;
    label?: string;
  } | null>(null);
  const [activeCalibTab, setActiveCalibTab] = useState<"manual" | "auto">(
    "manual",
  );

  const calibParamsRef = useRef({
    lat: 1.177677,
    lng: -1.252454,
    scaleX: 0.000453,
    scaleY: 0.000453,
    rotation: 0.82,
    invertX: false,
    invertY: false,
    swapXY: false,
  });
  calibParamsRef.current = {
    lat: calibCenterLat,
    lng: calibCenterLng,
    scaleX: calibScaleX,
    scaleY: calibScaleY,
    rotation: calibRotation,
    invertX: calibInvertX,
    invertY: calibInvertY,
    swapXY: calibSwapXY,
  };

  const [calibGridInterval, setCalibGridInterval] = useState<number>(500);
  const [mouseCoord, setMouseCoord] = useState<{
    lat: number;
    lng: number;
    x: number;
    y: number;
  } | null>(null);
  const [calibrationPin, setCalibrationPin] = useState<{
    lat: number;
    lng: number;
    x: number;
    y: number;
  } | null>(null);
  const [copiedRustCode, setCopiedRustCode] = useState(false);

  // Offline Download State
  const [isOfflineReady, setIsOfflineReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [offlineSpriteUrl, setOfflineSpriteUrl] = useState<string | null>(null);
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

  const effectiveGameSlug = mapData?.game?.slug || gameSlug || "";
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

  // Live Game Character Tracking
  const {
    isSupported: isTrackerSupported,
    isActive: isTrackerActive,
    isGameRunning: isGameRunningTracker,
    isTracking: isPlayerTracked,
    position: livePlayerPos,
    candidates: trackerCandidates,
    selectedPointerId: trackerSelectedId,
    setSelectedPointerId: setTrackerSelectedId,
    followPlayer,
    setFollowPlayer,
    toggleTracking,
    toggleFollowPlayer,
  } = useLiveGameTracker({
    gameSlug: effectiveGameSlug,
    mapSlug: effectiveMapSlug,
    autoStart: false,
  });

  const playerMarkerRef = useRef<L.Marker | null>(null);
  const livePosRef = useRef(livePlayerPos);
  livePosRef.current = livePlayerPos;
  const followPlayerRef = useRef(followPlayer);
  followPlayerRef.current = followPlayer;

  // Check offline readiness
  useEffect(() => {
    let isMounted = true;
    if (effectiveGameSlug && effectiveMapSlug) {
      isMapOfflineReady(effectiveGameSlug, effectiveMapSlug).then((ready) => {
        if (isMounted) setIsOfflineReady(ready);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [effectiveGameSlug, effectiveMapSlug]);

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

  // Load Saved Found Progress & Sync across windows
  useEffect(() => {
    if (!finalStorageKey && !categoryStorageKey && !hideFoundStorageKey) return;
    const loadSaved = () => {
      if (finalStorageKey) {
        try {
          const saved = localStorage.getItem(finalStorageKey);
          if (saved) setFoundIds(new Set(JSON.parse(saved)));
          else setFoundIds(new Set());
        } catch {}
      }
    };
    loadSaved();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === finalStorageKey) {
        loadSaved();
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
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [finalStorageKey, categoryStorageKey, hideFoundStorageKey]);

  // Load Saved Category Visibility State or apply default rule (>100 markers if map > 1000)
  useEffect(() => {
    if (!categoryStorageKey && !effectiveGameSlug) return;
    try {
      const saved =
        (categoryStorageKey && localStorage.getItem(categoryStorageKey)) ||
        (effectiveGameSlug && localStorage.getItem(`map_categories_${effectiveGameSlug}`));
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
  }, [categoryStorageKey, effectiveGameSlug, normalizedLocations.length, categoryCounts]);

  // Load Saved Hide Found Toggle
  useEffect(() => {
    if (!hideFoundStorageKey && !effectiveGameSlug) return;
    try {
      const saved =
        (hideFoundStorageKey && localStorage.getItem(hideFoundStorageKey)) ||
        (effectiveGameSlug && localStorage.getItem(`map_hide_found_${effectiveGameSlug}`));
      if (saved !== null) setHideFound(JSON.parse(saved));
      else setHideFound(false);
    } catch {}
  }, [hideFoundStorageKey, effectiveGameSlug]);

  // Found counts per category
  const categoryFoundCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    normalizedLocations.forEach((l) => {
      if (foundIds.has(l.id)) {
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
        if (next.has(locId)) next.delete(locId);
        else next.add(locId);

        if (finalStorageKey) {
          try {
            localStorage.setItem(
              finalStorageKey,
              JSON.stringify(Array.from(next)),
            );
          } catch {}
        }
        return next;
      });
    },
    [finalStorageKey],
  );

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
            localStorage.setItem(`map_categories_${effectiveGameSlug}`, JSON.stringify(next));
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
  }, [categoriesById, mapData?.groups, normalizedLocations, updateCategoryState]);

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
  }, [categoriesById, mapData?.groups, normalizedLocations, updateCategoryState]);

  const toggleHideFound = useCallback(() => {
    setHideFound((prev) => {
      const next = !prev;
      if (hideFoundStorageKey) {
        try {
          localStorage.setItem(hideFoundStorageKey, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  }, [hideFoundStorageKey]);

  const jumpToLocation = useCallback(
    (targetIdOrTitle: string | number) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const raw = String(targetIdOrTitle).trim();
      const rawLower = raw.toLowerCase();

      // Find the location object
      const targetLoc = normalizedLocations.find(
        (l) =>
          String(l.id) === raw ||
          (l.title && l.title.toLowerCase().trim() === rawLower) ||
          (l.title && l.title.toLowerCase().includes(rawLower)),
      );
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
          markersMapRef.current.get(targetLoc.id) ||
          markersMapRef.current.get(String(targetLoc.id)) ||
          (targetLoc.title
            ? markersMapRef.current.get(targetLoc.title.toLowerCase().trim())
            : undefined);

        if (marker) {
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
      const spriteWidth = mapData?.mapConfig?.markerImagesWidth
        ? mapData.mapConfig.markerImagesWidth / 2
        : 132;
      const spriteHeight = mapData?.mapConfig?.markerImagesHeight
        ? mapData.mapConfig.markerImagesHeight / 2
        : 220;

      const sprite = spriteMap[cId];
      let icon: L.DivIcon;

      if (sprite && spriteImgUrl) {
        const pr = sprite.pixelRatio || 2;
        const posX = sprite.x / pr;
        const posY = sprite.y / pr;
        const iconW = (sprite.width || 66) / pr;
        const iconH = (sprite.height || 88) / pr;

        icon = L.divIcon({
          className: "custom-div-icon",
          html: `<div class="marker-icon ${isFound ? "is-found" : ""}" style="background-image: url('${spriteImgUrl}'); background-position: -${posX}px -${posY}px; width: ${iconW}px; height: ${iconH}px; background-repeat: no-repeat; background-size: ${spriteWidth}px ${spriteHeight}px; cursor: pointer;"></div>`,
          iconSize: [iconW, iconH],
          iconAnchor: [iconW / 2, iconH],
          popupAnchor: [0, -(iconH - 2)],
        });
      } else {
        const cat = categoriesById[cId];
        const rawIcon = cat?.icon || "miscellaneous";
        const iconDash = rawIcon.replace(/_/g, "-");
        const iconUnder = rawIcon.replace(/-/g, "_");
        const pinColor = cat?.color || cat?.icon_color || "#e03131";
        const iconW = 28;
        const iconH = 36;

        const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="${iconW}" height="${iconH}" style="display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));"><path d="M16 0C7.163 0 0 7.163 0 16c0 10.5 14.2 24.8 14.8 25.4a1.7 1.7 0 0 0 2.4 0C17.8 40.8 32 26.5 32 16 32 7.163 24.837 0 16 0z" fill="${pinColor}"/><circle cx="16" cy="15" r="10" fill="#ffffff"/></svg>`;

        icon = L.divIcon({
          className: "custom-div-icon",
          html: `
            <div class="mg-marker-pin ${isFound ? "is-found" : ""}" style="position: relative; width: ${iconW}px; height: ${iconH}px; cursor: pointer;">
              ${pinSvg}
              <div style="position: absolute; top: 0; left: 0; width: ${iconW}px; height: 30px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
                <span class="cat-icon icon-${iconDash} icon-${iconUnder}" style="font-size: 13px; color: ${pinColor}; line-height: 1;"></span>
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
    [mapData?.mapConfig, effectiveGameSlug, categoriesById, offlineSpriteUrl],
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

      // Check offline sprite, or download and cache if online
      if (effectiveGameSlug) {
        getOfflineAsset(`sprite_${effectiveGameSlug}`).then((blob) => {
          if (blob && !isCancelled) {
            setOfflineSpriteUrl(URL.createObjectURL(blob));
          } else {
            const remoteSpriteUrl =
              mapData?.mapConfig?.markerImagesUrl ||
              `https://cdn.mapgenie.io/images/games/${effectiveGameSlug}/markers@2x.png`;
            fetchAndCacheOfflineAsset(`sprite_${effectiveGameSlug}`, remoteSpriteUrl).then((newBlob) => {
              if (newBlob && !isCancelled) {
                setOfflineSpriteUrl(URL.createObjectURL(newBlob));
                iconCacheRef.current.clear();
              }
            }).catch(() => {});
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
              cssText = await res.text();
              if (cssText.trim().length > 0) break;
            }
          } catch (_) {}
        }
      }

      if (isCancelled) return;

      let iconRules = "";
      if (cssText) {
        const iconRegex =
          /\.icon-([a-zA-Z0-9_\-]+):before\s*\{\s*content:\s*(["'][^"']+["']);?\s*\}/g;
        let match;
        while ((match = iconRegex.exec(cssText)) !== null) {
          const rawName = match[1];
          const contentVal = match[2];
          const dashed = rawName.replace(/_/g, "-");
          const underscored = rawName.replace(/-/g, "_");
          iconRules += `\n.icon-${dashed}:before, .icon-${underscored}:before { content: ${contentVal} !important; }`;
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
        @keyframes playerPulse {
          0% { transform: scale(0.92); opacity: 0.95; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
          70% { transform: scale(1.18); opacity: 0.25; box-shadow: 0 0 0 16px rgba(34, 197, 94, 0); }
          100% { transform: scale(0.92); opacity: 0.95; box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        .player-beacon-pulse {
          animation: playerPulse 1.6s infinite cubic-bezier(0.4, 0, 0.6, 1);
        }
        .cat-icon, [class^="icon-"], [class*=" icon-"] {
          font-family: 'icomoon', 'mg-icons' !important;
          speak: never;
          font-style: normal;
          font-weight: normal;
          text-transform: none;
          line-height: 1;
          display: inline-block;
          width: 15px;
          text-align: center;
          -webkit-font-smoothing: antialiased;
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
          margin: 2px 0;
          font-size: 11.5px;
          font-weight: 700;
          color: #93c5fd;
          background: rgba(37, 99, 235, 0.2);
          border: 1px solid rgba(96, 165, 250, 0.4);
          border-radius: 4px;
          cursor: pointer;
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
      styleTag.innerHTML = fontOverrides + "\n" + iconRules;
    }

    loadFontsAndStyles();
    return () => {
      isCancelled = true;
    };
  }, [mapData?.mapConfig, effectiveGameSlug]);

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
        [];
      const primaryTileSet = (Array.isArray(tileSets) && tileSets[0]) || {};

      const minZoom =
        customMinZoom ??
        primaryTileSet.min_zoom ??
        mapData?.mapConfig?.min_zoom ??
        (mapData?.map as any)?.min_zoom ??
        0;
      const maxNativeZoom =
        customMaxZoom ??
        primaryTileSet.tiles_max_zoom ??
        primaryTileSet.max_zoom ??
        (mapData?.mapConfig as any)?.tiles_max_zoom ??
        mapData?.mapConfig?.max_zoom ??
        (mapData?.map as any)?.tiles_max_zoom ??
        (mapData?.map as any)?.max_zoom ??
        16;
      const maxZoom = maxNativeZoom + 3;

      let startLat =
        mapData?.mapConfig?.start_lat ??
        mapData?.map?.start_lat;
      let startLng =
        mapData?.mapConfig?.start_lng ??
        mapData?.map?.start_lng;

      if ((startLat == null || startLat === 0) && normalizedLocations.length > 0) {
        let sumLat = 0;
        let sumLng = 0;
        let validCount = 0;
        for (const loc of normalizedLocations) {
          const lLat = typeof loc.latitude === "string" ? parseFloat(loc.latitude) : loc.latitude;
          const lLng = typeof loc.longitude === "string" ? parseFloat(loc.longitude) : loc.longitude;
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
            (mapData?.map as any)?.initial_zoom ??
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

      const map = L.map(mapContainerRef.current, {
        minZoom,
        maxZoom: maxZoom + 4,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 60,
        attributionControl: false,
        zoomControl: false,
        preferCanvas: true,
        inertia: true,
        inertiaDeceleration: 3000,
      }).setView([activeStartLat, activeStartLng], activeZoom);

      if (!(isOverlay && overlayShape === "circle")) {
        L.control.zoom({ position: "bottomright" }).addTo(map);
      }

      // Focus zoom interactions (scroll wheel, double-click, controls) on character instead of mouse when auto-pan is active
      const origSetZoomAround = map.setZoomAround.bind(map);
      map.setZoomAround = function (latlng: any, zoom: number, options?: any) {
        if (followPlayerRef.current) {
          const charLatLng =
            playerMarkerRef.current?.getLatLng() ||
            (livePosRef.current?.map_lat != null &&
            livePosRef.current?.map_lng != null
              ? L.latLng(livePosRef.current.map_lat, livePosRef.current.map_lng)
              : null);
          if (charLatLng) {
            return origSetZoomAround(charLatLng, zoom, options);
          }
        }
        return origSetZoomAround(latlng, zoom, options);
      };

      const origSetZoom = map.setZoom.bind(map);
      map.setZoom = function (zoom: number, options?: any) {
        if (followPlayerRef.current) {
          const charLatLng =
            playerMarkerRef.current?.getLatLng() ||
            (livePosRef.current?.map_lat != null &&
            livePosRef.current?.map_lng != null
              ? L.latLng(livePosRef.current.map_lat, livePosRef.current.map_lng)
              : null);
          if (charLatLng) {
            return origSetZoomAround(charLatLng, zoom, options);
          }
        }
        return origSetZoom(zoom, options);
      };

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

          // 5. Versioned fallbacks for gameSlug / mapSlug
          if (effectiveGameSlug && effectiveMapSlug) {
            const versions = [
              "default-v5",
              "default-v4",
              "default-v3",
              "default-v2",
              "default-v1",
              "default",
            ];
            for (const v of versions) {
              rawCandidates.push(
                `https://tiles.mapgenie.io/games/${effectiveGameSlug}/${effectiveMapSlug}/${v}/${coords.z}/${coords.x}/${coords.y}.jpg`,
                `https://tiles.mapgenie.io/games/${effectiveGameSlug}/${effectiveMapSlug}/${v}/${coords.z}/${coords.y}/${coords.x}.jpg`,
              );
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
            L.Util.bind(this._tileOnLoad, this, done, tile)();
          };

          L.DomEvent.on(tile, "load", handleTileLoad);
          L.DomEvent.on(tile, "error", tryNextUrl);

          const offlineKey = `tile_v3_${effectiveGameSlug}_${effectiveMapSlug}_${coords.z}_${coords.x}_${coords.y}`;
          getOfflineAsset(offlineKey)
            .then((blob) => {
              if (blob && !isCancelled) {
                tile.src = URL.createObjectURL(blob);
              } else {
                tryNextUrl();
              }
            })
            .catch(() => {
              tryNextUrl();
            });

          return tile;
        },
      });

      new (DatabaseTileLayer as any)("", {
        minZoom,
        maxZoom: maxZoom + 4,
        minNativeZoom: minZoom,
        maxNativeZoom,
        tileSize: 256,
        noWrap: true,
        keepBuffer: 8,
        updateWhenIdle: false,
        updateWhenZooming: false,
        updateInterval: 50,
      }).addTo(map);

      markerGroupRef.current = L.layerGroup().addTo(map);
      calibrationLayerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
      setMapReady((v) => v + 1);

      // Automatically disable auto-pan when user manually drags / moves the map
      map.on("dragstart", () => {
        setFollowPlayer(false);
      });

      // Save map position & zoom on move/zoom with debounce
      let saveViewTimer: any = null;
      map.on("moveend zoomend", () => {
        if (!effectiveGameSlug || followPlayerRef.current || typeof window === "undefined") return;
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

      map.on("mousemove", (e: any) => {
        if (!e.latlng) return;
        const p = calibParamsRef.current;
        const [x, y] = unprojectMapCoords(
          e.latlng.lat,
          e.latlng.lng,
          p.lat,
          p.lng,
          p.scaleY,
          p.scaleX,
          p.rotation,
          p.invertX,
          p.invertY,
          p.swapXY,
        );
        setMouseCoord({ lat: e.latlng.lat, lng: e.latlng.lng, x, y });
      });

      map.on("mouseout", () => {
        setMouseCoord(null);
      });

      map.on("click", (e: any) => {
        if (!showCalibrationToolRef.current || !e.latlng) return;
        const p = calibParamsRef.current;
        const [x, y] = unprojectMapCoords(
          e.latlng.lat,
          e.latlng.lng,
          p.lat,
          p.lng,
          p.scaleY,
          p.scaleX,
          p.rotation,
          p.invertX,
          p.invertY,
          p.swapXY,
        );

        if (calibAnchorSlotRef.current === 1) {
          const gx = livePosRef.current ? livePosRef.current.x : x;
          const gy = livePosRef.current ? livePosRef.current.y : y;
          setAnchorP1({
            gameX: gx,
            gameY: gy,
            mapLat: e.latlng.lat,
            mapLng: e.latlng.lng,
            label: "Anchor 1",
          });
          setCalibAnchorSlot(null);
        } else if (calibAnchorSlotRef.current === 2) {
          const gx = livePosRef.current ? livePosRef.current.x : x;
          const gy = livePosRef.current ? livePosRef.current.y : y;
          setAnchorP2({
            gameX: gx,
            gameY: gy,
            mapLat: e.latlng.lat,
            mapLng: e.latlng.lng,
            label: "Anchor 2",
          });
          setCalibAnchorSlot(null);
        } else {
          setCalibrationPin({ lat: e.latlng.lat, lng: e.latlng.lng, x, y });
        }
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
            if (entry.contentRect.width > 0 && entry.contentRect.height > 0 && mapInstanceRef.current) {
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
      if (playerMarkerRef.current) {
        playerMarkerRef.current.remove();
        playerMarkerRef.current = null;
      }
      if (calibrationLayerGroupRef.current) {
        calibrationLayerGroupRef.current.clearLayers();
        calibrationLayerGroupRef.current = null;
      }
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

  // Live Calibration & Scale Visualizer Layer Drawing Effect
  useEffect(() => {
    const L = leafletModuleRef.current;
    const map = mapInstanceRef.current;
    const calibGroup = calibrationLayerGroupRef.current;
    if (!map || !L || !calibGroup) return;

    calibGroup.clearLayers();

    if (!showCalibrationTool) return;

    // 1. Draw World Origin (0, 0) Crosshair
    const [origLat, origLng] = projectGameCoords(
      0,
      0,
      calibCenterLat,
      calibCenterLng,
      calibScaleY,
      calibScaleX,
      calibRotation,
      calibInvertX,
      calibInvertY,
      calibSwapXY,
    );
    const originIcon = L.divIcon({
      className: "origin-pin-icon",
      html: `
        <div style="position: relative; width: 0; height: 0; pointer-events: none;">
          <div style="position: absolute; top: -7px; left: -7px; width: 14px; height: 14px; border-radius: 50%; background: #3b82f6; border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(59,130,246,0.9);"></div>
          <div style="position: absolute; top: 10px; left: 0; transform: translateX(-50%); background: rgba(15,23,42,0.92); border: 1px solid #3b82f6; border-radius: 4px; padding: 1px 5px; font-size: 9px; font-weight: 700; color: #93c5fd; white-space: nowrap; font-family: 'Oswald', sans-serif; letter-spacing: 0.5px; box-shadow: 0 2px 6px rgba(0,0,0,0.8);">ORIGIN (0,0)</div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
    L.marker([origLat, origLng], {
      icon: originIcon,
      interactive: false,
    }).addTo(calibGroup);

    // 2. Draw Grid Lines with Rotation
    if (showGridOverlay) {
      const step = calibGridInterval;
      // Vertical grid lines (X axis lines)
      for (let x = -2500; x <= 2500; x += step) {
        const [p1Lat, p1Lng] = projectGameCoords(
          x,
          -3000,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );
        const [p2Lat, p2Lng] = projectGameCoords(
          x,
          3000,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );
        const isAxis = x === 0;
        L.polyline(
          [
            [p1Lat, p1Lng],
            [p2Lat, p2Lng],
          ],
          {
            color: isAxis ? "#22c55e" : "#3b82f6",
            weight: isAxis ? 2.5 : 1,
            opacity: isAxis ? 0.85 : 0.28,
            dashArray: isAxis ? undefined : "4, 6",
            interactive: false,
          },
        ).addTo(calibGroup);
      }

      // Horizontal grid lines (Y axis lines)
      for (let y = -3000; y <= 3000; y += step) {
        const [p1Lat, p1Lng] = projectGameCoords(
          -2500,
          y,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );
        const [p2Lat, p2Lng] = projectGameCoords(
          2500,
          y,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );
        const isAxis = y === 0;
        L.polyline(
          [
            [p1Lat, p1Lng],
            [p2Lat, p2Lng],
          ],
          {
            color: isAxis ? "#ef4444" : "#3b82f6",
            weight: isAxis ? 2.5 : 1,
            opacity: isAxis ? 0.85 : 0.28,
            dashArray: isAxis ? undefined : "4, 6",
            interactive: false,
          },
        ).addTo(calibGroup);
      }
    }

    // 3. Draw District Polygons with Rotation
    if (showDistrictBoxes && KNOWN_GAME_DISTRICTS["mafia-2"]) {
      KNOWN_GAME_DISTRICTS["mafia-2"].forEach((d) => {
        const p1 = projectGameCoords(
          d.minX,
          d.minY,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );
        const p2 = projectGameCoords(
          d.maxX,
          d.minY,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );
        const p3 = projectGameCoords(
          d.maxX,
          d.maxY,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );
        const p4 = projectGameCoords(
          d.minX,
          d.maxY,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );

        const poly = L.polygon([p1, p2, p3, p4], {
          color: d.color,
          weight: 1.5,
          opacity: 0.75,
          fillColor: d.color,
          fillOpacity: 0.08,
          dashArray: "3, 5",
        }).addTo(calibGroup);

        poly.bindTooltip(d.name, {
          permanent: false,
          direction: "center",
          className: "district-tooltip",
        });

        // Center district title label
        const [centerLat, centerLng] = projectGameCoords(
          (d.minX + d.maxX) / 2,
          (d.minY + d.maxY) / 2,
          calibCenterLat,
          calibCenterLng,
          calibScaleY,
          calibScaleX,
          calibRotation,
          calibInvertX,
          calibInvertY,
          calibSwapXY,
        );
        const labelIcon = L.divIcon({
          className: "district-label-icon",
          html: `
            <div style="position: relative; width: 0; height: 0; pointer-events: none;">
              <div style="position: absolute; top: 0; left: 0; transform: translate(-50%, -50%); background: rgba(10, 14, 23, 0.85); border: 1px solid ${d.color}; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.7); font-family: 'Oswald', sans-serif;">
                ${d.name}
              </div>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        L.marker([centerLat, centerLng], {
          icon: labelIcon,
          interactive: false,
        }).addTo(calibGroup);
      });
    }

    // 4. Draw Anchor Points & Connecting Vector
    if (anchorP1 && anchorP2) {
      L.polyline(
        [
          [anchorP1.mapLat, anchorP1.mapLng],
          [anchorP2.mapLat, anchorP2.mapLng],
        ],
        {
          color: "#f43f5e",
          weight: 2,
          dashArray: "6, 6",
          interactive: false,
        },
      ).addTo(calibGroup);
    }

    if (anchorP1) {
      const a1Icon = L.divIcon({
        className: "anchor-pin-1",
        html: `
          <div style="position: relative; width: 0; height: 0; cursor: pointer;">
            <div style="position: absolute; top: -8px; left: -8px; width: 16px; height: 16px; border-radius: 50%; background: #06b6d4; border: 2px solid #ffffff; box-shadow: 0 0 12px rgba(6,182,212,0.9);"></div>
            <div style="position: absolute; top: 11px; left: 0; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); border: 1px solid #06b6d4; border-radius: 4px; padding: 2px 6px; font-size: 9.5px; font-weight: 700; color: #67e8f9; white-space: nowrap; font-family: monospace; box-shadow: 0 2px 8px rgba(0,0,0,0.8);">
              P1: (${anchorP1.gameX.toFixed(0)}, ${anchorP1.gameY.toFixed(0)})
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const p1Marker = L.marker([anchorP1.mapLat, anchorP1.mapLng], {
        icon: a1Icon,
      }).addTo(calibGroup);
      p1Marker.on("click", () => setAnchorP1(null));
    }

    if (anchorP2) {
      const a2Icon = L.divIcon({
        className: "anchor-pin-2",
        html: `
          <div style="position: relative; width: 0; height: 0; cursor: pointer;">
            <div style="position: absolute; top: -8px; left: -8px; width: 16px; height: 16px; border-radius: 50%; background: #ec4899; border: 2px solid #ffffff; box-shadow: 0 0 12px rgba(236,72,153,0.9);"></div>
            <div style="position: absolute; top: 11px; left: 0; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); border: 1px solid #ec4899; border-radius: 4px; padding: 2px 6px; font-size: 9.5px; font-weight: 700; color: #f472b6; white-space: nowrap; font-family: monospace; box-shadow: 0 2px 8px rgba(0,0,0,0.8);">
              P2: (${anchorP2.gameX.toFixed(0)}, ${anchorP2.gameY.toFixed(0)})
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const p2Marker = L.marker([anchorP2.mapLat, anchorP2.mapLng], {
        icon: a2Icon,
      }).addTo(calibGroup);
      p2Marker.on("click", () => setAnchorP2(null));
    }

    // 5. Draw Measure Pin if placed
    if (calibrationPin) {
      const pinIcon = L.divIcon({
        className: "calib-pin-icon",
        html: `
          <div style="position: relative; width: 0; height: 0; cursor: pointer;">
            <div style="position: absolute; top: -8px; left: -8px; width: 16px; height: 16px; border-radius: 50%; background: #f59e0b; border: 2px solid #ffffff; box-shadow: 0 0 12px rgba(245, 158, 11, 0.9);"></div>
            <div style="position: absolute; top: 11px; left: 0; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); border: 1px solid #f59e0b; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 700; color: #fbbf24; white-space: nowrap; font-family: monospace; box-shadow: 0 2px 10px rgba(0,0,0,0.8);">
              X: ${calibrationPin.x.toFixed(1)}m | Y: ${calibrationPin.y.toFixed(1)}m
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const pinMarker = L.marker([calibrationPin.lat, calibrationPin.lng], {
        icon: pinIcon,
      }).addTo(calibGroup);
      pinMarker.on("click", () => setCalibrationPin(null));
    }
  }, [
    showCalibrationTool,
    showGridOverlay,
    showDistrictBoxes,
    calibCenterLat,
    calibCenterLng,
    calibScaleX,
    calibScaleY,
    calibRotation,
    calibInvertX,
    calibInvertY,
    calibSwapXY,
    calibGridInterval,
    calibrationPin,
    anchorP1,
    anchorP2,
  ]);

  // Live Player Character Marker on Leaflet Map
  useEffect(() => {
    const L = leafletModuleRef.current;
    const map = mapInstanceRef.current;
    if (!map || !L) return;

    if (isPlayerTracked && livePlayerPos != null) {
      const [calibLat, calibLng] = projectGameCoords(
        livePlayerPos.x,
        livePlayerPos.y,
        calibCenterLat,
        calibCenterLng,
        calibScaleY,
        calibScaleX,
        calibRotation,
        calibInvertX,
        calibInvertY,
        calibSwapXY,
      );
      const lat = showCalibrationTool
        ? calibLat
        : (livePlayerPos.map_lat ?? calibLat);
      const lng = showCalibrationTool
        ? calibLng
        : (livePlayerPos.map_lng ?? calibLng);
      const heading = (livePlayerPos.heading_degrees ?? 0) - calibRotation;
      const districtText = livePlayerPos.district || "Empire Bay";

      const playerIconHtml = `
        <div class="player-live-wrapper" style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div class="player-beacon-pulse" style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background: rgba(34, 197, 94, 0.25); border: 2px solid #22c55e; pointer-events: none;"></div>
          <div style="transform: rotate(${heading}deg); transition: transform 0.08s linear; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; position: relative;">
            <svg viewBox="0 0 32 32" width="30" height="30" style="position: absolute; top: 0; left: 0; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.8));">
              <polygon points="16,2 26,28 16,22 6,28" fill="#22c55e" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>
          </div>
          <div style="position: absolute; width: 8px; height: 8px; border-radius: 50%; background: #ffffff; border: 2px solid #15803d; pointer-events: none;"></div>
        </div>
      `;

      const playerIcon = L.divIcon({
        className: "live-player-icon",
        html: playerIconHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -22],
      });

      const popupHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 170px; color: #ffffff;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #22c55e;"></span>
            <span style="font-size: 13px; font-weight: 700; color: #22c55e; font-family: 'Oswald', sans-serif; text-transform: uppercase;">LIVE CHARACTER</span>
          </div>
          <div style="font-size: 14px; font-weight: 700; color: #ffffff; margin-bottom: 4px;">${districtText}</div>
          <div style="font-size: 11px; color: #94a3b8; font-family: monospace;">X: ${livePlayerPos.x.toFixed(1)}m | Y: ${livePlayerPos.y.toFixed(1)}m | Z: ${livePlayerPos.z.toFixed(1)}m</div>
        </div>
      `;

      if (!playerMarkerRef.current) {
        const marker = L.marker([lat, lng], {
          icon: playerIcon,
          zIndexOffset: 10000,
        }).addTo(map);

        marker.bindPopup(popupHtml, { minWidth: 180 });
        playerMarkerRef.current = marker;
      } else {
        playerMarkerRef.current.setLatLng([lat, lng]);
        playerMarkerRef.current.setIcon(playerIcon);
        playerMarkerRef.current.setPopupContent(popupHtml);
      }

      if (followPlayer && !(map as any)._animatingZoom) {
        map.panTo([lat, lng], { animate: true, duration: 0.15 });
      }
    } else if (playerMarkerRef.current) {
      map.removeLayer(playerMarkerRef.current);
      playerMarkerRef.current = null;
    }
  }, [
    livePlayerPos,
    isPlayerTracked,
    followPlayer,
    mapReady,
    showCalibrationTool,
    calibCenterLat,
    calibCenterLng,
    calibScaleX,
    calibScaleY,
    calibRotation,
    calibInvertX,
    calibInvertY,
    calibSwapXY,
  ]);

  // 1. Build all markers once when map and data are ready
  useEffect(() => {
    const L = leafletModuleRef.current;
    if (!mapReady || !L) return;

    iconCacheRef.current.clear();
    markersMapRef.current.clear();
    const created: typeof allMarkersRef.current = [];

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
              ${loc.description ? `<div style="font-size: 12px; color: #cbd5e1; line-height: 1.45; background: #161a24; border: 1px solid #232a3b; border-radius: 6px; padding: 8px 10px; max-height: 140px; overflow-y: auto;">${formattedDesc}</div>` : ""}
              <div style="margin-top: 10px;">
                <button class="toggle-found-btn" style="width: 100%; padding: 6px 12px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; border-radius: 4px; border: 1px solid ${currentIsFound ? "#e03131" : "#242c3d"}; cursor: pointer; background: ${currentIsFound ? "#e03131" : "#171c26"}; color: #ffffff; transition: all 0.15s ease;">
                  ${currentIsFound ? "✓ MARKED AS FOUND" : "FOUND"}
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
                ? "✓ MARKED AS FOUND"
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
  }, [mapReady, normalizedLocations, getIcon, categoriesById]);

  // 2. High-speed visibility / filter sync without re-allocating markers
  useEffect(() => {
    const layerGroup = markerGroupRef.current;
    const L = leafletModuleRef.current;
    if (!layerGroup || !L || allMarkersRef.current.length === 0) return;

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
      if (item.marker.getIcon() !== icon) {
        item.marker.setIcon(icon);
      }

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
            if (!allCats.some((existing) => String(existing.id) === String(c.id))) {
              allCats.push({ ...c, group_id: c.group_id || g.id });
            }
          });
        }
      });
    }

    if (Array.isArray(mapData?.groups) && mapData.groups.length > 0) {
      return mapData.groups.map((g) => {
        let cats = Array.isArray(g.categories) && g.categories.length > 0 ? [...g.categories] : [];
        if (cats.length === 0) {
          cats = allCats.filter(
            (c) =>
              String(c.group_id) === String(g.id) ||
              (c as any).group_title === g.title ||
              ((c as any).group && String((c as any).group.id) === String(g.id))
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
            width: isOverlay && overlayShape === "circle" ? "100%" : isOverlay ? 300 : 360,
            minWidth: isOverlay && overlayShape === "circle" ? "100%" : isOverlay ? 300 : 360,
            maxWidth: isOverlay && overlayShape !== "circle" ? "85vw" : undefined,
            height: "100%",
            backgroundColor: isOverlay ? "rgba(8, 10, 15, 0.98)" : "#000000",
            backdropFilter: isOverlay ? "blur(16px)" : undefined,
            borderRight: isOverlay && overlayShape === "circle" ? "none" : "1px solid #1a1a1a",
            borderRadius: isOverlay && overlayShape === "circle" ? "50%" : undefined,
            display: "flex",
            flexDirection: "column",
            position: isOverlay ? "absolute" : "relative",
            inset: isOverlay && overlayShape === "circle" ? 0 : undefined,
            left: isOverlay && overlayShape !== "circle" ? 0 : undefined,
            top: isOverlay && overlayShape !== "circle" ? 0 : undefined,
            bottom: isOverlay && overlayShape !== "circle" ? 0 : undefined,
            zIndex: 1200,
            fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
            color: "#ffffff",
            userSelect: "none",
            boxShadow: isOverlay && overlayShape !== "circle" ? "5px 0 28px rgba(0,0,0,0.85)" : undefined,
            padding: isOverlay && overlayShape === "circle" ? "64px 14px 48px 14px" : undefined,
            overflowY: isOverlay && overlayShape === "circle" ? "auto" : "hidden",
            overflowX: "hidden",
          }}
        >
          {/* Top Header & Logo */}
          <Box
            style={{
              padding: isOverlay && overlayShape === "circle" ? "4px 6px 8px" : "14px 16px 10px",
              borderBottom: "1px solid #141414",
              textAlign: "center",
              position: "relative",
              flexShrink: 0,
            }}
          >
            {isOverlay && overlayShape === "circle" ? (
              <Flex justify="space-between" align="center" style={{ marginBottom: 6, padding: "0 2px" }}>
                <Text
                  style={{
                    fontSize: 11.5,
                    fontWeight: 800,
                    color: "#60a5fa",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  MAP FILTERS
                </Text>
                <Button
                  size="compact-xs"
                  variant="filled"
                  color="red"
                  leftSection={<X size={11} />}
                  onClick={handleCloseSidebar}
                  style={{ fontSize: 10, height: 22, padding: "0 8px", cursor: "pointer" }}
                >
                  EXIT
                </Button>
              </Flex>
            ) : (
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
            )}

            <Text
              style={{
                fontSize: isOverlay && overlayShape === "circle" ? 14 : 22,
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
            {gameTitle || effectiveGameSlug.replace(/-/g, " ")} INTERACTIVE MAP
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
                  {downloadProgress?.status || "Downloading tiles & assets..."}
                </Text>
              </Box>
            ) : isOfflineReady ? (
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

            {/* Live Game Character Tracker Panel */}
            {isTrackerSupported && (
              <Box
                style={{
                  marginTop: 8,
                  backgroundColor: isPlayerTracked
                    ? "rgba(6, 40, 23, 0.7)"
                    : isGameRunningTracker
                      ? "rgba(40, 30, 6, 0.7)"
                      : "rgba(18, 20, 28, 0.7)",
                  border: `1px solid ${
                    isPlayerTracked
                      ? "#166534"
                      : isGameRunningTracker
                        ? "#854d0e"
                        : "#262e3d"
                  }`,
                  borderRadius: 4,
                  padding: "8px 10px",
                }}
              >
                <Flex justify="space-between" align="center">
                  <Flex align="center" gap={6}>
                    <Radio
                      size={13}
                      color={
                        isPlayerTracked
                          ? "#22c55e"
                          : isGameRunningTracker
                            ? "#eab308"
                            : "#94a3b8"
                      }
                      className={
                        isPlayerTracked ? "player-beacon-pulse" : undefined
                      }
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        color: isPlayerTracked
                          ? "#4ade80"
                          : isGameRunningTracker
                            ? "#fde047"
                            : "#cbd5e1",
                        textTransform: "uppercase",
                      }}
                    >
                      {isPlayerTracked
                        ? `GPS: ${livePlayerPos?.district || "ACTIVE"}`
                        : isGameRunningTracker
                          ? "GAME RUNNING"
                          : "LIVE GPS TRACKER"}
                    </Text>
                  </Flex>
                  <UnstyledButton
                    onClick={toggleTracking}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: isTrackerActive ? "#4ade80" : "#94a3b8",
                      letterSpacing: 0.5,
                      cursor: "pointer",
                    }}
                  >
                    {isTrackerActive ? "ENABLED" : "ENABLE"}
                  </UnstyledButton>
                </Flex>

                {isPlayerTracked && livePlayerPos?.map_lat != null && (
                  <Flex
                    justify="space-between"
                    align="center"
                    style={{
                      marginTop: 6,
                      paddingTop: 6,
                      borderTop: "1px solid rgba(22, 101, 52, 0.4)",
                    }}
                  >
                    <UnstyledButton
                      onClick={() => {
                        if (
                          mapInstanceRef.current &&
                          livePlayerPos.map_lat != null &&
                          livePlayerPos.map_lng != null
                        ) {
                          mapInstanceRef.current.setView(
                            [livePlayerPos.map_lat, livePlayerPos.map_lng],
                            Math.max(mapInstanceRef.current.getZoom(), 11),
                            { animate: true },
                          );
                          setFollowPlayer(true);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: "#86efac",
                        letterSpacing: 0.5,
                        cursor: "pointer",
                      }}
                    >
                      <Crosshair size={11} />
                      CENTER CHARACTER
                    </UnstyledButton>
                    <UnstyledButton
                      onClick={toggleFollowPlayer}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: followPlayer ? "#22c55e" : "#64748b",
                        letterSpacing: 0.5,
                        cursor: "pointer",
                      }}
                    >
                      <Navigation size={11} />
                      {followPlayer ? "AUTO-PAN: ON" : "AUTO-PAN: OFF"}
                    </UnstyledButton>
                    <UnstyledButton
                      onClick={() => setShowCalibrationTool((prev) => !prev)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: showCalibrationTool ? "#60a5fa" : "#94a3b8",
                        letterSpacing: 0.5,
                        cursor: "pointer",
                      }}
                    >
                      <Sliders size={11} />
                      {showCalibrationTool ? "SCALE: ON" : "SCALE"}
                    </UnstyledButton>
                  </Flex>
                )}
              </Box>
            )}
          </Box>
        </Box>

        {/* SHOW ALL / HIDE ALL Bar */}
        <Flex
          justify="center"
          align="center"
          gap={32}
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid #141414",
            backgroundColor: "#050505",
          }}
        >
          <UnstyledButton
            onClick={showAllCategories}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
            }}
          >
            SHOW ALL
          </UnstyledButton>

          <UnstyledButton
            onClick={hideAllCategories}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
            }}
          >
            HIDE ALL
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
            flex: isOverlay && overlayShape === "circle" ? "none" : 1,
            overflowY: isOverlay && overlayShape === "circle" ? "visible" : "auto",
            padding: isOverlay && overlayShape === "circle" ? "10px 4px" : "12px 16px",
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
                    title={isGroupVisible ? "Click to hide all items in this category group" : "Click to show all items in this category group"}
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
                        <span
                          className={`cat-icon icon-${iconDash} icon-${iconUnder}`}
                          style={{
                            fontSize: 13,
                            width: 15,
                            height: 15,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            color: isVisible ? "#ffffff" : "#666666",
                          }}
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
                            fontFamily: "'Oswald', 'Arial Narrow', sans-serif",
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
            borderRadius: isOverlay && overlayShape === "circle" ? 8 : undefined,
            marginTop: isOverlay && overlayShape === "circle" ? 12 : 0,
            marginBottom: isOverlay && overlayShape === "circle" ? 16 : 0,
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

        {/* Top Floating Header Controls */}
        {!(isOverlay && overlayShape === "circle") && (
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
            <Group gap="xs" style={{ pointerEvents: "auto" }}>
              <Tooltip label={isSidebarOpen ? "Hide Filters & Categories" : "Show Filters & Categories"} withArrow>
                <ActionIcon
                  variant="filled"
                  color="dark"
                  size="lg"
                  radius="xl"
                  onClick={handleToggleSidebar}
                  style={{
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

              {/* Sub-map Switcher */}
              {availableMaps && availableMaps.length > 1 && (
                <Flex
                  gap={4}
                  style={{
                    backgroundColor: "rgba(12, 14, 18, 0.92)",
                    padding: "4px 6px",
                    borderRadius: 8,
                    border: "1px solid #262b36",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {availableMaps.map((m) => {
                    const isSelected =
                      (currentMapSlug || effectiveMapSlug) === m.slug;
                    return (
                      <UnstyledButton
                        key={m.slug}
                        onClick={() => onSelectMap?.(m.slug)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          backgroundColor: isSelected ? "#e03131" : "transparent",
                          color: isSelected ? "#fff" : "#a0aec0",
                          transition: "all 0.15s",
                        }}
                      >
                        {m.title}
                      </UnstyledButton>
                    );
                  })}
                </Flex>
              )}
            </Group>

            {/* Top Right Actions: Overlay Popout & Close */}
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
        )}

        {/* Floating Calibration & Scale Visualizer Widget */}
        {showCalibrationTool && (
          <Box
            style={{
              position: "absolute",
              bottom: 24,
              left: 24,
              zIndex: 1100,
              backgroundColor: "rgba(10, 14, 23, 0.96)",
              border: "1px solid #25334d",
              borderRadius: 8,
              padding: "12px 14px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.85)",
              backdropFilter: "blur(12px)",
              width: 340,
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
              userSelect: "none",
            }}
          >
            {/* Header */}
            <Flex
              justify="space-between"
              align="center"
              style={{
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: "1px solid #1e293b",
              }}
            >
              <Flex align="center" gap={6}>
                <Sliders size={14} color="#60a5fa" />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#93c5fd",
                    letterSpacing: 0.5,
                    fontFamily: "'Oswald', sans-serif",
                    textTransform: "uppercase",
                  }}
                >
                  MAP ALIGNMENT CALIBRATOR
                </Text>
              </Flex>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setShowCalibrationTool(false);
                  setCalibAnchorSlot(null);
                }}
                style={{ cursor: "pointer", color: "#cbd5e1" }}
              >
                <X size={13} color="#cbd5e1" />
              </ActionIcon>
            </Flex>

            {/* Navigation Tabs (Manual vs 2-Point Auto) */}
            <Flex
              gap={4}
              style={{
                marginBottom: 10,
                backgroundColor: "#060911",
                padding: 4,
                borderRadius: 6,
                border: "1px solid #1e293b",
              }}
            >
              <UnstyledButton
                onClick={() => setActiveCalibTab("manual")}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 4,
                  fontSize: 10.5,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  backgroundColor:
                    activeCalibTab === "manual" ? "#0284c7" : "transparent",
                  color: activeCalibTab === "manual" ? "#ffffff" : "#94a3b8",
                  transition: "all 0.15s",
                  cursor: "pointer",
                }}
              >
                <Sliders size={12} />
                MANUAL CONTROLS
              </UnstyledButton>
              <UnstyledButton
                onClick={() => setActiveCalibTab("auto")}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 4,
                  fontSize: 10.5,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  backgroundColor:
                    activeCalibTab === "auto" ? "#e11d48" : "transparent",
                  color: activeCalibTab === "auto" ? "#ffffff" : "#94a3b8",
                  transition: "all 0.15s",
                  cursor: "pointer",
                }}
              >
                <Target size={12} />
                2-POINT AUTO-FIT
              </UnstyledButton>
            </Flex>

            {/* Mouse / Pin Inspector */}
            <Box
              style={{
                backgroundColor: "#060911",
                border: "1px solid #1e293b",
                borderRadius: 4,
                padding: "6px 8px",
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: "#64748b",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 2,
                }}
              >
                CURSOR / INSPECTOR GAME COORDS
              </Text>
              {mouseCoord ? (
                <Flex justify="space-between" align="center">
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#e2e8f0",
                      fontFamily: "monospace",
                    }}
                  >
                    X:{" "}
                    <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                      {mouseCoord.x.toFixed(1)}m
                    </span>{" "}
                    | Y:{" "}
                    <span style={{ color: "#f43f5e", fontWeight: 700 }}>
                      {mouseCoord.y.toFixed(1)}m
                    </span>
                  </Text>
                  <Text
                    style={{
                      fontSize: 9.5,
                      color: "#94a3b8",
                      fontFamily: "monospace",
                    }}
                  >
                    ({mouseCoord.lat.toFixed(4)}, {mouseCoord.lng.toFixed(4)})
                  </Text>
                </Flex>
              ) : (
                <Text
                  style={{
                    fontSize: 10,
                    color: "#64748b",
                    fontStyle: "italic",
                  }}
                >
                  Move cursor over map to inspect game units
                </Text>
              )}
            </Box>

            {/* Overlay Toggles */}
            <Flex gap={6} style={{ marginBottom: 8 }}>
              <UnstyledButton
                onClick={() => setShowGridOverlay((v) => !v)}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  borderRadius: 4,
                  backgroundColor: showGridOverlay
                    ? "rgba(59, 130, 246, 0.2)"
                    : "#0f172a",
                  border: `1px solid ${showGridOverlay ? "#3b82f6" : "#1e293b"}`,
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: showGridOverlay ? "#60a5fa" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <Grid size={11} />
                GRID: {showGridOverlay ? "ON" : "OFF"}
              </UnstyledButton>

              <UnstyledButton
                onClick={() => setShowDistrictBoxes((v) => !v)}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  borderRadius: 4,
                  backgroundColor: showDistrictBoxes
                    ? "rgba(34, 197, 94, 0.2)"
                    : "#0f172a",
                  border: `1px solid ${showDistrictBoxes ? "#22c55e" : "#1e293b"}`,
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: showDistrictBoxes ? "#4ade80" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <Maximize2 size={11} />
                DISTRICTS: {showDistrictBoxes ? "ON" : "OFF"}
              </UnstyledButton>
            </Flex>

            {activeCalibTab === "manual" ? (
              <>
                {/* Steppers Box */}
                <Box
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    marginBottom: 8,
                  }}
                >
                  {/* Rotation Angle */}
                  <Flex justify="space-between" align="center">
                    <Flex align="center" gap={4}>
                      <RotateCw size={11} color="#a855f7" />
                      <Text
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: "#c084fc",
                        }}
                      >
                        Rotation Angle (θ):
                      </Text>
                    </Flex>
                    <Flex align="center" gap={3}>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibRotation((v) => +(v - 0.5).toFixed(2))
                        }
                      >
                        -
                      </ActionIcon>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#f8fafc",
                          fontFamily: "monospace",
                          width: 68,
                          textAlign: "center",
                        }}
                      >
                        {calibRotation.toFixed(1)}°
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibRotation((v) => +(v + 0.5).toFixed(2))
                        }
                      >
                        +
                      </ActionIcon>
                    </Flex>
                  </Flex>

                  {/* Center Lat */}
                  <Flex justify="space-between" align="center">
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "#94a3b8",
                      }}
                    >
                      Center Lat (Y):
                    </Text>
                    <Flex align="center" gap={3}>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibCenterLat((v) => +(v - 0.0005).toFixed(6))
                        }
                      >
                        -
                      </ActionIcon>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#f8fafc",
                          fontFamily: "monospace",
                          width: 68,
                          textAlign: "center",
                        }}
                      >
                        {calibCenterLat.toFixed(6)}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibCenterLat((v) => +(v + 0.0005).toFixed(6))
                        }
                      >
                        +
                      </ActionIcon>
                    </Flex>
                  </Flex>

                  {/* Center Lng */}
                  <Flex justify="space-between" align="center">
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "#94a3b8",
                      }}
                    >
                      Center Lng (X):
                    </Text>
                    <Flex align="center" gap={3}>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibCenterLng((v) => +(v - 0.0005).toFixed(6))
                        }
                      >
                        -
                      </ActionIcon>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#f8fafc",
                          fontFamily: "monospace",
                          width: 68,
                          textAlign: "center",
                        }}
                      >
                        {calibCenterLng.toFixed(6)}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibCenterLng((v) => +(v + 0.0005).toFixed(6))
                        }
                      >
                        +
                      </ActionIcon>
                    </Flex>
                  </Flex>

                  {/* Scale X */}
                  <Flex justify="space-between" align="center">
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "#38bdf8",
                      }}
                    >
                      Scale X (Width):
                    </Text>
                    <Flex align="center" gap={3}>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibScaleX((v) => +(v - 0.000004).toFixed(6))
                        }
                      >
                        -
                      </ActionIcon>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#f8fafc",
                          fontFamily: "monospace",
                          width: 68,
                          textAlign: "center",
                        }}
                      >
                        {calibScaleX.toFixed(6)}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibScaleX((v) => +(v + 0.000004).toFixed(6))
                        }
                      >
                        +
                      </ActionIcon>
                    </Flex>
                  </Flex>

                  {/* Scale Y */}
                  <Flex justify="space-between" align="center">
                    <Text
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "#f43f5e",
                      }}
                    >
                      Scale Y (Height):
                    </Text>
                    <Flex align="center" gap={3}>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibScaleY((v) => +(v - 0.000004).toFixed(6))
                        }
                      >
                        -
                      </ActionIcon>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#f8fafc",
                          fontFamily: "monospace",
                          width: 68,
                          textAlign: "center",
                        }}
                      >
                        {calibScaleY.toFixed(6)}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="default"
                        onClick={() =>
                          setCalibScaleY((v) => +(v + 0.000004).toFixed(6))
                        }
                      >
                        +
                      </ActionIcon>
                    </Flex>
                  </Flex>
                </Box>

                {/* Axis Invert / Swap Controls */}
                <Flex gap={4} style={{ marginBottom: 8 }}>
                  <UnstyledButton
                    onClick={() => setCalibInvertX((v) => !v)}
                    style={{
                      flex: 1,
                      padding: "3px 4px",
                      borderRadius: 3,
                      fontSize: 9.5,
                      fontWeight: 700,
                      backgroundColor: calibInvertX
                        ? "rgba(239, 68, 68, 0.2)"
                        : "#0f172a",
                      border: `1px solid ${calibInvertX ? "#ef4444" : "#1e293b"}`,
                      color: calibInvertX ? "#f87171" : "#64748b",
                      textAlign: "center",
                    }}
                  >
                    INVERT X: {calibInvertX ? "YES" : "NO"}
                  </UnstyledButton>
                  <UnstyledButton
                    onClick={() => setCalibInvertY((v) => !v)}
                    style={{
                      flex: 1,
                      padding: "3px 4px",
                      borderRadius: 3,
                      fontSize: 9.5,
                      fontWeight: 700,
                      backgroundColor: calibInvertY
                        ? "rgba(239, 68, 68, 0.2)"
                        : "#0f172a",
                      border: `1px solid ${calibInvertY ? "#ef4444" : "#1e293b"}`,
                      color: calibInvertY ? "#f87171" : "#64748b",
                      textAlign: "center",
                    }}
                  >
                    INVERT Y: {calibInvertY ? "YES" : "NO"}
                  </UnstyledButton>
                  <UnstyledButton
                    onClick={() => setCalibSwapXY((v) => !v)}
                    style={{
                      flex: 1,
                      padding: "3px 4px",
                      borderRadius: 3,
                      fontSize: 9.5,
                      fontWeight: 700,
                      backgroundColor: calibSwapXY
                        ? "rgba(168, 85, 247, 0.2)"
                        : "#0f172a",
                      border: `1px solid ${calibSwapXY ? "#a855f7" : "#1e293b"}`,
                      color: calibSwapXY ? "#c084fc" : "#64748b",
                      textAlign: "center",
                    }}
                  >
                    SWAP X/Y
                  </UnstyledButton>
                </Flex>
              </>
            ) : (
              /* 2-Point Auto-Fit Tab */
              <Box
                style={{
                  backgroundColor: "#060911",
                  border: "1px solid #1e293b",
                  borderRadius: 4,
                  padding: "8px",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 9.5,
                    color: "#94a3b8",
                    marginBottom: 6,
                    lineHeight: 1.3,
                  }}
                >
                  Stand at 2 distant landmarks in-game, capture both points, and
                  click solve to automatically calculate exact scale & rotation
                  angle.
                </Text>

                {/* Point 1 */}
                <Flex
                  justify="space-between"
                  align="center"
                  style={{ marginBottom: 4 }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: anchorP1 ? "#38bdf8" : "#64748b",
                    }}
                  >
                    {anchorP1
                      ? `P1: (${anchorP1.gameX.toFixed(0)}, ${anchorP1.gameY.toFixed(0)})`
                      : "P1: Not Set"}
                  </Text>
                  <UnstyledButton
                    onClick={() =>
                      setCalibAnchorSlot(calibAnchorSlot === 1 ? null : 1)
                    }
                    style={{
                      padding: "3px 8px",
                      borderRadius: 3,
                      fontSize: 9.5,
                      fontWeight: 700,
                      backgroundColor:
                        calibAnchorSlot === 1 ? "#0284c7" : "#1e293b",
                      color: "#ffffff",
                    }}
                  >
                    {calibAnchorSlot === 1 ? "CLICK MAP NOW" : "SET P1"}
                  </UnstyledButton>
                </Flex>

                {/* Point 2 */}
                <Flex
                  justify="space-between"
                  align="center"
                  style={{ marginBottom: 8 }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: anchorP2 ? "#ec4899" : "#64748b",
                    }}
                  >
                    {anchorP2
                      ? `P2: (${anchorP2.gameX.toFixed(0)}, ${anchorP2.gameY.toFixed(0)})`
                      : "P2: Not Set"}
                  </Text>
                  <UnstyledButton
                    onClick={() =>
                      setCalibAnchorSlot(calibAnchorSlot === 2 ? null : 2)
                    }
                    style={{
                      padding: "3px 8px",
                      borderRadius: 3,
                      fontSize: 9.5,
                      fontWeight: 700,
                      backgroundColor:
                        calibAnchorSlot === 2 ? "#db2777" : "#1e293b",
                      color: "#ffffff",
                    }}
                  >
                    {calibAnchorSlot === 2 ? "CLICK MAP NOW" : "SET P2"}
                  </UnstyledButton>
                </Flex>

                {/* Solve Button */}
                <Button
                  size="xs"
                  variant="filled"
                  color="pink"
                  fullWidth
                  disabled={!anchorP1 || !anchorP2}
                  onClick={() => {
                    if (!anchorP1 || !anchorP2) return;
                    const dxGame = anchorP2.gameX - anchorP1.gameX;
                    const dyGame = anchorP2.gameY - anchorP1.gameY;
                    const distGame = Math.hypot(dxGame, dyGame);

                    const dLngMap = anchorP2.mapLng - anchorP1.mapLng;
                    const dLatMap = anchorP2.mapLat - anchorP1.mapLat;
                    const distMap = Math.hypot(dLngMap, dLatMap);

                    if (distGame < 1 || distMap < 0.00001) return;

                    const angleGame = Math.atan2(dyGame, dxGame);
                    const angleMap = Math.atan2(dLatMap, dLngMap);
                    let rotDeg = ((angleMap - angleGame) * 180) / Math.PI;

                    while (rotDeg > 180) rotDeg -= 360;
                    while (rotDeg < -180) rotDeg += 360;

                    const scale = distMap / distGame;
                    const rad = (rotDeg * Math.PI) / 180;
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);

                    const rx1 = anchorP1.gameX * cos - anchorP1.gameY * sin;
                    const ry1 = anchorP1.gameX * sin + anchorP1.gameY * cos;

                    const cLat = anchorP1.mapLat - ry1 * scale;
                    const cLng = anchorP1.mapLng - rx1 * scale;

                    setCalibRotation(+rotDeg.toFixed(2));
                    setCalibScaleX(+scale.toFixed(6));
                    setCalibScaleY(+scale.toFixed(6));
                    setCalibCenterLat(+cLat.toFixed(6));
                    setCalibCenterLng(+cLng.toFixed(6));
                    setCalibInvertX(false);
                    setCalibInvertY(false);
                    setCalibSwapXY(false);
                  }}
                  style={{ fontSize: 10, fontWeight: 700, height: 26 }}
                >
                  CALCULATE & FIT ROTATION + SCALE
                </Button>
              </Box>
            )}

            {/* Actions Bar */}
            <Flex gap={6}>
              <Button
                size="xs"
                variant="filled"
                color="blue"
                leftSection={
                  copiedRustCode ? <Check size={11} /> : <Copy size={11} />
                }
                fullWidth
                onClick={() => {
                  const code = `let lat_center = ${calibCenterLat.toFixed(6)};\nlet lng_center = ${calibCenterLng.toFixed(6)};\nlet lat_scale = ${calibScaleY.toFixed(6)};\nlet lng_scale = ${calibScaleX.toFixed(6)};\nlet rotation_deg = ${calibRotation.toFixed(2)};\nlet invert_x = ${calibInvertX};\nlet invert_y = ${calibInvertY};\nlet swap_xy = ${calibSwapXY};`;
                  navigator.clipboard.writeText(code);
                  setCopiedRustCode(true);
                  setTimeout(() => setCopiedRustCode(false), 2000);
                }}
                style={{ fontSize: 10.5, fontWeight: 700, height: 26 }}
              >
                {copiedRustCode ? "COPIED RUST CODE!" : "COPY RUST CODE"}
              </Button>

              <ActionIcon
                size={26}
                variant="default"
                title="Reset to default calibration"
                onClick={() => {
                  setCalibCenterLat(1.177677);
                  setCalibCenterLng(-1.252454);
                  setCalibScaleX(0.000453);
                  setCalibScaleY(0.000453);
                  setCalibRotation(0.82);
                  setCalibInvertX(false);
                  setCalibInvertY(false);
                  setCalibSwapXY(false);
                  setAnchorP1(null);
                  setAnchorP2(null);
                }}
              >
                <RotateCcw size={12} />
              </ActionIcon>
            </Flex>
          </Box>
        )}
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
