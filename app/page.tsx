"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Game, ActiveTab, SortOption, ViewMode } from "../lib/types";
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
  getAppSetting,
  saveAppSetting,
  isAdultContent,
  ADULT_KEYWORDS,
  toggleWishlistRepack,
  getPinnedGameIds,
  togglePinnedGame,
  syncRecentGamesToTrayAndTaskbar,
} from "../lib/db";
import { toggleThemeWithRipple } from "../lib/themeRipple";
import { Sidebar } from "../components/layout/Sidebar";
import { GameCard } from "../components/library/GameCard";
import { GameDetailModal } from "../components/GameDetailModal";
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
import { UserMenu } from "../components/auth/UserMenu";
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
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, ProgressBarStatus } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

import {
  AppShell,
  Group,
  TextInput,
  Select,
  SegmentedControl,
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
  Title,
} from "@mantine/core";
import {
  Search,
  FolderSearch,
  Plus,
  Flame,
  SlidersHorizontal,
  Clock,
  X,
  LayoutGrid,
  List,
  Sun,
  Moon,
  Minus,
  Square,
  Database,
  DownloadCloud,
  Pause,
  Play,
  Sparkles,
  HardDrive,
  CheckCircle2,
  Bookmark,
  Star,
  Layers,
  Trash2,
  Globe,
  Map as MapIcon,
  Zap,
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

  if (!hasDownloads) return null;

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

  if (!activeGame) return null;

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
  const { colorScheme, setColorScheme, toggleColorScheme } =
    useMantineColorScheme();
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
  const [visitedTabs, setVisitedTabs] = useState<Set<ActiveTab>>(
    () => new Set(["library"]),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | "favorites" | "installed" | "completed" | "wishlist"
  >("all");
  const [sortOption, setSortOption] = useState<SortOption>("playtime-desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
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
    if (typeof window === "undefined") return;
    if (hasLoadedInitialSettings.current) return;
    hasLoadedInitialSettings.current = true;

    const savedMode = localStorage.getItem("fitrepacks_view_mode");
    if (savedMode === "grid" || savedMode === "list") {
      setViewMode(savedMode);
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
      setActiveTab(savedTab as any);
      setVisitedTabs((prev) => {
        if (prev.has(savedTab as any)) return prev;
        const next = new Set(prev);
        next.add(savedTab as any);
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

  const handleSelectGame = useCallback((id: string) => {
    setSelectedListGameId(id);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_selected_list_game_id", id);
    }
  }, []);

  const handleCategoryFilterChange = useCallback((val: string | null) => {
    if (!val) return;
    const filter = val as
      | "all"
      | "favorites"
      | "installed"
      | "completed"
      | "wishlist";
    setCategoryFilter(filter);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_category_filter", filter);
    }
  }, []);

  const handleSortOptionChange = useCallback((val: string | null) => {
    if (!val) return;
    const sort = val as SortOption;
    setSortOption(sort);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitrepacks_sort_option", sort);
    }
  }, []);

  const handleTabChange = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
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
      if (now - lastFocusCheck < 60000) return;
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
      if (!isMounted) return;
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (process.env.NODE_ENV === "development") {
        setIsDevMode(true);
      }
      if ("__TAURI_INTERNALS__" in window) {
        invoke<boolean>("is_dev_mode")
          .then((dev) => {
            if (dev) setIsDevMode(true);
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
          if (unsub) unlistenFn = unsub;
        })
        .catch((err) => {
          console.warn("Tauri event listener fallback:", err);
        });
    }
    return () => {
      if (unlistenFn) unlistenFn();
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
      if (unlistenTray) unlistenTray();
      if (unlistenDownloads) unlistenDownloads();
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
        if (container) container.scrollTop = currentScroll;
      });
      setTimeout(() => {
        if (container) container.scrollTop = currentScroll;
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
          if (!isInst) return false;
        }
        if (categoryFilter === "completed") {
          const isComp = Boolean(g.isCompleted);
          if (!isComp) return false;
        }
        if (categoryFilter === "wishlist") {
          const isWish = g.isWishlisted;
          if (!isWish) return false;
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
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        const getHrs = (g: Game) =>
          g.hoursPlayed ?? (g.playtimeMinutes || 0) / 60;
        const getReleaseDateTimestamp = (g: Game): number => {
          if (g.releaseDate) {
            const parsed = Date.parse(g.releaseDate);
            if (!isNaN(parsed)) return parsed;
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
            if (!isNaN(parsed)) return parsed;
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
        if (sortOption === "title-asc") {
          return a.title.localeCompare(b.title);
        }
        if (sortOption === "rating-desc") {
          return (b.rating || 0) - (a.rating || 0);
        }
        return 0;
      });
  }, [games, searchQuery, categoryFilter, sortOption, pinnedGameIds]);

  const categoryCounts = useMemo(() => {
    let installed = 0;
    let completed = 0;
    let wishlist = 0;
    let favorites = 0;
    for (let i = 0; i < games.length; i++) {
      const g = games[i];
      if (g.isInstalled) installed++;
      if (g.isCompleted) completed++;
      if (g.isWishlisted) wishlist++;
      if (g.isFavorite) favorites++;
    }
    return {
      all: games.length,
      installed,
      completed,
      wishlist,
      favorites,
    };
  }, [games]);

  const categoryControlData = useMemo(
    () => [
      {
        label: (
          <Center style={{ gap: 6 }}>
            <Box component="span" fw={600}>
              All
            </Box>
            <Box
              component="span"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                opacity: 0.85,
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                padding: "2px 6px",
                borderRadius: "10px",
                lineHeight: 1,
              }}
            >
              {categoryCounts.all}
            </Box>
          </Center>
        ),
        value: "all",
      },
      {
        label: (
          <Center style={{ gap: 6 }}>
            <HardDrive size={13} color="#60a5fa" />
            <Box component="span" fw={600}>
              Installed
            </Box>
            <Box
              component="span"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                opacity: 0.85,
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                padding: "2px 6px",
                borderRadius: "10px",
                lineHeight: 1,
              }}
            >
              {categoryCounts.installed}
            </Box>
          </Center>
        ),
        value: "installed",
      },
      {
        label: (
          <Center style={{ gap: 6 }}>
            <CheckCircle2 size={13} color="#34d399" />
            <Box component="span" fw={600}>
              Completed
            </Box>
            <Box
              component="span"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                opacity: 0.85,
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                padding: "2px 6px",
                borderRadius: "10px",
                lineHeight: 1,
              }}
            >
              {categoryCounts.completed}
            </Box>
          </Center>
        ),
        value: "completed",
      },
      {
        label: (
          <Center style={{ gap: 6 }}>
            <Bookmark size={13} color="#fb923c" />
            <Box component="span" fw={600}>
              Wishlist
            </Box>
            <Box
              component="span"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                opacity: 0.85,
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                padding: "2px 6px",
                borderRadius: "10px",
                lineHeight: 1,
              }}
            >
              {categoryCounts.wishlist}
            </Box>
          </Center>
        ),
        value: "wishlist",
      },
      {
        label: (
          <Center style={{ gap: 6 }}>
            <Star size={13} color="#facc15" />
            <Box component="span" fw={600}>
              Favorites
            </Box>
            <Box
              component="span"
              style={{
                fontSize: "11px",
                fontWeight: 700,
                opacity: 0.85,
                backgroundColor: "rgba(0, 0, 0, 0.25)",
                padding: "2px 6px",
                borderRadius: "10px",
                lineHeight: 1,
              }}
            >
              {categoryCounts.favorites}
            </Box>
          </Center>
        ),
        value: "favorites",
      },
    ],
    [categoryCounts],
  );

  const searchPlaceholder =
    activeTab === "library"
      ? "Search game library (title, genre...)"
      : activeTab === "repacks"
        ? "Search FitGirl repacks (title, genre, publisher...)"
        : activeTab === "steamrip"
          ? "Search SteamRIP pre-installed games (title, genre...)"
          : activeTab === "analytics"
            ? "Search playtime analytics (title, genre...)"
            : "Search...";

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: viewMode === "list" ? 280 : 260,
        breakpoint: 0,
      }}
      padding={0}
      bg="var(--mantine-color-body)"
    >
      {/* Sticky Custom App Header spanning above sidebar with full-height window controls */}
      <AppShell.Header
        data-tauri-drag-region
        bg="var(--mantine-color-default)"
        style={{
          borderBottom: "1px solid var(--mantine-color-default-border)",
          zIndex: 100,
          userSelect: "none",
          height: 56,
        }}
      >
        <Group
          h="100%"
          justify="space-between"
          align="center"
          gap={0}
          data-tauri-drag-region
          style={{ width: "100%", height: "100%" }}
        >
          {/* Left section: App Brand + Search Input */}
          <Group gap="lg" px="md" data-tauri-drag-region align="center">
            <Group
              gap="sm"
              data-tauri-drag-region
              style={{ cursor: "default" }}
            >
              <ThemeIcon size={32} radius="md" variant="transparent">
                <Image src="/favicon.svg" alt="FitRepacks Logo" w={32} h={32} />
              </ThemeIcon>
              <Group gap={8} data-tauri-drag-region align="center">
                <Text fw={800} size="sm" style={{ letterSpacing: -0.5 }}>
                  FitRepacks
                </Text>
                <Badge size="xs" color="blue" variant="filled">
                  Client
                </Badge>
                {isDevMode && (
                  <Badge
                    size="sm"
                    color="yellow"
                    variant="filled"
                    style={{
                      color: "#1a1500",
                      backgroundColor: "#fab005",
                      fontWeight: 900,
                      letterSpacing: 0.8,
                      fontSize: 10.5,
                      paddingInline: 8,
                      boxShadow: "0 0 12px rgba(250, 176, 5, 0.5)",
                    }}
                  >
                    DEV MODE
                  </Badge>
                )}
                {updaterStatus === "available" && updateDetails && (
                  <Tooltip
                    label={`Update v${updateDetails.version} is available! Click to view details & install.`}
                    withArrow
                  >
                    <Badge
                      size="sm"
                      color="teal"
                      variant="filled"
                      leftSection={<Sparkles size={12} />}
                      onClick={() => setIsSettingsOpen(true)}
                      style={{
                        cursor: "pointer",
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        boxShadow: "0 0 10px rgba(32, 201, 151, 0.4)",
                        transition: "transform 0.15s ease",
                      }}
                    >
                      Update v{updateDetails.version}
                    </Badge>
                  </Tooltip>
                )}
                {updaterStatus === "downloading" && (
                  <Tooltip
                    label="Downloading update... Click to open settings."
                    withArrow
                  >
                    <Badge
                      size="sm"
                      color="blue"
                      variant="filled"
                      leftSection={<DownloadCloud size={12} />}
                      onClick={() => setIsSettingsOpen(true)}
                      style={{
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Downloading Update...
                    </Badge>
                  </Tooltip>
                )}
                {updaterStatus === "ready-to-restart" && (
                  <Tooltip
                    label="Update is ready to install! Click to restart."
                    withArrow
                  >
                    <Badge
                      size="sm"
                      color="green"
                      variant="filled"
                      leftSection={<CheckCircle2 size={12} />}
                      onClick={() => setIsSettingsOpen(true)}
                      style={{
                        cursor: "pointer",
                        fontWeight: 700,
                        boxShadow: "0 0 12px rgba(64, 192, 87, 0.6)",
                      }}
                    >
                      Restart to Update
                    </Badge>
                  </Tooltip>
                )}
              </Group>
            </Group>

            <TextInput
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftSection={<Search size={16} color="#909296" />}
              rightSection={
                searchQuery ? (
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => setSearchQuery("")}
                  >
                    <X size={14} />
                  </ActionIcon>
                ) : null
              }
              radius="md"
              size="xs"
              style={{ width: 320 }}
            />
          </Group>

          {/* Right section: Download Indicator + Theme + Actions + Native Full-Height Window Controls */}
          <Group
            gap="xs"
            h="100%"
            align="center"
            style={{ height: "100%" }}
            data-tauri-drag-region
          >
            <HeaderDownloadProgress onOpenDownloads={() => handleTabChange("downloads")} />

            <Tooltip
              label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <ActionIcon
                suppressHydrationWarning
                variant="outline"
                color={isDark ? "yellow" : "blue"}
                onClick={handleToggleTheme}
                size="sm"
                radius="md"
              >
                <span suppressHydrationWarning>
                  {!mounted ? (
                    <Moon size={16} />
                  ) : isDark ? (
                    <Sun size={16} />
                  ) : (
                    <Moon size={16} />
                  )}
                </span>
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Interactive Game Maps Browser">
              <ActionIcon
                variant="light"
                color="teal"
                onClick={() => setIsMapsBrowserOpen(true)}
                size="sm"
                radius="md"
              >
                <MapIcon size={16} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Game Booster & Resource Cleaner">
              <ActionIcon
                variant="light"
                color="yellow"
                onClick={() => setIsBoosterOpen(true)}
                size="sm"
                radius="md"
              >
                <Zap size={16} />
              </ActionIcon>
            </Tooltip>

            {activeTab === "library" && (
              <Group gap="xs">
                <Button
                  color="blue"
                  variant="light"
                  size="xs"
                  leftSection={<Sparkles size={14} />}
                  onClick={() => setIsIgdbSearchOpen(true)}
                  radius="md"
                >
                  Find on IGDB
                </Button>
                <Button
                  color="blue"
                  size="xs"
                  leftSection={<Plus size={14} />}
                  onClick={() => setIsAddOrScanModalOpen(true)}
                  radius="md"
                >
                  Add Game
                </Button>
              </Group>
            )}

            <UserMenu />

            {/* Custom Desktop Window Controls Filling Full Header Height */}
            <Group
              gap={0}
              h="100%"
              align="stretch"
              style={{
                height: "100%",
                marginLeft: 8,
                borderLeft: "1px solid var(--mantine-color-default-border)",
              }}
            >
              <Tooltip label="Minimize">
                <UnstyledButton
                  onClick={handleMinimizeWindow}
                  className="window-control-btn"
                  style={{
                    width: 48,
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--mantine-color-dimmed)",
                  }}
                >
                  <Minus size={15} />
                </UnstyledButton>
              </Tooltip>
              <Tooltip label="Maximize / Restore">
                <UnstyledButton
                  onClick={handleToggleMaximizeWindow}
                  className="window-control-btn"
                  style={{
                    width: 48,
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--mantine-color-dimmed)",
                  }}
                >
                  <Square size={12} />
                </UnstyledButton>
              </Tooltip>
              <Tooltip label="Close">
                <UnstyledButton
                  onClick={handleCloseAppWindow}
                  className="window-control-close-btn"
                  style={{
                    width: 48,
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--mantine-color-dimmed)",
                  }}
                >
                  <X size={16} />
                </UnstyledButton>
              </Tooltip>
            </Group>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p={0}
        bg="var(--mantine-color-body)"
        style={{ borderRight: "1px solid var(--mantine-color-default-border)" }}
      >
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleTabChange}
          gameCount={games.length}
          activeGameTitle={activeGame?.title}
          activeGameMinutes={0}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={handleCategoryFilterChange}
          sortOption={sortOption}
          onSortOptionChange={handleSortOptionChange}
          allGames={games}
          games={filteredGames}
          pinnedGameIds={pinnedGameIds}
          selectedGameId={selectedListGameId || filteredGames[0]?.id || null}
          onSelectGame={handleSelectGame}
          onLaunchGame={handleLaunchGame}
          activeGameId={activeGame?.id || null}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </AppShell.Navbar>

      <AppShell.Main
        ref={mainScrollRef}
        bg="var(--mantine-color-body)"
        style={{
          overflowY: "auto",
          height: "calc(100vh - var(--app-shell-header-height, 56px))",
        }}
      >
        {/* Active Session Alert Banner (isolated timer) */}
        <ActiveSessionBanner
          activeGame={activeGame}
          onStop={stopActiveSession}
        />

        {/* Main Content Body with Zero-Delay Persistent Tabs */}
        <Box
          className="tab-content-fade"
          key={`tab-library-${viewMode}`}
          style={{
            display: activeTab === "library" ? "block" : "none",
            height: "100%",
          }}
        >
          {viewMode === "list" ? (
            (() => {
              const activeListGame =
                filteredGames.find((g) => g.id === selectedListGameId) ||
                filteredGames[0];

              return activeListGame ? (
                <ScrollArea
                  h="calc(100vh - var(--app-shell-header-height, 56px))"
                  type="auto"
                  style={{ width: "100%", height: "100%" }}
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
                    onGameUpdated={(updated) => {
                      setGames(getStoredGames());
                    }}
                  />
                </ScrollArea>
              ) : (
                <Paper
                  p={60}
                  style={{ textAlign: "center", margin: 40 }}
                  radius="lg"
                >
                  <Text size="sm" c="dimmed">
                    Select a game from the sidebar to view details.
                  </Text>
                </Paper>
              );
            })()
          ) : (
            <Box p="lg">
              <Stack gap="lg">
                <Paper
                  p="xs"
                  radius="lg"
                  bg="var(--mantine-color-default)"
                  style={{
                    border: "1px solid var(--mantine-color-default-border)",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
                  }}
                >
                  <Group justify="space-between" wrap="wrap" gap="sm">
                    <SegmentedControl
                      value={categoryFilter}
                      onChange={handleCategoryFilterChange}
                      data={categoryControlData}
                      radius="md"
                      color="blue"
                      size="sm"
                      styles={{
                        label: {
                          padding: "6px 12px",
                        },
                      }}
                    />

                    <Group gap="sm">
                      <Group gap={6} align="center">
                        <SlidersHorizontal
                          size={14}
                          color="var(--mantine-color-dimmed)"
                        />
                        <Select
                          value={sortOption}
                          onChange={handleSortOptionChange}
                          data={[
                            { label: "Most Played", value: "playtime-desc" },
                            { label: "Least Played", value: "playtime-asc" },
                            { label: "Last Played", value: "recent" },
                            {
                              label: "Release (Newest)",
                              value: "release-desc",
                            },
                            {
                              label: "Release (Oldest)",
                              value: "release-asc",
                            },
                            { label: "Recently Added", value: "added-desc" },
                            { label: "First Added", value: "added-asc" },
                            { label: "Title (A-Z)", value: "title-asc" },
                            { label: "Highest Rated", value: "rating-desc" },
                          ]}
                          radius="md"
                          size="xs"
                          w={170}
                          comboboxProps={{
                            shadow: "md",
                            transitionProps: {
                              transition: "pop",
                              duration: 150,
                            },
                          }}
                        />
                      </Group>

                      <SegmentedControl
                        size="xs"
                        value={viewMode}
                        onChange={handleViewModeChange}
                        data={[
                          {
                            label: (
                              <Center style={{ gap: 5 }}>
                                <LayoutGrid size={13} />
                                <Box component="span">Grid</Box>
                              </Center>
                            ),
                            value: "grid",
                          },
                          {
                            label: (
                              <Center style={{ gap: 5 }}>
                                <List size={13} />
                                <Box component="span">List</Box>
                              </Center>
                            ),
                            value: "list",
                          },
                        ]}
                        radius="md"
                        color="blue"
                      />
                    </Group>
                  </Group>
                </Paper>

                {/* Game Grid */}
                {filteredGames.length > 0 ? (
                  <SimpleGrid
                    className="library-grid-container"
                    cols={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }}
                    spacing="md"
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
                      />
                    ))}
                  </SimpleGrid>
                ) : (
                  <Paper
                    p={60}
                    radius="lg"
                    bg="var(--mantine-color-default)"
                    style={{
                      textAlign: "center",
                      border: "1px solid var(--mantine-color-default-border)",
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
                        : 'Your library is empty. Click "+ Add Game" to start adding games.'}
                    </Text>
                  </Paper>
                )}
              </Stack>
            </Box>
          )}
        </Box>

        {visitedTabs.has("analytics") && (
          <Box
            className="tab-content-fade"
            key="tab-analytics"
            p="lg"
            style={{ display: activeTab === "analytics" ? "block" : "none" }}
          >
            <PlaytimeStats games={games} searchQuery={searchQuery} />
          </Box>
        )}

        {visitedTabs.has("repacks") && (
          <Box
            className="tab-content-fade"
            key="tab-repacks"
            p="lg"
            style={{ display: activeTab === "repacks" ? "block" : "none" }}
          >
            <RepacksPostsView
              activeGameTitle={activeGame?.title}
              externalSearchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              dataSource="fitgirl"
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
            style={{ display: activeTab === "downloads" ? "block" : "none" }}
          >
            <DownloadsView />
          </Box>
        )}

        {visitedTabs.has("steamrip") && (
          <Box
            className="tab-content-fade"
            key="tab-steamrip"
            p="lg"
            style={{ display: activeTab === "steamrip" ? "block" : "none" }}
          >
            <RepacksPostsView
              activeGameTitle={activeGame?.title}
              externalSearchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              dataSource="steamrip"
              onOpenTorrentDownload={(magnetUrl, title, coverUrl, repackSize) =>
                setTorrentModalData({ magnetUrl, title, coverUrl, repackSize })
              }
            />
          </Box>
        )}
      </AppShell.Main>

      {/* Modals */}

      {selectedGame && (
        <GameDetailModal
          game={selectedGame}
          onClose={() => setSelectedGame(null)}
          onLaunch={handleLaunchGame}
          onEdit={handleOpenEditModal}
          onUninstall={handleUninstallGame}
          onRemoveFromWishlist={handleRemoveFromWishlist}
          isPlaying={activeGame?.id === selectedGame.id}
          activeTimerSeconds={0}
          isAnyGameRunning={activeGame !== null}
          onOpenTorrentDownload={(data) => setTorrentModalData(data)}
          onGameUpdated={(updated) => {
            setGames(getStoredGames());
            setSelectedGame(updated);
          }}
        />
      )}

      {isIgdbSearchOpen && (
        <IgdbSearchModal
          opened={isIgdbSearchOpen}
          onClose={() => setIsIgdbSearchOpen(false)}
          onGameAdded={(newGame) => {
            setGames(getStoredGames());
            // setSelectedGame(newGame);
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
            setActiveTab("downloads");
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
  );
}
