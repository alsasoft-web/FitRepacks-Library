"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Game, ActiveTab, SortOption, ViewMode, parseSizeToMB } from "../lib/types";
import {
  getStoredGames,
  syncTauriLibraryData,
  addGameToStorage,
  addGamesBatchToStorage,
  updateGameInStorage,
  deleteGameFromStorage,
  toggleFavoriteGame,
  toggleCompletedGame,
  setGameStatus,
  updateGamePlaytime,
  isAdultContent,
  ADULT_KEYWORDS,
  toggleWishlistRepack,
  getPinnedGameIds,
  togglePinnedGame,
  syncRecentGamesToTrayAndTaskbar,
} from "../lib/db";
import { toggleThemeWithRipple } from "../lib/themeRipple";
import { GameCard } from "../components/library/GameCard";
import { GameDetailView } from "../components/library/GameDetailView";
import { AddOrScanGameModal } from "../components/AddOrScanGameModal";
import { IgdbSearchModal } from "../components/IgdbSearchModal";
import { EditGameModal } from "../components/EditGameModal";
import { NoUninstallerModal } from "../components/NoUninstallerModal";
import { PlaytimeStats } from "../components/analytics/PlaytimeStats";
import { RepacksPostsView } from "../components/repacks/RepacksPostsView";
import { TorrentDownloadModal } from "../components/repacks/TorrentDownloadModal";
import { DownloadsView } from "../components/DownloadsView";
import { SettingsModal } from "../components/SettingsModal";
import { MapsBrowserModal, MapViewerModal } from "../components/maps";
import { ProcessBoosterModal } from "../components/ProcessBoosterModal";
import { useAppUpdater } from "../lib/updater";
import {
  useDownloadQueueStore,
  resumeActiveDownloadsOnStartup,
  toggleAllDownloadsPause,
} from "../lib/downloadQueueStore";
import {
  initRepackSubscription,
  unsubscribeRepackSubscription,
} from "../lib/repackSubscription";
import { syncLibraryGamesWithLatestRepacks } from "../lib/gameLinker";
import { useOverlayShortcuts } from "../lib/useOverlayShortcuts";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

import {
  AppShell,
  Group,
  TextInput,
  Select,
  Button,
  SimpleGrid,
  Alert,
  Text,
  Box,
  Stack,
  Paper,
  ActionIcon,
  Center,
  ScrollArea,
  useMantineColorScheme,
  Tooltip,
  useComputedColorScheme,
  Progress,
  UnstyledButton,
  ThemeIcon,
  Image,
  Badge,
  Modal,
  Drawer,
  Title,
  Slider,
  Checkbox,
  Divider,
} from "@mantine/core";
import { useNetwork } from "@mantine/hooks";
import {
  Search,
  Plus,
  Clock,
  X,
  LayoutGrid,
  List,
  LayoutTemplate,
  Sun,
  Moon,
  Minus,
  Square,
  DownloadCloud,
  Download,
  Pause,
  Play,
  Sparkles,
  HardDrive,
  CheckCircle2,
  Bookmark,
  Star,
  Trash2,
  Map as MapIcon,
  Zap,
  Gamepad2,
  BarChart3,
  Settings,
  Lock,
  Filter,
  Pin,
} from "lucide-react";

// Memoized Header Live Download Progress (prevents Home from re-rendering every 1s during downloads)
const HeaderDownloadProgress: React.FC<{
  onOpenDownloads: () => void;
}> = React.memo(({ onOpenDownloads }) => {
  const magnetDownloads = useDownloadQueueStore(
    (state) => state.magnetDownloads,
  );
  const queuedGames = useDownloadQueueStore((state) => state.queuedGames);
  const aggregateStats = useDownloadQueueStore((state) => state.aggregateStats);

  const incompleteTorrents = useMemo(
    () => magnetDownloads.filter((t) => t.status !== "completed"),
    [magnetDownloads],
  );
  const activeDownloadingTorrents = useMemo(
    () => incompleteTorrents.filter((t) => t.status === "downloading"),
    [incompleteTorrents],
  );
  const isAllPaused =
    incompleteTorrents.length > 0 && activeDownloadingTorrents.length === 0;
  const hasDownloads =
    incompleteTorrents.length > 0 ||
    aggregateStats.activeCount > 0 ||
    queuedGames.some((g) => g.status !== "completed");

  const totalDownloadProgress =
    incompleteTorrents.length > 0
      ? incompleteTorrents.reduce(
          (acc, curr) => acc + (curr.progress || 0),
          0,
        ) / incompleteTorrents.length
      : 0;

  if (!hasDownloads) {return null;}

  return (
    <Paper
      px="xs"
      py={4}
      radius="xl"
      bg="var(--mantine-color-default)"
      style={{
        border: isAllPaused
          ? "1px solid var(--mantine-color-yellow-7)"
          : "1px solid var(--mantine-color-teal-7)",
        boxShadow: isAllPaused
          ? "0 0 10px rgba(250, 176, 5, 0.15)"
          : "0 0 10px rgba(32, 201, 151, 0.2)",
        transition: "all 0.2s ease",
      }}
    >
      <Group gap={6}>
        <Tooltip
          label={
            isAllPaused ? "Resume all downloads" : "Pause all downloads"
          }
        >
          <ActionIcon
            size={24}
            variant="subtle"
            color={isAllPaused ? "yellow" : "teal"}
            radius="xl"
            onClick={(e) => {
              e.stopPropagation();
              toggleAllDownloadsPause();
            }}
            style={{ cursor: "pointer" }}
          >
            {isAllPaused ? (
              <Play size={13} fill="currentColor" />
            ) : (
              <Pause size={13} fill="currentColor" />
            )}
          </ActionIcon>
        </Tooltip>

        <Tooltip
          label={
            isAllPaused
              ? `Downloads Paused (${incompleteTorrents.length} items) • Click to open Downloads Manager`
              : `Downloading (${activeDownloadingTorrents.length || aggregateStats.activeCount} active) • Click to open Downloads Manager`
          }
        >
          <Group
            gap="xs"
            onClick={onOpenDownloads}
            style={{ cursor: "pointer" }}
          >
            <Stack gap={2} style={{ width: 100 }}>
              <Group justify="space-between" align="center" gap={2}>
                <Text
                  size="11px"
                  fw={700}
                  c={isAllPaused ? "yellow.4" : "teal.4"}
                  ff="monospace"
                >
                  {isAllPaused
                    ? "Paused"
                    : `↓ ${aggregateStats.totalDownSpeed || "0 B/s"}`}
                </Text>
                <Text size="10px" c="dimmed">
                  {totalDownloadProgress.toFixed(0)}%
                </Text>
              </Group>
              <Progress
                value={totalDownloadProgress}
                color={isAllPaused ? "yellow" : "teal"}
                size={3}
                radius="xl"
                animated={!isAllPaused}
              />
            </Stack>
          </Group>
        </Tooltip>
      </Group>
    </Paper>
  );
});

// Memoized Active Session Banner (handles its own timer without re-rendering parent page)
const ActiveSessionBanner: React.FC<{
  activeGame: Game | null;
  onStop: () => void;
}> = React.memo(({ activeGame, onStop }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!activeGame) {
      setElapsedSeconds(0);
      return;
    }
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  return () => clearInterval(interval);
  }, [activeGame]);

  if (!activeGame) {return null;}

  return (
    <Alert
      color="teal"
      variant="filled"
      radius={0}
      p="xs"
      icon={<Play size={16} />}
      style={{
        boxShadow: "0 4px 12px rgba(18, 184, 134, 0.2)",
        borderBottom: "1px solid var(--mantine-color-teal-6)",
      }}
    >
      <Group justify="space-between">
        <Box>
          <Text size="xs" fw={700}>
            Playing: {activeGame.title}
          </Text>
          <Text size="xs">
            Session: {Math.floor(elapsedSeconds / 3600)}h{" "}
            {Math.floor((elapsedSeconds % 3600) / 60)}m{" "}
            {elapsedSeconds % 60}s
          </Text>
        </Box>
        <Button
          size="xs"
          color="red"
          variant="white"
          onClick={onStop}
        >
          Stop Game
        </Button>
      </Group>
    </Alert>
  );
});

// Hook for Windows Taskbar & System Tray Progress Sync (runs outside React component renders)
function useTaskbarProgressSync() {
  const lastTaskbarProgressRef = useRef<{
    status: ProgressBarStatus;
    progress: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    const unsub = useDownloadQueueStore.subscribe((state) => {
      const magnetDownloads = state.magnetDownloads;
      const queuedGames = state.queuedGames;

      const incomplete = magnetDownloads.filter((t) => t.status !== "completed");
      const incompleteQueued = queuedGames.filter(
        (g) => g.status !== "completed",
      );

      if (incomplete.length === 0 && incompleteQueued.length === 0) {
        if (lastTaskbarProgressRef.current?.status !== ProgressBarStatus.None) {
          lastTaskbarProgressRef.current = {
            status: ProgressBarStatus.None,
            progress: 0,
          };
          getCurrentWindow()
            .setProgressBar({ status: ProgressBarStatus.None })
            .catch(() => {});
          invoke("update_tray_downloads", { downloads: [] }).catch(() => {});
        }
        return;
      }

      const hasActiveTorrents = incomplete.some(
        (t) => t.status === "downloading" || t.status === "checking",
      );
      const hasActiveQueued = incompleteQueued.some(
        (g) => g.status === "downloading",
      );
      const isPaused = !hasActiveTorrents && !hasActiveQueued;
      const isError =
        incomplete.length > 0 &&
        incomplete.every((t) => t.status === "error") &&
        (incompleteQueued.length === 0 ||
          incompleteQueued.every((g) => g.status === "error"));

      let status = ProgressBarStatus.Normal;
      if (isError) {
        status = ProgressBarStatus.Error;
      } else if (isPaused) {
        status = ProgressBarStatus.Paused;
      } else if (
        incomplete.length > 0 &&
        incomplete.every((t) => t.status === "checking")
      ) {
        status = ProgressBarStatus.Indeterminate;
      }

      let progressPercent = 0;
      if (incomplete.length > 0) {
        const total = incomplete.reduce(
          (acc, curr) => acc + (curr.progress || 0),
          0,
        );
        progressPercent = total / incomplete.length;
      } else if (incompleteQueued.length > 0) {
        const total = incompleteQueued.reduce((acc, g) => {
          const gProg =
            g.files.reduce((facc, f) => facc + (f.progressPercent || 0), 0) /
            (g.files.length || 1);
          return acc + gProg;
        }, 0);
        progressPercent = total / incompleteQueued.length;
      }

      const targetProgress = Math.min(
        100,
        Math.max(0, Math.round(progressPercent)),
      );
      const prev = lastTaskbarProgressRef.current;

      if (!prev || prev.status !== status || prev.progress !== targetProgress) {
        lastTaskbarProgressRef.current = { status, progress: targetProgress };
        getCurrentWindow()
          .setProgressBar({
            status,
            progress: targetProgress,
          })
          .catch(() => {});
      }

      const trayDownloadsPayload = [
        ...incomplete.map((d) => ({
          id: d.id,
          title: d.title,
          progress: d.progress || 0,
          speed: d.speed || "0.0 B/s",
          status: d.status,
        })),
        ...incompleteQueued.map((g) => ({
          id: g.id,
          title: g.title,
          progress:
            g.files.reduce((acc, f) => acc + (f.progressPercent || 0), 0) /
            (g.files.length || 1),
          speed: "Downloading",
          status: g.status,
        })),
      ].slice(0, 5);

      invoke("update_tray_downloads", { downloads: trayDownloadsPayload }).catch(
        () => {},
      );
    });

  return () => {
      unsub();
    };
  }, []);
}

