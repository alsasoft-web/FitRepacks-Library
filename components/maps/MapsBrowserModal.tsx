"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Modal,
  Box,
  Group,
  Stack,
  Text,
  Title,
  TextInput,
  SimpleGrid,
  Card,
  Badge,
  Button,
  ActionIcon,
  ScrollArea,
  Tooltip,
  Loader,
  Center,
  Menu,
} from "@mantine/core";
import {
  Search,
  X,
  RefreshCw,
  ExternalLink,
  MapPin,
  ChevronDown,
  Layers,
  Map as MapIcon,
  PictureInPicture2,
} from "lucide-react";
import { GameMapInfo, useAllGameMaps } from "../../lib/gameMaps";
import { MapViewerModal } from "./MapViewerModal";
import { openInBrowser } from "../../lib/openUrl";
import { openMapOverlay } from "../../lib/mapOverlay";

interface MapsBrowserModalProps {
  opened: boolean;
  onClose: () => void;
  onSelectMap?: (gameSlug: string, mapSlug: string, gameTitle: string) => void;
}

interface GameGroupItem {
  gameTitle: string;
  gameSlug: string;
  maps: GameMapInfo[];
  primaryMap: GameMapInfo;
  totalLocations: number;
}

// ---------------------------------------------------------------------------
// Game Map Card
// ---------------------------------------------------------------------------

interface GameMapGridCardProps {
  group: GameGroupItem;
  onOpenMap: (gameSlug: string, mapSlug: string, gameTitle: string) => void;
}

