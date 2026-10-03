"use client";

import React, { useEffect, useState } from "react";
import { Modal, Center, Loader, Text, Stack, Button, ActionIcon, Box, Group } from "@mantine/core";
import { X, AlertCircle } from "lucide-react";
import { MapViewer } from "./MapViewer";
import { MapData, MapItem, MapViewerModalProps } from "./types";
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
import { openMapOverlay } from "../../lib/mapOverlay";

export function MapViewerModal({
  opened,
  onClose,
  gameSlug,
  mapSlug,
  gameTitle,
  mapData: initialMapData,
  storageKey,
  size = "95vw",
  height = "90vh",
  minZoom,
  maxZoom,
}: MapViewerModalProps) {
  const [activeMapSlug, setActiveMapSlug] = useState<string>(mapSlug || "default");
  const [availableMaps, setAvailableMaps] = useState<MapItem[]>([]);
  const [loadedMapData, setLoadedMapData] = useState<MapData | null>(initialMapData || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadedMapData(initialMapData || null);
    setAvailableMaps([]);
    setActiveMapSlug(mapSlug || "default");
    setError(null);
    setIsLoading(false);
  }, [gameSlug, initialMapData]);

  useEffect(() => {
    if (mapSlug) {
      setActiveMapSlug(mapSlug);
    }
  }, [mapSlug]);

  useEffect(() => {
    if (initialMapData) {
      setLoadedMapData(initialMapData);
      return;
    }

    if (!opened || !gameSlug) return;

    let isMounted = true;

    async function fetchOnlineMapData() {
      const cleanGameSlug = gameSlug
        ? gameSlug.includes("--")
          ? gameSlug.split("--")[0]
          : gameSlug
        : "";
      let resolvedMapSlug = activeMapSlug || mapSlug || "default";

      let hadOfflineData = false;
      let offlineCached: any = null;

      // 1. Instant Offline Load (0 delay)
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
        // 2. Online fetch & catalog resolution in background
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

        // Identify Map ID
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

        // Fetch full map dataset and HTML
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

        // Extract sprite coordinates & dimensions from HTML
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

        // Retain cached sprite positions if offline/html extraction didn't yield them
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

        // Categories
        const categories: any[] = [];
        const rawCategories =
          (Array.isArray(rawData.categories) && rawData.categories.length > 0)
            ? rawData.categories
            : (Array.isArray(htmlMapData?.categories) && htmlMapData.categories.length > 0)
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

        // Locations
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
        const primaryTileSet = tileSets[0] || {};
        const tilePath = primaryTileSet.path || `${cleanGameSlug}/${targetMapSlug}/default-v3`;
        const tileExt = primaryTileSet.extension || "jpg";
        const tilePattern = primaryTileSet.pattern
          ? primaryTileSet.pattern.startsWith("http")
            ? primaryTileSet.pattern
            : `https://tiles.mapgenie.io/games/${primaryTileSet.pattern}`
          : undefined;

        const resolvedGame = rawData.game || htmlMapData?.game || gameData || {};
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
          max_zoom: primaryTileSet.tiles_max_zoom ?? primaryTileSet.max_zoom ?? rawMap.max_zoom ?? 16,
          start_lat: startLat,
          start_lng: startLng,
          center: [startLat, startLng] as [number, number],
          markerSpritePositions:
            Object.keys(extractedSpritePositions).length > 0 ? extractedSpritePositions : undefined,
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

        // Always save fresh online map data to offline IndexedDB
        saveOfflineMapData(cleanGameSlug, targetMapSlug, finalMapData).catch(() => {});

        // Pre-cache fonts, CSS, and sprite sheet in the background
        if (mapConfig.markerImagesUrl) {
          fetchAndCacheOfflineAsset(`sprite_${cleanGameSlug}`, mapConfig.markerImagesUrl).catch(() => {});
        }
        if (mapConfig.iconsCssUrl) {
          fetchAndCacheOfflineAsset(`css_theme_${cleanGameSlug}`, mapConfig.iconsCssUrl).catch(() => {});
        }
        if (mapConfig.icomoonUrl) {
          fetchAndCacheOfflineAsset(`font_icomoon_${cleanGameSlug}`, mapConfig.icomoonUrl).catch(() => {});
        }
        if (mapConfig.mgIconsUrl) {
          fetchAndCacheOfflineAsset(`font_mg_icons_${cleanGameSlug}`, mapConfig.mgIconsUrl).catch(() => {});
        }

        if (isMounted) {
          setLoadedMapData(finalMapData);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          if (!hadOfflineData) {
            console.warn("Failed to load map data from MapGenie:", err);
            setError(err.message || "Unable to fetch map data");
            setIsLoading(false);
          }
        }
      }
    }

    fetchOnlineMapData();

    return () => {
      isMounted = false;
    };
  }, [opened, gameSlug, mapSlug, activeMapSlug, initialMapData]);

  const activeStorageKey =
    storageKey || (gameSlug ? `map_found_${gameSlug}_${activeMapSlug || mapSlug || "default"}` : undefined);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size={size}
      centered
      radius="md"
      withCloseButton={false}
      padding={0}
      overlayProps={{ backgroundOpacity: 0.75 }}
      styles={{
        content: {
          backgroundColor: "#000000",
          overflow: "hidden",
          height,
          maxHeight: height,
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.95)",
          border: "1px solid #222",
        },
        body: {
          padding: 0,
          height: "100%",
        },
      }}
    >
      {isLoading ? (
        <Box style={{ height: "100%", width: "100%", position: "relative", backgroundColor: "#000" }}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            radius="xl"
            pos="absolute"
            top={16}
            right={16}
            style={{ zIndex: 10 }}
            onClick={onClose}
          >
            <X size={18} />
          </ActionIcon>
          <Center style={{ height: "100%", width: "100%" }}>
            <Stack align="center" gap="sm">
              <Loader color="red" size="md" />
              <Text size="sm" c="dimmed">
                Loading interactive map...
              </Text>
              {gameTitle && (
                <Text size="xs" c="gray.6">
                  {gameTitle}
                </Text>
              )}
            </Stack>
          </Center>
        </Box>
      ) : error ? (
        <Box style={{ height: "100%", width: "100%", position: "relative", backgroundColor: "#0a0a0a" }}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            radius="xl"
            pos="absolute"
            top={16}
            right={16}
            style={{ zIndex: 10 }}
            onClick={onClose}
          >
            <X size={18} />
          </ActionIcon>
          <Center style={{ height: "100%", width: "100%" }}>
            <Stack align="center" gap="sm" style={{ maxWidth: 400, textAlign: "center", padding: 24 }}>
              <AlertCircle size={40} color="#e03131" />
              <Text size="md" fw={600} c="white">
                Map Not Available
              </Text>
              <Text size="xs" c="dimmed">
                {error}
              </Text>
              <Group gap="xs" mt="xs">
                <Button size="xs" variant="default" onClick={onClose}>
                  Close
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="red"
                  onClick={() => {
                    setError(null);
                    setIsLoading(true);
                  }}
                >
                  Retry
                </Button>
              </Group>
            </Stack>
          </Center>
        </Box>
      ) : loadedMapData ? (
        <MapViewer
          mapData={loadedMapData}
          storageKey={activeStorageKey}
          gameSlug={gameSlug}
          mapSlug={activeMapSlug}
          availableMaps={availableMaps}
          currentMapSlug={activeMapSlug}
          minZoom={minZoom}
          maxZoom={maxZoom}
          onSelectMap={(newSlug) => setActiveMapSlug(newSlug)}
          onOpenOverlay={() => {
            openMapOverlay({
              gameSlug: gameSlug || "",
              mapSlug: activeMapSlug || mapSlug || "default",
              gameTitle,
              minZoom,
              maxZoom,
            });
            onClose();
          }}
          onClose={onClose}
          style={{ height: "100%", width: "100%" }}
        />
      ) : null}
    </Modal>
  );
}
