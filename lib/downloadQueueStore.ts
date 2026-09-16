import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";

import { getAppSetting, saveAppSetting } from "./db";

const sqliteStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return await getAppSetting(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await saveAppSetting(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await saveAppSetting(name, "");
  },
};

export interface QueuedFile {
  id: string;
  name: string;
  url: string; // original link
  directUrl?: string;
  size: string;
  bytes?: number;
  downloadedBytes?: number;
  downloadedFormatted?: string;
  progressPercent?: number;
  status:
    | "pending"
    | "resolving"
    | "downloading"
    | "paused"
    | "completed"
    | "failed"
    | "skipped"
    | "checking";
  isOptional: boolean;
  isSelected: boolean;
  order: number;
}

export interface QueuedGame {
  id: string;
  title: string;
  coverUrl: string;
  source: string;
  addedAt: string;
  files: QueuedFile[];
  status: "downloading" | "paused" | "completed" | "error";
}

export interface MagnetDownloadItem {
  id: string;
  infoHash?: string;
  title: string;
  progress: number;
  speed: string;
  uploadSpeed?: string;
  eta: string;
  size: string;
  downloaded: string;
  status:
    | "downloading"
    | "paused"
    | "queued"
    | "completed"
    | "error"
    | "checking";
  magnetUrl?: string;
  downloadDir?: string;
  coverUrl?: string;
  addedAt: string;
  files?: QueuedFile[];
  peers?: number;
}

interface LiveAggregateStats {
  totalDownSpeed: string;
  totalUpSpeed: string;
  totalDownBytes: number;
  totalUpBytes: number;
  activeCount: number;
}

interface DownloadQueueState {
  queuedGames: QueuedGame[];
  magnetDownloads: MagnetDownloadItem[];
  aggregateStats: LiveAggregateStats;
  addGameToQueue: (game: Omit<QueuedGame, "addedAt">) => void;
  removeGameFromQueue: (gameId: string) => void;
  toggleFileSelection: (gameId: string, fileId: string) => void;
  moveFileOrder: (
    gameId: string,
    fileId: string,
    direction: "up" | "down",
  ) => void;
  updateFileStatus: (
    gameId: string,
    fileId: string,
    status: QueuedFile["status"],
    directUrl?: string,
  ) => void;
  toggleGamePause: (gameId: string) => void;
  addMagnetDownload: (item: {
    title: string;
    magnetUrl: string;
    size?: string;
    downloadDir?: string;
    coverUrl?: string;
    files?: QueuedFile[];
    infoHash?: string;
  }) => string;
  removeMagnetDownload: (id: string) => void;
  toggleMagnetPause: (id: string) => void;
  toggleMagnetFileSelection: (downloadId: string, fileId: string) => void;
  syncFromLiveStats: (stats: {
    total_down_speed_formatted: string;
    total_up_speed_formatted: string;
    total_down_speed_bytes: number;
    total_up_speed_bytes: number;
    active_downloads_count: number;
    torrents: Array<{
      info_hash: string;
      name: string;
      progress_percent: number;
      download_speed_bytes?: number;
      download_speed_formatted: string;
      upload_speed_formatted: string;
      downloaded_bytes?: number;
      total_bytes?: number;
      downloaded_formatted: string;
      total_formatted: string;
      status: string;
      eta: string;
      peers: number;
      file_progress_bytes?: number[];
    }>;
  }) => void;
}

