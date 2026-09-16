import React, { useState, useEffect, useMemo } from "react";
import { Game } from "../lib/types";
import {
  clearGameUpdate,
  toggleCompletedGame,
  toggleWishlistGame,
  updateGameInStorage,
  detectInstalledGameVersion,
  detectGameExeLastModified,
  isGameUpToDateByDate,
  ignoreGameUpdate,
  unignoreGameUpdate,
  setGameStatus,
} from "../lib/db";
import { parseDateSafe } from "../lib/versionDetector";
import {
  linkGameToIgdb,
  linkGameToFitGirl,
  linkGameToSteamRIP,
  linkGameToAllSources,
  extractMagnetLinks,
  extractDirectDownloadLinks,
  cleanGameTitle,
  extractGameVersion,
  isNewerVersion,
  isHighestVersion,
  compareReleaseSources,
} from "../lib/gameLinker";
import { HoldToUninstallButton } from "./HoldToUninstallButton";
import { SourceLinkerModal } from "./library/SourceLinkerModal";
import { openInBrowser } from "../lib/openUrl";
import {
  Modal,
  Image,
  Title,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  Paper,
  Box,
  SimpleGrid,
  Tabs,
  Menu,
  TextInput,
  ActionIcon,
  Tooltip,
  Alert,
  Card,
  Collapse,
  UnstyledButton,
} from "@mantine/core";
import {
  Play,
  Clock,
  Folder,
  Star,
  Tag,
  Edit3,
  Film,
  Image as ImageIcon,
  Sparkles,
  CheckCircle2,
  DownloadCloud,
  Magnet,
  ExternalLink,
  Link2,
  Copy,
  Check,
  Globe,
  Flame,
  Info,
  Search,
  ChevronDown,
  ChevronRight,
  Bookmark,
  Calendar,
  EyeOff,
  RotateCcw,
  HardDrive,
  Square,
} from "lucide-react";

interface GameDetailModalProps {
  game: Game | null;
  onClose: () => void;
  onLaunch: (game: Game) => void;
  onEdit?: (game: Game) => void;
  onUninstall?: (id: string) => void;
  onRemoveFromWishlist?: (id: string) => void;
  isPlaying?: boolean;
  activeTimerSeconds?: number;
  isAnyGameRunning?: boolean;
  onOpenTorrentDownload?: (data: {
    magnetUrl: string;
    title?: string;
    coverUrl?: string;
    repackSize?: string;
  }) => void;
  onGameUpdated?: (game: Game) => void;
}

