/**
 * Pure frontend game version detection using @tauri-apps/plugin-fs
 */

function parseCodexCfg(content: string): string | null {
  let version: string | null = null;
  let contentId: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.includes('"Version"')) {
      const parts = trimmed.split('"');
      if (parts.length >= 4 && parts[3].trim()) {
        version = parts[3].trim();
      }
    } else if (trimmed.includes('"ContentId"')) {
      const parts = trimmed.split('"');
      if (parts.length >= 4 && parts[3].trim()) {
        contentId = parts[3].trim();
      }
    }
  }

  if (version && contentId) {
    return `v${version.replace(/^v/i, "")} (Build ${contentId})`;
  }
  if (version) {
    return `v${version.replace(/^v/i, "")}`;
  }
  if (contentId) {
    return `Build ${contentId}`;
  }
  return null;
}

function parseIniVersion(content: string): string | null {
  let buildId: string | null = null;
  let version: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith("buildid=") ||
      lower.startsWith("build_id=") ||
      lower.startsWith("build=")
    ) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const val = trimmed.substring(eqIdx + 1).trim();
        if (val) buildId = val;
      }
    } else if (
      lower.startsWith("version=") ||
      lower.startsWith("appversion=") ||
      lower.startsWith("gameversion=")
    ) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const val = trimmed.substring(eqIdx + 1).trim();
        if (val) version = val;
      }
    }
  }

  if (version && buildId) {
    return `v${version.replace(/^v/i, "")} (Build ${buildId})`;
  }
  if (version) {
    return `v${version.replace(/^v/i, "")}`;
  }
  if (buildId) {
    return `Build ${buildId}`;
  }
  return null;
}

const VERSION_FILE_NAMES = new Set([
  "codex.cfg",
  "flt.ini",
  "steam_emu.ini",
  "steamconfig.ini",
  "rune.ini",
  "tenoke.ini",
  "ali213.ini",
  "smartsteamemu.ini",
  "steam_api.ini",
  "empress.ini",
  "version.txt",
  "build.txt",
  "build_id.txt",
  "buildid.txt",
  "appversion.txt",
  "buildinfo.txt",
  "buildinfo",
  "game_version.txt",
  "build_version.txt",
]);

async function checkVersionFile(filePath: string): Promise<string | null> {
  const normalized = filePath.replace(/\\/g, "/");
  const fileName = (normalized.split("/").pop() || "").toLowerCase();
  if (!VERSION_FILE_NAMES.has(fileName)) return null;

  try {
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const content = await readTextFile(filePath);
    if (!content) return null;

    if (fileName === "codex.cfg") {
      return parseCodexCfg(content);
    }

    if (fileName.endsWith(".ini")) {
      return parseIniVersion(content);
    }

    const firstLine = content.split(/\r?\n/)[0]?.trim() || "";
    if (firstLine && firstLine.length < 60) {
      if (/^\d+$/.test(firstLine)) {
        return `Build ${firstLine}`;
      }
      return firstLine;
    }
  } catch {}
  return null;
}

export async function detectInstalledGameVersion(
  exeOrFolderPath: string,
): Promise<string | undefined> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return undefined;
  }
  if (!exeOrFolderPath || !exeOrFolderPath.trim()) {
    return undefined;
  }

  const clean = exeOrFolderPath.trim().replace(/\\/g, "/");
  const baseDir = clean.toLowerCase().endsWith(".exe")
    ? clean.substring(0, clean.lastIndexOf("/"))
    : clean;

  if (!baseDir) return undefined;

  try {
    const { readDir, exists } = await import("@tauri-apps/plugin-fs");

    // 1. Search downwards inside the game folder (up to depth 3)
    const queue: { dir: string; depth: number }[] = [
      { dir: baseDir, depth: 0 },
    ];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth > 3) continue;

      if (await exists(current.dir)) {
        const entries = await readDir(current.dir);
        for (const entry of entries) {
          const entryPath = `${current.dir}/${entry.name}`;
          if (entry.isDirectory) {
            const lowerName = entry.name.toLowerCase();
            if (
              !lowerName.includes("redist") &&
              !lowerName.includes("recycle") &&
              !lowerName.includes("backup")
            ) {
              queue.push({ dir: entryPath, depth: current.depth + 1 });
            }
          } else if (entry.isFile) {
            const ver = await checkVersionFile(entryPath);
            if (ver) return ver;
          }
        }
      }
    }

    // 2. Search upwards parent directories (up to 3 levels)
    let parentDir = baseDir.substring(0, baseDir.lastIndexOf("/"));
    for (let i = 0; i < 3; i++) {
      if (!parentDir || parentDir.length <= 3) break;
      if (await exists(parentDir)) {
        const entries = await readDir(parentDir);
        for (const entry of entries) {
          if (entry.isFile) {
            const ver = await checkVersionFile(`${parentDir}/${entry.name}`);
            if (ver) return ver;
          }
        }
      }
      parentDir = parentDir.substring(0, parentDir.lastIndexOf("/"));
    }
  } catch (err) {
    console.error("Error detecting installed game version in frontend:", err);
  }

  return undefined;
}

