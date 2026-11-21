"use client";

import React from "react";
import { Game } from "../../lib/types";
import { cleanGameTitle } from "../../lib/gameLinker";
import {
  isGameUpToDateByDate,
  detectGameExeLastModified,
  ignoreGameUpdate,
  unignoreGameUpdate,
} from "../../lib/db";
import { parseDateSafe } from "../../lib/versionDetector";
import { useGameMap } from "../../lib/gameMaps";
import { MapViewerModal } from "../maps";
import {
  Card,
  Badge,
  Group,
  Text,
  ActionIcon,
  Stack,
  Box,
  Image,
  Tooltip,
  Menu,
} from "@mantine/core";
import {
  Play,
  Clock,
  Star,
  Flame,
  Trash2,
  Edit3,
  Bookmark,
  Sparkles,
  CheckCircle2,
  Check,
  RotateCcw,
  ChevronDown,
  HardDrive,
  Pin,
  EyeOff,
  Square,
  MapPin,
} from "lucide-react";
import { setGameStatus } from "../../lib/db";

interface GameCardProps {
  game: Game;
  onLaunch: (game: Game) => void;
  onOpenDetails: (game: Game) => void;
  onToggleFavorite: (id: string) => void;
  onToggleCompleted?: (id: string) => void;
  onStatusChange?: (
    id: string,
    status: "installed" | "wishlist" | "completed" | "none",
  ) => void;
  isPinned?: boolean;
  onTogglePin?: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (game: Game) => void;
  onHoverGame?: (game: Game | null) => void;
  isPlaying?: boolean;
  isAnyGameRunning?: boolean;
}

