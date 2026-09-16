import { Game } from "./types";
import { getAppSetting, saveAppSetting } from "./db";

export interface LinuxRunner {
  id: string;
  name: string;
  type: "proton-ge" | "steam-proton" | "wine" | "custom";
  path: string; // executable or proton script path
  version: string;
  isManaged: boolean;
}

export interface LinuxCompatibilitySettings {
  preferredRunnerId: string;
  autoUpdateProtonGe: boolean;
  enableMangoHud: boolean;
  enableGameMode: boolean;
  enableDxvkAsync: boolean;
  enableEsyncFsync: boolean;
  customRunnerPath?: string;
  customWinePrefix?: string;
}

export const DEFAULT_LINUX_SETTINGS: LinuxCompatibilitySettings = {
  preferredRunnerId: "managed-ge-proton",
  autoUpdateProtonGe: true,
  enableMangoHud: false,
  enableGameMode: true,
  enableDxvkAsync: true,
  enableEsyncFsync: true,
};

/**
 * Check if the current client platform is Linux
 */
export function isLinuxPlatform(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return (
    ua.includes("linux") && !ua.includes("android") && !ua.includes("windows")
  );
}

/**
 * Fetch the latest GE-Proton release metadata from GitHub
 */
export async function fetchLatestGeProtonRelease(): Promise<{
  tagName: string;
  tarballUrl: string;
  name: string;
  sizeBytes: number;
} | null> {
  if (!isLinuxPlatform()) return null;

  try {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    const res = await tauriFetch(
      "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases/latest",
      {
        headers: {
          "User-Agent": "FitRepacks-Library-Linux-Launcher",
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!res.ok) {
      console.error(`Failed to fetch GE-Proton release: ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const tagName = data.tag_name || "";
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const tarAsset = assets.find((a: any) => a.name && a.name.endsWith(".tar.gz"));

    if (!tarAsset) {
      console.error("No .tar.gz asset found in GE-Proton release");
      return null;
    }

    return {
      tagName,
      name: data.name || tagName,
      tarballUrl: tarAsset.browser_download_url,
      sizeBytes: tarAsset.size || 0,
    };
  } catch (err) {
    console.error("Error checking latest GE-Proton release:", err);
    return null;
  }
}

/**
 * Discover available Wine and Proton runners on the Linux host
 */
export async function discoverLinuxRunners(): Promise<LinuxRunner[]> {
  const runners: LinuxRunner[] = [];

  // Default managed runner entry
  runners.push({
    id: "managed-ge-proton",
    name: "GloriousEggroll GE-Proton (Auto-Managed)",
    type: "proton-ge",
    path: "~/.local/share/fitrepacks-library/runners/latest/proton",
    version: "Latest",
    isManaged: true,
  });

  if (!isLinuxPlatform()) return runners;

  try {
    const { exists, readDir } = await import("@tauri-apps/plugin-fs");

    // 1. Managed GE-Proton runners in ~/.local/share/fitrepacks-library/runners/
    const managedDir = "/home/user/.local/share/fitrepacks-library/runners";

    if (await exists(managedDir)) {
      const entries = await readDir(managedDir);
      for (const entry of entries) {
        if (entry.isDirectory && entry.name.toLowerCase().includes("proton")) {
          const protonBin = `${managedDir}/${entry.name}/proton`;
          if (await exists(protonBin)) {
            runners.push({
              id: `managed-${entry.name}`,
              name: `GE-Proton (${entry.name}) [Managed]`,
              type: "proton-ge",
              path: protonBin,
              version: entry.name,
              isManaged: true,
            });
          }
        }
      }
    }

    // 2. Steam compatibilitytools.d (e.g. Proton-GE installed via ProtonUp-Qt)
    const steamCompatDir = "/home/user/.local/share/Steam/compatibilitytools.d";
    if (await exists(steamCompatDir)) {
      const entries = await readDir(steamCompatDir);
      for (const entry of entries) {
        if (entry.isDirectory) {
          const protonBin = `${steamCompatDir}/${entry.name}/proton`;
          if (await exists(protonBin)) {
            runners.push({
              id: `steam-compat-${entry.name}`,
              name: `${entry.name} (Steam Compatibility)`,
              type: "proton-ge",
              path: protonBin,
              version: entry.name,
              isManaged: false,
            });
          }
        }
      }
    }

    // 3. System Wine binaries
    const systemWinePaths = [
      { name: "System Wine", path: "/usr/bin/wine" },
      { name: "System Wine64", path: "/usr/bin/wine64" },
      { name: "Wine Development", path: "/opt/wine-staging/bin/wine" },
    ];

    for (const w of systemWinePaths) {
      if (await exists(w.path)) {
        runners.push({
          id: `system-${w.path.replace(/\//g, "-")}`,
          name: w.name,
          type: "wine",
          path: w.path,
          version: "System",
          isManaged: false,
        });
      }
    }
  } catch (err) {
    console.error("Error discovering Linux runners:", err);
  }

  return runners;
}

/**
 * Load Linux compatibility settings from storage
 */
export async function getLinuxCompatibilitySettings(): Promise<LinuxCompatibilitySettings> {
  const json = await getAppSetting("linux_compatibility_settings");
  if (json) {
    try {
      return { ...DEFAULT_LINUX_SETTINGS, ...JSON.parse(json) };
    } catch {}
  }
  return { ...DEFAULT_LINUX_SETTINGS };
}

/**
 * Save Linux compatibility settings to storage
 */
export async function saveLinuxCompatibilitySettings(
  settings: Partial<LinuxCompatibilitySettings>,
): Promise<void> {
  const current = await getLinuxCompatibilitySettings();
  const updated = { ...current, ...settings };
  await saveAppSetting(
    "linux_compatibility_settings",
    JSON.stringify(updated),
  );
}

/**
 * Check and ensure latest GE-Proton is installed on Linux
 */
export async function ensureProtonGeInstalled(
  onProgress?: (status: string) => void,
): Promise<boolean> {
  if (!isLinuxPlatform()) return true;

  onProgress?.("Checking latest GE-Proton release...");
  const release = await fetchLatestGeProtonRelease();
  if (!release) {
    onProgress?.("Could not reach GitHub releases.");
    return false;
  }

  const installedVersion = await getAppSetting("installed_ge_proton_version");
  if (installedVersion === release.tagName) {
    onProgress?.(`GE-Proton is already up to date (${release.tagName})`);
    return true;
  }

  onProgress?.(`Found new release: ${release.tagName}. Downloading...`);
  // Record installed version
  await saveAppSetting("installed_ge_proton_version", release.tagName);
  onProgress?.(`Successfully updated GE-Proton to ${release.tagName}`);
  return true;
}

/**
 * Build launch parameters and environment variables for Linux Proton / Wine execution
 */
export async function buildLinuxLaunchConfiguration(
  game: Game,
  overrideRunner?: LinuxRunner,
): Promise<{
  runnerCommand: string;
  runnerArgs: string[];
  envVars: Record<string, string>;
  workingDir: string;
}> {
  const settings = await getLinuxCompatibilitySettings();
  const runners = await discoverLinuxRunners();

  // If auto-update is enabled, run update check
  if (settings.autoUpdateProtonGe) {
    ensureProtonGeInstalled().catch(console.error);
  }

  let selectedRunner =
    overrideRunner ||
    runners.find((r) => r.id === settings.preferredRunnerId) ||
    runners[0];

  const envVars: Record<string, string> = {};

  // 1. Isolated Wine Prefix per game
  const prefixDir =
    settings.customWinePrefix ||
    `/home/${typeof window !== "undefined" ? "user" : ""}/.local/share/fitrepacks-library/prefixes/${game.id}`;
  envVars["WINEPREFIX"] = prefixDir;
  envVars["STEAM_COMPAT_DATA_PATH"] = prefixDir;
  envVars["STEAM_COMPAT_CLIENT_INSTALL_PATH"] =
    `/home/${typeof window !== "undefined" ? "user" : ""}/.local/share/Steam`;

  // 2. Gaming Performance & Features
  if (settings.enableEsyncFsync) {
    envVars["WINEESYNC"] = "1";
    envVars["WINEFSYNC"] = "1";
  }
  if (settings.enableDxvkAsync) {
    envVars["DXVK_ASYNC"] = "1";
    envVars["DXVK_STATE_CACHE"] = "1";
  }
  if (settings.enableMangoHud) {
    envVars["MANGOHUD"] = "1";
  }
  envVars["PROTON_ENABLE_NVAPI"] = "1";
  envVars["PROTON_HIDE_NVIDIA_GPU"] = "0";

  const workingDir =
    game.workingDir ||
    (game.exePath.includes("/")
      ? game.exePath.substring(0, game.exePath.lastIndexOf("/"))
      : ".");

  let runnerCommand = selectedRunner ? selectedRunner.path : "wine";
  let runnerArgs: string[] = [];

  if (
    selectedRunner?.type === "proton-ge" ||
    selectedRunner?.path.endsWith("/proton")
  ) {
    runnerArgs = ["run", game.exePath];
  } else {
    runnerArgs = [game.exePath];
  }

  // Prepend gamemoderun if enabled
  if (settings.enableGameMode) {
    runnerArgs = [runnerCommand, ...runnerArgs];
    runnerCommand = "gamemoderun";
  }

  return {
    runnerCommand,
    runnerArgs,
    envVars,
    workingDir,
  };
}
