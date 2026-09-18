import { useState, useCallback } from "react";
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

/**
 * Check for available application updates from the configured updater endpoints
 */
export async function checkAppUpdate(): Promise<AppUpdateDetails | null> {
  const [update, currentVersion] = await Promise.all([
    check(),
    getVersion().catch(() => "Unknown"),
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
 * React hook to manage checking, downloading, and installing app updates
 */
export function useAppUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateDetails, setUpdateDetails] = useState<AppUpdateDetails | null>(null);
  const [progress, setProgress] = useState<UpdateProgress>({
    downloadedBytes: 0,
    totalBytes: 0,
    percent: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = useCallback(async (silent = false) => {
    setStatus("checking");
    setError(null);

    try {
      const update = await checkAppUpdate();

      if (update) {
        setUpdateDetails(update);
        setStatus("available");
        return update;
      } else {
        setUpdateDetails(null);
        setStatus("up-to-date");
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
        setUpdateDetails(null);
        setStatus("up-to-date");
        return null;
      }

      setError(msg);
      setStatus("error");
      if (!silent) {
        console.error("App update check error:", err);
      }
      return null;
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!updateDetails?.rawUpdate) return;

    setStatus("downloading");
    setError(null);
    setProgress({ downloadedBytes: 0, totalBytes: 0, percent: 0 });

    try {
      let totalBytes = 0;
      let downloadedBytes = 0;

      await updateDetails.rawUpdate.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength || 0;
            setProgress({
              downloadedBytes: 0,
              totalBytes,
              percent: 0,
            });
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
            setProgress({
              downloadedBytes,
              totalBytes,
              percent,
            });
            break;
          case "Finished":
            setProgress({
              downloadedBytes: totalBytes || downloadedBytes,
              totalBytes: totalBytes || downloadedBytes,
              percent: 100,
            });
            break;
        }
      });

      setStatus("ready-to-restart");
    } catch (err: any) {
      const msg = err?.message || String(err) || "Failed to download and install update";
      setError(msg);
      setStatus("error");
      console.error("App update install error:", err);
    }
  }, [updateDetails]);

  const restartApp = useCallback(async () => {
    try {
      await relaunch();
    } catch (err: any) {
      console.error("Failed to relaunch application:", err);
      setError(err?.message || "Failed to restart application");
    }
  }, []);

  const resetStatus = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    updateDetails,
    progress,
    error,
    checkForUpdates,
    installUpdate,
    restartApp,
    resetStatus,
  };
}