const GameMapGridCard = React.memo(function GameMapGridCard({
  group,
  onOpenMap,
}: GameMapGridCardProps) {
  const { gameTitle, gameSlug, maps, primaryMap, totalLocations } = group;
  const primaryMSlug = primaryMap.map_slug || "default";

  const imageCandidates = useMemo(() => {
    const list: string[] = [];
    if (primaryMap.game_card && primaryMap.game_card.startsWith("http")) list.push(primaryMap.game_card);
    if (primaryMap.game_image && primaryMap.game_image.startsWith("http")) list.push(primaryMap.game_image);
    if (primaryMap.thumbnail_url && primaryMap.thumbnail_url.startsWith("http")) list.push(primaryMap.thumbnail_url);
    list.push(`https://media.mapgenie.io/v2/assets/prod/games/${gameSlug}/gamecard.jpg`);
    list.push(`https://media.mapgenie.io/v2/assets/prod/games/${gameSlug}/preview.jpg`);
    list.push(`https://cdn.mapgenie.io/images/games/${gameSlug}/gamecard.jpg`);
    return Array.from(new Set(list.filter(Boolean)));
  }, [primaryMap, gameSlug]);

  const [imgIdx, setImgIdx] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const currentImg = imageCandidates[imgIdx] || "";

  const handleImgError = useCallback(() => {
    if (imgIdx + 1 < imageCandidates.length) {
      setImgIdx((prev) => prev + 1);
    } else {
      setImgFailed(true);
    }
  }, [imgIdx, imageCandidates.length]);

  const hasMultipleMaps = maps.length > 1;

  return (
    <Card
      radius="md"
      padding={0}
      style={{
        backgroundColor: "#11141c",
        border: "1px solid #1e2433",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
      }}
      styles={{
        root: {
          "&:hover": {
            transform: "translateY(-3px)",
            borderColor: "#3b4661",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          },
        },
      }}
    >
      {/* Artwork Header */}
      <Box
        style={{
          position: "relative",
          width: "100%",
          height: 140,
          backgroundColor: "#090b10",
          overflow: "hidden",
          cursor: "pointer",
        }}
        onClick={() => onOpenMap(gameSlug, primaryMSlug, gameTitle)}
      >
        {!imgFailed && currentImg ? (
          <img
            src={currentImg}
            alt={gameTitle}
            onError={handleImgError}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <Center style={{ height: "100%", width: "100%", backgroundColor: "#141721" }}>
            <MapIcon size={36} color="#3b4661" />
          </Center>
        )}

        {/* Gradient Overlay */}
        <Box
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(9,11,16,0.95) 100%)",
          }}
        />

        {/* Badge - Locations */}
        {totalLocations > 0 && (
          <Badge
            size="xs"
            variant="filled"
            color="dark"
            leftSection={<MapPin size={10} />}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: "rgba(10,12,18,0.85)",
              border: "1px solid #283042",
              color: "#e2e8f0",
              fontWeight: 700,
            }}
          >
            {totalLocations.toLocaleString()} locations
          </Badge>
        )}

        {/* Multi-map badge */}
        {hasMultipleMaps && (
          <Badge
            size="xs"
            variant="filled"
            color="red"
            leftSection={<Layers size={10} />}
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              fontWeight: 700,
            }}
          >
            {maps.length} Maps
          </Badge>
        )}
      </Box>

      {/* Card Content */}
      <Box style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column" }}>
        <Text
          fw={700}
          size="sm"
          c="white"
          lineClamp={1}
          title={gameTitle}
          style={{ cursor: "pointer" }}
          onClick={() => onOpenMap(gameSlug, primaryMSlug, gameTitle)}
        >
          {gameTitle}
        </Text>

        <Text size="xs" c="dimmed" mt={2} lineClamp={1}>
          {hasMultipleMaps
            ? maps.map((m) => m.title.replace(new RegExp(`^${gameTitle}\\s*-\\s*`, "i"), "")).join(", ")
            : primaryMap.title}
        </Text>

        {/* Action Buttons */}
        <Group gap={6} mt="auto" pt={12}>
          {hasMultipleMaps ? (
            <Menu shadow="md" width={220} position="bottom-start">
              <Menu.Target>
                <Button
                  size="xs"
                  variant="filled"
                  color="red"
                  fullWidth
                  rightSection={<ChevronDown size={14} />}
                  style={{ flex: 1, fontSize: 12, fontWeight: 700 }}
                >
                  Explore Maps
                </Button>
              </Menu.Target>
              <Menu.Dropdown style={{ backgroundColor: "#141722", border: "1px solid #283042" }}>
                <Menu.Label style={{ color: "#718096", fontSize: 10, fontWeight: 800 }}>SELECT MAP</Menu.Label>
                {maps.map((m) => {
                  const mSlug = m.map_slug || "default";
                  const cleanName = m.title.replace(new RegExp(`^${gameTitle}\\s*-\\s*`, "i"), "");
                  return (
                    <Menu.Item
                      key={mSlug}
                      onClick={() => onOpenMap(gameSlug, mSlug, gameTitle)}
                      rightSection={
                        m.locations_count ? (
                          <Text size="xs" c="dimmed">
                            {m.locations_count}
                          </Text>
                        ) : null
                      }
                      style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}
                    >
                      {cleanName}
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>
          ) : (
            <Button
              size="xs"
              variant="filled"
              color="red"
              fullWidth
              onClick={() => onOpenMap(gameSlug, primaryMSlug, gameTitle)}
              style={{ flex: 1, fontSize: 12, fontWeight: 700 }}
            >
              Open Map
            </Button>
          )}

          <Tooltip label="Open as Floating Overlay" position="top" withArrow>
            <ActionIcon
              size="md"
              variant="default"
              style={{ backgroundColor: "#181c27", borderColor: "#283042", color: "#60a5fa" }}
              onClick={(e) => {
                e.stopPropagation();
                openMapOverlay({
                  gameSlug,
                  mapSlug: primaryMSlug,
                  gameTitle,
                });
              }}
            >
              <PictureInPicture2 size={14} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="Open in MapGenie Browser" position="top" withArrow>
            <ActionIcon
              size="md"
              variant="default"
              style={{ backgroundColor: "#181c27", borderColor: "#283042", color: "#a0aec0" }}
              onClick={(e) => {
                e.stopPropagation();
                openInBrowser(primaryMap.url || `https://mapgenie.io/${gameSlug}`);
              }}
            >
              <ExternalLink size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
    </Card>
  );
});

// ---------------------------------------------------------------------------
// Main Modal Component
// ---------------------------------------------------------------------------