export default function Home() {
  const { online: isOnline = true } = useNetwork();
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("dark", {
    getInitialValueInEffect: true,
  });
  const isDark = computedColorScheme === "dark";
  const [mounted, setMounted] = useState(false);
  const hasLoadedInitialSettings = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [games, setGames] = useState<Game[]>([]);
  const [pinnedGameIds, setPinnedGameIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>("library");
  const [catalogSource, setCatalogSource] = useState<
    "all" | "fitgirl" | "steamrip" | "recomp"
  >("all");
  const [catalogAmbientArtwork, setCatalogAmbientArtwork] = useState<string | null>(null);
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(
    () => new Set(["library"]),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "favorites" | "installed" | "completed" | "wishlist"
  >("all");
  const [sortOption, setSortOption] = useState<SortOption>("playtime-desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [splitGridCols, setSplitGridCols] = useState<number>(3);
  const [fullGridZoom, setFullGridZoom] = useState<number>(155);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "fitgirl" | "steamrip" | "manual"
  >("all");
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [notInstalledOnly, setNotInstalledOnly] = useState<boolean>(false);
  const [hoveredGameId, setHoveredGameId] = useState<string | null>(null);
  const [selectedListGameId, setSelectedListGameId] = useState<string | null>(
    null,
  );
  const [isMapsBrowserOpen, setIsMapsBrowserOpen] = useState(false);
  const [isBoosterOpen, setIsBoosterOpen] = useState(false);
  const [activeMapViewer, setActiveMapViewer] = useState<{
    gameSlug: string;
    mapSlug: string;
    gameTitle: string;
  } | null>(null);

  // Restore all UI settings from localStorage once on mount
  useEffect(() => {
    if (typeof window === "undefined") {return;}
    if (hasLoadedInitialSettings.current) {return;}
    hasLoadedInitialSettings.current = true;

    const savedMode = localStorage.getItem("fitrepacks_view_mode");
    if (
      savedMode === "grid" ||
      savedMode === "list" ||
      savedMode === "full-grid"
    ) {
      setViewMode(savedMode);
    }

    const savedSplitCols = localStorage.getItem("fitrepacks_split_grid_cols");
    if (savedSplitCols) {
      const parsed = parseInt(savedSplitCols, 10);
      if (parsed >= 2 && parsed <= 4) {setSplitGridCols(parsed);}
    }

    const savedFullZoom = localStorage.getItem("fitrepacks_full_grid_zoom");
    if (savedFullZoom) {
      const parsed = parseInt(savedFullZoom, 10);
      if (parsed >= 110 && parsed <= 240) {setFullGridZoom(parsed);}
    }

    const savedId = localStorage.getItem("fitrepacks_selected_list_game_id");
    if (savedId) {
      setSelectedListGameId(savedId);
    }

    const savedCat = localStorage.getItem("fitrepacks_category_filter");
    if (
      savedCat &&
      ["all", "favorites", "installed", "completed", "wishlist"].includes(
        savedCat,
      )
    ) {
      setCategoryFilter(savedCat as any);
    }

    const savedSort = localStorage.getItem("fitrepacks_sort_option");
    if (
      savedSort &&
      [
        "playtime-desc",
        "playtime-asc",
        "recent",
        "release-desc",
        "release-asc",
        "added-desc",
        "added-asc",
        "size-desc",
        "size-asc",
        "title-asc",
        "rating-desc",
      ].includes(savedSort)
    ) {
      setSortOption(savedSort as any);
    }

    const savedTab = localStorage.getItem("fitrepacks_active_tab");
    if (
      savedTab &&
      [
        "library",
        "repacks",
        "steamrip",
        "downloads",
        "controllers",
        "analytics",
      ].includes(savedTab)
    ) {
      const normalizedTab = (
        savedTab === "steamrip" ? "repacks" : savedTab
      ) as ActiveTab;
      if (savedTab === "steamrip") {
        setCatalogSource("steamrip");
      }
      setActiveTab(normalizedTab);
      setVisitedTabs((prev) => {
        if (prev.has(normalizedTab)) {return prev;}
        const next = new Set(prev);
        next.add(normalizedTab);
        return next;
      });
    }

    const savedTheme = localStorage.getItem("fitrepacks_color_scheme");
    if (savedTheme === "dark" || savedTheme === "light") {
      setColorScheme(savedTheme);
    }
  }, [setColorScheme]);

  const handleViewModeChange = useCallback((newMode: string) => {
    const mode = newMode as ViewMode;
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_view_mode", mode);
    }
  }, []);

  const handleSplitGridColsChange = useCallback((cols: number) => {
    setSplitGridCols(cols);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_split_grid_cols", String(cols));
    }
  }, []);

  const handleFullGridZoomChange = useCallback((zoom: number) => {
    setFullGridZoom(zoom);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_full_grid_zoom", String(zoom));
    }
  }, []);

  const handleSelectGame = useCallback((id: string) => {
    setSelectedListGameId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_selected_list_game_id", id);
    }
  }, []);

  const handleCategoryFilterChange = useCallback((val: string | null) => {
    if (!val) {return;}
    const filter = val as
      | "all"
      | "favorites"
      | "installed"
      | "completed"
      | "wishlist";
    setCategoryFilter(filter);
    setNotInstalledOnly(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_category_filter", filter);
    }
  }, []);

  const clearAllFilters = useCallback(() => {
    setCategoryFilter("all");
    setGenreFilter(null);
    setSourceFilter("all");
    setYearFilter(null);
    setNotInstalledOnly(false);
    setSearchQuery("");
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_category_filter", "all");
    }
  }, []);

  const handleSortOptionChange = useCallback((val: string | null) => {
    if (!val) {return;}
    const sort = val as SortOption;
    setSortOption(sort);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_sort_option", sort);
    }
  }, []);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setVisitedTabs((prev) => {
      if (prev.has(tab)) {return prev;}
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_active_tab", tab);
    }
  }, []);

  const handleToggleTheme = (event: React.MouseEvent<HTMLElement>) => {
    const nextScheme = isDark ? "light" : "dark";
    toggleThemeWithRipple(event, () => {
      setColorScheme(nextScheme);
    });
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_color_scheme", nextScheme);
    }
  };

  // Modals state
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [noUninstallerGame, setNoUninstallerGame] = useState<Game | null>(null);
  const [gameToRemove, setGameToRemove] = useState<Game | null>(null);
  const [isAddOrScanModalOpen, setIsAddOrScanModalOpen] = useState(false);
  const [isIgdbSearchOpen, setIsIgdbSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleOpenDetails = useCallback((game: Game) => {
    setSelectedGame(game);
  }, []);

  const handleOpenEditModal = useCallback((game: Game) => {
    setEditingGame(game);
  }, []);

  // Global App Updater Store
  const updaterStatus = useAppUpdater((state) => state.status);
  const updateDetails = useAppUpdater((state) => state.updateDetails);

  // Synchronize overall download progress with Windows Taskbar app icon and Tray Menu
  useTaskbarProgressSync();

  // Check for application updates on startup and whenever window gains focus (throttled)
  useEffect(() => {
    let unlistenTauriFocus: (() => void) | undefined;
    let lastFocusCheck = 0;

    const triggerCheck = (silent = true) => {
      const now = Date.now();
      if (now - lastFocusCheck < 60000) {return;}
      lastFocusCheck = now;
      useAppUpdater.getState().checkForUpdates(silent);
    };

    triggerCheck(true);

    const handleFocus = () => {
      triggerCheck(true);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerCheck(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => {
          return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
            if (focused) {
              triggerCheck(true);
            }
          });
        })
        .then((unlisten) => {
          unlistenTauriFocus = unlisten;
        })
        .catch(() => {});
    }

  return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (unlistenTauriFocus) {
        unlistenTauriFocus();
      }
    };
  }, []);

  // Persistent App-Wide Real-Time Stats Polling from Native Rust BitTorrent Engine
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let isMounted = true;

    const pollStats = async () => {
      if (!isMounted) {return;}
      try {
        const store = useDownloadQueueStore.getState();
        const hasActiveOrIncomplete =
          store.magnetDownloads.some((t) => t.status !== "completed") ||
          store.queuedGames.some((g) => g.status !== "completed");

        if (!hasActiveOrIncomplete && store.aggregateStats.activeCount === 0) {
          return;
        }

        const stats = await invoke<any>("get_all_torrent_stats");
        if (isMounted && stats) {
          store.syncFromLiveStats(stats);
        }
      } catch {
        // ignore
      }
    };

    pollStats();
    const intervalId = setInterval(pollStats, 1000);

  return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  // Torrent download modal state
  const [torrentModalData, setTorrentModalData] = useState<{
    magnetUrl: string;
    title?: string;
    coverUrl?: string;
    repackSize?: string;
  } | null>(null);

  // Active game execution monitor state
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const activeGameRef = useRef<Game | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const isStoppingSessionRef = useRef<boolean>(false);
  const [isDevMode, setIsDevMode] = useState<boolean>(false);

  // Global Map Overlay Keyboard and Controller Shortcut Listener
  useOverlayShortcuts({ activeGame });

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (process.env.NODE_ENV === "development") {
        setIsDevMode(true);
      }
      if ("__TAURI_INTERNALS__" in window) {
        invoke<boolean>("is_dev_mode")
          .then((dev) => {
            if (dev) {setIsDevMode(true);}
          })
          .catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    setGames(getStoredGames());
    setPinnedGameIds(getPinnedGameIds());
    syncTauriLibraryData().then((loaded) => {
      if (loaded) {
        setGames(loaded);
      }
      resumeActiveDownloadsOnStartup();
    });

    const handleGamesUpdated = () => {
      const stored = getStoredGames();
      setGames([...stored]);
      setSelectedGame((prev) =>
        prev ? stored.find((g) => g.id === prev.id) || null : null,
      );
    };

    const handlePinnedUpdated = (e: any) => {
      setPinnedGameIds(e.detail || getPinnedGameIds());
    };

    const handleFocus = () => {
      syncTauriLibraryData().then((loaded) => {
        if (loaded && loaded.length > 0) {
          setGames(loaded);
        }
      });
      setPinnedGameIds(getPinnedGameIds());
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
        syncTauriLibraryData().then((loaded) => {
          if (loaded) {
            setGames(loaded);
          }
        });
        setPinnedGameIds(getPinnedGameIds());
      }
    };

    window.addEventListener("fitrepacks-games-updated", handleGamesUpdated);
    window.addEventListener("fitrepacks-pinned-updated", handlePinnedUpdated);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("keydown", handleKeyDown);

  return () => {
      window.removeEventListener(
        "fitrepacks-games-updated",
        handleGamesUpdated,
      );
      window.removeEventListener(
        "fitrepacks-pinned-updated",
        handlePinnedUpdated,
      );
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Synchronize recent games with system tray menu and Windows taskbar jump list
  useEffect(() => {
    if (games && games.length > 0) {
      syncRecentGamesToTrayAndTaskbar(games);
    }
  }, [games]);

  // Realtime AlsaBase repacks subscription & Windows notification listener
  useEffect(() => {
    let cleanupFn: (() => void) | null = null;
    initRepackSubscription().then((cleanup) => {
      cleanupFn = cleanup;
    });

    syncLibraryGamesWithLatestRepacks();

    // Ensure Windows startup registry is verified and synchronized on app launch
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      import("../lib/db")
        .then(({ getAppSetting, setAutostartStatus, getAutostartStatus }) => {
          getAppSetting("autostart_enabled")
            .then(async (setting) => {
              if (setting === "true") {
                const isCurrentlyEnabled = await getAutostartStatus().catch(() => false);
                if (!isCurrentlyEnabled) {
                  await setAutostartStatus(true).catch(() => {});
                }
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
    }

  return () => {
      if (cleanupFn) {
        cleanupFn();
      }
      unsubscribeRepackSubscription();
    };
  }, []);

  const stopActiveSession = useCallback(() => {
    const game = activeGameRef.current;
    if (!game || isStoppingSessionRef.current) {
      return;
    }
    isStoppingSessionRef.current = true;

    let elapsedSecs = 0;
    if (sessionStartTimeRef.current) {
      elapsedSecs = Math.floor(
        (Date.now() - sessionStartTimeRef.current) / 1000,
      );
    }

    if (elapsedSecs >= 5) {
      const elapsedMinutes = elapsedSecs / 60;
      const updated = updateGamePlaytime(game.id, elapsedMinutes);
      setGames(updated);
    }
    setActiveGame(null);
    activeGameRef.current = null;
    sessionStartTimeRef.current = null;
  }, []);

  // Active Game Execution Timer effect (checks process without ticking Home state)
  useEffect(() => {
    activeGameRef.current = activeGame;
    let interval: NodeJS.Timeout | null = null;
    let isChecking = false;

    if (activeGame) {
      isStoppingSessionRef.current = false;
      sessionStartTimeRef.current = Date.now();

      interval = setInterval(async () => {
        if (
          sessionStartTimeRef.current &&
          Date.now() - sessionStartTimeRef.current > 15000 &&
          typeof window !== "undefined" &&
          "__TAURI_INTERNALS__" in window &&
          !isChecking &&
          !isStoppingSessionRef.current
        ) {
          isChecking = true;
          invoke<boolean>("is_game_running", {
            gameId: activeGame.id,
            exePath: activeGame.exePath,
          })
            .then((stillRunning) => {
              isChecking = false;
              if (!stillRunning && !isStoppingSessionRef.current) {
                stopActiveSession();
              }
            })
            .catch(() => {
              isChecking = false;
            });
        }
      }, 2500);
    } else {
      sessionStartTimeRef.current = null;
    }
  return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [activeGame, stopActiveSession]);

  // Tauri game-process-closed listener to auto stop timer when process exits
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      listen<{ gameId: string }>("game-process-closed", () => {
        if (!isStoppingSessionRef.current) {
          stopActiveSession();
        }
      })
        .then((unsub) => {
          if (unsub) {unlistenFn = unsub;}
        })
        .catch((err) => {
          console.warn("Tauri event listener fallback:", err);
        });
    }
  return () => {
      if (unlistenFn) {unlistenFn();}
    };
  }, [stopActiveSession]);

  const handleMinimizeWindow = async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        await getCurrentWindow().minimize();
      } catch (err) {
        console.error("Failed to minimize window:", err);
      }
    }
  };

  const handleToggleMaximizeWindow = async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        await getCurrentWindow().toggleMaximize();
      } catch (err) {
        console.error("Failed to toggle maximize window:", err);
      }
    }
  };

  const handleCloseAppWindow = async () => {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        await getCurrentWindow().close();
      } catch (err) {
        console.error("Failed to close window:", err);
      }
    }
  };

  const handleLaunchGame = useCallback(
    async (game: Game) => {
      if (!game.isInstalled || !game.exePath || !game.exePath.trim()) {
        return;
      }
      if (activeGame) {
        if (activeGame.id === game.id) {
          stopActiveSession();
        }
        return;
      }

      setActiveGame(game);

      // Update active map overlay target if game has an interactive map
      try {
        const { findMatchingMap, getLastOpenedMapSlug } = await import("../lib/gameMaps");
        const matched = findMatchingMap(game.title, game.id);
        if (matched) {
          const gSlug = matched.game_slug || (matched.slug.includes("--") ? matched.slug.split("--")[0] : matched.slug);
          const gTitle = matched.game_title || game.title;
          const mLast = getLastOpenedMapSlug(gSlug) || matched.map_slug || "default";
          if (typeof window !== "undefined") {
            localStorage.setItem("fitrepacks_active_game_slug", gSlug);
            localStorage.setItem("fitrepacks_active_game_title", gTitle);
            localStorage.setItem("fitrepacks_last_valid_map_game", gSlug);
          }
          if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
            invoke("set_active_overlay_game", {
              gameSlug: gSlug,
              mapSlug: mLast,
              gameTitle: gTitle,
            }).catch(() => {});
          }
        } else if (typeof window !== "undefined") {
          localStorage.removeItem("fitrepacks_active_game_slug");
          localStorage.removeItem("fitrepacks_active_game_title");
        }
      } catch (_) {}

      // Update lastPlayed timestamp immediately on launch so it reflects in recent lists
      const now = new Date().toISOString();
      const updatedGame: Game = { ...game, lastPlayed: now };
      updateGameInStorage(updatedGame);
      setGames((prev) => prev.map((g) => (g.id === game.id ? updatedGame : g)));

      try {
        if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
          const { isLinuxPlatform, buildLinuxLaunchConfiguration } =
            await import("../lib/linuxRunner");

          if (isLinuxPlatform()) {
            const config = await buildLinuxLaunchConfiguration(game);
            await invoke<string>("launch_game_exe", {
              exePath: game.exePath,
              workingDir: config.workingDir,
              gameId: game.id,
              runnerCommand: config.runnerCommand,
              runnerArgs: config.runnerArgs,
              envVars: config.envVars,
            });
          } else {
            await invoke<string>("launch_game_exe", {
              exePath: game.exePath,
              workingDir: game.workingDir || undefined,
              gameId: game.id,
              runnerCommand: null,
              runnerArgs: null,
              envVars: null,
            });
          }
        }
      } catch (err: any) {
        console.error("Failed launching game:", err);
        alert(`Failed to launch game executable:\n${err?.message || err}`);
        setActiveGame(null);
      }
    },
    [activeGame, stopActiveSession, games],
  );

  // Listen to system tray quick game launch and downloads navigation events
  useEffect(() => {
    let unlistenTray: (() => void) | null = null;
    let unlistenDownloads: (() => void) | null = null;

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      listen<string>("tray-launch-game", (event) => {
        const gameId = event.payload;
        if (gameId) {
          const currentGames = getStoredGames();
          const target = currentGames.find((g) => g.id === gameId);
          if (target) {
            handleLaunchGame(target);
          }
        }
      }).then((unlisten) => {
        unlistenTray = unlisten;
      });

      listen("tray-open-downloads", () => {
        handleTabChange("downloads");
      }).then((unlisten) => {
        unlistenDownloads = unlisten;
      });
    }

  return () => {
      if (unlistenTray) {unlistenTray();}
      if (unlistenDownloads) {unlistenDownloads();}
    };
  }, [handleLaunchGame, handleTabChange]);

  const handleImportGames = (newGames: Game[]) => {
    const updated = addGamesBatchToStorage(newGames);
    setGames(updated);
  };

  const handleAddSingleGame = (newGame: Game) => {
    const updated = addGameToStorage(newGame);
    setGames(updated);
  };

  const handleSaveEditedGame = (updatedGame: Game) => {
    const updated = updateGameInStorage(updatedGame);
    setGames(updated);
    if (selectedGame && selectedGame.id === updatedGame.id) {
      setSelectedGame(updatedGame);
    }
  };

  // Card trash icon button: Prompts confirmation before removing from library
  const handleRemoveFromList = useCallback((id: string) => {
    const allGames = getStoredGames();
    const target = allGames.find((g) => g.id === id);
    if (target) {
      setGameToRemove(target);
    } else {
      const updated = deleteGameFromStorage(id);
      setGames(updated);
    }
  }, []);

  // Remove from Wishlist button: Keeps game if installed, favorite, or completed!
  const handleRemoveFromWishlist = useCallback((id: string) => {
    toggleWishlistRepack(id);
    setSelectedGame((prev) => {
      if (prev && prev.id === id) {
        const updatedGames = getStoredGames();
        return updatedGames.find((g) => g.id === id) || null;
      }
      return prev;
    });
  }, []);

  // Hold-to-uninstall button: Checks for unins000.exe. If missing, prompts user with confirmation dialog
  const handleUninstallGame = useCallback(async (id: string) => {
    const allGames = getStoredGames();
    const target = allGames.find((g) => g.id === id);
    if (!target) {
      return;
    }

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { checkUninstallerExe, uninstallGameExe } =
          await import("../lib/scanner");
        const uninstallerPath = await checkUninstallerExe(target.exePath);

        if (uninstallerPath) {
          await uninstallGameExe(target.exePath);
          const updated = deleteGameFromStorage(id);
          setGames(updated);
        } else {
          setNoUninstallerGame(target);
        }
        return;
      } catch {
        setNoUninstallerGame(target);
        return;
      }
    }

    const updated = deleteGameFromStorage(id);
    setGames(updated);
  }, []);

  const handleConfirmDeleteFolder = useCallback(async (game: Game) => {
    const gameFolder =
      game.workingDir ||
      (game.exePath.includes("\\")
        ? game.exePath.substring(0, game.exePath.lastIndexOf("\\"))
        : game.exePath);
    if (
      gameFolder &&
      typeof window !== "undefined" &&
      "__TAURI_INTERNALS__" in window
    ) {
      try {
        const { exists, remove } = await import("@tauri-apps/plugin-fs");
        if (await exists(gameFolder)) {
          await remove(gameFolder, { recursive: true });
        }
      } catch {
        // ignore
      }
    }
    const updated = deleteGameFromStorage(game.id);
    setGames(updated);
    setNoUninstallerGame(null);
  }, []);

  const handleConfirmRemoveLibraryOnly = useCallback((game: Game) => {
    const updated = deleteGameFromStorage(game.id);
    setGames(updated);
    setNoUninstallerGame(null);
  }, []);

  const mainScrollRef = useRef<HTMLDivElement>(null);

  const handleToggleFavorite = useCallback((id: string) => {
    const updated = toggleFavoriteGame(id);
    setGames(updated);
  }, []);

  const handleToggleCompleted = useCallback((id: string) => {
    const updated = toggleCompletedGame(id);
    setGames(updated);
  }, []);

  const handleStatusChange = useCallback(
    (id: string, status: "installed" | "wishlist" | "completed" | "none") => {
      const updated = setGameStatus(id, status);
      setGames([...updated]);
    },
    [],
  );

  const handleTogglePin = useCallback((id: string) => {
    if (
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
    ) {
      document.activeElement.blur();
    }
    const container = mainScrollRef.current;
    const currentScroll = container ? container.scrollTop : 0;

    const next = togglePinnedGame(id);
    setPinnedGameIds(next);

    if (container && currentScroll > 0) {
      requestAnimationFrame(() => {
        if (container) {container.scrollTop = currentScroll;}
      });
      setTimeout(() => {
        if (container) {container.scrollTop = currentScroll;}
      }, 30);
    }
  }, []);

  const filteredGames = useMemo(() => {
    return games
      .filter((g) => {
        const q = searchQuery.trim().toLowerCase();
        if (q) {
          const tokens = q
            .split(/[\s:,\-_/\\|.]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
          const strippedQ = q.replace(/[^a-z0-9]/g, "");
          const titleStr = (g.title || "").toLowerCase();
          const devStr = (g.developer || "").toLowerCase();
          const genresStr = (g.genres || []).join(" ").toLowerCase();
          const combined = `${titleStr} ${devStr} ${genresStr}`;
          const combinedStripped = combined.replace(/[^a-z0-9]/g, "");

          const matchesStripped =
            Boolean(strippedQ) && combinedStripped.includes(strippedQ);
          const matchesAllTokens =
            tokens.length > 0 &&
            tokens.every((token) => combined.includes(token));

          if (!matchesStripped && !matchesAllTokens) {
            return false;
          }
        }
        if (categoryFilter === "favorites" && !g.isFavorite) {
          return false;
        }
        if (categoryFilter === "installed") {
          const isInst = Boolean(g.isInstalled);
          if (!isInst) {return false;}
        }
        if (categoryFilter === "completed") {
          const isComp = Boolean(g.isCompleted);
          if (!isComp) {return false;}
        }
        if (categoryFilter === "wishlist") {
          const isWish = g.isWishlisted;
          if (!isWish) {return false;}
        }
        if (notInstalledOnly && g.isInstalled) {
          return false;
        }
        if (genreFilter) {
          if (!g.genres || !g.genres.includes(genreFilter)) {
            return false;
          }
        }
        if (sourceFilter !== "all") {
          if (sourceFilter === "fitgirl" && !g.linkedFitgirlUrl && g.source !== "fitgirl") {
            return false;
          }
          if (sourceFilter === "steamrip" && !g.linkedSteamripUrl && g.source !== "steamrip") {
            return false;
          }
          if (
            sourceFilter === "manual" &&
            (g.linkedFitgirlUrl ||
              g.linkedSteamripUrl ||
              g.source === "fitgirl" ||
              g.source === "steamrip")
          ) {
            return false;
          }
        }
        if (yearFilter) {
          const gameYear = g.releaseYear
            ? String(g.releaseYear)
            : g.releaseDate
              ? String(new Date(g.releaseDate).getFullYear())
              : null;
          if (gameYear !== yearFilter) {return false;}
        }

        // Hide adult games unless explicitly searching or filtering for adult categories
        const isAdultSelectedInSearch =
          Boolean(q) && ADULT_KEYWORDS.some((kw) => q.includes(kw));
        const isAdultSelectedInCat =
          Boolean(categoryFilter) &&
          ADULT_KEYWORDS.some((kw) =>
            categoryFilter.toLowerCase().includes(kw),
          );

        if (!isAdultSelectedInSearch && !isAdultSelectedInCat) {
          if (isAdultContent(g.genres, g.tags, g.title)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const aPinned = pinnedGameIds.includes(a.id);
        const bPinned = pinnedGameIds.includes(b.id);
        if (aPinned && !bPinned) {return -1;}
        if (!aPinned && bPinned) {return 1;}

        const getHrs = (g: Game) =>
          g.hoursPlayed ?? (g.playtimeMinutes || 0) / 60;
        const getReleaseDateTimestamp = (g: Game): number => {
          if (g.releaseDate) {
            const parsed = Date.parse(g.releaseDate);
            if (!isNaN(parsed)) {return parsed;}
          }
          if (g.releaseYear) {
            return new Date(g.releaseYear, 0, 1).getTime();
          }
          const rawPostDate =
            g.fitgirlUploadDate ||
            g.steamripUploadDate ||
            g.updateInfo?.date ||
            g.dateAdded;
          if (rawPostDate) {
            const parsed = Date.parse(rawPostDate);
            if (!isNaN(parsed)) {return parsed;}
          }
          return 0;
        };

        if (sortOption === "playtime-desc") {
          return getHrs(b) - getHrs(a);
        }
        if (sortOption === "playtime-asc") {
          return getHrs(a) - getHrs(b);
        }
        if (sortOption === "release-desc") {
          return getReleaseDateTimestamp(b) - getReleaseDateTimestamp(a);
        }
        if (sortOption === "release-asc") {
          return getReleaseDateTimestamp(a) - getReleaseDateTimestamp(b);
        }
        if (sortOption === "recent") {
          const dateA = a.lastPlayed ? new Date(a.lastPlayed).getTime() : 0;
          const dateB = b.lastPlayed ? new Date(b.lastPlayed).getTime() : 0;
          return dateB - dateA;
        }
        if (sortOption === "added-desc") {
          const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
          const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
          return dateB - dateA;
        }
        if (sortOption === "added-asc") {
          const dateA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
          const dateB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
          return dateA - dateB;
        }
        if (sortOption === "size-desc") {
          const sizeA = parseSizeToMB(a.repackSize);
          const sizeB = parseSizeToMB(b.repackSize);
          if (sizeA === 0 && sizeB === 0) {
            return a.title.localeCompare(b.title);
          }
          if (sizeA === 0) {return 1;}
          if (sizeB === 0) {return -1;}
          const diff = sizeB - sizeA;
          return diff !== 0 ? diff : a.title.localeCompare(b.title);
        }
        if (sortOption === "size-asc") {
          const sizeA = parseSizeToMB(a.repackSize);
          const sizeB = parseSizeToMB(b.repackSize);
          if (sizeA === 0 && sizeB === 0) {
            return a.title.localeCompare(b.title);
          }
          if (sizeA === 0) {return 1;}
          if (sizeB === 0) {return -1;}
          const diff = sizeA - sizeB;
          return diff !== 0 ? diff : a.title.localeCompare(b.title);
        }
        if (sortOption === "title-asc") {
          return a.title.localeCompare(b.title);
        }
        if (sortOption === "title-desc") {
          return b.title.localeCompare(a.title);
        }
        if (sortOption === "rating-desc") {
  return (b.rating || 0) - (a.rating || 0);
        }
        return 0;
      });
  }, [
    games,
    searchQuery,
    categoryFilter,
    notInstalledOnly,
    genreFilter,
    sourceFilter,
    yearFilter,
    sortOption,
    pinnedGameIds,
  ]);

  const categoryCounts = useMemo(() => {
    let installed = 0;
    let notInstalled = 0;
    let completed = 0;
    let wishlist = 0;
    let favorites = 0;
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (g.isInstalled) {installed++;}
      else {notInstalled++;}
      if (g.isCompleted) {completed++;}
      if (g.isWishlisted) {wishlist++;}
      if (g.isFavorite) {favorites++;}
    }
    return {
      all: games.length,
      installed,
      notInstalled,
      completed,
      wishlist,
      favorites,
    };
  }, [games]);

  const availableGenres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of games) {
      if (!g.genres) {continue;}
      for (const genre of g.genres) {
        counts.set(genre, (counts.get(genre) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [games]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const g of games) {
      if (g.releaseYear) {years.add(String(g.releaseYear));}
      else if (g.releaseDate) {
        const y = new Date(g.releaseDate).getFullYear();
        if (!isNaN(y)) {years.add(String(y));}
      }
    }
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [games]);

  const activeFilterCount =
    (categoryFilter !== "all" ? 1 : 0) +
    (notInstalledOnly ? 1 : 0) +
    (genreFilter ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0) +
    (yearFilter ? 1 : 0);

  const navItems: {
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    isLocked?: boolean;
  }[] = useMemo(
    () => [
      {
        id: "library",
        label: "Library",
        icon: <Gamepad2 size={15} />,
        badge: `${games.length}`,
      },
      {
        id: "repacks",
        label: "Catalog",
        icon: isOnline ? (
          <DownloadCloud size={15} />
        ) : (
          <Lock size={14} color="#ff6b6b" />
        ),
        isLocked: !isOnline,
      },
      {
        id: "downloads",
        label: "Downloads",
        icon: <Download size={15} />,
      },
      {
        id: "analytics",
        label: "Analytics",
        icon: <BarChart3 size={15} />,
      },
    ],
    [games.length, isOnline],
  );

  const activeListGame = useMemo(() => {
  return (
      filteredGames.find((g) => g.id === selectedListGameId) ||
      filteredGames[0] ||
      null
    );
  }, [filteredGames, selectedListGameId]);

  const ambientGame = useMemo(() => {
    if (viewMode === "full-grid" && hoveredGameId) {
      return games.find((g) => g.id === hoveredGameId) || activeListGame;
    }
    return activeListGame;
  }, [viewMode, hoveredGameId, games, activeListGame]);

  const ambientArtworkUrl =
    (activeTab === "repacks" && catalogAmbientArtwork) ||
    ambientGame?.bannerUrl ||
    ambientGame?.screenshots?.[0] ||
    ambientGame?.coverUrl ||
    null;

  const searchPlaceholder =
    activeTab === "library"
      ? "Search"
      : activeTab === "repacks"
        ? catalogSource === "all"
          ? "Search all catalog sources..."
          : catalogSource === "recomp"
            ? "Search Recomp catalog..."
            : catalogSource === "steamrip"
              ? "Search SteamRIP games..."
              : "Search FitGirl repacks..."
        : activeTab === "analytics"
          ? "Search analytics..."
          : "Search...";

  const glassSelectStyles = {
    input: {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      borderColor: "rgba(255, 255, 255, 0.12)",
      backdropFilter: "blur(12px)",
    },
    dropdown: {
      backgroundColor: "rgba(14, 18, 26, 0.82)",
      backdropFilter: "blur(24px)",
      borderColor: "rgba(255, 255, 255, 0.12)",
    },
  };

  const renderLibraryBottomControls = (includeZoom: boolean) => (
    <Group gap="xs" align="center" wrap="nowrap">
      {/* Quick Category Filters */}
      <Group gap={3} wrap="nowrap">
        {[
          {
            id: "all" as const,
            label: `All (${categoryCounts.all})`,
            icon: <Gamepad2 size={13} />,
            color: "blue",
          },
          {
            id: "installed" as const,
            label: `Installed (${categoryCounts.installed})`,
            icon: <HardDrive size={13} />,
            color: "blue",
          },
          {
            id: "favorites" as const,
            label: `Favorites (${categoryCounts.favorites})`,
            icon: <Star size={13} />,
            color: "yellow",
          },
          {
            id: "completed" as const,
            label: `Completed (${categoryCounts.completed})`,
            icon: <CheckCircle2 size={13} />,
            color: "teal",
          },
          {
            id: "wishlist" as const,
            label: `Wishlist (${categoryCounts.wishlist})`,
            icon: <Bookmark size={13} />,
            color: "orange",
          },
        ].map((cat) => {
          const active = categoryFilter === cat.id && !notInstalledOnly;
          return (
            <Tooltip key={cat.id} label={cat.label} withArrow>
              <ActionIcon
                size="sm"
                radius="md"
                variant={active ? "filled" : "subtle"}
                color={active ? cat.color : "gray"}
                onClick={() => handleCategoryFilterChange(cat.id)}
              >
                {cat.icon}
              </ActionIcon>
            </Tooltip>
          );
        })}
      </Group>

      <Divider orientation="vertical" opacity={0.2} />

      {/* View Modes + Filter Drawer */}
      <Group gap={2} wrap="nowrap">
        <Tooltip label="List View (FusionX / Daze)" withArrow>
          <ActionIcon
            size="sm"
            radius="sm"
            variant={viewMode === "list" ? "white" : "subtle"}
            color={viewMode === "list" ? "dark" : "gray"}
            onClick={() => handleViewModeChange("list")}
          >
            <List size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Split Grid View (Posters + Details)" withArrow>
          <ActionIcon
            size="sm"
            radius="sm"
            variant={viewMode === "grid" ? "white" : "subtle"}
            color={viewMode === "grid" ? "dark" : "gray"}
            onClick={() => handleViewModeChange("grid")}
          >
            <LayoutTemplate size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Full Grid View (Daze Posters)" withArrow>
          <ActionIcon
            size="sm"
            radius="sm"
            variant={viewMode === "full-grid" ? "white" : "subtle"}
            color={viewMode === "full-grid" ? "dark" : "gray"}
            onClick={() => handleViewModeChange("full-grid")}
          >
            <LayoutGrid size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Toggle Filter & Sort Drawer" withArrow>
          <ActionIcon
            size="sm"
            radius="sm"
            variant={
              isFilterPanelOpen || activeFilterCount > 0 ? "light" : "subtle"
            }
            color={
              isFilterPanelOpen || activeFilterCount > 0 ? "cyan" : "gray"
            }
            onClick={() => setIsFilterPanelOpen((v) => !v)}
          >
            <Filter size={13} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {includeZoom && (
        <>
          <Divider orientation="vertical" opacity={0.2} />
          <Group gap="xs" align="center" wrap="nowrap">
            <Text size="xs" fw={600} c="gray.3">
              Zoom
            </Text>
            <Slider
              value={fullGridZoom}
              onChange={handleFullGridZoomChange}
              min={110}
              max={240}
              step={5}
              w={110}
              size="xs"
              color="gray.2"
              label={(v) => `${v}px`}
            />
          </Group>
        </>
      )}
    </Group>
  );

  return (
    <>
      {/* Ambient Blurred Game Artwork Background */}
      <Box
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
          backgroundColor: isDark ? "#08090d" : "#f1f5f9",
        }}
      >
        {ambientArtworkUrl && (
          <Box
            style={{
              position: "absolute",
              inset: -40,
              backgroundImage: `url(${ambientArtworkUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: isDark
                ? "blur(26px) brightness(0.6) saturate(1.6)"
                : "blur(32px) brightness(0.95) saturate(1.15) opacity(0.42)",
              transition: "background-image 350ms ease, filter 300ms ease",
              transform: "scale(1.08)",
            }}
          />
        )}
        <Box
          style={{
            position: "absolute",
            inset: 0,
            background: isDark
              ? "radial-gradient(circle at 50% 18%, rgba(14, 18, 28, 0.14) 0%, rgba(8, 9, 13, 0.56) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.65) 0%, rgba(241,245,249,0.92) 100%)",
          }}
        />
      </Box>

      <AppShell
        header={{ height: 52 }}
        padding={0}
        bg="transparent"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* Glassmorphic Top Header (All Navigation, View Modes, Quick Filters & Settings) */}
        <AppShell.Header
          data-tauri-drag-region
          className="daze-glass-header"
          style={{
            zIndex: 100,
            userSelect: "none",
            height: 52,
          }}
        >
          <Group
            h="100%"
            justify="space-between"
            align="center"
            gap={0}
            wrap="nowrap"
            data-tauri-drag-region
            style={{ width: "100%", height: "100%", position: "relative" }}
          >
            {/* Header Left: Brand + Search + Category Panel Toggle + Quick Filter Icons */}
            <Group
              gap="xs"
              px="sm"
              data-tauri-drag-region
              align="center"
              wrap="nowrap"
              style={{ minWidth: 0 }}
            >
              <Group
                gap={8}
                data-tauri-drag-region
                align="center"
                wrap="nowrap"
                style={{ cursor: "default", flexShrink: 0 }}
              >
                <ThemeIcon size={26} radius="md" variant="transparent">
                  <Image
                    src="/favicon.svg"
                    alt="FitRepacks Logo"
                    w={26}
                    h={26}
                  />
                </ThemeIcon>
                {isDevMode && (
                  <Badge
                    size="xs"
                    color="yellow"
                    variant="filled"
                    style={{
                      color: "#1a1500",
                      backgroundColor: "#fab005",
                      fontWeight: 900,
                      letterSpacing: 0.6,
                      fontSize: 9.5,
                    }}
                  >
                    DEV
                  </Badge>
                )}
                {updaterStatus === "available" && updateDetails && (
                  <Tooltip
                    label={`Update v${updateDetails.version} available — click to install`}
                    withArrow
                  >
                    <Badge
                      size="xs"
                      color="teal"
                      variant="filled"
                      leftSection={<Sparkles size={10} />}
                      onClick={() => setIsSettingsOpen(true)}
                      style={{ cursor: "pointer", fontWeight: 700 }}
                    >
                      v{updateDetails.version}
                    </Badge>
                  </Tooltip>
                )}
                {updaterStatus === "downloading" && (
                  <Tooltip label="Downloading update..." withArrow>
                    <Badge
                      size="xs"
                      color="blue"
                      variant="filled"
                      leftSection={<DownloadCloud size={10} />}
                      onClick={() => setIsSettingsOpen(true)}
                      style={{ cursor: "pointer" }}
                    >
                      Updating...
                    </Badge>
                  </Tooltip>
                )}
                {updaterStatus === "ready-to-restart" && (
                  <Tooltip label="Restart to apply update" withArrow>
                    <Badge
                      size="xs"
                      color="green"
                      variant="filled"
                      leftSection={<CheckCircle2 size={10} />}
                      onClick={() => setIsSettingsOpen(true)}
                      style={{ cursor: "pointer", fontWeight: 700 }}
                    >
                      Restart
                    </Badge>
                  </Tooltip>
                )}
              </Group>

              {/* Rounded Glassmorphic Search (hidden on Catalog tab where search lives in the filter sidebar) */}
              {activeTab !== "repacks" && (
                <TextInput
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftSection={<Search size={14} color="#909296" />}
                  rightSection={
                    searchQuery ? (
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => setSearchQuery("")}
                      >
                        <X size={12} />
                      </ActionIcon>
                    ) : null
                  }
                  radius="xl"
                  size="xs"
                  w={{ base: 140, sm: 190, lg: 230 }}
                  styles={{
                    input: {
                      backgroundColor: isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(15, 23, 42, 0.06)",
                      borderColor: isDark
                        ? "rgba(255, 255, 255, 0.14)"
                        : "rgba(15, 23, 42, 0.12)",
                    },
                  }}
                />
              )}

            </Group>

            {/* Header Center: Top Navigation Pills (Centered & Fixed Position) */}
            <Group
              gap={3}
              p={3}
              wrap="nowrap"
              className="daze-glass-pill"
              style={{
                borderRadius: 10,
                flexShrink: 0,
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 2,
              }}
            >
                {navItems.map((item) => {
                  const isActive = activeTab === item.id;
  return (
                    <Tooltip
                      key={item.id}
                      label={
                        item.isLocked
                          ? "Internet required for online catalog"
                          : item.label
                      }
                      withArrow
                    >
                      <UnstyledButton
                        onClick={() => {
                          if (item.isLocked) {return;}
                          handleTabChange(item.id);
                        }}
                        px={10}
                        py={4}
                        style={{
                          borderRadius: 7,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          backgroundColor: isActive
                            ? "rgba(255, 255, 255, 0.14)"
                            : "transparent",
                          color: item.isLocked
                            ? "var(--mantine-color-dimmed)"
                            : isActive
                              ? "#ffffff"
                              : "var(--mantine-color-dimmed)",
                          opacity: item.isLocked ? 0.5 : 1,
                          cursor: item.isLocked ? "not-allowed" : "pointer",
                          transition: "all 140ms ease",
                        }}
                      >
                        {item.icon}
                        <Text size="xs" fw={isActive ? 700 : 500} visibleFrom="xl">
                          {item.label}
                        </Text>
                        {item.badge && (
                          <Badge
                            size="10px"
                            variant="filled"
                            color={isActive ? "blue" : "dark.5"}
                            px={5}
                            visibleFrom="xl"
                          >
                            {item.badge}
                          </Badge>
                        )}
                      </UnstyledButton>
                    </Tooltip>
                  );
                })}
              </Group>

            {/* Header Right: Downloads + Actions + Theme + Settings + User + Window Controls */}
            <Group
              gap={6}
              h="100%"
              align="center"
              wrap="nowrap"
              style={{ height: "100%", flexShrink: 0 }}
              data-tauri-drag-region
            >
              <HeaderDownloadProgress
                onOpenDownloads={() => handleTabChange("downloads")}
              />

              {activeTab === "library" && (
                <Group gap={5} wrap="nowrap">
                  <Tooltip label="Find Game on IGDB" withArrow>
                    <ActionIcon
                      color="blue"
                      variant="light"
                      size="sm"
                      radius="md"
                      onClick={() => setIsIgdbSearchOpen(true)}
                    >
                      <Sparkles size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Add or Scan Game" withArrow>
                    <Button
                      color="blue"
                      size="compact-xs"
                      leftSection={<Plus size={13} />}
                      onClick={() => setIsAddOrScanModalOpen(true)}
                      radius="md"
                    >
                      Add
                    </Button>
                  </Tooltip>
                </Group>
              )}

              <Tooltip label="Interactive Game Maps" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="teal"
                  onClick={() => setIsMapsBrowserOpen(true)}
                  size="sm"
                  radius="md"
                >
                  <MapIcon size={15} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Game Booster & Resource Cleaner" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="yellow"
                  onClick={() => setIsBoosterOpen(true)}
                  size="sm"
                  radius="md"
                >
                  <Zap size={15} />
                </ActionIcon>
              </Tooltip>

              <Tooltip
                label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                withArrow
              >
                <ActionIcon
                  suppressHydrationWarning
                  variant="subtle"
                  color={isDark ? "yellow" : "blue"}
                  onClick={handleToggleTheme}
                  size="sm"
                  radius="md"
                >
                  <span suppressHydrationWarning>
                    {!mounted ? (
                      <Moon size={15} />
                    ) : isDark ? (
                      <Sun size={15} />
                    ) : (
                      <Moon size={15} />
                    )}
                  </span>
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Settings & Download Path" withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={() => setIsSettingsOpen(true)}
                  size="sm"
                  radius="md"
                  aria-label="Settings"
                >
                  <Settings size={15} />
                </ActionIcon>
              </Tooltip>

              {/* Custom Desktop Window Controls Filling Full Header Height */}
              <Group
                gap={0}
                h="100%"
                align="stretch"
                wrap="nowrap"
                style={{
                  height: "100%",
                  marginLeft: 4,
                  borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <Tooltip label="Minimize">
                  <UnstyledButton
                    onClick={handleMinimizeWindow}
                    className="window-control-btn"
                    style={{
                      width: 44,
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--mantine-color-dimmed)",
                    }}
                  >
                    <Minus size={14} />
                  </UnstyledButton>
                </Tooltip>
                <Tooltip label="Maximize / Restore">
                  <UnstyledButton
                    onClick={handleToggleMaximizeWindow}
                    className="window-control-btn"
                    style={{
                      width: 44,
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--mantine-color-dimmed)",
                    }}
                  >
                    <Square size={11} />
                  </UnstyledButton>
                </Tooltip>
                <Tooltip label="Close">
                  <UnstyledButton
                    onClick={handleCloseAppWindow}
                    className="window-control-close-btn"
                    style={{
                      width: 44,
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--mantine-color-dimmed)",
                    }}
                  >
                    <X size={15} />
                  </UnstyledButton>
                </Tooltip>
              </Group>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Main
          ref={mainScrollRef}
          bg="transparent"
          style={{
            paddingTop: 52,
            height: "100vh",
            overflowY: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* LIBRARY TAB: 3 FusionX / Daze View Modes + Optional Right Filter Panel */}
          <Box
            className="tab-content-fade"
            key={`tab-library-${viewMode}`}
            style={{
              display: activeTab === "library" ? "flex" : "none",
              flex: 1,
              minHeight: 0,
              height: "100%",
              width: "100%",
              overflow: "hidden",
              position: "relative",
            }}
          >

            {/* COLUMN 2: Compact List Column OR Split Grid Poster Column */}
            {viewMode !== "full-grid" && (
              <Box
                w={
                  viewMode === "list"
                    ? { base: 220, md: 255 }
                    : { base: 280, md: 360, xl: 410 }
                }
                className="daze-glass-panel"
                style={{
                  height: "100%",
                  flexShrink: 0,
                  borderRight: "1px solid rgba(255, 255, 255, 0.06)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <ScrollArea style={{ flex: 1 }} p="xs" type="hover">
                  {filteredGames.length === 0 ? (
                    <Center p="xl">
                      <Text size="xs" c="dimmed" ta="center">
                        No games match your filters.
                      </Text>
                    </Center>
                  ) : viewMode === "list" ? (
                    <Stack gap={2}>
                      {filteredGames.map((g) => {
                        const isSelected = activeListGame?.id === g.id;
                        const isRunning = activeGame?.id === g.id;
  return (
                          <Group
                            key={g.id}
                            px={8}
                            py={6}
                            gap="xs"
                            wrap="nowrap"
                            className={`fusionx-list-row ${isSelected ? "is-selected" : ""}`}
                            onClick={() => handleSelectGame(g.id)}
                            onDoubleClick={() => handleLaunchGame(g)}
                            style={{
                              contentVisibility: "auto" as any,
                              containIntrinsicSize: "220px 32px",
                            }}
                          >
                            <Image
                              src={g.iconUrl || g.coverUrl}
                              w={20}
                              h={20}
                              radius={4}
                              fit="cover"
                              fallbackSrc="https://placehold.co/24x24/141517/3b82f6?text=G"
                              loading="lazy"
                              decoding="async"
                              style={{ flexShrink: 0 }}
                            />
                            <Text
                              size="xs"
                              fw={isSelected ? 700 : 500}
                              c={
                                isRunning
                                  ? "teal.3"
                                  : isSelected
                                    ? "white"
                                    : g.isInstalled
                                      ? "gray.2"
                                      : "dimmed"
                              }
                              truncate
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              {g.title}
                            </Text>
                            <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                              {isRunning && (
                                <Box
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    backgroundColor: "#20c997",
                                    boxShadow: "0 0 8px #20c997",
                                  }}
                                />
                              )}
                              {pinnedGameIds.includes(g.id) && (
                                <Pin
                                  size={10}
                                  fill="#7950f2"
                                  color="#7950f2"
                                  style={{ transform: "rotate(45deg)" }}
                                />
                              )}
                              {g.isFavorite && (
                                <Star size={11} fill="#e5e7eb" color="#e5e7eb" />
                              )}
                            </Group>
                          </Group>
                        );
                      })}
                    </Stack>
                  ) : (
                    <SimpleGrid cols={splitGridCols} spacing={8}>
                      {filteredGames.map((g) => {
                        const isSelected = activeListGame?.id === g.id;
                        const isRunning = activeGame?.id === g.id;
  return (
                          <Box
                            key={g.id}
                            className={`fusionx-poster-item ${isSelected ? "is-selected" : ""}`}
                            onClick={() => handleSelectGame(g.id)}
                            onDoubleClick={() => handleLaunchGame(g)}
                            style={{
                              contentVisibility: "auto" as any,
                              containIntrinsicSize: "110px 165px",
                            }}
                          >
                            <Image
                              src={g.coverUrl}
                              alt={g.title}
                              w="100%"
                              h="100%"
                              fit="cover"
                              fallbackSrc={`https://placehold.co/300x450/0f172a/3b82f6?text=${encodeURIComponent(g.title)}`}
                              loading="lazy"
                              decoding="async"
                              style={{
                                opacity: g.isInstalled || isRunning ? 1 : 0.72,
                              }}
                            />
                            {g.isFavorite && (
                              <Box
                                pos="absolute"
                                top={6}
                                right={6}
                                style={{
                                  filter:
                                    "drop-shadow(0 2px 4px rgba(0,0,0,0.9))",
                                }}
                              >
                                <Star size={12} fill="#fcc419" color="#fcc419" />
                              </Box>
                            )}
                            {isRunning && (
                              <Badge
                                pos="absolute"
                                bottom={6}
                                left={6}
                                right={6}
                                size="xs"
                                color="teal"
                                variant="filled"
                              >
                                RUNNING
                              </Badge>
                            )}
                          </Box>
                        );
                      })}
                    </SimpleGrid>
                  )}
                </ScrollArea>

                {/* Split Grid Bottom Zoom Slider */}
                {viewMode === "grid" && (
                  <Group
                    px="md"
                    py={8}
                    gap="xs"
                    wrap="nowrap"
                    align="center"
                    style={{
                      background: "rgba(255, 255, 255, 0.04)",
                      backdropFilter: "blur(16px)",
                      WebkitBackdropFilter: "blur(16px)",
                      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <Minus size={12} color="var(--mantine-color-dimmed)" />
                    <Slider
                      value={splitGridCols}
                      onChange={handleSplitGridColsChange}
                      min={2}
                      max={4}
                      step={1}
                      size="xs"
                      color="gray.3"
                      label={(v) => `${v} columns`}
                      style={{ flex: 1 }}
                    />
                    <Plus size={12} color="var(--mantine-color-dimmed)" />
                  </Group>
                )}
                <Box
                  px="xs"
                  py={6}
                  style={{
                    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  {renderLibraryBottomControls(false)}
                </Box>
              </Box>
            )}

            {/* COLUMN 3: Main Viewport (GameDetailView in List/Split-Grid OR Full Grid View) */}
            <Box
              style={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Active Session Alert Banner (shown in main viewport, not over sidebar) */}
              <ActiveSessionBanner
                activeGame={activeGame}
                onStop={stopActiveSession}
              />
              <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
              {viewMode === "full-grid" ? (
                <>
                  <ScrollArea h="100%" type="auto">
                    <Box p={{ base: "md", lg: "xl" }} pb={88}>
                      {filteredGames.length > 0 ? (
                        <Box
                          className="library-grid-container"
                          style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(auto-fill, minmax(${fullGridZoom}px, 1fr))`,
                            gap: 14,
                          }}
                        >
                          {filteredGames.map((game) => (
                            <GameCard
                              key={game.id}
                              game={game}
                              isPlaying={activeGame?.id === game.id}
                              isAnyGameRunning={activeGame !== null}
                              isPinned={pinnedGameIds.includes(game.id)}
                              onTogglePin={handleTogglePin}
                              onLaunch={handleLaunchGame}
                              onOpenDetails={handleOpenDetails}
                              onEdit={handleOpenEditModal}
                              onToggleFavorite={handleToggleFavorite}
                              onToggleCompleted={handleToggleCompleted}
                              onStatusChange={handleStatusChange}
                              onDelete={handleRemoveFromList}
                              onHoverGame={(g) => setHoveredGameId(g?.id || null)}
                            />
                          ))}
                        </Box>
                      ) : (
                        <Paper
                          p={60}
                          radius="lg"
                          className="daze-glass-panel"
                          style={{
                            textAlign: "center",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                          }}
                        >
                          <Clock
                            size={40}
                            color="#5c5f66"
                            style={{ margin: "0 auto" }}
                          />
                          <Text size="md" fw={700} c="white" mt="xs">
                            No games found
                          </Text>
                          <Text size="xs" c="dimmed" mt={4}>
                            {searchQuery
                              ? `No games matched "${searchQuery}".`
                              : 'Your library is empty. Click "+ Add" to start adding games.'}
                          </Text>
                        </Paper>
                      )}
                    </Box>
                  </ScrollArea>

                  {/* Floating Bottom-Center Filters + View Mode + Zoom Dock */}
                  <Paper
                    px="md"
                    py={6}
                    radius="xl"
                    className="daze-glass-pill"
                    style={{
                      position: "absolute",
                      bottom: 16,
                      left: "50%",
                      transform: "translateX(-50%)",
                      zIndex: 25,
                      boxShadow: "0 8px 28px rgba(0, 0, 0, 0.55)",
                    }}
                  >
                    {renderLibraryBottomControls(true)}
                  </Paper>
                </>
              ) : activeListGame ? (
                <Box
                  h="100%"
                  style={{
                    width: "100%",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <GameDetailView
                    game={activeListGame}
                    onLaunch={handleLaunchGame}
                    onEdit={handleOpenEditModal}
                    onUninstall={handleUninstallGame}
                    onRemoveFromWishlist={handleRemoveFromWishlist}
                    isPlaying={activeGame?.id === activeListGame.id}
                    isAnyGameRunning={activeGame !== null}
                    onOpenTorrentDownload={(data) => setTorrentModalData(data)}
                    onGameUpdated={() => {
                      setGames(getStoredGames());
                    }}
                  />
                </Box>
              ) : (
                <Center h="100%" p="xl">
                  <Paper
                    p={48}
                    radius="lg"
                    className="daze-glass-panel"
                    style={{
                      textAlign: "center",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                    }}
                  >
                    <Text size="sm" c="dimmed">
                      Select a game from the list or add one to get started.
                    </Text>
                  </Paper>
                </Center>
              )}
              </Box>
            </Box>

            {/* Left Filter & Sort Drawer */}
            <Drawer
              opened={isFilterPanelOpen}
              onClose={() => setIsFilterPanelOpen(false)}
              position="left"
              size={280}
              padding={0}
              withCloseButton={false}
              overlayProps={{ backgroundOpacity: 0.35, blur: 3 }}
              styles={{
                content: {
                  backgroundColor: isDark
                    ? "rgba(14, 18, 26, 0.82)"
                    : "rgba(255, 255, 255, 0.88)",
                  backdropFilter: "blur(24px) saturate(175%)",
                  WebkitBackdropFilter: "blur(24px) saturate(175%)",
                  borderRight: isDark
                    ? "1px solid rgba(255, 255, 255, 0.1)"
                    : "1px solid rgba(15, 23, 42, 0.09)",
                },
                body: {
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  padding: 0,
                },
              }}
            >
                <Group
                  justify="space-between"
                  align="center"
                  p="sm"
                  style={{
                    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                  }}
                >
                  <Button
                    size="xs"
                    radius="xl"
                    variant="light"
                    color="gray"
                    className="daze-glass-pill"
                    onClick={clearAllFilters}
                    disabled={activeFilterCount === 0 && !searchQuery}
                    style={{ flex: 1 }}
                  >
                    Clear Filters
                  </Button>
                  <ActionIcon
                    size="sm"
                    radius="xl"
                    variant="subtle"
                    color="gray"
                    onClick={() => setIsFilterPanelOpen(false)}
                  >
                    <X size={14} />
                  </ActionIcon>
                </Group>

                <ScrollArea style={{ flex: 1 }} p="sm" type="hover">
                  <Stack gap="sm">
                    <Stack gap={6}>
                      <Checkbox
                        size="xs"
                        label={`Installed (${categoryCounts.installed})`}
                        checked={categoryFilter === "installed"}
                        onChange={(e) =>
                          handleCategoryFilterChange(
                            e.currentTarget.checked ? "installed" : "all",
                          )
                        }
                      />
                      <Checkbox
                        size="xs"
                        label={`Not installed (${categoryCounts.notInstalled})`}
                        checked={notInstalledOnly}
                        onChange={(e) => {
                          const checked = e.currentTarget.checked;
                          setNotInstalledOnly(checked);
                          if (checked) {setCategoryFilter("all");}
                        }}
                      />
                      <Checkbox
                        size="xs"
                        label={`Favorite (${categoryCounts.favorites})`}
                        checked={categoryFilter === "favorites"}
                        onChange={(e) =>
                          handleCategoryFilterChange(
                            e.currentTarget.checked ? "favorites" : "all",
                          )
                        }
                      />
                      <Checkbox
                        size="xs"
                        label={`Completed (${categoryCounts.completed})`}
                        checked={categoryFilter === "completed"}
                        onChange={(e) =>
                          handleCategoryFilterChange(
                            e.currentTarget.checked ? "completed" : "all",
                          )
                        }
                      />
                      <Checkbox
                        size="xs"
                        label={`Wishlist (${categoryCounts.wishlist})`}
                        checked={categoryFilter === "wishlist"}
                        onChange={(e) =>
                          handleCategoryFilterChange(
                            e.currentTarget.checked ? "wishlist" : "all",
                          )
                        }
                      />
                    </Stack>

                    <Divider opacity={0.15} />

                    <Select
                      label="Sort By"
                      size="xs"
                      radius="md"
                      styles={glassSelectStyles}
                      value={sortOption}
                      onChange={handleSortOptionChange}
                      data={[
                        { label: "Most Played", value: "playtime-desc" },
                        { label: "Least Played", value: "playtime-asc" },
                        { label: "Last Played", value: "recent" },
                        { label: "Release (Newest)", value: "release-desc" },
                        { label: "Release (Oldest)", value: "release-asc" },
                        { label: "Recently Added", value: "added-desc" },
                        { label: "First Added", value: "added-asc" },
                        { label: "Size (Largest)", value: "size-desc" },
                        { label: "Size (Smallest)", value: "size-asc" },
                        { label: "Title (A-Z)", value: "title-asc" },
                        { label: "Title (Z-A)", value: "title-desc" },
                        { label: "Highest Rated", value: "rating-desc" },
                      ]}
                    />

                    <Select
                      label="Genre"
                      size="xs"
                      radius="md"
                      styles={glassSelectStyles}
                      placeholder="All genres"
                      clearable
                      searchable
                      value={genreFilter}
                      onChange={setGenreFilter}
                      data={availableGenres.map((g) => ({
                        label: `${g.name} (${g.count})`,
                        value: g.name,
                      }))}
                    />

                    <Select
                      label="Source"
                      size="xs"
                      radius="md"
                      styles={glassSelectStyles}
                      value={sourceFilter}
                      onChange={(val) =>
                        setSourceFilter((val as any) || "all")
                      }
                      data={[
                        { label: "All Sources", value: "all" },
                        { label: "FitGirl Repacks", value: "fitgirl" },
                        { label: "SteamRIP", value: "steamrip" },
                        { label: "Manual / Other", value: "manual" },
                      ]}
                    />

                    <Select
                      label="Release Year"
                      size="xs"
                      radius="md"
                      styles={glassSelectStyles}
                      placeholder="Any year"
                      clearable
                      value={yearFilter}
                      onChange={setYearFilter}
                      data={availableYears}
                    />
                  </Stack>
                </ScrollArea>
            </Drawer>
          </Box>

        {visitedTabs.has("analytics") && (
          <Box
            className="tab-content-fade"
            key="tab-analytics"
            p="lg"
            style={{
              display: activeTab === "analytics" ? "block" : "none",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            <PlaytimeStats games={games} searchQuery={searchQuery} />
          </Box>
        )}

        {visitedTabs.has("repacks") && (
          <Box
            className="tab-content-fade"
            key="tab-repacks"
            style={{
              display: activeTab === "repacks" ? "flex" : "none",
              flex: 1,
              minHeight: 0,
              height: "100%",
              width: "100%",
              overflow: "hidden",
            }}
          >
            <RepacksPostsView
              activeGameTitle={activeGame?.title}
              externalSearchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              dataSource={catalogSource}
              onDataSourceChange={setCatalogSource}
              onAmbientArtworkChange={setCatalogAmbientArtwork}
              onOpenTorrentDownload={(magnetUrl, title, coverUrl, repackSize) =>
                setTorrentModalData({ magnetUrl, title, coverUrl, repackSize })
              }
            />
          </Box>
        )}

        {visitedTabs.has("downloads") && (
          <Box
            className="tab-content-fade"
            key="tab-downloads"
            p="lg"
            style={{
              display: activeTab === "downloads" ? "block" : "none",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            <DownloadsView />
          </Box>
        )}
      </AppShell.Main>

      {/* Modals */}

      {/* Game Details Right Drawer */}
      <Drawer
        opened={Boolean(selectedGame)}
        onClose={() => setSelectedGame(null)}
        position="right"
        size="min(920px, 92vw)"
        padding={0}
        withCloseButton={false}
        overlayProps={{ backgroundOpacity: 0.45, blur: 4 }}
        styles={{
          content: {
            backgroundColor: isDark ? "#0b0c0f" : "#ffffff",
            borderLeft: isDark
              ? "1px solid rgba(255, 255, 255, 0.1)"
              : "1px solid rgba(15, 23, 42, 0.09)",
            overflow: "hidden",
          },
          body: {
            height: "100%",
            padding: 0,
            position: "relative",
          },
        }}
      >
        {selectedGame && (
          <Box style={{ height: "100%", position: "relative" }}>
            <ActionIcon
              size="md"
              radius="xl"
              variant="filled"
              onClick={() => setSelectedGame(null)}
              aria-label="Close game details"
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                zIndex: 40,
                backgroundColor: "rgba(15, 17, 23, 0.72)",
                color: "#ffffff",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.16)",
              }}
            >
              <X size={16} />
            </ActionIcon>
            <GameDetailView
              game={selectedGame}
              onLaunch={handleLaunchGame}
              onEdit={handleOpenEditModal}
              onUninstall={handleUninstallGame}
              onRemoveFromWishlist={handleRemoveFromWishlist}
              onCloseModal={() => setSelectedGame(null)}
              isPlaying={activeGame?.id === selectedGame.id}
              isAnyGameRunning={activeGame !== null}
              onOpenTorrentDownload={(data) => setTorrentModalData(data)}
              onGameUpdated={(updated) => {
                setGames(getStoredGames());
                setSelectedGame(updated);
              }}
            />
          </Box>
        )}
      </Drawer>

      {isIgdbSearchOpen && (
        <IgdbSearchModal
          opened={isIgdbSearchOpen}
          onClose={() => setIsIgdbSearchOpen(false)}
          onGameAdded={() => {
            setGames(getStoredGames());
          }}
        />
      )}

      {editingGame && (
        <EditGameModal
          game={editingGame}
          onClose={() => setEditingGame(null)}
          onSaveGame={handleSaveEditedGame}
        />
      )}

      {noUninstallerGame && (
        <NoUninstallerModal
          game={noUninstallerGame}
          onClose={() => setNoUninstallerGame(null)}
          onConfirmDeleteFolder={handleConfirmDeleteFolder}
          onConfirmRemoveLibraryOnly={handleConfirmRemoveLibraryOnly}
        />
      )}

      {gameToRemove && (
        <Modal
          opened={Boolean(gameToRemove)}
          onClose={() => setGameToRemove(null)}
          size="md"
          radius="xl"
          padding="md"
          centered
          withCloseButton={false}
        >
          <Stack gap="md">
            <Group gap="sm">
              <Paper radius="md" p="xs" bg="red.9">
                <Trash2 size={24} color="#ff8787" />
              </Paper>
              <Box>
                <Title order={4}>Remove from Library</Title>
                <Text size="xs" c="dimmed">
                  Confirm removing game from your library collection
                </Text>
              </Box>
            </Group>

            <Text size="sm" style={{ lineHeight: 1.5 }}>
              Are you sure you want to remove{" "}
              <Text span fw={700} c="blue.4">
                {gameToRemove.title}
              </Text>{" "}
              from your library?
            </Text>

            <Alert color="blue" variant="light" radius="md">
              This only removes the game entry from your FitRepacks library
              list. It will{" "}
              <Text span fw={700}>
                not delete or uninstall
              </Text>{" "}
              any game files or save data from your disk.
            </Alert>

            <Group
              justify="flex-end"
              gap="xs"
              pt="xs"
              style={{
                borderTop: "1px solid var(--mantine-color-default-border)",
              }}
            >
              <Button
                variant="subtle"
                color="gray"
                size="xs"
                radius="md"
                onClick={() => setGameToRemove(null)}
              >
                Cancel
              </Button>
              <Button
                color="red"
                variant="filled"
                size="xs"
                radius="md"
                leftSection={<Trash2 size={14} />}
                onClick={() => {
                  const updated = deleteGameFromStorage(gameToRemove.id);
                  setGames(updated);
                  if (selectedGame?.id === gameToRemove.id) {
                    setSelectedGame(null);
                  }
                  setGameToRemove(null);
                }}
              >
                Remove from Library
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}

      {isAddOrScanModalOpen && (
        <AddOrScanGameModal
          opened={isAddOrScanModalOpen}
          onClose={() => setIsAddOrScanModalOpen(false)}
          onAddGame={handleAddSingleGame}
          onImportGames={handleImportGames}
        />
      )}

      {torrentModalData && (
        <TorrentDownloadModal
          opened={Boolean(torrentModalData)}
          onClose={() => setTorrentModalData(null)}
          magnetUrl={torrentModalData.magnetUrl}
          title={torrentModalData.title}
          coverUrl={torrentModalData.coverUrl}
          repackSize={torrentModalData.repackSize}
          onDownloadStarted={() => {
            handleTabChange("downloads");
          }}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          opened={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {isMapsBrowserOpen && (
        <MapsBrowserModal
          opened={isMapsBrowserOpen}
          onClose={() => setIsMapsBrowserOpen(false)}
          onSelectMap={(gameSlug, mapSlug, gameTitle) => {
            setIsMapsBrowserOpen(false);
            setActiveMapViewer({ gameSlug, mapSlug, gameTitle });
          }}
        />
      )}

      {activeMapViewer && (
        <MapViewerModal
          opened={Boolean(activeMapViewer)}
          onClose={() => setActiveMapViewer(null)}
          gameSlug={activeMapViewer.gameSlug}
          mapSlug={activeMapViewer.mapSlug}
          gameTitle={activeMapViewer.gameTitle}
        />
      )}

      {isBoosterOpen && (
        <ProcessBoosterModal
          opened={isBoosterOpen}
          onClose={() => setIsBoosterOpen(false)}
        />
      )}
    </AppShell>
    </>
  );
}