export const GameCard = React.memo<GameCardProps>(
  ({
    game,
    onLaunch,
    onOpenDetails,
    onToggleFavorite,
    onStatusChange,
    isPinned = false,
    onTogglePin,
    onDelete,
    onEdit,
    onHoverGame,
    isPlaying = false,
    isAnyGameRunning = false,
  }) => {
    const isOtherGameRunning = isAnyGameRunning && !isPlaying;
    const [isMapOpen, setIsMapOpen] = React.useState(false);
    const { map: gameMap } = useGameMap(game.title);

    const handleQuickStatus = (
      status: "installed" | "wishlist" | "completed" | "none",
    ) => {
      let targetStatus = status;
      if (status === "installed" && game.isInstalled) {targetStatus = "none";}
      else if (status === "wishlist" && game.isWishlisted)
        {targetStatus = "none";}
      else if (status === "completed" && game.isCompleted)
        {targetStatus = "none";}

      if (onStatusChange) {
        onStatusChange(game.id, targetStatus);
      } else {
        setGameStatus(game.id, targetStatus);
      }
    };

    const isGameInstalled = Boolean(
      game.isInstalled || (game.exePath && game.exePath.trim() !== ""),
    );

    const [localLastModified, setLocalLastModified] = React.useState<
      string | undefined
    >(game.installedLastModified);

    const [localIgnoredDate, setLocalIgnoredDate] = React.useState<
      string | undefined
    >(game.ignoredUpdateDate);

    React.useEffect(() => {
      setLocalIgnoredDate(game.ignoredUpdateDate);
    }, [game.ignoredUpdateDate]);

    React.useEffect(() => {
      if (game.installedLastModified) {
        setLocalLastModified(game.installedLastModified);
      } else if (game.exePath) {
        detectGameExeLastModified(game.exePath).then((d) => {
          if (d) {
            const iso = d.toISOString();
            setLocalLastModified(iso);
            game.installedLastModified = iso;
          }
        });
      }
    }, [game.exePath, game.installedLastModified]);

    const effectiveLastMod = game.installedLastModified || localLastModified;
    const effectiveIgnoredDate =
      localIgnoredDate !== undefined
        ? localIgnoredDate
        : game.ignoredUpdateDate;

    const handleIgnoreUpdate = (postDate?: string) => {
      const dateToSet = postDate || new Date().toISOString();
      setLocalIgnoredDate(dateToSet);
      game.ignoredUpdateDate = dateToSet;
      ignoreGameUpdate(game.id, dateToSet);
    };

    const handleUnignoreUpdate = () => {
      setLocalIgnoredDate(undefined);
      game.ignoredUpdateDate = undefined;
      unignoreGameUpdate(game.id);
    };

    const updateData = React.useMemo(() => {
      if (!isGameInstalled) {return null;}

      const fitgirlDate =
        game.fitgirlUploadDate ||
        (game.source === "fitgirl"
          ? game.releaseDate || game.updateInfo?.date
          : undefined);

      const steamripDate =
        game.steamripUploadDate ||
        (game.source === "steamrip"
          ? game.releaseDate || game.updateInfo?.date
          : undefined);

      const isIgnored = (postDate?: string) => {
        if (!effectiveIgnoredDate) {return false;}
        if (!postDate) {return true;}
        if (effectiveIgnoredDate === postDate) {return true;}
        const ignTime = parseDateSafe(effectiveIgnoredDate);
        const postTime = parseDateSafe(postDate);
        if (ignTime !== null && postTime !== null && ignTime >= postTime)
          {return true;}
        return false;
      };

      const isFitgirlOutdated = Boolean(
        effectiveLastMod &&
        fitgirlDate &&
        !isIgnored(fitgirlDate) &&
        !isGameUpToDateByDate(effectiveLastMod, fitgirlDate, 10),
      );

      const isSteamripOutdated = Boolean(
        effectiveLastMod &&
        steamripDate &&
        !isIgnored(steamripDate) &&
        !isGameUpToDateByDate(effectiveLastMod, steamripDate, 10),
      );

      const isGenericUpdateOutdated = (() => {
        if (!game.hasUpdate) {return false;}
        const targetPostDate =
          game.updateInfo?.date || fitgirlDate || steamripDate;
        if (isIgnored(targetPostDate)) {return false;}
        if (effectiveLastMod && targetPostDate) {
          return !isGameUpToDateByDate(effectiveLastMod, targetPostDate, 10);
        }
        return false;
      })();

      const hasFitgirlUpdate = Boolean(isFitgirlOutdated);
      const hasSteamripUpdate = Boolean(isSteamripOutdated);
      const hasUpdate = Boolean(
        isGenericUpdateOutdated || hasFitgirlUpdate || hasSteamripUpdate,
      );
      if (!hasUpdate) {return null;}

      const activePostDate = hasFitgirlUpdate
        ? fitgirlDate
        : hasSteamripUpdate
          ? steamripDate
          : game.updateInfo?.date;

      const updateTitle = hasFitgirlUpdate
        ? `New update in FitGirl: ${fitgirlDate || "Available"}`
        : hasSteamripUpdate
          ? `New update in SteamRIP: ${steamripDate || "Available"}`
          : game.updateInfo?.date
            ? `Update available: ${game.updateInfo.date}`
            : "Update available";

      return { title: updateTitle, postDate: activePostDate };
    }, [
      isGameInstalled,
      game.hasUpdate,
      game.updateInfo,
      effectiveLastMod,
      game.fitgirlUploadDate,
      game.steamripUploadDate,
      game.releaseDate,
      game.source,
      effectiveIgnoredDate,
      localIgnoredDate,
      game.ignoredUpdateDate,
    ]);

    const playtimeLabel = React.useMemo(() => {
      if (!game.playtimeMinutes || game.playtimeMinutes <= 0) {return null;}
      return game.playtimeMinutes >= 60
        ? `${(game.playtimeMinutes / 60).toFixed(1)}h`
        : `${Math.floor(game.playtimeMinutes)}m`;
    }, [game.playtimeMinutes]);

    return (
      <Card
        padding={0}
        radius="md"
        bg="dark.8"
        className="daze-poster-card"
        style={{
          cursor: "pointer",
          position: "relative",
          aspectRatio: "3 / 4",
          overflow: "hidden",
          border: isPlaying
            ? "2px solid #20c997"
            : isPinned
              ? "1px solid rgba(121, 80, 242, 0.7)"
              : "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: isPlaying
            ? "0 0 22px rgba(32, 201, 151, 0.5), 0 8px 20px rgba(0, 0, 0, 0.6)"
            : "0 8px 22px rgba(0, 0, 0, 0.45)",
          contentVisibility: "auto" as any,
          containIntrinsicSize: "160px 214px",
        }}
        onMouseEnter={() => onHoverGame?.(game)}
        onMouseLeave={() => onHoverGame?.(null)}
        onClick={() => onOpenDetails(game)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (
            !isOtherGameRunning &&
            game.exePath &&
            game.exePath.trim() !== ""
          ) {
            onLaunch(game);
          }
        }}
      >
        {/* Full-bleed 3:4 Cover Image */}
        <Image
          src={game.coverUrl}
          alt={game.title}
          fallbackSrc={`https://placehold.co/600x800/0f172a/3b82f6?text=${encodeURIComponent(game.title)}`}
          fit="cover"
          loading="lazy"
          decoding="async"
          className="daze-poster-img"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: isGameInstalled || isPlaying ? 1 : 0.78,
          }}
        />

        {/* Subtle Top-Right Star Indicator at Rest */}
        {game.isFavorite && !isPlaying && (
          <Box
            pos="absolute"
            top={8}
            right={8}
            style={{
              zIndex: 2,
              pointerEvents: "none",
              filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.85))",
            }}
          >
            <Star size={14} fill="#fcc419" color="#fcc419" />
          </Box>
        )}

        {/* Running Active Session Badge (Always visible) */}
        {isPlaying && (
          <Badge
            color="teal"
            variant="filled"
            size="xs"
            pos="absolute"
            top={8}
            left={8}
            leftSection={
              <Box
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: "#fff",
                  boxShadow: "0 0 6px #fff",
                }}
              />
            }
            style={{
              zIndex: 6,
              boxShadow: "0 0 14px rgba(32, 201, 151, 0.9)",
              fontWeight: 800,
              letterSpacing: "0.5px",
              pointerEvents: "none",
            }}
          >
            RUNNING
          </Badge>
        )}

        {/* Update Available Pill at Rest */}
        {updateData && !isPlaying && (
          <Badge
            color="yellow"
            variant="filled"
            size="xs"
            pos="absolute"
            top={8}
            left={8}
            title={updateData.title}
            leftSection={<Sparkles size={10} />}
            style={{
              zIndex: 3,
              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.65)",
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            UPDATE
          </Badge>
        )}

        {/* Hover Reveal Overlay: Top Action Controls + Bottom Metadata & Quick Actions */}
        <Box
          className="daze-poster-overlay"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background:
              "linear-gradient(to bottom, rgba(8, 9, 14, 0.55) 0%, transparent 35%, rgba(8, 9, 14, 0.35) 60%, rgba(8, 9, 14, 0.82) 100%)",
            padding: 8,
          }}
        >
          {/* Top Action Bar */}
          <Group justify="space-between" wrap="nowrap" align="center">
            <Group gap={4} wrap="nowrap" align="center">
              <ActionIcon
                variant="filled"
                radius="xl"
                size="sm"
                style={{
                  backgroundColor: game.isFavorite
                    ? "#fcc419"
                    : "rgba(15, 17, 23, 0.75)",
                  color: game.isFavorite ? "#000" : "#f1f3f5",
                  backdropFilter: "blur(8px)",
                  border: game.isFavorite
                    ? "none"
                    : "1px solid rgba(255, 255, 255, 0.18)",
                }}
                title={
                  game.isFavorite ? "Remove from Favorites" : "Add to Favorites"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(game.id);
                }}
              >
                <Star
                  size={12}
                  fill={game.isFavorite ? "#000" : "none"}
                  strokeWidth={2.2}
                />
              </ActionIcon>

              {onTogglePin && (
                <ActionIcon
                  variant="filled"
                  radius="xl"
                  size="sm"
                  style={{
                    backgroundColor: isPinned
                      ? "#7950f2"
                      : "rgba(15, 17, 23, 0.75)",
                    color: "#ffffff",
                    backdropFilter: "blur(8px)",
                    border: isPinned
                      ? "none"
                      : "1px solid rgba(255, 255, 255, 0.18)",
                  }}
                  title={isPinned ? "Unpin from top" : "Pin to top"}
                  onClick={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement)?.blur();
                    onTogglePin(game.id);
                  }}
                >
                  <Pin
                    size={11}
                    fill={isPinned ? "currentColor" : "none"}
                    strokeWidth={2.2}
                    style={{
                      transform: isPinned ? "rotate(45deg)" : "none",
                    }}
                  />
                </ActionIcon>
              )}

              {gameMap && (
                <Tooltip label="Open Interactive Map" position="bottom" withArrow>
                  <ActionIcon
                    variant="filled"
                    radius="xl"
                    size="sm"
                    style={{
                      backgroundColor: "rgba(18, 184, 134, 0.92)",
                      color: "#ffffff",
                      backdropFilter: "blur(8px)",
                      border: "1px solid rgba(255, 255, 255, 0.25)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMapOpen(true);
                    }}
                  >
                    <MapPin size={12} strokeWidth={2.2} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>

            {/* Status Menu */}
            {!isPlaying && (
              <Menu
                shadow="md"
                width={175}
                position="bottom-end"
                withinPortal
                radius="md"
              >
                <Menu.Target>
                  <Box
                    component="div"
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "inline-flex" }}
                  >
                    {game.isInstalled ? (
                      <Badge
                        color="blue"
                        variant="filled"
                        size="xs"
                        leftSection={<HardDrive size={10} />}
                        rightSection={<ChevronDown size={9} />}
                        style={{ cursor: "pointer", fontWeight: 600 }}
                        title="Change status"
                      >
                        INSTALLED
                      </Badge>
                    ) : game.isWishlisted ? (
                      <Badge
                        color="orange"
                        variant="filled"
                        size="xs"
                        leftSection={<Bookmark size={10} fill="white" />}
                        rightSection={<ChevronDown size={9} />}
                        style={{ cursor: "pointer", fontWeight: 600 }}
                        title="Change status"
                      >
                        WISHLIST
                      </Badge>
                    ) : game.isCompleted ? (
                      <Badge
                        color="teal"
                        variant="filled"
                        size="xs"
                        leftSection={<CheckCircle2 size={10} />}
                        rightSection={<ChevronDown size={9} />}
                        style={{ cursor: "pointer", fontWeight: 600 }}
                        title="Change status"
                      >
                        DONE
                      </Badge>
                    ) : (
                      <Badge
                        variant="filled"
                        size="xs"
                        leftSection={<Clock size={10} />}
                        rightSection={<ChevronDown size={9} />}
                        style={{
                          backgroundColor: "rgba(15, 17, 23, 0.8)",
                          border: "1px solid rgba(255, 255, 255, 0.16)",
                          color: "#e5e7eb",
                          cursor: "pointer",
                        }}
                        title="Change status"
                      >
                        {playtimeLabel || "STATUS"}
                      </Badge>
                    )}
                  </Box>
                </Menu.Target>

                <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                  <Menu.Label>Change Status</Menu.Label>
                  <Menu.Item
                    leftSection={<HardDrive size={14} color="#3b82f6" />}
                    rightSection={
                      game.isInstalled ? (
                        <Check size={13} color="#3b82f6" />
                      ) : undefined
                    }
                    onClick={() => handleQuickStatus("installed")}
                  >
                    Installed
                  </Menu.Item>
                  <Menu.Item
                    leftSection={
                      <Bookmark
                        size={14}
                        color="#f97316"
                        fill={game.isWishlisted ? "#f97316" : "none"}
                      />
                    }
                    rightSection={
                      game.isWishlisted ? (
                        <Check size={13} color="#f97316" />
                      ) : undefined
                    }
                    onClick={() => handleQuickStatus("wishlist")}
                  >
                    Wishlist
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<CheckCircle2 size={14} color="#10b981" />}
                    rightSection={
                      game.isCompleted ? (
                        <Check size={13} color="#10b981" />
                      ) : undefined
                    }
                    onClick={() => handleQuickStatus("completed")}
                  >
                    Completed
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<RotateCcw size={14} />}
                    color="dimmed"
                    onClick={() => handleQuickStatus("none")}
                  >
                    Clear Status
                  </Menu.Item>
                  {updateData && (
                    <>
                      <Menu.Divider />
                      <Menu.Item
                        leftSection={<EyeOff size={14} color="#eab308" />}
                        onClick={() => handleIgnoreUpdate(updateData.postDate)}
                      >
                        Ignore Update
                      </Menu.Item>
                    </>
                  )}
                  {Boolean(localIgnoredDate || game.ignoredUpdateDate) && (
                    <>
                      <Menu.Divider />
                      <Menu.Item
                        leftSection={<RotateCcw size={14} />}
                        onClick={() => handleUnignoreUpdate()}
                      >
                        Restore Update Check
                      </Menu.Item>
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>

          {/* Bottom Metadata + Quick Actions */}
          <Stack
            gap={6}
            p={8}
            className="daze-glass-card"
            style={{
              borderRadius: 10,
              backdropFilter: "blur(16px) saturate(170%)",
              WebkitBackdropFilter: "blur(16px) saturate(170%)",
            }}
          >
            <Box>
              <Text
                fw={700}
                size="xs"
                c="white"
                lineClamp={2}
                style={{
                  lineHeight: 1.25,
                  textShadow: "0 1px 4px rgba(0, 0, 0, 0.9)",
                }}
              >
                {cleanGameTitle(game.title)}
              </Text>
              <Group gap={4} mt={4} wrap="wrap">
                {game.releaseYear && (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="dark.6"
                    style={{ fontSize: "9.5px", height: 16, padding: "0 5px" }}
                  >
                    {game.releaseYear}
                  </Badge>
                )}
                {(game.fitgirlSize ||
                  (game.source !== "steamrip" && game.repackSize)) && (
                  <Badge
                    size="xs"
                    variant="light"
                    color="grape"
                    style={{ fontSize: "9.5px", height: 16, padding: "0 5px" }}
                  >
                    {game.fitgirlSize || game.repackSize}
                  </Badge>
                )}
                {playtimeLabel && (
                  <Badge
                    size="xs"
                    variant="light"
                    color="teal"
                    style={{ fontSize: "9.5px", height: 16, padding: "0 5px" }}
                  >
                    {playtimeLabel}
                  </Badge>
                )}
              </Group>
            </Box>

            <Group
              justify="space-between"
              align="center"
              pt={5}
              style={{ borderTop: "1px solid rgba(255, 255, 255, 0.12)" }}
            >
              <Group gap={4}>
                {game.isInstalled &&
                  game.exePath &&
                  game.exePath.trim() !== "" && (
                    <ActionIcon
                      variant="filled"
                      color={
                        isPlaying
                          ? "teal"
                          : isOtherGameRunning
                            ? "gray"
                            : "white"
                      }
                      size="sm"
                      radius="xl"
                      disabled={isOtherGameRunning}
                      title={
                        isPlaying
                          ? "Stop Game / Session"
                          : isOtherGameRunning
                            ? "Another game is currently running"
                            : "Launch Game"
                      }
                      style={{
                        color: isPlaying || isOtherGameRunning ? "#fff" : "#0b0c0f",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLaunch(game);
                      }}
                    >
                      {isPlaying ? (
                        <Square size={10} fill="white" />
                      ) : (
                        <Play size={11} fill="currentColor" />
                      )}
                    </ActionIcon>
                  )}
              </Group>

              <Group gap={4}>
                {onEdit && (
                  <ActionIcon
                    variant="subtle"
                    color="gray.3"
                    size="xs"
                    radius="md"
                    title="Edit Game"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(game);
                    }}
                  >
                    <Edit3 size={12} />
                  </ActionIcon>
                )}
                <ActionIcon
                  variant="subtle"
                  color="red.4"
                  size="xs"
                  radius="md"
                  title="Remove from Library"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(game.id);
                  }}
                >
                  <Trash2 size={12} />
                </ActionIcon>
              </Group>
            </Group>
          </Stack>
        </Box>

        {/* Interactive Map Viewer Modal directly from Card */}
        {gameMap && isMapOpen && (
          <Box
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <MapViewerModal
              opened={isMapOpen}
              onClose={() => setIsMapOpen(false)}
              gameSlug={
                gameMap.game_slug ||
                (gameMap.slug.includes("--")
                  ? gameMap.slug.split("--")[0]
                  : gameMap.slug)
              }
              mapSlug={gameMap.map_slug}
              gameTitle={game.title}
            />
          </Box>
        )}
      </Card>
    );
  },
);