export const useDownloadQueueStore = create<DownloadQueueState>()(
  persist(
    (set) => ({
      queuedGames: [],
      magnetDownloads: [],
      aggregateStats: {
        totalDownSpeed: "0.0 B/s",
        totalUpSpeed: "0.0 B/s",
        totalDownBytes: 0,
        totalUpBytes: 0,
        activeCount: 0,
      },

      addGameToQueue: (gameData) =>
        set((state) => {
          const existingIndex = state.queuedGames.findIndex(
            (g) => g.id === gameData.id,
          );
          const newGame: QueuedGame = {
            ...gameData,
            addedAt: new Date().toISOString(),
          };

          if (existingIndex >= 0) {
            const updated = [...state.queuedGames];
            updated[existingIndex] = newGame;
            return { queuedGames: updated };
          }

          return { queuedGames: [newGame, ...state.queuedGames] };
        }),

      removeGameFromQueue: (gameId) =>
        set((state) => ({
          queuedGames: state.queuedGames.filter((g) => g.id !== gameId),
        })),

      toggleFileSelection: (gameId, fileId) =>
        set((state) => ({
          queuedGames: state.queuedGames.map((game) => {
            if (game.id !== gameId) return game;
            return {
              ...game,
              files: game.files.map((file) => {
                if (file.id !== fileId) return file;
                if (!file.isOptional) return file; // Cannot deselect main files
                return {
                  ...file,
                  isSelected: !file.isSelected,
                  status: !file.isSelected ? "pending" : "skipped",
                };
              }),
            };
          }),
        })),

      moveFileOrder: (gameId, fileId, direction) =>
        set((state) => ({
          queuedGames: state.queuedGames.map((game) => {
            if (game.id !== gameId) return game;
            const index = game.files.findIndex((f) => f.id === fileId);
            if (index < 0) return game;

            const newIndex = direction === "up" ? index - 1 : index + 1;
            if (newIndex < 0 || newIndex >= game.files.length) return game;

            const newFiles = [...game.files];
            const [moved] = newFiles.splice(index, 1);
            newFiles.splice(newIndex, 0, moved);

            // Update internal order index
            return {
              ...game,
              files: newFiles.map((f, idx) => ({ ...f, order: idx + 1 })),
            };
          }),
        })),

      updateFileStatus: (gameId, fileId, status, directUrl) =>
        set((state) => ({
          queuedGames: state.queuedGames.map((game) => {
            if (game.id !== gameId) return game;
            return {
              ...game,
              files: game.files.map((file) => {
                if (file.id !== fileId) return file;
                return {
                  ...file,
                  status,
                  ...(directUrl ? { directUrl } : {}),
                };
              }),
            };
          }),
        })),

      toggleGamePause: (gameId) =>
        set((state) => ({
          queuedGames: state.queuedGames.map((game) => {
            if (game.id !== gameId) return game;
            return {
              ...game,
              status: game.status === "downloading" ? "paused" : "downloading",
            };
          }),
        })),

      addMagnetDownload: (item) => {
        const id = `dl-${Date.now()}`;
        const downloads = useDownloadQueueStore.getState().magnetDownloads;
        const activeCount = downloads.filter(
          (d) => d.status === "downloading",
        ).length;

        // Check max concurrent torrents limit (default 1)
        let maxLimit = 1;
        try {
          if (typeof window !== "undefined") {
            const raw = localStorage.getItem("fitrepacks_torrent_settings");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (
                typeof parsed.maxActiveDownloads === "number" &&
                parsed.maxActiveDownloads > 0
              ) {
                maxLimit = parsed.maxActiveDownloads;
              }
            }
          }
        } catch {}

        const isExceeded = activeCount >= maxLimit;
        const initialStatus = isExceeded
          ? ("queued" as const)
          : ("downloading" as const);

        const newDownload: MagnetDownloadItem = {
          id,
          infoHash: item.infoHash,
          title: item.title,
          magnetUrl: item.magnetUrl,
          size: item.size || "Unknown",
          downloadDir: item.downloadDir || "C:\\Games",
          coverUrl: item.coverUrl,
          files: item.files || [],
          progress: 0,
          speed: "0.0 B/s",
          uploadSpeed: "0.0 B/s",
          eta: isExceeded ? "Queued" : "Connecting...",
          downloaded: "0 B",
          status: initialStatus,
          addedAt: new Date().toISOString(),
          peers: 0,
        };

        set((state) => ({
          magnetDownloads: [newDownload, ...state.magnetDownloads],
        }));

        return id;
      },

      removeMagnetDownload: (id) => {
        set((state) => ({
          magnetDownloads: state.magnetDownloads.filter((d) => d.id !== id),
        }));
        checkAndProcessDownloadQueue();
      },

      toggleMagnetPause: (id) => {
        let freedSlot = false;
        set((state) => ({
          magnetDownloads: state.magnetDownloads.map((d) => {
            if (d.id !== id) return d;
            const isCurrentlyActive =
              d.status === "downloading" ||
              d.status === "checking" ||
              d.status === "queued";
            const newStatus = isCurrentlyActive
              ? ("paused" as const)
              : ("downloading" as const);

            if (isCurrentlyActive && newStatus === "paused") {
              freedSlot = true;
            }

            const updatedFiles = d.files?.map((f) => {
              if (
                !f.isSelected ||
                f.status === "completed" ||
                f.status === "skipped"
              )
                return f;
              return {
                ...f,
                status:
                  newStatus === "paused"
                    ? ("paused" as const)
                    : ("downloading" as const),
              };
            });
            return {
              ...d,
              status: newStatus,
              speed: newStatus === "paused" ? "0.0 B/s" : d.speed,
              uploadSpeed: newStatus === "paused" ? "0.0 B/s" : d.uploadSpeed,
              files: updatedFiles || d.files,
            };
          }),
        }));
        if (freedSlot) {
          checkAndProcessDownloadQueue();
        }
      },

      toggleMagnetFileSelection: (downloadId, fileId) =>
        set((state) => ({
          magnetDownloads: state.magnetDownloads.map((dl) => {
            if (dl.id !== downloadId || !dl.files) return dl;
            return {
              ...dl,
              files: dl.files.map((f) => {
                if (f.id !== fileId) return f;
                if (!f.isOptional) return f;
                return {
                  ...f,
                  isSelected: !f.isSelected,
                  status: !f.isSelected ? "pending" : "skipped",
                };
              }),
            };
          }),
        })),

      syncFromLiveStats: (stats) => {
        set((state) => {
          const updatedMagnetDownloads = state.magnetDownloads.map((dl) => {
            // Find matching live torrent by infoHash or clean title match
            const liveMatch = stats.torrents.find((t) => {
              if (
                dl.infoHash &&
                t.info_hash.toLowerCase() === dl.infoHash.toLowerCase()
              ) {
                return true;
              }
              if (
                dl.magnetUrl &&
                dl.magnetUrl.toLowerCase().includes(t.info_hash.toLowerCase())
              ) {
                return true;
              }
              return false;
            });

            if (!liveMatch) return dl;

            const isParentPaused =
              dl.status === "paused" || liveMatch.status === "paused";

            const downloadedBytes = liveMatch.downloaded_bytes ?? 0;
            const totalBytes = liveMatch.total_bytes ?? 0;
            const isFullyFinished =
              liveMatch.status === "completed" ||
              (liveMatch.progress_percent >= 100 &&
                totalBytes > 0 &&
                downloadedBytes >= totalBytes);

            const isRehashing =
              liveMatch.status === "checking" ||
              dl.status === "checking" ||
              (!isFullyFinished &&
                (liveMatch.download_speed_bytes ?? 0) === 0 &&
                (liveMatch.eta?.includes("Rehashing") ||
                  liveMatch.eta?.includes("Checking")));

            const currentStatus = isFullyFinished
              ? ("completed" as const)
              : isRehashing
                ? ("checking" as const)
                : dl.status === "paused"
                  ? ("paused" as const)
                  : liveMatch.status === "paused"
                    ? ("paused" as const)
                    : ("downloading" as const);

            const updatedFiles = dl.files?.map((file, idx) => {
              if (!file.isSelected) {
                return {
                  ...file,
                  status: "skipped" as const,
                  downloadedBytes: 0,
                  downloadedFormatted: "0 B",
                  progressPercent: 0,
                };
              }

              let fileDownloadedBytes = 0;
              if (
                liveMatch.file_progress_bytes &&
                liveMatch.file_progress_bytes[idx] !== undefined
              ) {
                fileDownloadedBytes = liveMatch.file_progress_bytes[idx];
              } else {
                let remainingBytes = downloadedBytes;
                for (let j = 0; j < idx; j++) {
                  const prevFile = dl.files?.[j];
                  if (prevFile && prevFile.isSelected) {
                    const prevBytes = prevFile.bytes || 0;
                    remainingBytes = Math.max(0, remainingBytes - prevBytes);
                  }
                }
                const thisFileBytes = file.bytes || 0;
                fileDownloadedBytes =
                  thisFileBytes > 0
                    ? Math.min(thisFileBytes, remainingBytes)
                    : remainingBytes;
              }

              const fileTotalBytes = file.bytes || 0;
              let fileProgressPct = 0;
              if (fileTotalBytes > 0) {
                fileProgressPct = Math.min(
                  100,
                  (fileDownloadedBytes / fileTotalBytes) * 100,
                );
              } else if (liveMatch.progress_percent >= 100) {
                fileProgressPct = 100;
              }

              const isFileCompleted =
                fileProgressPct >= 100 ||
                (fileTotalBytes > 0 && fileDownloadedBytes >= fileTotalBytes);

              const fileStatus = isFileCompleted
                ? ("completed" as const)
                : !file.isSelected
                  ? ("skipped" as const)
                  : isRehashing
                    ? ("checking" as const)
                    : isParentPaused
                      ? ("paused" as const)
                      : liveMatch.status === "downloading"
                        ? ("downloading" as const)
                        : ("pending" as const);

              const formattedDownloaded =
                fileDownloadedBytes >= 1024 * 1024 * 1024
                  ? `${(fileDownloadedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
                  : fileDownloadedBytes >= 1024 * 1024
                    ? `${(fileDownloadedBytes / (1024 * 1024)).toFixed(2)} MB`
                    : fileDownloadedBytes >= 1024
                      ? `${(fileDownloadedBytes / 1024).toFixed(2)} KB`
                      : `${fileDownloadedBytes} B`;

              return {
                ...file,
                downloadedBytes: fileDownloadedBytes,
                downloadedFormatted: formattedDownloaded,
                progressPercent: isFileCompleted ? 100 : fileProgressPct,
                status: fileStatus,
              };
            });

            return {
              ...dl,
              infoHash: liveMatch.info_hash,
              progress: Math.min(100, Math.max(0, liveMatch.progress_percent)),
              speed: liveMatch.download_speed_formatted,
              uploadSpeed: liveMatch.upload_speed_formatted,
              eta: isRehashing ? "Rehashing / Checking..." : liveMatch.eta,
              downloaded: liveMatch.downloaded_formatted,
              status: currentStatus,
              peers: liveMatch.peers,
              files: updatedFiles || dl.files,
            };
          });

          return {
            magnetDownloads: updatedMagnetDownloads,
            aggregateStats: {
              totalDownSpeed: stats.total_down_speed_formatted,
              totalUpSpeed: stats.total_up_speed_formatted,
              totalDownBytes: stats.total_down_speed_bytes,
              totalUpBytes: stats.total_up_speed_bytes,
              activeCount: stats.active_downloads_count,
            },
          };
        });
      },
    }),
    {
      name: "fitrepacks_download_queue",
      storage: createJSONStorage(() => sqliteStorage),
      partialize: (state) => ({
        queuedGames: state.queuedGames,
        magnetDownloads: state.magnetDownloads.map((dl) => ({
          ...dl,
          // Reset live speed on disk write
          speed: "0.0 B/s",
          uploadSpeed: "0.0 B/s",
          peers: 0,
        })),
      }),
    },
  ),
);

/** Auto-resume active downloads in the Rust BitTorrent engine on app restart */
export async function resumeActiveDownloadsOnStartup(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
    return;

  const state = useDownloadQueueStore.getState();
  const activeDownloads = state.magnetDownloads.filter(
    (dl) => dl.status === "downloading" && dl.magnetUrl,
  );

  if (activeDownloads.length === 0) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    for (const dl of activeDownloads) {
      const selectedIndices: number[] = [];
      dl.files?.forEach((f, idx) => {
        if (f.isSelected) selectedIndices.push(idx);
      });

      try {
        let resumed = false;
        if (dl.infoHash) {
          resumed = await invoke<boolean>("resume_torrent_download", {
            infoHash: dl.infoHash,
          });
        }

        if (!resumed) {
          const infoHash = await invoke<string>("start_torrent_download", {
            magnetUrl: dl.magnetUrl,
            downloadDir: dl.downloadDir || "C:\\Games\\Downloads",
            selectedFileIndices:
              dl.files && selectedIndices.length < dl.files.length
                ? selectedIndices
                : null,
          });
          if (infoHash && infoHash !== "list_only") {
            useDownloadQueueStore.setState((prev) => ({
              magnetDownloads: prev.magnetDownloads.map((item) =>
                item.id === dl.id ? { ...item, infoHash } : item,
              ),
            }));
          }
        }
      } catch (err) {
        console.warn(`Failed to auto-resume torrent ${dl.title}:`, err);
      }
    }
  } catch (err) {
    console.error("Error in resumeActiveDownloadsOnStartup:", err);
  }
}

/** Auto-process download queue based on max concurrent torrents setting */
export async function checkAndProcessDownloadQueue(): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window))
    return;

  let maxLimit = 1;
  try {
    const raw = localStorage.getItem("fitrepacks_torrent_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.maxActiveDownloads === "number" &&
        parsed.maxActiveDownloads > 0
      ) {
        maxLimit = parsed.maxActiveDownloads;
      }
    }
  } catch {}

  const state = useDownloadQueueStore.getState();
  const activeCount = state.magnetDownloads.filter(
    (d) => d.status === "downloading",
  ).length;

  if (activeCount >= maxLimit) return;

  const queuedItem = state.magnetDownloads.find(
    (d) => d.status === "queued" && d.progress < 100 && d.magnetUrl,
  );

  if (!queuedItem) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    let resumed = false;
    if (queuedItem.infoHash) {
      resumed = await invoke<boolean>("resume_torrent_download", {
        infoHash: queuedItem.infoHash,
      });
    }

    if (!resumed && queuedItem.magnetUrl) {
      const selectedIndices: number[] = [];
      queuedItem.files?.forEach((f, idx) => {
        if (f.isSelected) selectedIndices.push(idx);
      });
      const newHash = await invoke<string>("start_torrent_download", {
        magnetUrl: queuedItem.magnetUrl,
        downloadDir: queuedItem.downloadDir || "C:\\Games\\Downloads",
        selectedFileIndices:
          queuedItem.files && selectedIndices.length < queuedItem.files.length
            ? selectedIndices
            : null,
      });
      if (newHash && newHash !== "list_only") {
        useDownloadQueueStore.setState((prev) => ({
          magnetDownloads: prev.magnetDownloads.map((item) =>
            item.id === queuedItem.id
              ? { ...item, infoHash: newHash, status: "downloading" as const }
              : item,
          ),
        }));
        return;
      }
    }

    useDownloadQueueStore.setState((prev) => ({
      magnetDownloads: prev.magnetDownloads.map((item) =>
        item.id === queuedItem.id
          ? { ...item, status: "downloading" as const }
          : item,
      ),
    }));
  } catch (err) {
    console.warn("Failed to auto-start queued torrent:", err);
  }
}
export async function toggleAllDownloadsPause(): Promise<void> {
  const state = useDownloadQueueStore.getState();
  const incomplete = state.magnetDownloads.filter(
    (d) => d.status !== "completed",
  );
  if (incomplete.length === 0) return;

  const hasActive = incomplete.some((d) => d.status === "downloading");

  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      for (const dl of incomplete) {
        if (hasActive) {
          // Pause everything
          if (dl.status === "downloading") {
            if (dl.infoHash) {
              await invoke("pause_torrent_download", {
                infoHash: dl.infoHash,
              });
            }
            state.toggleMagnetPause(dl.id);
          }
        } else {
          // Resume everything
          let resumed = false;
          if (dl.infoHash) {
            resumed = await invoke<boolean>("resume_torrent_download", {
              infoHash: dl.infoHash,
            });
          }
          if (!resumed && dl.magnetUrl) {
            const selectedIndices: number[] = [];
            dl.files?.forEach((f, idx) => {
              if (f.isSelected) selectedIndices.push(idx);
            });
            const newHash = await invoke<string>("start_torrent_download", {
              magnetUrl: dl.magnetUrl,
              downloadDir: dl.downloadDir || "C:\\Games\\Downloads",
              selectedFileIndices:
                dl.files && selectedIndices.length < dl.files.length
                  ? selectedIndices
                  : null,
            });
            if (newHash && newHash !== "list_only") {
              useDownloadQueueStore.setState((prev) => ({
                magnetDownloads: prev.magnetDownloads.map((item) =>
                  item.id === dl.id ? { ...item, infoHash: newHash } : item,
                ),
              }));
            }
          }
          state.toggleMagnetPause(dl.id);
        }
      }
    } catch (err) {
      console.error("Failed to toggle all downloads pause/resume:", err);
    }
  } else {
    for (const dl of incomplete) {
      state.toggleMagnetPause(dl.id);
    }
  }
}
