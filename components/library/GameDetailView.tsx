"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Game } from "../../lib/types";
import {
  updateGameInStorage,
  toggleFavoriteGame,
  toggleCompletedGame,
  toggleWishlistGame,
  detectInstalledGameVersion,
  detectGameExeLastModified,
  isGameUpToDateByDate,
  ignoreGameUpdate,
  unignoreGameUpdate,
  setGameStatus,
} from "../../lib/db";
import { parseDateSafe } from "../../lib/versionDetector";
import {
  extractMagnetLinks,
  extractDirectDownloadLinks,
  cleanGameTitle,
  extractGameVersion,
  isNewerVersion,
  compareReleaseSources,
} from "../../lib/gameLinker";
import { HoldToConfirmButton } from "../HoldToConfirmButton";
import { SourceLinkerModal } from "./SourceLinkerModal";
import { ImageLightboxModal } from "../common/ImageLightboxModal";
import { openInBrowser } from "../../lib/openUrl";
import { RepackUpdateLink } from "../../lib/repackTypes";
import { isLinuxPlatform } from "../../lib/linuxRunner";
import { useGameMap } from "../../lib/gameMaps";
import { MapViewerModal } from "../maps";
import {
  Title,
  Text,
  Group,
  Stack,
  Badge,
  Button,
  Paper,
  Box,
  SimpleGrid,
  TextInput,
  ActionIcon,
  Tooltip,
  Alert,
  Tabs,
  Card,
  Collapse,
  UnstyledButton,
  Divider,
  ThemeIcon,
  Menu,
  Progress,
  Center,
  Image as MantineImage,
} from "@mantine/core";
import {
  Play,
  Square,
  Folder,
  Star,
  Tag,
  Edit3,
  Film,
  Image as ImageIcon,
  Check,
  FileCode,
  DownloadCloud,
  Magnet,
  Link2,
  Sparkles,
  Globe,
  Flame,
  Copy,
  ExternalLink,
  Info,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Trophy,
  Calendar,
  Building2,
  HardDrive,
  Layers,
  ArrowRight,
  Bookmark,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  Clock,
  MapPin,
  Map as MapIcon,
} from "lucide-react";

export interface ParsedUpdateItem {
  raw: RepackUpdateLink;
  title: string;
  fromVersion?: string;
  toVersion?: string;
  repacker?: string;
  isDirectDownload: boolean;
  hoster?: string;
}

export function parseGameUpdateItem(item: RepackUpdateLink): ParsedUpdateItem {
  const rawTitle = (item.title || "").trim();
  const rawNotes = (item.notes || "").trim();
  const url = (item.url || "").trim();

  let hoster: string | undefined = undefined;
  try {
    const parsed = new URL(url);
    let h = parsed.hostname.replace(/^www\./, "");
    const parts = h.split(".");
    if (parts.length > 2) {h = parts.slice(-2).join(".");}
    hoster = h;
  } catch {}

  const isDirectDownload = Boolean(
    rawTitle.toLowerCase().includes(".rar") ||
    rawTitle.toLowerCase().includes(".zip") ||
    rawTitle.toLowerCase().includes(".exe") ||
    rawTitle.toLowerCase().includes(".7z") ||
    rawTitle.toLowerCase().includes("update") ||
    url.toLowerCase().includes("filecrypt") ||
    url.toLowerCase().includes("multiup") ||
    url.toLowerCase().includes("1fichier") ||
    url.toLowerCase().includes("gofile") ||
    url.toLowerCase().includes("rapidgator") ||
    url.toLowerCase().includes("mega.nz") ||
    url.toLowerCase().includes("/container/"),
  );

  let fromVersion: string | undefined;
  let toVersion: string | undefined;

  const combined = `${rawTitle} ${rawNotes}`;
  const transitionMatch = combined.match(
    /(?:from[_\s]+)?(v?\d+[\w._-]+)[_\s]+to[_\s]+(v?\d+[\w._-]+)/i,
  );
  if (transitionMatch) {
    fromVersion = transitionMatch[1].replace(/^_+|_+$/g, "");
    toVersion = transitionMatch[2].replace(/^_+|_+$/g, "");
  }

  let repacker: string | undefined;
  const repackerMatch = combined.match(
    /\b(ElAmigos|CODEX|TENOKE|RUNE|SKIDROW|FLT|FitGirl)\b/i,
  );
  if (repackerMatch) {
    repacker = repackerMatch[0];
  }

  return {
    raw: item,
    title: rawTitle,
    fromVersion,
    toVersion,
    repacker,
    isDirectDownload,
    hoster,
  };
}

interface GameDetailViewProps {
  game: Game;
  onLaunch: (game: Game) => void;
  onEdit?: (game: Game) => void;
  onUninstall?: (id: string) => void;
  onRemoveFromWishlist?: (id: string) => void;
  onCloseModal?: () => void;
  isPlaying?: boolean;
  isAnyGameRunning?: boolean;
  onOpenTorrentDownload?: (data: {
    magnetUrl: string;
    title?: string;
    coverUrl?: string;
    repackSize?: string;
  }) => void;
  onGameUpdated?: (game: Game) => void;
}

