import { ScannedExecutable } from "./types";

// Common subfolder names where executable binaries hide inside game directories
const BINARY_SUBFOLDERS = new Set([
  "bin",
  "binaries",
  "win64",
  "win32",
  "x64",
  "x86",
  "win",
  "system",
  "build",
  "release",
  "shipping",
  "engine",
  "game",
  "contents",
  "app",
  "windows",
]);

// Ignored directories (backups, tools, redistributables)
const IGNORED_DIRECTORIES = new Set([
  "backup",
  "backups",
  "ds4windows",
  "_redist",
  "redist",
  "__installer",
  "support",
  "docs",
  "documentation",
  "$recycle.bin",
]);

// Non-game utility executables to ignore
const UTILITY_EXES = new Set([
  "unins000.exe",
  "uninstall.exe",
  "dxsetup.exe",
  "dxwebsetup.exe",
  "vc_redist.x64.exe",
  "vc_redist.x86.exe",
  "crashreporter.exe",
  "easyanticheat.exe",
  "unitycrashhandler64.exe",
  "unitycrashhandler32.exe",
  "battleye.exe",
  "uplay_autoupdate.exe",
  "cefprocess.exe",
  "vcredist_x64.exe",
  "vcredist_x86.exe",
  "uninstaller.exe",
  "setup.exe",
  "updater.exe",
  "quicksfv.exe",
  "language selector.exe",
  "7za.exe",
  "crashreporter.exe",
  "redengineerrorreporter.exe",
  "idtechlauncher.exe",
  "rapidcrc.exe",
]);

/**
 * Clean directory/file names to human readable Title Case
 */