export function formatPlaytime(
  game: Game,
  isPlaying?: boolean,
  currentTimerSeconds: number = 0,
): string {
  const recordedMinutes =
    game.playtimeMinutes !== undefined && game.playtimeMinutes > 0
      ? game.playtimeMinutes
      : (game.hoursPlayed ? game.hoursPlayed * 60 : 0);
  const recordedSeconds = Math.round(recordedMinutes * 60);
  const totalSeconds = recordedSeconds + (isPlaying ? currentTimerSeconds : 0);

  if (totalSeconds < 3600) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s Logged`;
  }
  const hours = totalSeconds / 3600;
  return `${hours.toFixed(1)} Hours Logged`;
}

/** Collapsible row for a single hoster in the direct downloads section */
const DirectHosterAccordion: React.FC<{
  hoster: string;
  links: { name: string; url: string; groupName: string }[];
}> = React.memo(({ hoster, links }) => {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%" }}
      >
        <Group
          justify="space-between"
          align="center"
          px="xs"
          py={6}
          style={{
            borderRadius: 6,
            background: "var(--mantine-color-default-hover)",
            cursor: "pointer",
          }}
        >
          <Group gap="xs">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Globe size={13} color="var(--mantine-color-dimmed)" />
            <Text size="xs" fw={600}>
              {hoster}
            </Text>
          </Group>
          <Badge size="xs" variant="dot" color="teal">
            {links.length} {links.length === 1 ? "link" : "parts"}
          </Badge>
        </Group>
      </UnstyledButton>

      <Collapse expanded={open}>
        <Stack gap={4} pt={4} pl="xs">
          {links.map((link, idx) => (
            <Group key={idx} gap={4} wrap="nowrap">
              <Button
                size="compact-xs"
                variant="light"
                color="blue"
                rightSection={<ExternalLink size={11} />}
                onClick={() => openInBrowser(link.url)}
                style={{ flex: 1, minWidth: 0 }}
                justify="space-between"
              >
                <Text size="xs" truncate style={{ maxWidth: "100%" }}>
                  {link.name || "Mirror"}
                </Text>
              </Button>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
});

function cleanGameSummary(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\.dlinks\s*\{[^}]*\}/gi, "")
    .replace(/\{margin:[^}]*\}/gi, "")
    .replace(/\[IDM\]\s*Click to show direct links/gi, "")
    .replace(/Filehoster:\s*[^\n,]*/gi, "")
    .replace(/Download Mirror\s*\([^\)]*\)/gi, "")
    .trim();
}

export const GameDetailModalComponent: React.FC<GameDetailModalProps> = ({
  game,
  onClose,
  onLaunch,
  onEdit,
  onUninstall,
  onRemoveFromWishlist,
  isPlaying = false,
  activeTimerSeconds = 0,
  isAnyGameRunning = false,
  onOpenTorrentDownload,
  onGameUpdated,
}) => {
  const [currentGame, setCurrentGame] = useState<Game | null>(game);
  const [activeTab, setActiveTab] = useState<string | null>("overview");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [isSourceLinkerOpen, setIsSourceLinkerOpen] = useState(false);

  // Linker states
  const [isLinking, setIsLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [customSearchTitle, setCustomSearchTitle] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);

  useEffect(() => {
    if (!game) return;
    setCurrentGame(game);
    setLinkMessage(null);
    setCustomSearchTitle(game.title || "");
    setShowSearchInput(false);
    setActiveTab("overview");

    let isMounted = true;
    if (game.exePath && (!game.installedVersion || !game.installedLastModified)) {
      (async () => {
        let ver = game.installedVersion;
        let lastModIso = game.installedLastModified;
        let modified = false;

        if (!ver) {
          const detected = await detectInstalledGameVersion(game.exePath!);
          if (detected) {
            ver = detected;
            modified = true;
          }
        }

        if (!lastModIso) {
          const lastMod = await detectGameExeLastModified(game.exePath!);
          if (lastMod) {
            lastModIso = lastMod.toISOString();
            modified = true;
          }
        }

        if (modified && isMounted) {
          let shouldClearUpdate = false;
          const targetPostDate =
            game.updateInfo?.date ||
            game.fitgirlUploadDate ||
            game.steamripUploadDate;
          if (
            lastModIso &&
            targetPostDate &&
            isGameUpToDateByDate(lastModIso, targetPostDate, 10)
          ) {
            shouldClearUpdate = true;
          }

          const updated: Game = {
            ...game,
            installedVersion: ver,
            version: game.version || ver,
            installedLastModified: lastModIso,
            hasUpdate: shouldClearUpdate ? false : game.hasUpdate,
            updateInfo: shouldClearUpdate ? undefined : game.updateInfo,
          };
          setCurrentGame(updated);
          updateGameInStorage(updated);
          if (onGameUpdated) onGameUpdated(updated);
        }
      })();
    }

    return () => {
      isMounted = false;
    };
  }, [game]);

  if (!currentGame) {
    return null;
  }

  const isLinkedFitgirl = Boolean(
    currentGame.linkedFitgirlUrl ||
    (currentGame.source === "fitgirl" && Boolean(currentGame.repackUrl)),
  );
  const isLinkedSteamrip = Boolean(
    currentGame.linkedSteamripUrl ||
    (currentGame.source === "steamrip" && Boolean(currentGame.repackUrl)),
  );
  const isLinkedIgdb = Boolean(currentGame.igdbId);

  const magnetLinks = useMemo(
    () => extractMagnetLinks(currentGame.mirrorGroups),
    [currentGame.mirrorGroups],
  );

  const directLinks = useMemo(
    () => extractDirectDownloadLinks(currentGame.mirrorGroups),
    [currentGame.mirrorGroups],
  );

  const totalDownloadLinksCount = magnetLinks.length + directLinks.length;
  const primaryMagnet = magnetLinks[0]?.url || null;

  const isIgnored = (postDate?: string) => {
    if (!currentGame?.ignoredUpdateDate) return false;
    if (!postDate) return true;
    if (currentGame.ignoredUpdateDate === postDate) return true;
    const ignTime = parseDateSafe(currentGame.ignoredUpdateDate);
    const postTime = parseDateSafe(postDate);
    if (ignTime !== null && postTime !== null && ignTime >= postTime)
      return true;
    return false;
  };

  const versionComparison = useMemo(() => {
    if (!currentGame) return null;
    const installedVer =
      currentGame.installedVersion ||
      (currentGame.exePath ? currentGame.version : undefined) ||
      (currentGame.isInstalled ? currentGame.version : undefined);
    const fitgirlVer =
      currentGame.fitgirlVersion ||
      (isLinkedFitgirl
        ? currentGame.version ||
          extractGameVersion(currentGame.title, currentGame.summary)
        : undefined);
    const steamripVer =
      currentGame.steamripVersion ||
      (isLinkedSteamrip
        ? currentGame.version ||
          extractGameVersion(currentGame.title, currentGame.summary)
        : undefined);

    const hasFitgirlUpdate = Boolean(
      currentGame.installedLastModified &&
      currentGame.fitgirlUploadDate &&
      !isIgnored(currentGame.fitgirlUploadDate) &&
      !isGameUpToDateByDate(
        currentGame.installedLastModified,
        currentGame.fitgirlUploadDate,
        10,
      ),
    );
    const hasSteamripUpdate = Boolean(
      currentGame.installedLastModified &&
      currentGame.steamripUploadDate &&
      !isIgnored(currentGame.steamripUploadDate) &&
      !isGameUpToDateByDate(
        currentGame.installedLastModified,
        currentGame.steamripUploadDate,
        10,
      ),
    );

    const fgRelease = {
      version: fitgirlVer,
      date: currentGame.fitgirlUploadDate,
    };
    const srRelease = {
      version: steamripVer,
      date: currentGame.steamripUploadDate,
    };

    const fgVsSr =
      fitgirlVer && steamripVer
        ? compareReleaseSources(fgRelease, srRelease)
        : 0;

    const isFitgirlHighest = Boolean(
      fitgirlVer &&
      (fgVsSr > 0 || (isLinkedFitgirl && !isLinkedSteamrip)),
    );
    const isSteamripHighest = Boolean(
      steamripVer &&
      (fgVsSr < 0 || (isLinkedSteamrip && !isLinkedFitgirl)),
    );
    const isInstalledHighest = Boolean(
      installedVer &&
      isHighestVersion(installedVer, [fitgirlVer, steamripVer]) &&
      (fitgirlVer || steamripVer),
    );

    return {
      installedVer,
      fitgirlVer,
      steamripVer,
      hasFitgirlUpdate,
      hasSteamripUpdate,
      isFitgirlHighest,
      isSteamripHighest,
      isInstalledHighest,
    };
  }, [
    currentGame,
    isLinkedFitgirl,
    isLinkedSteamrip,
  ]);

  const cleanedSummary = useMemo(
    () => cleanGameSummary(currentGame.summary),
    [currentGame.summary],
  );
  const cleanedStoryline = useMemo(
    () => cleanGameSummary(currentGame.storyline),
    [currentGame.storyline],
  );

  const sortedScreenshots = useMemo(() => {
    if (!currentGame.screenshots || currentGame.screenshots.length === 0)
      return [];
    const allScreenshots = currentGame.screenshots || [];
    const gifScreenshots = allScreenshots.filter(
      (s) => s && /\.gif(?:\?.*)?$/i.test(s),
    );
    const staticScreenshots = allScreenshots.filter(
      (s) => s && !/\.gif(?:\?.*)?$/i.test(s),
    );
    return [...gifScreenshots, ...staticScreenshots];
  }, [currentGame.screenshots]);

  const hosters = useMemo(() => {
    if (!directLinks.length) return [];
    const byHoster = directLinks.reduce<Record<string, typeof directLinks>>(
      (acc, link) => {
        let hoster = link.url;
        try {
          let h = new URL(link.url).hostname.replace(/^www\./, "");
          const parts = h.split(".");
          if (parts.length > 2) h = parts.slice(-2).join(".");
          hoster = h;
        } catch {}
        if (!acc[hoster]) acc[hoster] = [];
        acc[hoster].push(link);
        return acc;
      },
      {},
    );
    return Object.entries(byHoster).sort((a, b) => b[1].length - a[1].length);
  }, [directLinks]);

  const handleIgnoreUpdate = (postDate?: string) => {
    if (!currentGame) return;
    const dateToIgnore =
      postDate ||
      currentGame.updateInfo?.date ||
      currentGame.fitgirlUploadDate ||
      currentGame.steamripUploadDate ||
      currentGame.releaseDate ||
      new Date().toISOString();

    ignoreGameUpdate(currentGame.id, dateToIgnore);
    const updated = {
      ...currentGame,
      ignoredUpdateDate: dateToIgnore,
      hasUpdate: false,
      updateInfo: undefined,
    };
    setCurrentGame(updated);
    updateGameInStorage(updated);
    if (onGameUpdated) onGameUpdated(updated);
  };

  const handleUnignoreUpdate = () => {
    if (!currentGame) return;
    unignoreGameUpdate(currentGame.id);
    const updated = {
      ...currentGame,
      ignoredUpdateDate: undefined,
    };
    setCurrentGame(updated);
    updateGameInStorage(updated);
    if (onGameUpdated) onGameUpdated(updated);
  };

  const handleStatusChange = (
    status: "installed" | "wishlist" | "completed" | "none",
  ) => {
    if (!currentGame) return;
    setGameStatus(currentGame.id, status);
    const isInst = status === "installed";
    const isWish = status === "wishlist";
    const isComp = status === "completed";
    const currentTags = currentGame.tags || [];
    const nextTags = isComp
      ? Array.from(new Set([...currentTags, "Completed"]))
      : currentTags.filter((t) => t !== "Completed");

    const updated: Game = {
      ...currentGame,
      isInstalled: isInst,
      isWishlisted: isWish,
      isCompleted: isComp,
      completedAt: isComp
        ? currentGame.completedAt || new Date().toISOString()
        : undefined,
      tags: nextTags,
    };
    setCurrentGame(updated);
    if (onGameUpdated) onGameUpdated(updated);
  };

  const handleDismissUpdate = () => {
    handleIgnoreUpdate();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleStartMagnetDownload = (magnetUrl: string) => {
    if (onOpenTorrentDownload) {
      onOpenTorrentDownload({
        magnetUrl,
        title: currentGame.title,
        coverUrl: currentGame.coverUrl,
        repackSize: currentGame.repackSize,
      });
      onClose();
    } else {
      openInBrowser(magnetUrl);
    }
  };

  // Linking handlers
  const handleLinkAll = async () => {
    setIsLinking(true);
    setLinkMessage(null);
    try {
      const res = await linkGameToAllSources(currentGame, customSearchTitle);
      setCurrentGame(res.game);
      if (onGameUpdated) onGameUpdated(res.game);

      const matched: string[] = [];
      if (res.igdbSuccess) matched.push("IGDB");
      if (res.fitgirlSuccess) matched.push("FitGirl");
      if (res.steamripSuccess) matched.push("SteamRIP");

      if (matched.length > 0) {
        setLinkMessage({
          type: "success",
          text: `Successfully linked ${matched.join(", ")} metadata & mirrors!`,
        });
        if (res.fitgirlSuccess || res.steamripSuccess) {
          setActiveTab("downloads");
        }
      } else {
        setLinkMessage({
          type: "info",
          text: "No matches found with current title. Click 'Search & Match Dialog' to pick an exact version.",
        });
        setShowSearchInput(true);
      }
    } catch (err) {
      setLinkMessage({
        type: "error",
        text: "An error occurred while linking sources.",
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleLinkSingle = async (source: "igdb" | "fitgirl" | "steamrip") => {
    setIsLinking(true);
    setLinkMessage(null);
    try {
      let res: { success: boolean; game: Game };
      if (source === "igdb") {
        res = await linkGameToIgdb(currentGame, customSearchTitle);
      } else if (source === "fitgirl") {
        res = await linkGameToFitGirl(currentGame, customSearchTitle);
      } else {
        res = await linkGameToSteamRIP(currentGame, customSearchTitle);
      }

      if (res.success) {
        setCurrentGame(res.game);
        if (onGameUpdated) onGameUpdated(res.game);
        setLinkMessage({
          type: "success",
          text: `Successfully linked to ${source.toUpperCase()}!`,
        });
        if (source === "fitgirl" || source === "steamrip") {
          setActiveTab("downloads");
        }
      } else {
        setLinkMessage({
          type: "info",
          text: `No matching game found on ${source.toUpperCase()}. Click 'Search & Match Dialog' below to search manually.`,
        });
        setShowSearchInput(true);
      }
    } catch (err) {
      setLinkMessage({
        type: "error",
        text: `Failed to link to ${source.toUpperCase()}.`,
      });
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <>
      <Modal
        opened={!!currentGame}
        onClose={onClose}
        size="xl"
        padding={0}
        radius="xl"
        withCloseButton={false}
        styles={{
          content: {
            maxWidth: "880px",
            width: "95vw",
          },
        }}
      >
        {/* Top Banner Backdrop */}
        <Box pos="relative" h={200} bg="dark.9">
          <Image
            src={currentGame.bannerUrl || currentGame.coverUrl}
            h={200}
            alt={currentGame.title}
            fit="cover"
            style={{ opacity: 0.45 }}
            fallbackSrc={currentGame.coverUrl}
          />
          <Box
            pos="absolute"
            inset={0}
            style={{
              background:
                "linear-gradient(to top, var(--mantine-color-dark-7) 10%, transparent 100%)",
            }}
          />
        </Box>

        {/* Main Content Area */}
        <Stack
          p="lg"
          gap="md"
          style={{ marginTop: -70, position: "relative", zIndex: 2 }}
        >
          {/* Header Profile Section (Cover + Full Title Info) */}
          <Group align="flex-start" gap="md" wrap="nowrap">
            <Paper
              radius="md"
              style={{
                width: 130,
                height: 175,
                flexShrink: 0,
                overflow: "hidden",
                border: "2px solid var(--mantine-color-dark-4)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            >
              <Image src={currentGame.coverUrl} h={175} fit="cover" />
            </Paper>

            {versionComparison && (
              <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs" wrap="wrap">
                  {(currentGame.releaseDate || currentGame.releaseYear) && (
                    <Badge
                      color="blue"
                      variant="light"
                      size="sm"
                      leftSection={<Calendar size={12} />}
                    >
                      {currentGame.releaseDate
                        ? new Date(currentGame.releaseDate).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            },
                          )
                        : currentGame.releaseYear}
                    </Badge>
                  )}
                  {currentGame.rating && (
                    <Badge
                      color="yellow"
                      variant="light"
                      size="sm"
                      leftSection={<Star size={12} fill="#fcc419" />}
                    >
                      {currentGame.rating}/100
                    </Badge>
                  )}
                  {currentGame.repackSize && (
                    <Badge color="grape" variant="light" size="sm">
                      {currentGame.repackSize}
                    </Badge>
                  )}
                  {versionComparison.installedVer && (
                    <Badge
                      color="teal"
                      variant="light"
                      size="sm"
                      style={{
                        border: versionComparison.isInstalledHighest
                          ? "1.5px solid #40c057"
                          : undefined,
                        boxShadow: versionComparison.isInstalledHighest
                          ? "0 0 8px rgba(64, 192, 87, 0.35)"
                          : undefined,
                      }}
                    >
                      {versionComparison.installedVer.toLowerCase().startsWith("build") ||
                      versionComparison.installedVer.toLowerCase().startsWith("version") ||
                      versionComparison.installedVer.toLowerCase().startsWith("v")
                        ? versionComparison.installedVer
                        : `Installed: ${versionComparison.installedVer}`}
                    </Badge>
                  )}
                  {versionComparison.hasFitgirlUpdate && (
                    <Badge
                      color="yellow"
                      variant="filled"
                      size="sm"
                      leftSection={<Sparkles size={11} />}
                    >
                      Newer in FitGirl ({versionComparison.fitgirlVer})
                    </Badge>
                  )}
                  {versionComparison.hasSteamripUpdate && (
                    <Badge
                      color="yellow"
                      variant="filled"
                      size="sm"
                      leftSection={<Sparkles size={11} />}
                    >
                      Newer in SteamRIP ({versionComparison.steamripVer})
                    </Badge>
                  )}
                  {currentGame.isCompleted && (
                    <Badge
                      color="teal"
                      variant="filled"
                      size="sm"
                      leftSection={<CheckCircle2 size={11} />}
                    >
                      COMPLETED
                    </Badge>
                  )}
                </Group>

                <Title
                  order={2}
                  c="white"
                  style={{ wordBreak: "break-word", lineHeight: 1.25 }}
                >
                  {cleanGameTitle(currentGame.title)}
                </Title>

                <Group gap="md" wrap="wrap">
                  <Group gap={4}>
                    <Clock size={15} color="#38d9a9" />
                    <Text size="xs" fw={700} c="teal.3" ff="monospace">
                      {formatPlaytime(currentGame, isPlaying, activeTimerSeconds)}
                    </Text>
                  </Group>
                  {currentGame.developer && (
                    <Text size="xs" c="dimmed">
                      Dev: {currentGame.developer}
                    </Text>
                  )}
                </Group>

                {/* Linked Source Badges with Exact Versions & Highest Version Highlight */}
                <Group gap={6} mt={2} wrap="wrap">
                  {isLinkedIgdb ? (
                    <Badge size="xs" color="violet" variant="dot">
                      IGDB Linked
                    </Badge>
                  ) : null}
                  {isLinkedFitgirl ? (
                    <Badge
                      size="xs"
                      color="pink"
                      variant={versionComparison.isFitgirlHighest ? "filled" : "dot"}
                      style={{
                        cursor: "pointer",
                        border: versionComparison.isFitgirlHighest
                          ? "1.5px solid #40c057"
                          : undefined,
                        boxShadow: versionComparison.isFitgirlHighest
                          ? "0 0 8px rgba(64, 192, 87, 0.35)"
                          : undefined,
                      }}
                      onClick={() =>
                        currentGame.linkedFitgirlUrl &&
                        openInBrowser(currentGame.linkedFitgirlUrl)
                      }
                    >
                      FitGirl: {versionComparison.fitgirlVer || "Linked"}
                      {versionComparison.isFitgirlHighest && isLinkedSteamrip
                        ? " (LATEST)"
                        : ""}{" "}
                      ↗
                    </Badge>
                  ) : null}
                  {isLinkedSteamrip ? (
                    <Badge
                      size="xs"
                      color="cyan"
                      variant={versionComparison.isSteamripHighest ? "filled" : "dot"}
                      style={{
                        cursor: "pointer",
                        border: versionComparison.isSteamripHighest
                          ? "1.5px solid #40c057"
                          : undefined,
                        boxShadow: versionComparison.isSteamripHighest
                          ? "0 0 8px rgba(64, 192, 87, 0.35)"
                          : undefined,
                      }}
                      onClick={() =>
                        currentGame.linkedSteamripUrl &&
                        openInBrowser(currentGame.linkedSteamripUrl)
                      }
                    >
                      SteamRIP: {versionComparison.steamripVer || "Linked"}
                      {versionComparison.isSteamripHighest && isLinkedFitgirl
                        ? " (LATEST)"
                        : ""}{" "}
                      ↗
                    </Badge>
                  ) : null}
                </Group>
              </Stack>
            )}
          </Group>

          {/* Action Buttons Toolbar */}
          <Group gap="xs" wrap="wrap" justify="flex-start">
            {/* Quick Download Button if Magnet exists and game is NOT installed */}
            {primaryMagnet &&
              !currentGame.isInstalled &&
              (!currentGame.exePath || currentGame.exePath.trim() === "") && (
                <Tooltip label="Download game files via Magnet Torrent" withArrow>
                  <Button
                    size="sm"
                    color="grape"
                    radius="md"
                    leftSection={<Magnet size={16} />}
                    onClick={() => handleStartMagnetDownload(primaryMagnet)}
                  >
                    DOWNLOAD
                  </Button>
                </Tooltip>
              )}

            {/* Launch or Running Button */}
            {currentGame.exePath && currentGame.exePath.trim() !== "" ? (
              <Button
                size="sm"
                color={isPlaying ? "teal" : "blue"}
                radius="md"
                leftSection={
                  isPlaying ? (
                    <Square size={16} fill="white" />
                  ) : (
                    <Play size={16} fill="white" />
                  )
                }
                onClick={() => {
                  onLaunch(currentGame);
                  if (!isPlaying) onClose();
                }}
              >
                {isPlaying ? "RUNNING (STOP)" : "LAUNCH"}
              </Button>
            ) : null}

            {/* Combined Status Dropdown Menu */}
            <Menu shadow="md" width={180} position="bottom-start" radius="md">
              <Menu.Target>
                <Button
                  size="sm"
                  radius="md"
                  variant="filled"
                  color={
                    currentGame.isInstalled
                      ? "blue"
                      : currentGame.isWishlisted
                        ? "orange"
                        : currentGame.isCompleted
                          ? "teal"
                          : "gray"
                  }
                  leftSection={
                    currentGame.isInstalled ? (
                      <HardDrive size={15} />
                    ) : currentGame.isWishlisted ? (
                      <Bookmark size={15} fill="white" />
                    ) : currentGame.isCompleted ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <Clock size={15} />
                    )
                  }
                  rightSection={<ChevronDown size={14} />}
                >
                  {currentGame.isInstalled
                    ? "INSTALLED"
                    : currentGame.isWishlisted
                      ? "WISHLIST"
                      : currentGame.isCompleted
                        ? "COMPLETED"
                        : "SET STATUS"}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Change Status</Menu.Label>
                <Menu.Item
                  leftSection={<HardDrive size={14} color="#3b82f6" />}
                  rightSection={
                    currentGame.isInstalled ? (
                      <Check size={13} color="#3b82f6" />
                    ) : undefined
                  }
                  onClick={() => handleStatusChange("installed")}
                >
                  Installed
                </Menu.Item>
                <Menu.Item
                  leftSection={
                    <Bookmark
                      size={14}
                      color="#f97316"
                      fill={currentGame.isWishlisted ? "#f97316" : "none"}
                    />
                  }
                  rightSection={
                    currentGame.isWishlisted ? (
                      <Check size={13} color="#f97316" />
                    ) : undefined
                  }
                  onClick={() => handleStatusChange("wishlist")}
                >
                  Wishlist
                </Menu.Item>
                <Menu.Item
                  leftSection={<CheckCircle2 size={14} color="#10b981" />}
                  rightSection={
                    currentGame.isCompleted ? (
                      <Check size={13} color="#10b981" />
                    ) : undefined
                  }
                  onClick={() => handleStatusChange("completed")}
                >
                  Completed
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<RotateCcw size={14} />}
                  color="dimmed"
                  onClick={() => handleStatusChange("none")}
                >
                  Clear Status
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            {/* Direct Edit / Link Sources Button — Opens Matching Dialog Immediately */}
            <Button
              size="sm"
              variant="light"
              color="indigo"
              radius="md"
              leftSection={<Link2 size={15} />}
              onClick={() => setIsSourceLinkerOpen(true)}
            >
              {isLinkedFitgirl || isLinkedSteamrip || isLinkedIgdb
                ? "Edit Sources"
                : "Link Sources"}
            </Button>

            {onEdit && (
              <Button
                size="sm"
                variant="default"
                radius="md"
                leftSection={<Edit3 size={15} color="#4dabf7" />}
                onClick={() => {
                  onClose();
                  onEdit(currentGame);
                }}
              >
                Edit
              </Button>
            )}

            {onUninstall && currentGame.exePath && (
              <HoldToUninstallButton
                onUninstallConfirmed={() => {
                  onUninstall(currentGame.id);
                  onClose();
                }}
              />
            )}
          </Group>

          {/* Custom Search Query Bar if expanded */}
          {showSearchInput && (
            <Paper
              p="xs"
              radius="md"
              bg="var(--mantine-color-default)"
              style={{
                border: "1px solid var(--mantine-color-default-border)",
              }}
            >
              <Group gap="xs">
                <TextInput
                  size="xs"
                  placeholder="Enter title to search IGDB / FitGirl / SteamRIP..."
                  value={customSearchTitle}
                  onChange={(e) => setCustomSearchTitle(e.target.value)}
                  style={{ flex: 1 }}
                  leftSection={<Search size={14} />}
                />
                <Button
                  size="xs"
                  color="indigo"
                  onClick={handleLinkAll}
                  loading={isLinking}
                >
                  Search & Link
                </Button>
              </Group>
            </Paper>
          )}

          {/* Feedback Message Alert */}
          {linkMessage && (
            <Alert
              color={
                linkMessage.type === "success"
                  ? "teal"
                  : linkMessage.type === "error"
                    ? "red"
                    : "blue"
              }
              radius="md"
              p="xs"
              withCloseButton
              onClose={() => setLinkMessage(null)}
            >
              <Text size="xs" fw={600}>
                {linkMessage.text}
              </Text>
            </Alert>
          )}

          {/* Update Notification Banner */}
          {currentGame.hasUpdate &&
            !isIgnored(
              currentGame.updateInfo?.date ||
                currentGame.fitgirlUploadDate ||
                currentGame.steamripUploadDate,
            ) &&
            (currentGame.isInstalled ||
              (currentGame.exePath && currentGame.exePath.trim() !== "")) &&
            (currentGame.installedLastModified
              ? !isGameUpToDateByDate(
                  currentGame.installedLastModified,
                  currentGame.updateInfo?.date ||
                    currentGame.fitgirlUploadDate ||
                    currentGame.steamripUploadDate,
                  10,
                )
              : true) && (
              <Paper
                p="sm"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  borderLeft: "4px solid var(--mantine-color-yellow-5)",
                  borderTop: "1px solid var(--mantine-color-default-border)",
                  borderRight: "1px solid var(--mantine-color-default-border)",
                  borderBottom: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Group justify="space-between" align="center">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Sparkles
                        size={16}
                        color="var(--mantine-color-yellow-4)"
                      />
                      <Text size="sm" fw={700} c="yellow.4">
                        New Update Available!
                      </Text>
                      {currentGame.updateInfo?.source && (
                        <Badge
                          color={
                            currentGame.updateInfo.source === "steamrip"
                              ? "cyan"
                              : "pink"
                          }
                          size="xs"
                          variant="light"
                        >
                          {currentGame.updateInfo.source === "steamrip"
                            ? "SteamRIP"
                            : "FitGirl Repacks"}
                        </Badge>
                      )}
                      {currentGame.updateInfo?.version && (
                        <Badge color="yellow" size="xs" variant="outline">
                          {currentGame.updateInfo.version}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {currentGame.updateInfo?.postTitle ||
                        "A newer update or repack is available for this game."}
                    </Text>
                  </Stack>

                  <Group gap="xs">
                    {currentGame.updateInfo?.url && (
                      <Button
                        variant="light"
                        color="yellow"
                        size="xs"
                        radius="md"
                        rightSection={<ExternalLink size={12} />}
                        onClick={() =>
                          currentGame.updateInfo?.url &&
                          openInBrowser(currentGame.updateInfo.url)
                        }
                      >
                        View Update Post
                      </Button>
                    )}
                    <Button
                      variant="subtle"
                      color="gray"
                      size="xs"
                      radius="md"
                      leftSection={<EyeOff size={13} />}
                      onClick={() => handleIgnoreUpdate()}
                    >
                      Ignore Update
                    </Button>
                  </Group>
                </Group>
              </Paper>
            )}

          {currentGame.ignoredUpdateDate && (
            <Paper
              p="xs"
              px="sm"
              radius="md"
              bg="var(--mantine-color-dark-7)"
              style={{
                border: "1px dashed var(--mantine-color-default-border)",
              }}
            >
              <Group justify="space-between" align="center">
                <Group gap="xs">
                  <EyeOff size={14} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" c="dimmed">
                    Update notifications are ignored for this game release.
                  </Text>
                </Group>
                <Button
                  variant="subtle"
                  color="blue"
                  size="compact-xs"
                  leftSection={<RotateCcw size={12} />}
                  onClick={handleUnignoreUpdate}
                >
                  Restore Update Checking
                </Button>
              </Group>
            </Paper>
          )}

          {/* Modal Body Tabs */}
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            radius="md"
            color="blue"
            keepMounted={false}
          >
            <Tabs.List>
              <Tabs.Tab value="overview" leftSection={<Info size={14} />}>
                Overview
              </Tabs.Tab>
              <Tabs.Tab
                value="downloads"
                leftSection={<DownloadCloud size={14} />}
                rightSection={
                  totalDownloadLinksCount > 0 ? (
                    <Badge size="xs" variant="filled" color="grape" px={6}>
                      {totalDownloadLinksCount}
                    </Badge>
                  ) : null
                }
              >
                Downloads & Mirrors
              </Tabs.Tab>
              <Tabs.Tab value="media" leftSection={<Film size={14} />}>
                Media & Gallery
              </Tabs.Tab>
              <Tabs.Tab value="history" leftSection={<Clock size={14} />}>
                Play History
              </Tabs.Tab>
            </Tabs.List>

            {/* 1. OVERVIEW TAB */}
            <Tabs.Panel value="overview" pt="md">
              <Stack gap="md">
                {/* Genres */}
                {currentGame.genres && currentGame.genres.length > 0 && (
                  <Group gap="xs">
                    {currentGame.genres.map((genre) => (
                      <Badge
                        key={genre}
                        variant="light"
                        color="blue"
                        size="sm"
                        leftSection={<Tag size={10} />}
                      >
                        {genre}
                      </Badge>
                    ))}
                  </Group>
                )}

                {/* Summary / Storyline */}
                {cleanedSummary ? (
                  <Stack gap={4}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      About Game
                    </Text>
                    <Paper
                      p="sm"
                      bg="var(--mantine-color-default)"
                      style={{
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Text size="sm" style={{ lineHeight: 1.6 }}>
                        {cleanedSummary}
                      </Text>
                      {cleanedStoryline && (
                        <Text
                          size="xs"
                          c="dimmed"
                          mt="xs"
                          style={{ lineHeight: 1.5 }}
                        >
                          {cleanedStoryline}
                        </Text>
                      )}
                    </Paper>
                  </Stack>
                ) : (
                  <Paper
                    p="md"
                    radius="md"
                    bg="var(--mantine-color-default)"
                    style={{
                      border: "1px solid var(--mantine-color-default-border)",
                      textAlign: "center",
                    }}
                  >
                    <Text size="xs" c="dimmed">
                      No description available. Click "Link Sources" above to
                      fetch full summary from IGDB!
                    </Text>
                  </Paper>
                )}

                {/* Executable Path */}
                {currentGame.exePath && (
                  <Stack gap={4}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Executable Path
                    </Text>
                    <Paper
                      p="xs"
                      bg="var(--mantine-color-default)"
                      style={{
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Group gap="xs">
                        <Folder size={16} color="#4dabf7" />
                        <Text
                          size="xs"
                          ff="monospace"
                          c="dimmed"
                          style={{ wordBreak: "break-all" }}
                        >
                          {currentGame.exePath}
                        </Text>
                      </Group>
                    </Paper>
                  </Stack>
                )}
              </Stack>
            </Tabs.Panel>

            {/* 2. DOWNLOADS TAB */}
            <Tabs.Panel value="downloads" pt="md">
              <Stack gap="md">
                {totalDownloadLinksCount > 0 ? (
                  <>
                    {/* Torrent Magnets Section */}
                    {magnetLinks.length > 0 && (
                      <Stack gap="xs">
                        <Group gap="xs">
                          <Magnet size={16} color="#e599f7" />
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Torrent Magnet Links ({magnetLinks.length})
                          </Text>
                        </Group>

                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                          {magnetLinks.map((mag, idx) => (
                            <Card
                              key={idx}
                              p="xs"
                              radius="md"
                              bg="var(--mantine-color-default)"
                              style={{
                                border:
                                  "1px solid var(--mantine-color-default-border)",
                              }}
                            >
                              <Stack gap="xs">
                                <Group justify="space-between">
                                  <Badge
                                    size="xs"
                                    color="grape"
                                    variant="light"
                                  >
                                    {mag.groupName}
                                  </Badge>
                                  <Text
                                    size="xs"
                                    fw={700}
                                    truncate
                                    style={{ flex: 1, marginLeft: 6 }}
                                  >
                                    {mag.name || "Torrent Magnet"}
                                  </Text>
                                </Group>

                                <Group gap="xs">
                                  <Button
                                    size="xs"
                                    color="grape"
                                    variant="filled"
                                    leftSection={<DownloadCloud size={13} />}
                                    style={{ flex: 1 }}
                                    onClick={() =>
                                      handleStartMagnetDownload(mag.url)
                                    }
                                  >
                                    Download Torrent
                                  </Button>
                                  <Tooltip
                                    label={
                                      copiedLink === mag.url
                                        ? "Copied!"
                                        : "Copy Magnet"
                                    }
                                    withArrow
                                  >
                                    <ActionIcon
                                      size="input-xs"
                                      variant="light"
                                      color={
                                        copiedLink === mag.url ? "teal" : "gray"
                                      }
                                      onClick={() => handleCopy(mag.url)}
                                    >
                                      {copiedLink === mag.url ? (
                                        <Check size={14} />
                                      ) : (
                                        <Copy size={14} />
                                      )}
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              </Stack>
                            </Card>
                          ))}
                        </SimpleGrid>
                      </Stack>
                    )}

                    {/* Direct Mirrors Section — grouped by hoster */}
                    {hosters.length > 0 && (
                      <Stack gap="xs">
                        <Group gap="xs">
                          <DownloadCloud size={16} color="#38d9a9" />
                          <Text
                            size="xs"
                            fw={700}
                            c="dimmed"
                            tt="uppercase"
                          >
                            Direct Mirrors & Filehosters (
                            {directLinks.length}) · {hosters.length} Hosters
                          </Text>
                        </Group>

                        <Stack gap={4}>
                          {hosters.map(([hoster, links]) => (
                            <DirectHosterAccordion
                              key={hoster}
                              hoster={hoster}
                              links={links}
                            />
                          ))}
                        </Stack>
                      </Stack>
                    )}
                  </>
                ) : (
                  <Paper
                    p="xl"
                    radius="md"
                    bg="var(--mantine-color-default)"
                    style={{
                      textAlign: "center",
                      border: "1px solid var(--mantine-color-default-border)",
                    }}
                  >
                    <Stack align="center" gap="sm">
                      <DownloadCloud size={36} color="#5c5f66" />
                      <Text size="sm" fw={700}>
                        No Downloads or Mirrors Attached
                      </Text>
                      <Text size="xs" c="dimmed" style={{ maxWidth: 400 }}>
                        Link this game to FitGirl or SteamRIP to automatically
                        fetch verified torrent magnet links and direct mirrors.
                      </Text>
                      <Group gap="xs" mt="xs">
                        <Button
                          size="xs"
                          color="indigo"
                          variant="filled"
                          leftSection={<Link2 size={14} />}
                          onClick={() => setIsSourceLinkerOpen(true)}
                        >
                          {isLinkedFitgirl || isLinkedSteamrip
                            ? "Edit Sources"
                            : "Search & Link Sources"}
                        </Button>
                      </Group>
                    </Stack>
                  </Paper>
                )}
              </Stack>
            </Tabs.Panel>

            {/* 3. MEDIA & GALLERY TAB */}
            <Tabs.Panel value="media" pt="md">
              <Stack gap="md">
                {/* Screenshots */}
                {sortedScreenshots.length > 0 && (
                  <Stack gap="xs">
                    <Group gap="xs">
                      <ImageIcon size={14} color="#4dabf7" />
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Media Gallery ({sortedScreenshots.length})
                      </Text>
                    </Group>
                    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                      {sortedScreenshots.map((img, i) => {
                        const isGif = /\.gif(?:\?.*)?$/i.test(img);
                        return (
                          <Paper
                            key={i}
                            radius="md"
                            style={{
                              position: "relative",
                              overflow: "hidden",
                              height: 120,
                              border: isGif
                                ? "1px solid var(--mantine-color-grape-6)"
                                : "1px solid var(--mantine-color-default-border)",
                            }}
                            bg="var(--mantine-color-body)"
                          >
                            <Image src={img} h={120} fit="cover" />
                            {isGif && (
                              <Badge
                                size="xs"
                                color="grape"
                                variant="filled"
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  zIndex: 2,
                                  pointerEvents: "none",
                                }}
                              >
                                GIF
                              </Badge>
                            )}
                          </Paper>
                        );
                      })}
                    </SimpleGrid>
                  </Stack>
                )}

                {/* Video Trailer */}
                {currentGame.videos && currentGame.videos.length > 0 && (
                  <Stack gap="xs">
                    <Group gap="xs">
                      <Film size={14} color="#da77f2" />
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Video Trailer
                      </Text>
                    </Group>
                    <Box
                      style={{
                        overflow: "hidden",
                        borderRadius: 8,
                        height: 240,
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                      bg="var(--mantine-color-body)"
                    >
                      <iframe
                        title={`${currentGame.title} Trailer`}
                        src={
                          currentGame.videos[0].startsWith("http")
                            ? currentGame.videos[0]
                            : `https://www.youtube.com/embed/${currentGame.videos[0]}`
                        }
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "none",
                        }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </Box>
                  </Stack>
                )}

                {sortedScreenshots.length === 0 &&
                  (!currentGame.videos || currentGame.videos.length === 0) && (
                    <Paper
                      p="xl"
                      radius="md"
                      bg="var(--mantine-color-default)"
                      style={{
                        textAlign: "center",
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Text size="xs" c="dimmed">
                        No media available. Link this game to IGDB or FitGirl to
                        pull high-res screenshots and trailers.
                      </Text>
                    </Paper>
                  )}
              </Stack>
            </Tabs.Panel>

            {/* 4. PLAY HISTORY TAB */}
            <Tabs.Panel value="history" pt="md">
              <Stack gap="xs">
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  Recent Play Sessions
                </Text>
                {(() => {
                  const sessions =
                    currentGame.playSessions && currentGame.playSessions.length > 0
                      ? currentGame.playSessions
                      : currentGame.lastPlayed &&
                          ((currentGame.playtimeMinutes !== undefined && currentGame.playtimeMinutes > 0) ||
                            (currentGame.hoursPlayed !== undefined && currentGame.hoursPlayed > 0))
                        ? [
                            {
                              id: "prev_session",
                              startTime: currentGame.lastPlayed,
                              durationMinutes:
                                currentGame.playtimeMinutes !== undefined && currentGame.playtimeMinutes > 0
                                  ? currentGame.playtimeMinutes
                                  : (currentGame.hoursPlayed ?? 0) * 60,
                            },
                          ]
                        : [];

                  if (sessions.length > 0) {
                    return (
                      <Stack gap={6} style={{ maxHeight: 200, overflowY: "auto" }}>
                        {sessions.map((session, index) => {
                          const sessionSecs = Math.round((session.durationMinutes || 0) * 60);
                          const sessionDisplay =
                            sessionSecs < 3600
                              ? `${Math.floor(sessionSecs / 60)}m ${sessionSecs % 60}s`
                              : `${(sessionSecs / 3600).toFixed(1)} hrs`;

                          return (
                            <Paper
                              key={session.id ?? session.startTime ?? index}
                              p="xs"
                              bg="var(--mantine-color-default)"
                              style={{
                                border:
                                  "1px solid var(--mantine-color-default-border)",
                              }}
                            >
                              <Group justify="space-between">
                                <Text size="xs" ff="monospace" c="dimmed">
                                  {new Date(session.startTime).toLocaleString()}
                                </Text>
                                <Text size="xs" ff="monospace" fw={700} c="teal.4">
                                  +{sessionDisplay}
                                </Text>
                              </Group>
                            </Paper>
                          );
                        })}
                      </Stack>
                    );
                  }

                  return (
                    <Paper
                      p="md"
                      radius="md"
                      bg="var(--mantine-color-default)"
                      style={{
                        textAlign: "center",
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Text size="xs" c="dimmed" fs="italic">
                        No play sessions recorded yet. Launch the game to start
                        tracking playtime!
                      </Text>
                    </Paper>
                  );
                })()}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Modal>

      {/* Dedicated Source & Metadata Linker Dialog */}
      <SourceLinkerModal
        opened={isSourceLinkerOpen}
        game={currentGame}
        onClose={() => setIsSourceLinkerOpen(false)}
        onGameUpdated={(updated) => {
          setCurrentGame(updated);
          if (onGameUpdated) onGameUpdated(updated);
        }}
      />
    </>
  );
};

export const GameDetailModal = React.memo(GameDetailModalComponent);