export function MapsBrowserModal({ opened, onClose, onSelectMap }: MapsBrowserModalProps) {
  const { maps, isLoading, refresh } = useAllGameMaps();
  const [search, setSearch] = useState("");
  const [activeViewer, setActiveViewer] = useState<{
    gameSlug: string;
    mapSlug: string;
    gameTitle: string;
  } | null>(null);

  // Group maps by game
  const gameGroups = useMemo(() => {
    const mapDict = new Map<string, GameMapInfo[]>();

    maps.forEach((m) => {
      const gSlug = m.game_slug || (m.slug ? m.slug.split("--")[0] : "unknown");
      const list = mapDict.get(gSlug) || [];
      list.push(m);
      mapDict.set(gSlug, list);
    });

    const groups: GameGroupItem[] = [];

    mapDict.forEach((gMaps, gSlug) => {
      const primary = gMaps[0];
      const gTitle = primary.game_title || primary.title || gSlug;
      const totalLocs = gMaps.reduce((sum, m) => sum + (m.locations_count || 0), 0);

      groups.push({
        gameTitle: gTitle,
        gameSlug: gSlug,
        maps: gMaps,
        primaryMap: primary,
        totalLocations: totalLocs,
      });
    });

    groups.sort((a, b) => a.gameTitle.localeCompare(b.gameTitle));
    return groups;
  }, [maps]);

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return gameGroups;
    const q = search.toLowerCase().trim();
    return gameGroups.filter((g) => {
      return (
        g.gameTitle.toLowerCase().includes(q) ||
        g.gameSlug.toLowerCase().includes(q) ||
        g.maps.some((m) => m.title.toLowerCase().includes(q) || (m.map_slug && m.map_slug.toLowerCase().includes(q)))
      );
    });
  }, [gameGroups, search]);

  const handleOpenMap = useCallback(
    (gameSlug: string, mapSlug: string, gameTitle: string) => {
      if (onSelectMap) {
        onSelectMap(gameSlug, mapSlug, gameTitle);
      } else {
        setActiveViewer({ gameSlug, mapSlug, gameTitle });
      }
    },
    [onSelectMap]
  );

  return (
    <>
      <Modal
        opened={opened && !activeViewer}
        onClose={onClose}
        size="85vw"
        centered
        radius="lg"
        withCloseButton={false}
        padding={0}
        overlayProps={{ backgroundOpacity: 0.75 }}
        styles={{
          content: {
            backgroundColor: "#0b0d13",
            border: "1px solid #1e2433",
            height: "85vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 25px 60px rgba(0,0,0,0.9)",
          },
          body: {
            padding: 0,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        }}
      >
        {/* Header Bar */}
        <Box
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #1e2433",
            backgroundColor: "#0f121a",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Group gap="sm">
            <MapIcon size={22} color="#e03131" />
            <div>
              <Title order={4} c="white" fw={800} style={{ letterSpacing: -0.2 }}>
                Game Maps Catalog
              </Title>
              <Text size="xs" c="dimmed">
                Interactive game maps powered by MapGenie ({gameGroups.length} Games, {maps.length} Maps)
              </Text>
            </div>
          </Group>

          <Group gap="sm">
            <Tooltip label="Refresh Map Catalog" position="bottom">
              <ActionIcon
                variant="default"
                size="lg"
                radius="md"
                onClick={refresh}
                loading={isLoading}
                style={{ backgroundColor: "#161a26", borderColor: "#283042", color: "#a0aec0" }}
              >
                <RefreshCw size={16} />
              </ActionIcon>
            </Tooltip>

            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              radius="md"
              onClick={onClose}
            >
              <X size={20} />
            </ActionIcon>
          </Group>
        </Box>

        {/* Search & Filter Bar */}
        <Box style={{ padding: "12px 24px", borderBottom: "1px solid #181c27", backgroundColor: "#0b0d13" }}>
          <TextInput
            placeholder="Search games or maps (e.g. Skyrim, Witcher 3, GTA, Elden Ring)..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<Search size={16} color="#666" />}
            rightSection={
              search ? (
                <ActionIcon size="xs" variant="transparent" onClick={() => setSearch("")}>
                  <X size={14} color="#888" />
                </ActionIcon>
              ) : null
            }
            styles={{
              input: {
                backgroundColor: "#131722",
                borderColor: "#242c3d",
                color: "#fff",
                borderRadius: 8,
                fontSize: 13,
              },
            }}
          />
        </Box>

        {/* Content Area */}
        <ScrollArea style={{ flex: 1 }} p={24}>
          {isLoading && gameGroups.length === 0 ? (
            <Center style={{ height: 350 }}>
              <Stack align="center" gap="sm">
                <Loader color="red" size="md" />
                <Text size="sm" c="dimmed">
                  Loading game maps catalog...
                </Text>
              </Stack>
            </Center>
          ) : filteredGroups.length === 0 ? (
            <Center style={{ height: 350 }}>
              <Stack align="center" gap="xs">
                <MapIcon size={40} color="#3b4661" />
                <Text size="sm" fw={600} c="white">
                  No game maps found
                </Text>
                <Text size="xs" c="dimmed">
                  Try searching for a different game name or keyword.
                </Text>
              </Stack>
            </Center>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
              {filteredGroups.map((group) => (
                <GameMapGridCard key={group.gameSlug} group={group} onOpenMap={handleOpenMap} />
              ))}
            </SimpleGrid>
          )}
        </ScrollArea>
      </Modal>

      {/* Internal Map Viewer Modal */}
      {activeViewer && (
        <MapViewerModal
          opened={Boolean(activeViewer)}
          onClose={() => setActiveViewer(null)}
          gameSlug={activeViewer.gameSlug}
          mapSlug={activeViewer.mapSlug}
          gameTitle={activeViewer.gameTitle}
        />
      )}
    </>
  );
}