/**
 * Get the last modified Date of a game executable file
 */
export async function detectGameExeLastModified(
  exePath: string,
): Promise<Date | null> {
  if (!exePath || !exePath.trim()) return null;
  const clean = exePath.trim();

  // 1. Try Tauri invoke command first
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const millis = await invoke<number>("get_game_last_modified", {
        path: clean,
      });
      if (millis && !isNaN(millis)) {
        return new Date(millis);
      }
    } catch (_) {
      // Fallback to plugin-fs
    }

    try {
      const { stat } = await import("@tauri-apps/plugin-fs");
      const info = await stat(clean);
      if (info && info.mtime) {
        return new Date(info.mtime);
      }
    } catch (_) {}
  }

  return null;
}

export function parseDateSafe(val?: Date | string | number | null): number | null {
  if (!val) return null;
  if (val instanceof Date) {
    const t = val.getTime();
    return isNaN(t) ? null : t;
  }
  if (typeof val === "number") {
    return isNaN(val) ? null : val;
  }
  if (typeof val === "string") {
    let clean = val.trim();
    if (!clean) return null;
    if (/^\d{10,}$/.test(clean)) {
      const num = Number(clean);
      if (!isNaN(num)) return num;
    }

    // Strip common leading words like "Updated on", "Date:", etc.
    clean = clean.replace(/^(?:updated|posted|published|date|on|at)[\s:]+/i, "").trim();

    // 1. Handle DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
    const dmy = clean.match(
      /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
    );
    if (dmy) {
      const p1 = parseInt(dmy[1], 10);
      const p2 = parseInt(dmy[2], 10);
      const y = parseInt(dmy[3], 10);
      const hh = dmy[4] ? parseInt(dmy[4], 10) : 0;
      const mm = dmy[5] ? parseInt(dmy[5], 10) : 0;
      const ss = dmy[6] ? parseInt(dmy[6], 10) : 0;

      let d = p1;
      let m = p2 - 1;
      if (p1 <= 12 && p2 > 12) {
        d = p2;
        m = p1 - 1;
      }
      const customDate = new Date(y, m, d, hh, mm, ss).getTime();
      if (!isNaN(customDate)) return customDate;
    }

    // 2. Handle YYYY-MM-DD or YYYY/MM/DD
    const ymd = clean.match(
      /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/,
    );
    if (ymd) {
      const y = parseInt(ymd[1], 10);
      const m = parseInt(ymd[2], 10) - 1;
      const d = parseInt(ymd[3], 10);
      const hh = ymd[4] ? parseInt(ymd[4], 10) : 0;
      const mm = ymd[5] ? parseInt(ymd[5], 10) : 0;
      const ss = ymd[6] ? parseInt(ymd[6], 10) : 0;
      const customDate = new Date(y, m, d, hh, mm, ss).getTime();
      if (!isNaN(customDate)) return customDate;
    }

    const parsed = Date.parse(clean);
    if (!isNaN(parsed)) return parsed;
  }
  return null;
}

/**
 * Returns true if the installed game executable last modified date indicates the game is up to date
 * with respect to the repack post date.
 * If the post date is newer than the game executable last modified date by MORE than thresholdDays (default 10 days),
 * then an update IS available (returns false).
 * If the last modified date is newer than the post date, or within thresholdDays before it,
 * the game is UP TO DATE (returns true).
 */
export function isGameUpToDateByDate(
  lastModified?: Date | string | number | null,
  postDate?: Date | string | number | null,
  thresholdDays = 10,
): boolean {
  const modTime = parseDateSafe(lastModified);
  const postTime = parseDateSafe(postDate);

  if (modTime === null || postTime === null) return true;

  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
  // If last modified date is >= (post date - threshold), the game is up to date
  return modTime >= postTime - thresholdMs;
}