function formatTitle(rawName: string): string {
  const cleaned = rawName
    .replace(/[._-]+/g, " ")
    .replace(/v\d+(\.\d+)*/gi, "")
    .replace(
      /\b(repack|fitgirl|dodi|gog|steam|crack|codex|flt|empress|build)\b/gi,
      "",
    )
    .trim();

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Climb directory path to find true game root folder name
 */
function resolveGameRootFolder(
  fullFilePath: string,
  targetScanFolder?: string,
): {
  rootFolderName: string;
  cleanTitle: string;
} {
  const normalizedFile = fullFilePath.replace(/\\/g, "/");
  let fileParts = normalizedFile.split("/").filter(Boolean);

  if (targetScanFolder) {
    let normTarget = targetScanFolder.replace(/\\/g, "/");
    if (normTarget.toLowerCase().endsWith(".exe")) {
      // If user selected an executable directly, use its parent directory
      normTarget = normTarget.substring(0, normTarget.lastIndexOf("/"));
    }
    const targetParts = normTarget.split("/").filter(Boolean);

    // If the target folder is a parent of the executable file, use the top-level subfolder inside targetScanFolder (or targetScanFolder itself if exe is directly inside it)
    if (
      targetParts.length > 0 &&
      fileParts.length >= targetParts.length &&
      fileParts
        .slice(0, targetParts.length)
        .every((part, idx) => part.toLowerCase() === targetParts[idx].toLowerCase())
    ) {
      if (fileParts.length > targetParts.length + 1) {
        // Exe is inside a subfolder inside the selected directory (e.g. Target/DOOM Eternal/backup/game.exe)
        // Use the folder directly under the target scan folder (DOOM Eternal)
        const gameFolder = fileParts[targetParts.length];
        return {
          rootFolderName: gameFolder,
          cleanTitle: formatTitle(gameFolder),
        };
      } else if (fileParts.length === targetParts.length + 1) {
        // Exe is directly inside target scan folder
        const gameFolder = targetParts[targetParts.length - 1];
        return {
          rootFolderName: gameFolder,
          cleanTitle: formatTitle(gameFolder),
        };
      }
    }
  }

  if (fileParts.length <= 1) {
    const file = fileParts[0] || "Unknown Game";
    const title = formatTitle(file.replace(/\.exe$/i, ""));
    return { rootFolderName: file, cleanTitle: title };
  }

  // Remove filename
  fileParts.pop();

  // Walk up directory chain while current folder is in BINARY_SUBFOLDERS
  while (fileParts.length > 1) {
    const currentFolder = fileParts[fileParts.length - 1].toLowerCase();
    if (BINARY_SUBFOLDERS.has(currentFolder)) {
      fileParts.pop();
    } else {
      break;
    }
  }

  const rootFolderName = fileParts[fileParts.length - 1] || "Unknown Game";
  const cleanTitle = formatTitle(rootFolderName);

  return { rootFolderName, cleanTitle };
}

/**
 * Filter out non-game exes and score likely game executable
 */
export function isLikelyGameExecutable(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const pathParts = normalized.toLowerCase().split("/").filter(Boolean);
  const fileName = pathParts[pathParts.length - 1] || "";

  if (!fileName.endsWith(".exe")) {
    return false;
  }

  // Check if any directory segment is an ignored directory (e.g. backup, ds4windows)
  for (let i = 0; i < pathParts.length - 1; i++) {
    const dir = pathParts[i];
    if (IGNORED_DIRECTORIES.has(dir) || dir.includes("ds4windows")) {
      return false;
    }
  }

  if (UTILITY_EXES.has(fileName)) {
    return false;
  }
  if (
    fileName.includes("unins") ||
    fileName.includes("crash") ||
    fileName.includes("setup") ||
    fileName.includes("dxsetup") ||
    fileName.includes("vcredist") ||
    fileName.includes("installer") ||
    fileName.includes("quicksfv")
  ) {
    return false;
  }
  return true;
}

/**
 * Parse target path into ScannedExecutable structure
 */
export function parseScannedPath(
  fullPath: string,
  targetScanFolder?: string,
): ScannedExecutable {
  const fileName = fullPath.replace(/\\/g, "/").split("/").pop() || "";
  const { rootFolderName, cleanTitle } = resolveGameRootFolder(
    fullPath,
    targetScanFolder,
  );
  const isLikely = isLikelyGameExecutable(fullPath);

  return {
    id: `scan-${Math.random().toString(36).substring(2, 9)}`,
    fileName,
    fullPath,
    detectedGameTitle: cleanTitle,
    detectedRootFolder: rootFolderName,
    isLikelyGameExe: isLikely,
  };
}

/**
 * Recursively scan folder path using @tauri-apps/plugin-fs
 */
export async function scanDirectory(
  folderPath: string,
): Promise<{ path: string; fileName: string }[]> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    if (folderPath.toLowerCase().endsWith(".exe")) {
      const fileName = folderPath.replace(/\\/g, "/").split("/").pop() || "";
      return [{ path: folderPath, fileName }];
    }
    return [];
  }

  const clean = folderPath.trim().replace(/\\/g, "/");
  if (clean.toLowerCase().endsWith(".exe")) {
    const fileName = clean.split("/").pop() || "";
    return [{ path: folderPath, fileName }];
  }

  const results: { path: string; fileName: string }[] = [];

  try {
    const { readDir, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(clean))) return [];

    const queue: { dir: string; depth: number }[] = [{ dir: clean, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth > 5) continue;

      try {
        const entries = await readDir(current.dir);
        for (const entry of entries) {
          const entryPath = `${current.dir}/${entry.name}`;
          if (entry.isDirectory) {
            const lower = entry.name.toLowerCase();
            if (
              !IGNORED_DIRECTORIES.has(lower) &&
              !lower.includes("ds4windows")
            ) {
              queue.push({ dir: entryPath, depth: current.depth + 1 });
            }
          } else if (entry.isFile) {
            const fileName = entry.name;
            if (fileName.toLowerCase().endsWith(".exe")) {
              if (
                !UTILITY_EXES.has(fileName.toLowerCase()) &&
                isLikelyGameExecutable(entryPath)
              ) {
                results.push({
                  path: entryPath.replace(/\//g, "\\"),
                  fileName,
                });
              }
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error("Error scanning directory in frontend:", err);
  }

  return results;
}

/**
 * Check if the given game directory or executable path contains FitGirl signature
 * (such as `_Redist/fitgirl.md5` or `fitgirl.md5` in main directory).
 */
export async function detectIsFitgirlRepack(
  exeOrFolderPath: string,
): Promise<boolean> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return false;
  }
  if (!exeOrFolderPath || !exeOrFolderPath.trim()) {
    return false;
  }

  try {
    const { exists, readDir } = await import("@tauri-apps/plugin-fs");
    const clean = exeOrFolderPath.trim().replace(/\\/g, "/");
    let currentDir: string | null = clean.toLowerCase().endsWith(".exe")
      ? clean.substring(0, clean.lastIndexOf("/"))
      : clean;

    for (let i = 0; i < 5; i++) {
      if (!currentDir || currentDir.length <= 3) break;

      if (await exists(currentDir)) {
        // Direct checks
        if (await exists(`${currentDir}/fitgirl.md5`)) return true;
        if (await exists(`${currentDir}/_Redist/fitgirl.md5`)) return true;
        if (await exists(`${currentDir}/redist/fitgirl.md5`)) return true;

        try {
          const entries = await readDir(currentDir);
          for (const entry of entries) {
            const lower = entry.name.toLowerCase();
            if (entry.isFile && lower === "fitgirl.md5") return true;
            if (
              entry.isDirectory &&
              (lower === "_redist" || lower === "redist")
            ) {
              if (await exists(`${currentDir}/${entry.name}/fitgirl.md5`)) {
                return true;
              }
            }
          }
        } catch {}
      }

      currentDir = currentDir.substring(0, currentDir.lastIndexOf("/"));
    }
  } catch (err) {
    console.error("Error checking fitgirl repack signature:", err);
  }

  return false;
}

/**
 * Find uninstaller executable in game folder or parent folders
 */
export async function checkUninstallerExe(
  exePath: string,
): Promise<string | null> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return null;
  }
  if (!exePath || !exePath.trim()) {
    return null;
  }

  const uninstallerNames = [
    "unins000.exe",
    "uninstall.exe",
    "uninstaller.exe",
    "unins001.exe",
    "unins002.exe",
    "setup.exe",
  ];

  try {
    const { exists, readDir } = await import("@tauri-apps/plugin-fs");
    const clean = exePath.trim().replace(/\\/g, "/");
    let currentDir: string | null = clean.toLowerCase().endsWith(".exe")
      ? clean.substring(0, clean.lastIndexOf("/"))
      : clean;

    for (let i = 0; i < 4; i++) {
      if (!currentDir || currentDir.length <= 3) break;

      if (await exists(currentDir)) {
        for (const name of uninstallerNames) {
          const candidate = `${currentDir}/${name}`;
          if (await exists(candidate)) {
            return candidate.replace(/\//g, "\\");
          }
        }

        try {
          const entries = await readDir(currentDir);
          for (const entry of entries) {
            if (entry.isFile) {
              const lower = entry.name.toLowerCase();
              if (
                lower === "unins000.exe" ||
                lower === "uninstall.exe" ||
                lower === "uninstaller.exe"
              ) {
                return `${currentDir}/${entry.name}`.replace(/\//g, "\\");
              }
            }
          }
        } catch {}
      }

      currentDir = currentDir.substring(0, currentDir.lastIndexOf("/"));
    }
  } catch (err) {
    console.error("Error checking uninstaller executable:", err);
  }

  return null;
}

/**
 * Launch uninstaller executable via @tauri-apps/plugin-opener
 */
export async function uninstallGameExe(exePath: string): Promise<boolean> {
  const uninstaller = await checkUninstallerExe(exePath);
  if (!uninstaller) return false;

  try {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(uninstaller);
    return true;
  } catch (err) {
    console.error("Failed to launch uninstaller:", err);
    return false;
  }
}


