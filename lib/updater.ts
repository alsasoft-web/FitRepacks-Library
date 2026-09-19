import { create } from "zustand";
import { check, Update, DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

export interface AppUpdateDetails {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  rawUpdate: Update;
}

export interface UpdateProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "ready-to-restart"
  | "error";

export interface AppUpdaterState {
  status: UpdateStatus;
  currentVersion: string;
  updateDetails: AppUpdateDetails | null;
  progress: UpdateProgress;
  error: string | null;
  hasCheckedOnStartup: boolean;
  lastCheckedTime: number;
  checkForUpdates: (silent?: boolean, force?: boolean) => Promise<AppUpdateDetails | null>;
  installUpdate: () => Promise<void>;
  restartApp: () => Promise<void>;
  resetStatus: () => void;
  loadCurrentVersion: () => Promise<string>;
}

/**
 * Check for available application updates from the configured updater endpoints
 */
export async function checkAppUpdate(): Promise<AppUpdateDetails | null> {
  const [update, currentVersion] = await Promise.all([
    check(),
    getVersion().catch(() => ""),
  ]);

  if (!update) {
    return null;
  }

  return {
    version: update.version,
    currentVersion,
    date: update.date,
    body: update.body,
    rawUpdate: update,
  };
}

/**
 * Global Zustand store and hook to manage checking, downloading, and installing app updates
 */
export const useAppUpdater = create<AppUpdaterState>((set, get) => ({
  status: "idle",
  currentVersion: "",
  updateDetails: null,
  progress: {
    downloadedBytes: 0,
    totalBytes: 0,
    percent: 0,
  },
  error: null,
  hasCheckedOnStartup: false,
  lastCheckedTime: 0,

  loadCurrentVersion: async () => {
    try {
      const v = await getVersion();
      if (v) {
        set({ currentVersion: v });
        return v;
      }
    } catch (_) {}
    return get().currentVersion;
  },

  checkForUpdates: async (silent = false, force = false) => {
    const currentStatus = get().status;
    if (
      currentStatus === "checking" ||
      currentStatus === "downloading" ||
      currentStatus === "ready-to-restart"
    ) {
      return get().updateDetails;
    }

    const now = Date.now();
    // Throttle silent checks to avoid rapid repeat requests when toggling focus (e.g. 30s)
    if (silent && !force && now - get().lastCheckedTime < 30000) {
      return get().updateDetails;
    }

    set({ status: "checking", error: null, lastCheckedTime: now });

    try {
      const v = await getVersion().catch(() => null);
      if (v) {
        set({ currentVersion: v });
      }
    } catch (_) {}

    try {
      const update = await checkAppUpdate();

      if (update) {
        set({
          updateDetails: update,
          status: "available",
          hasCheckedOnStartup: true,
        });
        return update;
      } else {
        set({
          updateDetails: null,
          status: "up-to-date",
          hasCheckedOnStartup: true,
        });
        return null;
      }
    } catch (err: any) {
      const msg = err?.message || String(err) || "Failed to check for updates";

      // When no release with latest.json is published yet on GitHub (404 Not Found)
      const isMissingManifest =
        msg.includes("404") ||
        msg.includes("Could not fetch a valid release JSON") ||
        msg.includes("Not Found");

      if (isMissingManifest) {
        set({
          updateDetails: null,
          status: "up-to-date",
          hasCheckedOnStartup: true,
        });
        return null;
      }

      set({
        error: msg,
        status: "error",
        hasCheckedOnStartup: true,
      });

      if (!silent) {
        console.error("App update check error:", err);
      }
      return null;
    }
  },

  installUpdate: async () => {
    const details = get().updateDetails;
    if (!details?.rawUpdate) return;

    set({
      status: "downloading",
      error: null,
      progress: { downloadedBytes: 0, totalBytes: 0, percent: 0 },
    });

    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await details.rawUpdate.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength || 0;
            set({
              progress: {
                downloadedBytes: 0,
                totalBytes,
                percent: 0,
              },
            });
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            const percent =
              totalBytes > 0
                ? Math.min(
                    100,
                    Math.round((downloadedBytes / totalBytes) * 100),
                  )
                : 0;
            set({
              progress: {
                downloadedBytes,
                totalBytes,
                percent,
              },
            });
            break;
          case "Finished":
            set({
              progress: {
                downloadedBytes: totalBytes || downloadedBytes,
                totalBytes: totalBytes || downloadedBytes,
                percent: 100,
              },
            });
            break;
        }
      });

      set({ status: "ready-to-restart" });
    } catch (err: any) {
      const msg =
        err?.message || String(err) || "Failed to download and install update";
      set({ error: msg, status: "error" });
      console.error("App update install error:", err);
    }
  },

  restartApp: async () => {
    try {
      await relaunch();
    } catch (err: any) {
      console.error("Failed to relaunch application:", err);
      set({ error: err?.message || "Failed to restart application" });
    }
  },

  resetStatus: () => {
    set({ status: "idle", error: null });
  },
}));

if (typeof window !== "undefined") {
  getVersion()
    .then((v) => {
      if (v) {
        useAppUpdater.setState({ currentVersion: v });
      }
    })
    .catch(() => {});
}
