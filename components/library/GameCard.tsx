"use client";

import React from "react";
import { Game } from "../../lib/types";
import { CachedImage } from "../common/CachedImage";
import {
  cleanGameTitle,
} from "../../lib/gameLinker";
import {
  isGameUpToDateByDate,
  detectGameExeLastModified,
  ignoreGameUpdate,
  unignoreGameUpdate,
} from "../../lib/db";
import { parseDateSafe } from "../../lib/versionDetector";
import { openInBrowser } from "../../lib/openUrl";
import {
  Card,
  Badge,
  Group,
  Text,
  ActionIcon,
  Stack,
  Box,
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
  Globe,
  Check,
  RotateCcw,
  ChevronDown,
  HardDrive,
  Pin,
  EyeOff,
  Square,
} from "lucide-react";
import { setGameStatus } from "../../lib/db";
import { useHover } from "@mantine/hooks";

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
  isPlaying?: boolean;
  isAnyGameRunning?: boolean;
}

export const GameCard = React.memo<GameCardProps>(
  ({
    game,
    onLaunch,
    onOpenDetails,
    onToggleFavorite,
    onToggleCompleted,
    onStatusChange,
    isPinned = false,
    onTogglePin,
    onDelete,
    onEdit,
    isPlaying = false,
    isAnyGameRunning = false,
  }) => {
    const { ref: hoverRef, hovered } = useHover<HTMLDivElement>();
    const isOtherGameRunning = isAnyGameRunning && !isPlaying;

    const handleQuickStatus = (
      status: "installed" | "wishlist" | "completed" | "none",
    ) => {
      let targetStatus = status;
      if (status === "installed" && game.isInstalled) targetStatus = "none";
      else if (status === "wishlist" && game.isWishlisted)
        targetStatus = "none";
      else if (status === "completed" && game.isCompleted)
        targetStatus = "none";

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
      localIgnoredDate !== undefined ? localIgnoredDate : game.ignoredUpdateDate;

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
      if (!isGameInstalled) return null;

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
        if (!effectiveIgnoredDate) return false;
        if (!postDate) return true;
        if (effectiveIgnoredDate === postDate) return true;
        const ignTime = parseDateSafe(effectiveIgnoredDate);
        const postTime = parseDateSafe(postDate);
        if (ignTime !== null && postTime !== null && ignTime >= postTime)
          return true;
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
        if (!game.hasUpdate) return false;
        const targetPostDate =
          game.updateInfo?.date || fitgirlDate || steamripDate;
        if (isIgnored(targetPostDate)) return false;
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
      if (!hasUpdate) return null;

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

    return (
      <Card
        ref={hoverRef}
        padding="sm"
        radius="lg"
        bg="var(--mantine-color-default)"
        style={{
          cursor: "pointer",
          position: "relative",
          transition: "all 220ms cubic-bezier(0.16, 1, 0.3, 1)",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          border: isPlaying
            ? "2px solid #20c997"
            : isPinned
              ? "1px solid rgba(121, 80, 242, 0.45)"
              : hovered
                ? "1px solid rgba(59, 130, 246, 0.4)"
                : "1px solid var(--mantine-color-default-border)",
          boxShadow: isPlaying
            ? "0 0 20px rgba(32, 201, 151, 0.45), 0 0 6px rgba(32, 201, 151, 0.8)"
            : hovered
              ? "0 10px 24px -6px rgba(0, 0, 0, 0.5), 0 0 12px rgba(59, 130, 246, 0.15)"
              : "0 2px 8px rgba(0, 0, 0, 0.2)",
          transform: hovered ? "translateY(-3px)" : "translateY(0)",
          contentVisibility: "auto" as any,
          containIntrinsicSize: "200px 340px",
        }}
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
        <Card.Section
          pos="relative"
          bg="var(--mantine-color-body)"
          style={{ overflow: "hidden", borderRadius: "10px 10px 0 0" }}
        >
          <Box
            style={{
              transform: hovered ? "scale(1.03)" : "scale(1)",
              transition: "transform 350ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <CachedImage
              src={game.coverUrl}
              height={240}
              alt={game.title}
              fallbackSrc={`https://placehold.co/600x800/0f172a/3b82f6?text=${encodeURIComponent(game.title)}`}
              fit="cover"
            />
          </Box>

          {/* Subtle Dark Bottom Vignette Overlay */}
          <Box
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "linear-gradient(to top, rgba(15, 17, 23, 0.85) 0%, rgba(15, 17, 23, 0.2) 35%, transparent 60%)",
            }}
          />

          {/* Top Badges */}
          <Group
            justify="space-between"
            pos="absolute"
            top={8}
            left={8}
            right={8}
            wrap="nowrap"
            align="center"
            style={{ zIndex: 2 }}
          >
            <Group gap={4} wrap="nowrap" align="center">
              <ActionIcon
                variant="filled"
                radius="xl"
                size="sm"
                style={{
                  backgroundColor: game.isFavorite
                    ? "#fcc419"
                    : "rgba(15, 17, 23, 0.65)",
                  color: game.isFavorite ? "#000" : "#f1f3f5",
                  backdropFilter: "blur(8px)",
                  border: game.isFavorite
                    ? "none"
                    : "1px solid rgba(255, 255, 255, 0.15)",
                  boxShadow: game.isFavorite
                    ? "0 0 10px rgba(252, 196, 25, 0.4)"
                    : "0 2px 6px rgba(0, 0, 0, 0.35)",
                  transition: "all 0.18s ease",
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
                      : "rgba(15, 17, 23, 0.65)",
                    color: isPinned ? "#ffffff" : "#f1f3f5",
                    backdropFilter: "blur(8px)",
                    border: isPinned
                      ? "none"
                      : "1px solid rgba(255, 255, 255, 0.15)",
                    boxShadow: isPinned
                      ? "0 0 10px rgba(121, 80, 242, 0.45)"
                      : "0 2px 6px rgba(0, 0, 0, 0.35)",
                    transition: "all 0.18s ease",
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
                      transition: "transform 0.15s ease",
                    }}
                  />
                </ActionIcon>
              )}
            </Group>

            {isPlaying ? (
              <Badge
                color="teal"
                variant="filled"
                size="xs"
                leftSection={<Flame size={11} />}
                style={{
                  boxShadow: "0 0 12px rgba(20, 184, 166, 0.5)",
                  fontWeight: 700,
                  letterSpacing: "0.4px",
                }}
              >
                RUNNING
              </Badge>
            ) : (
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
                        rightSection={
                          <ChevronDown size={9} style={{ opacity: 0.8 }} />
                        }
                        style={{
                          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                          cursor: "pointer",
                          fontWeight: 600,
                          letterSpacing: "0.3px",
                        }}
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
                        rightSection={
                          <ChevronDown size={9} style={{ opacity: 0.8 }} />
                        }
                        style={{
                          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                          cursor: "pointer",
                          fontWeight: 600,
                          letterSpacing: "0.3px",
                        }}
                        title="Change status"
                      >
                        WISHLIST
                      </Badge>
                    ) : game.isCompleted ? (
                      <Badge
                        color="teal"
                        variant="filled"
                        size="xs"
                        leftSection={<CheckCircle2 size={11} />}
                        rightSection={
                          <ChevronDown size={9} style={{ opacity: 0.8 }} />
                        }
                        style={{
                          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                          cursor: "pointer",
                          fontWeight: 600,
                          letterSpacing: "0.3px",
                        }}
                        title="Change status"
                      >
                        COMPLETED
                      </Badge>
                    ) : (
                      <Badge
                        variant="filled"
                        size="xs"
                        leftSection={<Clock size={10} />}
                        rightSection={
                          <ChevronDown size={9} style={{ opacity: 0.7 }} />
                        }
                        style={{
                          backgroundColor: "rgba(15, 17, 23, 0.7)",
                          backdropFilter: "blur(8px)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          color: "#e5e7eb",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                          cursor: "pointer",
                          fontWeight: 500,
                        }}
                        title="Change status"
                      >
                        {game.playtimeMinutes > 0
                          ? game.playtimeMinutes >= 60
                            ? `${(game.playtimeMinutes / 60).toFixed(1)}h`
                            : `${Math.floor(game.playtimeMinutes)}m`
                          : "STATUS"}
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

          {/* Running Active Session Badge */}
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
                zIndex: 10,
                boxShadow: "0 0 14px rgba(32, 201, 151, 0.9)",
                fontWeight: 800,
                letterSpacing: "0.5px",
                pointerEvents: "none",
              }}
            >
              RUNNING
            </Badge>
          )}

          {/* Update Available Badge - Only displayed when installed & update exists */}
          {updateData && !isPlaying && (
            <Badge
              color="yellow"
              variant="filled"
              size="xs"
              pos="absolute"
              bottom={8}
              left={8}
              title={updateData.title}
              leftSection={<Sparkles size={10} />}
              style={{
                zIndex: 2,
                boxShadow:
                  "0 2px 10px rgba(250, 1, 0.45), 0 2px 5px rgba(0, 0, 0, 0.5)",
                fontWeight: 700,
                letterSpacing: "0.4px",
                pointerEvents: "none",
              }}
            >
              UPDATE AVAILABLE
            </Badge>
          )}
        </Card.Section>

        <Stack gap="xs" mt="sm">
          <Box>
            <Text
              fw={700}
              size="sm"
              lineClamp={1}
              style={{
                letterSpacing: "0.2px",
                lineHeight: 1.3,
              }}
            >
              {cleanGameTitle(game.title)}
            </Text>
            <Group justify="space-between" mt={4} wrap="nowrap" align="center">
              <Text
                size="xs"
                c="dimmed"
                truncate
                style={{ maxWidth: "125px", fontSize: "11px" }}
              >
                {game.genres?.slice(0, 2).join(", ") || "Game"}
              </Text>
              {game.releaseYear ? (
                <Badge
                  size="xs"
                  variant="light"
                  color="gray"
                  radius="xs"
                  style={{
                    fontSize: "10px",
                    height: 18,
                    padding: "0 4px",
                    fontWeight: 600,
                  }}
                >
                  {game.releaseYear}
                </Badge>
              ) : null}
            </Group>
          </Box>

          <Group
            justify="space-between"
            pt="xs"
            wrap="nowrap"
            align="center"
            style={{
              borderTop: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <Text
              size="xs"
              c={isPlaying ? "teal.4" : "dimmed"}
              fw={isPlaying ? 700 : 400}
              truncate
              style={{ maxWidth: "105px", fontSize: "11px" }}
            >
              {isPlaying
                ? "Running now"
                : game.isInstalled
                  ? game.lastPlayed
                    ? `Last: ${new Date(game.lastPlayed).toLocaleDateString()}`
                    : "Never played"
                  : game.isWishlisted
                    ? "Wishlist"
                    : "Not Installed"}
            </Text>
            <Group gap={4} wrap="nowrap">
              {game.isInstalled &&
                game.exePath &&
                game.exePath.trim() !== "" && (
                  <ActionIcon
                    variant="filled"
                    color={
                      isPlaying ? "teal" : isOtherGameRunning ? "gray" : "blue"
                    }
                    size="xs"
                    radius="md"
                    disabled={isOtherGameRunning}
                    title={
                      isPlaying
                        ? "Stop Game / Session"
                        : isOtherGameRunning
                          ? "Another game is currently running"
                          : "Launch Game"
                    }
                    style={{
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                      boxShadow: isPlaying
                        ? "0 0 10px rgba(32, 201, 151, 0.7)"
                        : "0 2px 4px rgba(0, 0, 0, 0.2)",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onLaunch(game);
                    }}
                  >
                    {isPlaying ? (
                      <Square size={10} fill="white" />
                    ) : (
                      <Play size={11} fill="white" />
                    )}
                  </ActionIcon>
                )}
              {onEdit && (
                <ActionIcon
                  variant="subtle"
                  color="blue"
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
                color="red"
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
      </Card>
    );
  },
);