/** Collapsible row for a single hoster in the direct downloads section */
const DirectHosterAccordion: React.FC<{
  hoster: string;
  links: { name: string; url: string; groupName: string; sourceUrl?: string }[];
  isUpdate?: boolean;
  sourcePageUrl?: string;
}> = ({ hoster, links, isUpdate = false, sourcePageUrl }) => {
  const [open, setOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const isMegaDb = hoster.toUpperCase() === "MEGADB" || links.some((l) => l.url.includes("megadb.net"));

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(url);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  return (
    <Paper
      radius="md"
      className="daze-glass-panel"
      style={{
        border: isUpdate
          ? "1px solid var(--mantine-color-cyan-8)"
          : "1px solid var(--mantine-color-default-border)",
        overflow: "hidden",
        boxShadow: isUpdate ? "0 0 10px rgba(6, 182, 212, 0.15)" : undefined,
      }}
    >
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          background: open ? "rgba(255, 255, 255, 0.03)" : "transparent",
          transition: "background-color 150ms ease",
        }}
      >
        <Group
          justify="space-between"
          align="center"
          px="md"
          py="sm"
          style={{ cursor: "pointer" }}
        >
          <Group gap="sm">
            <ThemeIcon
              size="sm"
              variant="light"
              color={isMegaDb ? "teal" : isUpdate ? "cyan" : "blue"}
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </ThemeIcon>
            <Globe
              size={15}
              color={
                isMegaDb
                  ? "var(--mantine-color-teal-4)"
                  : isUpdate
                  ? "var(--mantine-color-cyan-4)"
                  : "var(--mantine-color-blue-4)"
              }
            />
            <Text size="xs" fw={700} ff="monospace">
              {hoster.toUpperCase()}
            </Text>
            {isMegaDb && (
              <Badge size="xs" color="teal" variant="light">
                ANTI-HOTLINK
              </Badge>
            )}
            {isUpdate && (
              <Badge
                size="xs"
                color="cyan"
                variant="light"
                leftSection={<Sparkles size={10} />}
              >
                UPDATE BUILD
              </Badge>
            )}
          </Group>
          <Badge size="xs" variant="light" color={isMegaDb ? "teal" : isUpdate ? "cyan" : "gray"}>
            {links.length} {links.length === 1 ? "Link" : "Parts"}
          </Badge>
        </Group>
      </UnstyledButton>

      <Collapse expanded={open}>
        <Stack gap={6} p="sm" pt={0}>
          <Divider my={4} />
          {isMegaDb && (
            <Paper
              p="xs"
              radius="md"
              bg="rgba(14, 165, 233, 0.08)"
              style={{ border: "1px solid rgba(14, 165, 233, 0.2)" }}
            >
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <Info size={14} color="var(--mantine-color-blue-4)" style={{ flexShrink: 0, marginTop: 2 }} />
                <Text size="xs" c="dimmed">
                  MegaDB requires opening from the official SteamRIP post to prevent hotlinking errors (&ldquo;Referrer not allowed&rdquo;). The download button opens the game page directly.
                </Text>
              </Group>
            </Paper>
          )}
          <Stack gap="xs">
            {links.map((link, idx) => {
              const isMegaDbLink = link.url.includes("megadb.net");
              const targetUrl =
                isMegaDbLink && (link.sourceUrl || sourcePageUrl)
                  ? (link.sourceUrl || sourcePageUrl)
                  : link.url;

              const displayName =
                link.name &&
                link.name.trim() &&
                !link.name.toLowerCase().startsWith("mirror")
                  ? link.name
                  : `${hoster} — Mirror ${idx + 1}`;

              return (
                <Paper
                  key={idx}
                  p="xs"
                  radius="md"
                  className="daze-glass-card"
                  style={{
                    border: "1px solid var(--mantine-color-default-border)",
                  }}
                >
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap="xs" style={{ minWidth: 0, flex: 1 }}>
                      <DownloadCloud
                        size={15}
                        color={
                          isMegaDbLink
                            ? "var(--mantine-color-teal-4)"
                            : isUpdate
                            ? "var(--mantine-color-cyan-4)"
                            : "var(--mantine-color-blue-4)"
                        }
                      />
                      <Text size="xs" fw={600} truncate style={{ flex: 1 }}>
                        {displayName}
                      </Text>
                    </Group>

                    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                      <Button
                        size="xs"
                        variant="light"
                        color={isMegaDbLink ? "teal" : isUpdate ? "cyan" : "blue"}
                        rightSection={<ExternalLink size={12} />}
                        onClick={() => openInBrowser(targetUrl)}
                        radius="md"
                      >
                        {isMegaDbLink ? "Download (via SteamRIP)" : "Download"}
                      </Button>
                      <Tooltip
                        label={
                          copiedLink === link.url ? "Copied direct link!" : "Copy Link"
                        }
                        withArrow
                      >
                        <ActionIcon
                          size="input-xs"
                          variant="subtle"
                          color={copiedLink === link.url ? "teal" : "gray"}
                          onClick={() => handleCopy(link.url)}
                          aria-label="Copy link"
                        >
                          {copiedLink === link.url ? (
                            <Check size={14} />
                          ) : (
                            <Copy size={14} />
                          )}
                        </ActionIcon>
                      </Tooltip>
                      {isMegaDbLink && (
                        <Tooltip label="Open direct MegaDB link (Requires referer modifier extension in browser)" withArrow>
                          <ActionIcon
                            size="input-xs"
                            variant="subtle"
                            color="gray"
                            onClick={() => openInBrowser(link.url)}
                            aria-label="Open direct MegaDB link"
                          >
                            <ExternalLink size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        </Stack>
      </Collapse>
    </Paper>
  );
};

function cleanGameSummary(raw?: string): string {
  if (!raw) {return "";}
  let text = raw;
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/\.dlinks\s*\{[^}]*\}/gi, "");
  text = text.replace(/\{margin:[^}]*\}/gi, "");
  text = text.replace(/\[IDM\]\s*Click to show direct links/gi, "");
  text = text.replace(/Filehoster:\s*[^\n,]*/gi, "");
  text = text.replace(/Download Mirror\s*\([^)]*\)/gi, "");
  return text.trim();
}

export const GameDetailView: React.FC<GameDetailViewProps> = ({
  game,
  onLaunch,
  onEdit,
  onUninstall,
  onRemoveFromWishlist,
  onCloseModal,
  isPlaying = false,
  isAnyGameRunning = false,
  onOpenTorrentDownload,
  onGameUpdated,
}) => {
  const [currentGame, setCurrentGame] = useState<Game>(game);
  const [activeTab, setActiveTab] = useState<string | null>("overview");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [isSourceLinkerOpen, setIsSourceLinkerOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState(0);
  const { map: gameMap } = useGameMap(currentGame.title);

  const [isEditingExePath, setIsEditingExePath] = useState(false);
  const [exePathInput, setExePathInput] = useState(game.exePath || "");
  const isLinux = useMemo(() => isLinuxPlatform(), []);

  // Linker states
  const [isLinking, setIsLinking] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [customSearchTitle, setCustomSearchTitle] = useState("");
  const [showSearchInput, setShowSearchInput] = useState(false);

  useEffect(() => {
    if (game) {
      setCurrentGame(game);
      setExePathInput(game.exePath || "");
      setIsEditingExePath(false);
      setLinkMessage(null);
      setCustomSearchTitle(game.title || "");
      setShowSearchInput(false);

      // Auto-detect installed version and last modified date if installed
      if (game.exePath) {
        if (!game.installedVersion) {
          detectInstalledGameVersion(game.exePath).then((detected) => {
            if (detected) {
              const updated = {
                ...game,
                installedVersion: detected,
                version: game.version || detected,
              };
              setCurrentGame(updated);
              updateGameInStorage(updated);
              if (onGameUpdated) {onGameUpdated(updated);}
            }
          });
        }

        if (!game.installedLastModified) {
          detectGameExeLastModified(game.exePath).then((lastMod) => {
            if (lastMod) {
              const lastModIso = lastMod.toISOString();
              let shouldClearUpdate = false;
              if (!game.installedVersion) {
                const targetPostDate =
                  game.updateInfo?.date ||
                  game.fitgirlUploadDate ||
                  game.steamripUploadDate;
                if (
                  targetPostDate &&
                  isGameUpToDateByDate(lastMod, targetPostDate)
                ) {
                  shouldClearUpdate = true;
                }
              }
              const updated = {
                ...game,
                installedLastModified: lastModIso,
                hasUpdate: shouldClearUpdate ? false : game.hasUpdate,
                updateInfo: shouldClearUpdate ? undefined : game.updateInfo,
              };
              setCurrentGame(updated);
              updateGameInStorage(updated);
              if (onGameUpdated) {onGameUpdated(updated);}
            }
          });
        }
      }
    }
  }, [game]);

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

  const totalDownloadLinksCount =
    magnetLinks.length +
    directLinks.length +
    (currentGame.gameUpdates?.length || 0);
  const primaryMagnet = magnetLinks[0]?.url || null;

  const handleBrowseExe = async () => {
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const chosen = await open({
          filters: [{ name: "Executable", extensions: ["exe"] }],
          multiple: false,
        });
        if (chosen && typeof chosen === "string") {
          setExePathInput(chosen);
        }
      }
    } catch {
      // fallback
    }
  };

  const handleSaveExePath = async () => {
    if (!currentGame) {return;}
    const cleanExe = exePathInput.trim();
    let detectedVersion: string | undefined = currentGame.installedVersion;
    if (cleanExe && !detectedVersion) {
      detectedVersion = await detectInstalledGameVersion(cleanExe);
    }
    const updatedGame: Game = {
      ...currentGame,
      exePath: cleanExe,
      isInstalled: Boolean(cleanExe),
      installedVersion: detectedVersion || currentGame.installedVersion,
      installDirectory: cleanExe.includes("\\")
        ? cleanExe.substring(0, cleanExe.lastIndexOf("\\"))
        : currentGame.installDirectory,
    };
    updateGameInStorage(updatedGame);
    setCurrentGame(updatedGame);
    if (onGameUpdated) {onGameUpdated(updatedGame);}
    setIsEditingExePath(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(text);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleOpenFolder = async (path?: string) => {
    let target = path || currentGame.installDirectory || currentGame.workingDir;
    if (!target && currentGame.exePath) {
      const cleanExe = currentGame.exePath.trim();
      const lastSlash = Math.max(
        cleanExe.lastIndexOf("\\"),
        cleanExe.lastIndexOf("/"),
      );
      if (lastSlash > 0) {
        target = cleanExe.substring(0, lastSlash);
      } else {
        target = cleanExe;
      }
    }
    if (!target) {return;}
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_folder_in_explorer", { folderPath: target });
      }
    } catch (err) {
      console.warn(
        "open_folder_in_explorer failed, trying plugin-opener fallback:",
        err,
      );
      try {
        const { openPath } = await import("@tauri-apps/plugin-opener");
        await openPath(target);
      } catch (fallbackErr) {
        console.error("Failed opening folder:", fallbackErr);
      }
    }
  };

  const sortedScreenshots = useMemo(() => {
    if (!currentGame.screenshots || currentGame.screenshots.length === 0)
      {return [];}
    const allScreenshots = currentGame.screenshots || [];
    const gifScreenshots = allScreenshots.filter(
      (s) => s && /\.gif(?:\?.*)?$/i.test(s),
    );
    const staticScreenshots = allScreenshots.filter(
      (s) => s && !/\.gif(?:\?.*)?$/i.test(s),
    );
    return [...gifScreenshots, ...staticScreenshots];
  }, [currentGame.screenshots]);

  const bannerBackground = useMemo(() => {
    if (currentGame.bannerUrl) {return currentGame.bannerUrl;}
    if (currentGame.screenshots && currentGame.screenshots.length > 0) {
      return currentGame.screenshots[0];
    }
    return currentGame.coverUrl;
  }, [currentGame.bannerUrl, currentGame.screenshots, currentGame.coverUrl]);

  const handleStartMagnetDownload = (magnetUrl: string) => {
    if (onOpenTorrentDownload) {
      onOpenTorrentDownload({
        magnetUrl,
        title: currentGame.title,
        coverUrl: currentGame.coverUrl,
        repackSize: currentGame.repackSize,
      });
    } else {
      openInBrowser(magnetUrl);
    }
  };

  // Version resolution
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
      ? extractGameVersion(currentGame.title, currentGame.summary)
      : undefined);

  const releaseComparison = useMemo(() => {
    const fg = {
      version: fitgirlVer,
      date: currentGame.fitgirlUploadDate,
    };
    const sr = {
      version: steamripVer,
      date: currentGame.steamripUploadDate,
    };

    if (isLinkedFitgirl && isLinkedSteamrip) {
      const cmp = compareReleaseSources(fg, sr);
      if (cmp > 0) {return { fitgirlIsNewest: true, steamripIsNewest: false };}
      if (cmp < 0) {return { fitgirlIsNewest: false, steamripIsNewest: true };}
      return { fitgirlIsNewest: false, steamripIsNewest: false };
    }
    if (isLinkedFitgirl)
      {return { fitgirlIsNewest: true, steamripIsNewest: false };}
    if (isLinkedSteamrip)
      {return { fitgirlIsNewest: false, steamripIsNewest: true };}
    return { fitgirlIsNewest: false, steamripIsNewest: false };
  }, [
    isLinkedFitgirl,
    isLinkedSteamrip,
    fitgirlVer,
    steamripVer,
    currentGame.fitgirlUploadDate,
    currentGame.steamripUploadDate,
  ]);

  const isIgnored = (postDate?: string) => {
    if (!currentGame.ignoredUpdateDate) {return false;}
    if (!postDate) {return true;}
    if (currentGame.ignoredUpdateDate === postDate) {return true;}
    const ignTime = parseDateSafe(currentGame.ignoredUpdateDate);
    const postTime = parseDateSafe(postDate);
    if (ignTime !== null && postTime !== null && ignTime >= postTime)
      {return true;}
    if (ignTime !== null && postTime === null) {return true;}
    return false;
  };

  const handleIgnoreUpdate = (postDate?: string) => {
    const nowIso = new Date().toISOString();
    let dateToIgnore = nowIso;
    if (postDate) {
      const pTime = parseDateSafe(postDate);
      const nowTime = Date.now();
      dateToIgnore = pTime && pTime > nowTime ? postDate : nowIso;
    }

    const updated: Game = {
      ...currentGame,
      ignoredUpdateDate: dateToIgnore,
      hasUpdate: false,
      updateInfo: undefined,
    };
    setCurrentGame(updated);
    ignoreGameUpdate(currentGame.id, dateToIgnore);
    updateGameInStorage(updated);
    if (onGameUpdated) {onGameUpdated(updated);}
  };

  const handleUnignoreUpdate = () => {
    const updated: Game = {
      ...currentGame,
      ignoredUpdateDate: undefined,
    };
    setCurrentGame(updated);
    unignoreGameUpdate(currentGame.id);
    updateGameInStorage(updated);
    if (onGameUpdated) {onGameUpdated(updated);}
  };

  const handleStatusChange = (
    status: "installed" | "wishlist" | "completed" | "none",
  ) => {
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
    if (onGameUpdated) {onGameUpdated(updated);}
  };

  const handleToggleFavorite = () => {
    toggleFavoriteGame(currentGame.id);
    const updated: Game = {
      ...currentGame,
      isFavorite: !currentGame.isFavorite,
    };
    setCurrentGame(updated);
    if (onGameUpdated) {onGameUpdated(updated);}
  };

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

  const displayInstalledVer = useMemo(() => {
    if (!installedVer) {return null;}
    const trimmed = installedVer.trim();
    if (
      trimmed.toLowerCase().startsWith("build") ||
      trimmed.toLowerCase().startsWith("version") ||
      trimmed.toLowerCase().startsWith("v")
    ) {
      return trimmed;
    }
    return `Version: ${trimmed}`;
  }, [installedVer]);

  const playtimeHours = ((currentGame.playtimeMinutes || 0) / 60).toFixed(1);
  const starRatingCount = currentGame.rating
    ? Math.max(1, Math.min(5, Math.round((currentGame.rating / 100) * 5)))
    : 0;
  const featuredMediaUrl = sortedScreenshots[0] || null;
  const statusLabel = isPlaying
    ? "Playing"
    : currentGame.isCompleted
      ? "Completed"
      : currentGame.isInstalled
        ? "Installed"
        : currentGame.isWishlisted
          ? "Wishlist"
          : "Not Played";

  return (
    <Box
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          paddingBottom: 72,
        }}
      >
      {/* 1. CINEMATIC FULL-WIDTH HERO BANNER (FusionX Style) */}
      <Box
        pos="relative"
        h={{ base: 310, sm: 360, lg: 390 }}
        style={{
          overflow: "hidden",
          flexShrink: 0,
          maskImage:
            "linear-gradient(to bottom, black 0%, black 45%, rgba(0, 0, 0, 0.65) 75%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 45%, rgba(0, 0, 0, 0.65) 75%, transparent 100%)",
        }}
      >
        <MantineImage
          src={bannerBackground}
          h="100%"
          w="100%"
          alt={currentGame.title}
          fit="cover"
          fallbackSrc={currentGame.coverUrl}
          loading="lazy"
          decoding="async"
          style={{
            transform: "scale(1.03)",
            filter: "brightness(0.72) saturate(1.12)",
            transition: "all 350ms ease",
          }}
        />

        {/* Deep Vertical Fade into Translucent Dark Background */}
        <Box
          pos="absolute"
          inset={0}
          style={{
            background:
              "linear-gradient(180deg, rgba(10, 12, 16, 0.08) 0%, rgba(10, 12, 16, 0.32) 55%, rgba(10, 12, 16, 0.78) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Left & Right Edge Vignette Fade */}
        <Box
          pos="absolute"
          inset={0}
          style={{
            background:
              "linear-gradient(90deg, rgba(10, 12, 16, 0.52) 0%, transparent 20%, transparent 80%, rgba(10, 12, 16, 0.52) 100%)",
            pointerEvents: "none",
          }}
        />
      </Box>

      {/* 2. HERO CONTENT OVERLAY (Bottom-Left Title/Metadata + Bottom-Right Stat Boxes & Floating Poster) */}
      <Box
        px={{ base: "md", sm: "xl" }}
        pb={90}
        style={{
          marginTop: -165,
          position: "relative",
          zIndex: 10,
          flex: 1,
        }}
      >
        <Group
          justify="space-between"
          align="flex-end"
          gap="xl"
          wrap="wrap"
          mb="lg"
        >
          {/* Left: Game Icon + Title + Star Rating + Year + Genre Pills */}
          <Stack gap={10} style={{ flex: 1, minWidth: 280 }}>
            <Group gap="xs" wrap="wrap">
              {currentGame.isCompleted && (
                <Badge
                  color="teal"
                  variant="filled"
                  size="xs"
                  leftSection={<Trophy size={11} />}
                >
                  COMPLETED
                </Badge>
              )}

              {hasFitgirlUpdate && (
                <Group gap={4}>
                  <Badge
                    color="yellow"
                    variant="filled"
                    size="xs"
                    leftSection={<Sparkles size={11} />}
                    style={{ cursor: "pointer" }}
                    onClick={() => setActiveTab("downloads")}
                  >
                    Update in FitGirl (
                    {currentGame.fitgirlUploadDate || "Available"})
                  </Badge>
                  <Tooltip label="Ignore this update">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() =>
                        handleIgnoreUpdate(currentGame.fitgirlUploadDate)
                      }
                    >
                      <EyeOff size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )}

              {hasSteamripUpdate && (
                <Group gap={4}>
                  <Badge
                    color="yellow"
                    variant="filled"
                    size="xs"
                    leftSection={<Sparkles size={11} />}
                    style={{ cursor: "pointer" }}
                    onClick={() => setActiveTab("downloads")}
                  >
                    Update in SteamRIP (
                    {currentGame.steamripUploadDate || "Available"})
                  </Badge>
                  <Tooltip label="Ignore this update">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() =>
                        handleIgnoreUpdate(currentGame.steamripUploadDate)
                      }
                    >
                      <EyeOff size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              )}

              {currentGame.ignoredUpdateDate &&
                !hasFitgirlUpdate &&
                !hasSteamripUpdate && (
                  <Tooltip label="Update checking is ignored for this release. Click to restore.">
                    <Badge
                      color="gray"
                      variant="light"
                      size="xs"
                      leftSection={<RotateCcw size={11} />}
                      style={{ cursor: "pointer" }}
                      onClick={handleUnignoreUpdate}
                    >
                      Update Ignored (Restore)
                    </Badge>
                  </Tooltip>
                )}
            </Group>

            {/* Title with inline square cover icon */}
            <Group gap="sm" align="center" wrap="nowrap">
              <MantineImage
                src={currentGame.iconUrl || currentGame.coverUrl}
                w={32}
                h={32}
                radius="sm"
                fit="cover"
                fallbackSrc="https://placehold.co/32x32/141517/3b82f6?text=G"
                style={{
                  border: "1px solid rgba(255,255,255,0.18)",
                  flexShrink: 0,
                }}
              />
              <Title
                order={1}
                style={{
                  fontSize: "clamp(1.55rem, 2.5vw, 2.25rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.4px",
                  lineHeight: 1.1,
                  textTransform: "uppercase",
                  textShadow: "0 4px 16px rgba(0, 0, 0, 0.75)",
                }}
              >
                {cleanGameTitle(currentGame.title)}
              </Title>
            </Group>

            {/* Star Rating + Release Year + Platform + Outlined Genre Pills */}
            <Group gap="xs" wrap="wrap" align="center">
              {currentGame.rating !== undefined && (
                <Group gap={3} align="center" mr={4}>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      size={13}
                      fill={idx < starRatingCount ? "#f8fafc" : "none"}
                      color={
                        idx < starRatingCount
                          ? "#f8fafc"
                          : "rgba(255,255,255,0.28)"
                      }
                    />
                  ))}
                  <Text size="xs" fw={700} c="gray.2" ml={3}>
                    {Math.round(currentGame.rating)}
                  </Text>
                </Group>
              )}

              {(currentGame.releaseYear || currentGame.releaseDate) && (
                <Text size="xs" fw={600} c="gray.3">
                  •{" "}
                  {currentGame.releaseYear ||
                    new Date(currentGame.releaseDate!).getFullYear()}{" "}
                  • PC (WINDOWS)
                </Text>
              )}

              {currentGame.genres &&
                currentGame.genres.slice(0, 4).map((genre) => (
                  <Badge
                    key={genre}
                    size="xs"
                    variant="outline"
                    color="gray.3"
                    radius="xs"
                    className="daze-glass-pill"
                    style={{
                      borderColor: "rgba(255, 255, 255, 0.24)",
                      color: "#e2e8f0",
                      fontWeight: 600,
                      letterSpacing: "0.4px",
                      textTransform: "uppercase",
                    }}
                  >
                    {genre}
                  </Badge>
                ))}
            </Group>
          </Stack>

          {/* Right: Stat Boxes + Floating 3:4 Cover Poster */}
          <Group gap="md" align="flex-end" wrap="nowrap">
            <Group gap={8} wrap="nowrap" visibleFrom="sm">
              <Paper
                px="sm"
                py={8}
                radius="md"
                className="daze-glass-panel"
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  textAlign: "center",
                  minWidth: 74,
                }}
              >
                <Text size="sm" fw={800} c="white" ff="monospace">
                  {playtimeHours}h
                </Text>
                <Text
                  size="9px"
                  fw={700}
                  c="dimmed"
                  tt="uppercase"
                  style={{ letterSpacing: "0.5px" }}
                >
                  IN-GAME
                </Text>
              </Paper>

              <Paper
                px="sm"
                py={8}
                radius="md"
                className="daze-glass-panel"
                style={{
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  textAlign: "center",
                  minWidth: 82,
                }}
              >
                <Text size="xs" fw={800} c="white" truncate maw={95}>
                  {currentGame.fitgirlSize ||
                    currentGame.steamripSize ||
                    currentGame.repackSize ||
                    (currentGame.isInstalled ? "Installed" : "PC")}
                </Text>
                <Text
                  size="9px"
                  fw={700}
                  c="dimmed"
                  tt="uppercase"
                  style={{ letterSpacing: "0.5px" }}
                >
                  {currentGame.repackSize || currentGame.fitgirlSize
                    ? "SIZE"
                    : "STATUS"}
                </Text>
              </Paper>

              {gameMap && (
                <Tooltip label="Open Interactive Map" withArrow>
                  <Paper
                    px="sm"
                    py={8}
                    radius="md"
                    className="daze-glass-panel"
                    onClick={() => setIsMapModalOpen(true)}
                    style={{
                      border: "1px solid rgba(32, 201, 151, 0.35)",
                      textAlign: "center",
                      cursor: "pointer",
                      minWidth: 68,
                    }}
                  >
                    <Center mb={2}>
                      <MapPin size={15} color="#20c997" />
                    </Center>
                    <Text
                      size="9px"
                      fw={700}
                      c="teal.3"
                      tt="uppercase"
                      style={{ letterSpacing: "0.5px" }}
                    >
                      MAP
                    </Text>
                  </Paper>
                </Tooltip>
              )}
            </Group>

            {/* Floating 3:4 Cover Poster */}
            <Paper
              radius="lg"
              visibleFrom="xs"
              style={{
                width: 148,
                height: 205,
                flexShrink: 0,
                overflow: "hidden",
                border: "1.5px solid rgba(255, 255, 255, 0.16)",
                boxShadow: "0 18px 40px rgba(0, 0, 0, 0.78)",
                position: "relative",
                background: "var(--mantine-color-dark-8)",
              }}
            >
              <MantineImage
                src={currentGame.coverUrl}
                h="100%"
                w="100%"
                fit="cover"
                fallbackSrc="https://placehold.co/600x800/0f172a/3b82f6?text=No+Cover"
                loading="lazy"
                decoding="async"
              />
              {isPlaying && (
                <Badge
                  pos="absolute"
                  bottom={8}
                  left={8}
                  right={8}
                  color="teal"
                  variant="filled"
                  size="xs"
                >
                  ● RUNNING
                </Badge>
              )}
            </Paper>
          </Group>
        </Group>

        {/* 3. HORIZONTAL QUICK-LINKS STRIP (FusionX Style) */}
        <Paper
          px="md"
          py={8}
          radius="md"
          className="daze-glass-panel"
          mb="lg"
          style={{
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <Group gap="xs" wrap="wrap" justify="space-between">
            <Group gap={6} wrap="wrap">
              {isLinkedFitgirl && currentGame.linkedFitgirlUrl && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color={releaseComparison.fitgirlIsNewest ? "pink" : "gray.3"}
                  leftSection={<Globe size={13} />}
                  rightSection={<ExternalLink size={11} />}
                  onClick={() => openInBrowser(currentGame.linkedFitgirlUrl!)}
                >
                  FitGirl {fitgirlVer ? `(${fitgirlVer})` : "Page"}
                </Button>
              )}

              {isLinkedSteamrip && currentGame.linkedSteamripUrl && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color={releaseComparison.steamripIsNewest ? "cyan" : "gray.3"}
                  leftSection={<Flame size={13} />}
                  rightSection={<ExternalLink size={11} />}
                  onClick={() => openInBrowser(currentGame.linkedSteamripUrl!)}
                >
                  SteamRIP {steamripVer ? `(${steamripVer})` : "Page"}
                </Button>
              )}

              {currentGame.exePath && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray.3"
                  leftSection={<FolderOpen size={13} />}
                  onClick={() => handleOpenFolder()}
                >
                  Install Folder
                </Button>
              )}

              {gameMap && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="teal"
                  leftSection={<MapPin size={13} />}
                  onClick={() => setIsMapModalOpen(true)}
                >
                  Interactive Map
                </Button>
              )}

              <Button
                size="compact-xs"
                variant="subtle"
                color="indigo.3"
                leftSection={<Link2 size={13} />}
                onClick={() => setIsSourceLinkerOpen(true)}
              >
                {isLinkedFitgirl || isLinkedSteamrip || isLinkedIgdb
                  ? "Edit Sources"
                  : "Link Sources"}
              </Button>

              <Button
                size="compact-xs"
                variant="subtle"
                color="gray.3"
                leftSection={<FileCode size={13} />}
                onClick={() => {
                  setActiveTab("overview");
                  setIsEditingExePath(true);
                }}
              >
                Executable Path
              </Button>
            </Group>

            <Group gap={6}>
              {isLinkedIgdb && (
                <Badge size="xs" color="violet" variant="light">
                  IGDB Linked
                </Badge>
              )}
              {displayInstalledVer && (
                <Badge size="xs" color="teal" variant="dot">
                  {displayInstalledVer}
                </Badge>
              )}
            </Group>
          </Group>
        </Paper>

        {/* 4. MAIN BODY TABS (Overview, Mirrors, Gallery) */}
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          radius="md"
          color="blue"
          variant="pills"
        >
          <Tabs.List
            mb="md"
            p={4}
            className="daze-glass-pill"
            style={{ borderRadius: 12, width: "fit-content" }}
          >
            <Tabs.Tab value="overview" leftSection={<Info size={15} />}>
              Overview
            </Tabs.Tab>
            <Tabs.Tab
              value="downloads"
              leftSection={<DownloadCloud size={15} />}
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
            <Tabs.Tab value="media" leftSection={<Film size={15} />}>
              Media & Gallery
            </Tabs.Tab>
          </Tabs.List>

          {/* TAB 1: OVERVIEW */}
          <Tabs.Panel value="overview">
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
              {/* Left Column: Media Preview, About & Storyline, Updates, Exe (Spans 2 cols) */}
              <Stack gap="md" style={{ gridColumn: "span 2" }}>
                {/* Featured 16:9 Media Showcase Frame (FusionX Style) */}
                {featuredMediaUrl && (
                  <Paper
                    radius="lg"
                    style={{
                      overflow: "hidden",
                      position: "relative",
                      aspectRatio: "16 / 9",
                      maxHeight: 330,
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      cursor: "pointer",
                      background: "var(--mantine-color-dark-8)",
                    }}
                    onClick={() => {
                      setSelectedScreenshotIndex(0);
                      setIsLightboxOpen(true);
                    }}
                  >
                    <MantineImage
                      src={featuredMediaUrl}
                      h="100%"
                      w="100%"
                      fit="cover"
                      loading="lazy"
                      decoding="async"
                    />
                    <Badge
                      pos="absolute"
                      bottom={10}
                      right={10}
                      size="xs"
                      variant="filled"
                      color="dark.7"
                      leftSection={<ImageIcon size={11} />}
                      style={{
                        backgroundColor: "rgba(10, 12, 16, 0.78)",
                        backdropFilter: "blur(8px)",
                        border: "1px solid rgba(255, 255, 255, 0.16)",
                      }}
                    >
                      1 / {sortedScreenshots.length} Screenshots
                    </Badge>
                  </Paper>
                )}

                {/* About Game Card */}
                <Paper
                  p="lg"
                  radius="md"
                  className="daze-glass-panel"
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <Stack gap="xs">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      About the Game
                    </Text>
                    <Text
                      size="sm"
                      style={{
                        lineHeight: 1.7,
                        color: "var(--mantine-color-text)",
                      }}
                    >
                      {cleanGameSummary(currentGame.summary) ||
                        "No summary available for this title. Link with IGDB to automatically pull detailed lore and synopsis."}
                    </Text>

                    {currentGame.storyline && (
                      <>
                        <Divider my="xs" />
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                          Storyline
                        </Text>
                        <Text size="xs" c="dimmed" style={{ lineHeight: 1.6 }}>
                          {cleanGameSummary(currentGame.storyline)}
                        </Text>
                      </>
                    )}

                    {currentGame.gameUpdates &&
                      currentGame.gameUpdates.length > 0 && (
                        <>
                          <Divider my="xs" />
                          <Group justify="space-between" align="center">
                            <Group gap="xs">
                              <Sparkles
                                size={14}
                                color="var(--mantine-color-pink-4)"
                              />
                              <Text
                                size="xs"
                                fw={700}
                                c="pink.3"
                                tt="uppercase"
                              >
                                Game Updates & Version Patches (
                                {currentGame.gameUpdates.length})
                              </Text>
                            </Group>
                            <Button
                              size="compact-xs"
                              variant="light"
                              color="pink"
                              onClick={() => setActiveTab("downloads")}
                            >
                              View All Patches
                            </Button>
                          </Group>
                          <Stack gap={6} mt={4}>
                            {currentGame.gameUpdates
                              .slice(0, 3)
                              .map((up, i) => {
                                const parsed = parseGameUpdateItem(up);
                                return (
                                  <Paper
                                    key={i}
                                    p="xs"
                                    radius="md"
                                    className="daze-glass-card"
                                    style={{
                                      border:
                                        "1px solid var(--mantine-color-default-border)",
                                    }}
                                  >
                                    <Group
                                      justify="space-between"
                                      align="center"
                                      wrap="nowrap"
                                      gap="xs"
                                    >
                                      <Stack
                                        gap={2}
                                        style={{ flex: 1, minWidth: 0 }}
                                      >
                                        {parsed.fromVersion &&
                                        parsed.toVersion ? (
                                          <Group
                                            gap={6}
                                            align="center"
                                            wrap="nowrap"
                                          >
                                            <Badge
                                              size="xs"
                                              color="gray"
                                              variant="light"
                                            >
                                              {parsed.fromVersion}
                                            </Badge>
                                            <ArrowRight
                                              size={12}
                                              color="var(--mantine-color-pink-4)"
                                            />
                                            <Badge
                                              size="xs"
                                              color="pink"
                                              variant="filled"
                                            >
                                              {parsed.toVersion}
                                            </Badge>
                                            {parsed.repacker && (
                                              <Badge
                                                size="xs"
                                                color="indigo"
                                                variant="outline"
                                              >
                                                {parsed.repacker}
                                              </Badge>
                                            )}
                                          </Group>
                                        ) : (
                                          <Text size="xs" fw={600} truncate>
                                            {parsed.title ||
                                              `Update Patch ${i + 1}`}
                                          </Text>
                                        )}
                                        <Text
                                          size="10px"
                                          c="dimmed"
                                          truncate
                                          ff="monospace"
                                        >
                                          {parsed.title}
                                        </Text>
                                      </Stack>

                                      <Button
                                        size="compact-xs"
                                        variant="light"
                                        color="pink"
                                        rightSection={
                                          <ExternalLink size={10} />
                                        }
                                        onClick={() => openInBrowser(up.url)}
                                      >
                                        Download
                                      </Button>
                                    </Group>
                                  </Paper>
                                );
                              })}
                          </Stack>
                        </>
                      )}
                  </Stack>
                </Paper>

                {/* Executable Path Station */}
                <Paper
                  p="lg"
                  radius="md"
                  className="daze-glass-panel"
                  style={{
                    border: "1px solid var(--mantine-color-default-border)",
                  }}
                >
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Group gap="xs">
                        <FileCode
                          size={16}
                          color="var(--mantine-color-blue-4)"
                        />
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                          Executable (.exe) & Directory
                        </Text>
                      </Group>
                      {!isEditingExePath && (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="blue"
                          leftSection={<Edit3 size={12} />}
                          onClick={() => setIsEditingExePath(true)}
                        >
                          Change Exe
                        </Button>
                      )}
                    </Group>

                    {isEditingExePath ? (
                      <Group gap="xs" wrap="nowrap" mt={4}>
                        <TextInput
                          size="xs"
                          radius="md"
                          placeholder="e.g. C:\Games\DoomEternal\DOOMEternalx64tk.exe"
                          value={exePathInput}
                          onChange={(e) => setExePathInput(e.target.value)}
                          leftSection={<Folder size={14} color="#4dabf7" />}
                          style={{ flex: 1 }}
                        />
                        <Button
                          size="xs"
                          color="blue"
                          onClick={handleSaveExePath}
                          radius="md"
                        >
                          Save
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={() => {
                            setExePathInput(currentGame.exePath || "");
                            setIsEditingExePath(false);
                          }}
                          radius="md"
                        >
                          Cancel
                        </Button>
                      </Group>
                    ) : (
                      <Group justify="space-between" align="center" mt={2}>
                        <Text
                          size="xs"
                          ff="monospace"
                          c={currentGame.exePath ? "dimmed" : "yellow"}
                          truncate
                          style={{ maxWidth: "70%" }}
                        >
                          {currentGame.exePath ||
                            "No executable linked yet. Click 'Change Exe' to set one."}
                        </Text>
                        {currentGame.exePath && (
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              color="gray"
                              leftSection={<FolderOpen size={12} />}
                              onClick={() => handleOpenFolder()}
                            >
                              Open Folder
                            </Button>
                            <HoldToConfirmButton
                              label="HOLD TO UNINSTALL"
                              holdDurationMs={2000}
                              onConfirmed={() =>
                                onUninstall && onUninstall(currentGame.id)
                              }
                            />
                          </Group>
                        )}
                      </Group>
                    )}
                  </Stack>
                </Paper>

                {/* Wine/Proton Linux Station (Linux Only) */}
                {isLinux && (
                  <Paper
                    p="lg"
                    radius="md"
                    className="daze-glass-panel"
                    style={{
                      border: "1px solid var(--mantine-color-default-border)",
                    }}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between" align="center">
                        <Group gap="xs">
                          <Layers
                            size={16}
                            color="var(--mantine-color-teal-4)"
                          />
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Linux Compatibility (Wine / Proton)
                          </Text>
                        </Group>
                      </Group>
                      <Text size="xs" c="dimmed">
                        Run this Windows executable natively on Linux using
                        Proton or Wine runner wrappers.
                      </Text>
                    </Stack>
                  </Paper>
                )}
              </Stack>

              {/* Right Column: Playtime Breakdown & Structured Details Table (FusionX / Daze Style) */}
              <Stack gap="md">
                {/* Playtime & Completion Breakdown Card */}
                <Paper
                  p="lg"
                  radius="md"
                  className="daze-glass-panel"
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <Stack gap="sm">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Playtime & Progress
                    </Text>

                    <Progress.Root size={10} radius="xl">
                      <Progress.Section
                        value={Math.min(
                          100,
                          Math.max(
                            8,
                            ((currentGame.playtimeMinutes || 0) / 3000) * 100,
                          ),
                        )}
                        color="cyan"
                      />
                      {currentGame.isCompleted && (
                        <Progress.Section value={100} color="teal" />
                      )}
                    </Progress.Root>

                    <SimpleGrid cols={3} spacing="xs" mt={4}>
                      <Paper
                        p="xs"
                        radius="sm"
                        className="daze-glass-card"
                        style={{ textAlign: "center" }}
                      >
                        <Text size="9px" c="dimmed" fw={600}>
                          Logged
                        </Text>
                        <Text size="sm" fw={800} ff="monospace">
                          {playtimeHours}h
                        </Text>
                      </Paper>
                      <Paper
                        p="xs"
                        radius="sm"
                        className="daze-glass-card"
                        style={{ textAlign: "center" }}
                      >
                        <Text size="9px" c="dimmed" fw={600}>
                          Sessions
                        </Text>
                        <Text size="sm" fw={800} ff="monospace">
                          {currentGame.playSessions?.length || 0}
                        </Text>
                      </Paper>
                      <Paper
                        p="xs"
                        radius="sm"
                        className="daze-glass-card"
                        style={{ textAlign: "center" }}
                      >
                        <Text size="9px" c="dimmed" fw={600}>
                          Status
                        </Text>
                        <Text size="xs" fw={700} c="teal.3" truncate>
                          {statusLabel}
                        </Text>
                      </Paper>
                    </SimpleGrid>
                  </Stack>
                </Paper>

                {/* Structured Details Table Card */}
                <Paper
                  p="lg"
                  radius="md"
                  className="daze-glass-panel"
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <Stack gap="xs">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={2}>
                      Details
                    </Text>

                    {[
                      {
                        label: "Developer",
                        value: currentGame.developer || "Unknown",
                      },
                      {
                        label: "Publisher",
                        value: currentGame.publisher || "—",
                      },
                      {
                        label: "Release Date",
                        value: currentGame.releaseDate
                          ? new Date(
                              currentGame.releaseDate,
                            ).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : currentGame.releaseYear
                            ? String(currentGame.releaseYear)
                            : "Unknown",
                      },
                      {
                        label: "Installed Build",
                        value: displayInstalledVer || "Not detected",
                      },
                      {
                        label: "Repack Size",
                        value:
                          currentGame.fitgirlSize ||
                          currentGame.steamripSize ||
                          currentGame.repackSize ||
                          "—",
                      },
                      {
                        label: "Source",
                        value: isLinkedFitgirl && isLinkedSteamrip
                          ? "FitGirl & SteamRIP"
                          : isLinkedFitgirl
                            ? "FitGirl Repacks"
                            : isLinkedSteamrip
                              ? "SteamRIP"
                              : currentGame.source || "Manual",
                      },
                      {
                        label: "Last Played",
                        value: currentGame.lastPlayed
                          ? new Date(
                              currentGame.lastPlayed,
                            ).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "Never",
                      },
                      {
                        label: "Date Added",
                        value: currentGame.dateAdded
                          ? new Date(currentGame.dateAdded).toLocaleDateString(
                              undefined,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )
                          : "Unknown",
                      },
                    ].map((row) => (
                      <Group
                        key={row.label}
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                        gap="sm"
                        py={4}
                        style={{
                          borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        }}
                      >
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{ flexShrink: 0, minWidth: 94 }}
                        >
                          {row.label}
                        </Text>
                        <Text
                          size="xs"
                          fw={600}
                          style={{ textAlign: "right", wordBreak: "break-word" }}
                        >
                          {row.value}
                        </Text>
                      </Group>
                    ))}

                    {currentGame.genres && currentGame.genres.length > 0 && (
                      <Box pt={6}>
                        <Text size="xs" c="dimmed" mb={6}>
                          Genres
                        </Text>
                        <Group gap={5} wrap="wrap">
                          {currentGame.genres.map((genre) => (
                            <Badge
                              key={genre}
                              variant="light"
                              color="blue"
                              size="xs"
                              leftSection={<Tag size={10} />}
                            >
                              {genre}
                            </Badge>
                          ))}
                        </Group>
                      </Box>
                    )}

                    {(hasFitgirlUpdate ||
                      hasSteamripUpdate ||
                      currentGame.hasUpdate ||
                      currentGame.ignoredUpdateDate) && (
                      <Box pt={8}>
                        {hasFitgirlUpdate ||
                        hasSteamripUpdate ||
                        currentGame.hasUpdate ? (
                          <Button
                            fullWidth
                            size="xs"
                            variant="light"
                            color="yellow"
                            leftSection={<EyeOff size={13} />}
                            onClick={() => handleIgnoreUpdate()}
                          >
                            Ignore New Version
                          </Button>
                        ) : (
                          <Button
                            fullWidth
                            size="xs"
                            variant="subtle"
                            color="gray"
                            leftSection={<RotateCcw size={13} />}
                            onClick={() => handleUnignoreUpdate()}
                          >
                            Restore Update Checking
                          </Button>
                        )}
                      </Box>
                    )}
                  </Stack>
                </Paper>
              </Stack>
            </SimpleGrid>
          </Tabs.Panel>

          {/* TAB 2: DOWNLOADS & MIRRORS */}
          <Tabs.Panel value="downloads">
            <Stack gap="md">
              {/* FitGirl Standalone Update Files Section */}
              {currentGame.gameUpdates &&
                currentGame.gameUpdates.length > 0 &&
                (() => {
                  const parsedUpdates = currentGame.gameUpdates.map((u) =>
                    parseGameUpdateItem(u),
                  );
                  const patchFiles = parsedUpdates.filter(
                    (p) => p.isDirectDownload || (p.fromVersion && p.toVersion),
                  );
                  const authorCreditLinks = parsedUpdates.filter(
                    (p) => !patchFiles.includes(p),
                  );

                  return (
                    <Paper
                      p="md"
                      radius="md"
                      className="daze-glass-panel"
                      style={{
                        border: hasFitgirlUpdate
                          ? "1.5px solid var(--mantine-color-pink-6)"
                          : "1px solid var(--mantine-color-default-border)",
                        boxShadow: hasFitgirlUpdate
                          ? "0 0 16px rgba(236, 72, 153, 0.2)"
                          : undefined,
                      }}
                    >
                      <Stack gap="xs">
                        <Group
                          justify="space-between"
                          align="center"
                          wrap="wrap"
                        >
                          <Group gap="xs">
                            <ThemeIcon
                              size="md"
                              color="pink"
                              variant="light"
                              radius="md"
                            >
                              <Sparkles size={18} />
                            </ThemeIcon>
                            <div>
                              <Text size="sm" fw={800} c="pink.3">
                                Game Updates & Version Patches (
                                {patchFiles.length > 0
                                  ? patchFiles.length
                                  : parsedUpdates.length}
                                )
                              </Text>
                              <Text size="xs" c="dimmed">
                                Sequential update patches to upgrade game
                                releases to newer build versions
                              </Text>
                            </div>
                          </Group>
                          {hasFitgirlUpdate && (
                            <Badge
                              color="pink"
                              variant="filled"
                              size="sm"
                              leftSection={<Sparkles size={11} />}
                            >
                              NEW FITGIRL UPDATE: {fitgirlVer}
                            </Badge>
                          )}
                        </Group>

                        <Divider my={4} />

                        {/* Main Patch Files List */}
                        <Stack gap={8}>
                          {(patchFiles.length > 0
                            ? patchFiles
                            : parsedUpdates
                          ).map((patch, idx) => (
                            <Paper
                              key={idx}
                              p="sm"
                              radius="md"
                              className="daze-glass-card"
                              style={{
                                border:
                                  "1px solid var(--mantine-color-default-border)",
                              }}
                            >
                              <Group
                                justify="space-between"
                                align="center"
                                wrap="wrap"
                                gap="sm"
                              >
                                <Stack
                                  gap={4}
                                  style={{ flex: 1, minWidth: 260 }}
                                >
                                  {patch.fromVersion && patch.toVersion ? (
                                    <Group gap="xs" align="center" wrap="wrap">
                                      <Badge
                                        size="sm"
                                        color="gray"
                                        variant="light"
                                      >
                                        From: {patch.fromVersion}
                                      </Badge>
                                      <ArrowRight
                                        size={14}
                                        color="var(--mantine-color-pink-4)"
                                      />
                                      <Badge
                                        size="sm"
                                        color="pink"
                                        variant="filled"
                                      >
                                        To: {patch.toVersion}
                                      </Badge>
                                      {patch.repacker && (
                                        <Badge
                                          size="xs"
                                          color="indigo"
                                          variant="outline"
                                        >
                                          {patch.repacker}
                                        </Badge>
                                      )}
                                      {patch.hoster && (
                                        <Badge
                                          size="xs"
                                          color="blue"
                                          variant="subtle"
                                        >
                                          {patch.hoster}
                                        </Badge>
                                      )}
                                    </Group>
                                  ) : (
                                    <Group gap="xs" align="center">
                                      <DownloadCloud
                                        size={16}
                                        color="var(--mantine-color-pink-4)"
                                      />
                                      <Text size="xs" fw={700}>
                                        {patch.title ||
                                          `Update File #${idx + 1}`}
                                      </Text>
                                      {patch.repacker && (
                                        <Badge
                                          size="xs"
                                          color="indigo"
                                          variant="outline"
                                        >
                                          {patch.repacker}
                                        </Badge>
                                      )}
                                    </Group>
                                  )}

                                  <Text
                                    size="11px"
                                    ff="monospace"
                                    c="dimmed"
                                    truncate
                                    style={{ maxWidth: "100%" }}
                                  >
                                    {patch.title}
                                  </Text>

                                  {patch.raw.notes && (
                                    <Text
                                      size="10px"
                                      c="dimmed"
                                      style={{ whiteSpace: "pre-line" }}
                                    >
                                      {patch.raw.notes}
                                    </Text>
                                  )}
                                </Stack>

                                <Group gap="xs" wrap="nowrap">
                                  <Button
                                    size="xs"
                                    color="pink"
                                    variant="light"
                                    rightSection={<ExternalLink size={12} />}
                                    onClick={() => openInBrowser(patch.raw.url)}
                                    radius="md"
                                  >
                                    Download Patch File
                                  </Button>
                                  <Tooltip
                                    label={
                                      copiedLink === patch.raw.url
                                        ? "Copied!"
                                        : "Copy Update URL"
                                    }
                                    withArrow
                                  >
                                    <ActionIcon
                                      size="input-xs"
                                      variant="subtle"
                                      color={
                                        copiedLink === patch.raw.url
                                          ? "teal"
                                          : "gray"
                                      }
                                      onClick={() => handleCopy(patch.raw.url)}
                                    >
                                      {copiedLink === patch.raw.url ? (
                                        <Check size={14} />
                                      ) : (
                                        <Copy size={14} />
                                      )}
                                    </ActionIcon>
                                  </Tooltip>
                                </Group>
                              </Group>
                            </Paper>
                          ))}
                        </Stack>

                        {/* Author Credits / Web References */}
                        {authorCreditLinks.length > 0 && (
                          <Group
                            gap="xs"
                            mt={4}
                            pt={4}
                            style={{
                              borderTop:
                                "1px dashed var(--mantine-color-default-border)",
                            }}
                          >
                            <Text size="10px" c="dimmed" fw={600}>
                              Source & Author Credits:
                            </Text>
                            {authorCreditLinks.map((credit, i) => (
                              <Button
                                key={i}
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                rightSection={<ExternalLink size={10} />}
                                onClick={() => openInBrowser(credit.raw.url)}
                              >
                                {credit.title ||
                                  credit.hoster ||
                                  `Source ${i + 1}`}
                              </Button>
                            ))}
                          </Group>
                        )}
                      </Stack>
                    </Paper>
                  );
                })()}

              {/* SteamRIP Update Notification Alert */}
              {hasSteamripUpdate && (
                <Alert
                  color="cyan"
                  variant="light"
                  radius="md"
                  icon={<Flame size={18} />}
                  title={`Newer SteamRIP Game Update Available (Build ${steamripVer})`}
                >
                  <Text size="xs">
                    A newer release build is available on SteamRIP. The direct
                    mirrors and pre-installed game downloads below contain the
                    updated build files.
                  </Text>
                </Alert>
              )}

              {totalDownloadLinksCount > 0 ? (
                <>
                  {/* Torrent Magnets Grid */}
                  {magnetLinks.length > 0 && (
                    <Stack gap="xs">
                      <Group gap="xs">
                        <Magnet
                          size={16}
                          color="var(--mantine-color-grape-4)"
                        />
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                          Torrent Magnet Releases ({magnetLinks.length})
                        </Text>
                      </Group>

                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        {magnetLinks.map((mag, idx) => (
                          <Card
                            key={idx}
                            p="md"
                            radius="md"
                            className="daze-glass-panel"
                            style={{
                              border:
                                "1px solid var(--mantine-color-default-border)",
                            }}
                          >
                            <Stack gap="xs">
                              <Group justify="space-between">
                                <Badge size="xs" color="grape" variant="filled">
                                  {mag.groupName}
                                </Badge>
                                <Text
                                  size="xs"
                                  fw={700}
                                  truncate
                                  style={{ flex: 1, marginLeft: 8 }}
                                >
                                  {mag.name || "Lossless Repack Magnet"}
                                </Text>
                              </Group>

                              <Group gap="xs" mt={4}>
                                <Button
                                  size="xs"
                                  color="grape"
                                  variant="filled"
                                  leftSection={<DownloadCloud size={14} />}
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

                  {/* Direct Mirrors Section */}
                  {directLinks.length > 0 &&
                    (() => {
                      const byHoster = directLinks.reduce<
                        Record<string, typeof directLinks>
                      >((acc, link) => {
                        let hoster = link.url;
                        try {
                          let h = new URL(link.url).hostname.replace(
                            /^www\./,
                            "",
                          );
                          const parts = h.split(".");
                          if (parts.length > 2) {h = parts.slice(-2).join(".");}
                          hoster = h;
                        } catch {}
                        if (!acc[hoster]) {acc[hoster] = [];}
                        acc[hoster].push(link);
                        return acc;
                      }, {});
                      const hosters = Object.entries(byHoster).sort(
                        (a, b) => b[1].length - a[1].length,
                      );

                      return (
                        <Stack gap="xs" mt="sm">
                          <Group gap="xs">
                            <DownloadCloud
                              size={16}
                              color="var(--mantine-color-cyan-4)"
                            />
                            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                              Direct Mirrors & Filehosters ({directLinks.length}
                              ) · {hosters.length} Hosters
                            </Text>
                          </Group>

                          <Stack gap="xs">
                            {hosters.map(([hoster, links]) => (
                              <DirectHosterAccordion
                                key={hoster}
                                hoster={hoster}
                                links={links}
                                isUpdate={hasSteamripUpdate}
                                sourcePageUrl={currentGame.linkedSteamripUrl}
                              />
                            ))}
                          </Stack>
                        </Stack>
                      );
                    })()}
                </>
              ) : (
                <Paper
                  p="xl"
                  radius="md"
                  className="daze-glass-panel"
                  style={{
                    textAlign: "center",
                    border: "1px solid var(--mantine-color-default-border)",
                  }}
                >
                  <Stack align="center" gap="sm">
                    <DownloadCloud
                      size={40}
                      color="var(--mantine-color-dimmed)"
                    />
                    <Text size="sm" fw={700}>
                      No Downloads or Mirrors Attached
                    </Text>
                    <Text size="xs" c="dimmed" style={{ maxWidth: 420 }}>
                      Link this game with FitGirl Repacks or SteamRIP to
                      automatically synchronize torrent magnet links and
                      high-speed direct download mirrors.
                    </Text>
                    <Button
                      size="xs"
                      color="indigo"
                      variant="filled"
                      leftSection={<Link2 size={14} />}
                      onClick={() => setIsSourceLinkerOpen(true)}
                      mt="xs"
                    >
                      Search & Link Sources
                    </Button>
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          {/* TAB 3: MEDIA & GALLERY */}
          <Tabs.Panel value="media">
            <Stack gap="lg">
              {currentGame.screenshots && currentGame.screenshots.length > 0 ? (
                (() => {
                  const allScreenshots = currentGame.screenshots || [];
                  const gifScreenshots = allScreenshots.filter(
                    (s) => s && /\.gif(?:\?.*)?$/i.test(s),
                  );
                  const staticScreenshots = allScreenshots.filter(
                    (s) => s && !/\.gif(?:\?.*)?$/i.test(s),
                  );
                  const sortedScreenshots = [
                    ...gifScreenshots,
                    ...staticScreenshots,
                  ];

                  return (
                    <Stack gap="xs">
                      <Group gap="xs">
                        <ImageIcon
                          size={15}
                          color="var(--mantine-color-blue-4)"
                        />
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                          In-Game Media ({sortedScreenshots.length})
                        </Text>
                      </Group>
                      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                        {sortedScreenshots.map((img, i) => {
                          const isGif = /\.gif(?:\?.*)?$/i.test(img);
                          return (
                            <Paper
                              key={i}
                              radius="md"
                              className="daze-glass-card"
                              style={{
                                position: "relative",
                                overflow: "hidden",
                                height: 140,
                                border: isGif
                                  ? "1px solid var(--mantine-color-grape-6)"
                                  : "1px solid var(--mantine-color-default-border)",
                                cursor: "pointer",
                                transition:
                                  "transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease",
                              }}
                              onClick={() => {
                                setSelectedScreenshotIndex(i);
                                setIsLightboxOpen(true);
                              }}
                            >
                              <MantineImage
                                src={img}
                                h={140}
                                w="100%"
                                fit="cover"
                                fallbackSrc="https://placehold.co/600x400/0f172a/3b82f6?text=Screenshot"
                                loading="lazy"
                                decoding="async"
                                style={{
                                  transition: "transform 200ms ease",
                                }}
                              />
                              {isGif && (
                                <Badge
                                  size="xs"
                                  color="grape"
                                  variant="filled"
                                  style={{
                                    position: "absolute",
                                    top: 6,
                                    right: 6,
                                    zIndex: 2,
                                    pointerEvents: "none",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
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
                  );
                })()
              ) : (
                <Paper
                  p="xl"
                  radius="md"
                  className="daze-glass-panel"
                  style={{ textAlign: "center" }}
                >
                  <Text size="xs" c="dimmed">
                    No screenshot media available. Link to IGDB to retrieve
                    high-resolution promotional artwork.
                  </Text>
                </Paper>
              )}

              {currentGame.videos && currentGame.videos.length > 0 && (
                <Stack gap="xs">
                  <Group gap="xs">
                    <Film size={15} color="var(--mantine-color-pink-4)" />
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      Gameplay Trailer
                    </Text>
                  </Group>
                  <Box
                    className="daze-glass-panel"
                    style={{
                      overflow: "hidden",
                      borderRadius: 12,
                      height: 320,
                      border: "1px solid var(--mantine-color-default-border)",
                    }}
                  >
                    <iframe
                      title={`${currentGame.title} Trailer`}
                      src={
                        currentGame.videos[0].startsWith("http")
                          ? currentGame.videos[0]
                          : `https://www.youtube.com/embed/${currentGame.videos[0]}`
                      }
                      style={{ width: "100%", height: "100%", border: "none" }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </Box>
                </Stack>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Box>
      </Box>

      <Paper
        px={{ base: "md", sm: "xl" }}
        py="sm"
        radius={0}
        className="daze-glass-footer"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          borderBottom: "none",
        }}
      >
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          {/* Left Metrics */}
          <Group gap="xl" wrap="wrap">
            <Group gap={8} align="center">
              <Calendar size={15} color="var(--mantine-color-dimmed)" />
              <Stack gap={0}>
                <Text size="10px" c="dimmed" fw={600}>
                  Last Played
                </Text>
                <Text size="xs" fw={700}>
                  {currentGame.lastPlayed
                    ? new Date(currentGame.lastPlayed).toLocaleDateString()
                    : "Never"}
                </Text>
              </Stack>
            </Group>

            <Group gap={8} align="center">
              <Clock size={15} color="var(--mantine-color-dimmed)" />
              <Stack gap={0}>
                <Text size="10px" c="dimmed" fw={600}>
                  Time Played
                </Text>
                <Text size="xs" fw={700} ff="monospace">
                  {playtimeHours}h
                </Text>
              </Stack>
            </Group>

            <Menu shadow="md" width={180} position="top-start" radius="md">
              <Menu.Target>
                <UnstyledButton style={{ cursor: "pointer" }}>
                  <Group gap={8} align="center">
                    <Trophy
                      size={15}
                      color={
                        currentGame.isCompleted
                          ? "#20c997"
                          : "var(--mantine-color-dimmed)"
                      }
                    />
                    <Stack gap={0}>
                      <Text size="10px" c="dimmed" fw={600} />
                      <Group gap={4} align="center">
                        <Text size="xs" fw={700}>
                          {statusLabel}
                        </Text>
                        <ChevronDown size={11} />
                      </Group>
                    </Stack>
                  </Group>
                </UnstyledButton>
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
          </Group>

          {/* Right Action Controls + Signature Pill Play Button */}
          <Group gap="xs" wrap="nowrap">
            <Tooltip
              label={
                currentGame.isFavorite
                  ? "Remove from Favorites"
                  : "Add to Favorites"
              }
              withArrow
            >
              <ActionIcon
                size="lg"
                radius="xl"
                variant="default"
                className="daze-glass-pill"
                onClick={handleToggleFavorite}
              >
                <Star
                  size={15}
                  fill={currentGame.isFavorite ? "#fcc419" : "none"}
                  color={currentGame.isFavorite ? "#fcc419" : "currentColor"}
                />
              </ActionIcon>
            </Tooltip>

            {currentGame.exePath && (
              <Tooltip label="Open Install Folder" withArrow>
                <ActionIcon
                  size="lg"
                  radius="xl"
                  variant="default"
                  className="daze-glass-pill"
                  onClick={() => handleOpenFolder()}
                >
                  <FolderOpen size={15} />
                </ActionIcon>
              </Tooltip>
            )}

            <Tooltip label="Link Sources" withArrow>
              <ActionIcon
                size="lg"
                radius="xl"
                variant="default"
                className="daze-glass-pill"
                onClick={() => setIsSourceLinkerOpen(true)}
              >
                <Link2 size={15} />
              </ActionIcon>
            </Tooltip>

            {onEdit && (
              <Tooltip label="Edit Info" withArrow>
                <ActionIcon
                  size="lg"
                  radius="xl"
                  variant="default"
                  className="daze-glass-pill"
                  onClick={() => {
                    if (onCloseModal) {onCloseModal();}
                    onEdit(currentGame);
                  }}
                >
                  <Edit3 size={15} />
                </ActionIcon>
              </Tooltip>
            )}

            {currentGame.exePath && onUninstall && (
              <HoldToConfirmButton
                label="UNINSTALL"
                holdDurationMs={2000}
                onConfirmed={() => {
                  onUninstall(currentGame.id);
                  if (onCloseModal) {onCloseModal();}
                }}
              />
            )}

            {currentGame.exePath && currentGame.exePath.trim() !== "" ? (
              <Button
                size="md"
                radius="xl"
                px="xl"
                disabled={isAnyGameRunning && !isPlaying}
                leftSection={
                  isPlaying ? (
                    <Square size={15} fill="currentColor" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )
                }
                style={{
                  backgroundColor: isPlaying
                    ? "#ef4444"
                    : isAnyGameRunning
                      ? "#374151"
                      : "#ffffff",
                  color: isPlaying || isAnyGameRunning ? "#ffffff" : "#0b0c0f",
                  fontWeight: 800,
                  boxShadow: isPlaying
                    ? "0 0 20px rgba(239, 68, 68, 0.45)"
                    : "0 4px 18px rgba(255, 255, 255, 0.22)",
                  transition: "transform 150ms ease, box-shadow 150ms ease",
                }}
                onClick={() => {
                  onLaunch(currentGame);
                  if (onCloseModal) {onCloseModal();}
                }}
              >
                {isPlaying
                  ? "Stop"
                  : isAnyGameRunning
                    ? "Running..."
                    : "Play"}
              </Button>
            ) : !currentGame.isInstalled && primaryMagnet ? (
              <Button
                size="md"
                radius="xl"
                px="xl"
                color="grape"
                leftSection={<DownloadCloud size={16} />}
                onClick={() => handleStartMagnetDownload(primaryMagnet)}
              >
                Download
              </Button>
            ) : !currentGame.isInstalled ? (
              <Button
                size="md"
                radius="xl"
                px="lg"
                variant="light"
                color="indigo"
                leftSection={<Link2 size={16} />}
                onClick={() => setIsSourceLinkerOpen(true)}
              >
                Link Sources
              </Button>
            ) : null}
          </Group>
        </Group>
      </Paper>

      {/* Dedicated Source Linker Modal */}
      <SourceLinkerModal
        opened={isSourceLinkerOpen}
        game={currentGame}
        onClose={() => setIsSourceLinkerOpen(false)}
        onGameUpdated={(updated) => {
          setCurrentGame(updated);
          if (onGameUpdated) {onGameUpdated(updated);}
        }}
      />

      {/* Interactive Map Viewer Modal */}
      {gameMap && (
        <MapViewerModal
          opened={isMapModalOpen}
          onClose={() => setIsMapModalOpen(false)}
          gameSlug={
            gameMap.game_slug ||
            (gameMap.slug.includes("--")
              ? gameMap.slug.split("--")[0]
              : gameMap.slug)
          }
          mapSlug={gameMap.map_slug}
          gameTitle={currentGame.title}
        />
      )}

      {/* In-App Screenshot Lightbox Modal */}
      <ImageLightboxModal
        opened={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        images={sortedScreenshots}
        initialIndex={selectedScreenshotIndex}
        title={cleanGameTitle(currentGame.title)}
      />
    </Box>
  );
};
