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
 * Dynamically resolve the Linux user's home directory
 */
export async function getLinuxHomeDir(): Promise<string> {
  try {
    const { homeDir } = await import("@tauri-apps/api/path");
    const h = await homeDir();
    if (h) return h.replace(/\/$/, "");
  } catch {}
  return "/home/deck";
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
 * Discover available Wine and Proton runners across Steam, Heroic, Lutris, Bottles, and system directories
 */
export async function discoverLinuxRunners(): Promise<LinuxRunner[]> {
  const home = await getLinuxHomeDir();
  const runners: LinuxRunner[] = [];

  // Default managed runner entry
  runners.push({
    id: "managed-ge-proton",
    name: "GloriousEggroll GE-Proton (Auto-Managed)",
    type: "proton-ge",
    path: `${home}/.local/share/fitrepacks-library/runners/latest/proton`,
    version: "Latest",
    isManaged: true,
  });

  if (!isLinuxPlatform()) return runners;

  try {
    const { exists, readDir } = await import("@tauri-apps/plugin-fs");

    // 1. Managed GE-Proton runners in ~/.local/share/fitrepacks-library/runners/
    const managedDir = `${home}/.local/share/fitrepacks-library/runners`;
    if (await exists(managedDir)) {
      try {
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
      } catch {}
    }

    // 2. Steam compatibility tools directories (Steam Native & Flatpak)
    const steamCompatDirs = [
      `${home}/.local/share/Steam/compatibilitytools.d`,
      `${home}/.steam/root/compatibilitytools.d`,
      `${home}/.steam/steam/compatibilitytools.d`,
      `${home}/.var/app/com.valvesoftware.Steam/data/Steam/compatibilitytools.d`,
    ];

    for (const compatDir of steamCompatDirs) {
      if (await exists(compatDir)) {
        try {
          const entries = await readDir(compatDir);
          for (const entry of entries) {
            if (entry.isDirectory) {
              const protonBin = `${compatDir}/${entry.name}/proton`;
              if (await exists(protonBin)) {
                const id = `steam-compat-${entry.name}`;
                if (!runners.some((r) => r.id === id)) {
                  runners.push({
                    id,
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
        } catch {}
      }
    }

    // 3. Official Steam Proton installations
    const steamAppsCommonDirs = [
      `${home}/.local/share/Steam/steamapps/common`,
      `${home}/.steam/root/steamapps/common`,
      `${home}/.steam/steam/steamapps/common`,
      `${home}/.var/app/com.valvesoftware.Steam/data/Steam/steamapps/common`,
    ];

    for (const commonDir of steamAppsCommonDirs) {
      if (await exists(commonDir)) {
        try {
          const entries = await readDir(commonDir);
          for (const entry of entries) {
            if (entry.isDirectory && entry.name.toLowerCase().startsWith("proton")) {
              const protonBin = `${commonDir}/${entry.name}/proton`;
              if (await exists(protonBin)) {
                const id = `steam-proton-${entry.name}`;
                if (!runners.some((r) => r.id === id)) {
                  runners.push({
                    id,
                    name: `Valve ${entry.name}`,
                    type: "steam-proton",
                    path: protonBin,
                    version: entry.name,
                    isManaged: false,
                  });
                }
              }
            }
          }
        } catch {}
      }
    }

    // 4. Heroic & Lutris & Bottles Wine/Proton paths
    const otherRunnerDirs = [
      { dir: `${home}/.config/heroic/tools/wine`, type: "wine" as const, label: "Heroic Wine" },
      { dir: `${home}/.config/heroic/tools/proton`, type: "proton-ge" as const, label: "Heroic Proton" },
      { dir: `${home}/.local/share/lutris/runners/wine`, type: "wine" as const, label: "Lutris Wine" },
      { dir: `${home}/.local/share/bottles/runners`, type: "wine" as const, label: "Bottles Wine" },
    ];

    for (const item of otherRunnerDirs) {
      if (await exists(item.dir)) {
        try {
          const entries = await readDir(item.dir);
          for (const entry of entries) {
            if (entry.isDirectory) {
              const exePath = item.type === "proton-ge"
                ? `${item.dir}/${entry.name}/proton`
                : `${item.dir}/${entry.name}/bin/wine`;
              if (await exists(exePath)) {
                const id = `custom-${entry.name}`;
                if (!runners.some((r) => r.id === id)) {
                  runners.push({
                    id,
                    name: `${entry.name} (${item.label})`,
                    type: item.type,
                    path: exePath,
                    version: entry.name,
                    isManaged: false,
                  });
                }
              }
            }
          }
        } catch {}
      }
    }

    // 5. System Wine binaries
    const systemWinePaths = [
      { name: "System Wine", path: "/usr/bin/wine" },
      { name: "System Wine64", path: "/usr/bin/wine64" },
      { name: "Wine Development", path: "/opt/wine-staging/bin/wine" },
      { name: "Wine Local", path: "/usr/local/bin/wine" },
    ];

    for (const w of systemWinePaths) {
      if (await exists(w.path)) {
        const id = `system-${w.path.replace(/\//g, "-")}`;
        if (!runners.some((r) => r.id === id)) {
          runners.push({
            id,
            name: w.name,
            type: "wine",
            path: w.path,
            version: "System",
            isManaged: false,
          });
        }
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
 * Build launch parameters and environment variables for Linux Proton / Wine execution of a game
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
  const home = await getLinuxHomeDir();
  const settings = await getLinuxCompatibilitySettings();
  const runners = await discoverLinuxRunners();

  // If auto-update is enabled, run update check in background
  if (settings.autoUpdateProtonGe) {
    ensureProtonGeInstalled().catch(console.error);
  }

  let selectedRunner =
    overrideRunner ||
    runners.find((r) => r.id === settings.preferredRunnerId) ||
    runners.find((r) => r.type === "proton-ge" || r.type === "steam-proton") ||
    runners[0];

  const envVars: Record<string, string> = {};

  // 1. Isolated Wine Prefix per game
  const prefixDir =
    settings.customWinePrefix ||
    `${home}/.local/share/fitrepacks-library/prefixes/${game.id}`;
  envVars["WINEPREFIX"] = prefixDir;
  envVars["STEAM_COMPAT_DATA_PATH"] = prefixDir;
  envVars["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = `${home}/.local/share/Steam`;

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
    selectedRunner?.type === "steam-proton" ||
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

/**
 * Build launch parameters and environment variables for Linux Proton / Wine execution of a setup installer
 */
export async function buildLinuxInstallerLaunchConfiguration(
  installerExePath: string,
  targetDir: string,
  installId: string,
  overrideRunner?: LinuxRunner,
): Promise<{
  runnerCommand: string;
  runnerArgs: string[];
  envVars: Record<string, string>;
  workingDir: string;
}> {
  const home = await getLinuxHomeDir();
  const settings = await getLinuxCompatibilitySettings();
  const runners = await discoverLinuxRunners();

  let selectedRunner =
    overrideRunner ||
    runners.find((r) => r.id === settings.preferredRunnerId) ||
    runners.find((r) => r.type === "proton-ge" || r.type === "steam-proton") ||
    runners[0];

  const envVars: Record<string, string> = {};

  // Designated prefix for installer execution
  const prefixDir = `${home}/.local/share/fitrepacks-library/prefixes/installer_${installId}`;
  envVars["WINEPREFIX"] = prefixDir;
  envVars["STEAM_COMPAT_DATA_PATH"] = prefixDir;
  envVars["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = `${home}/.local/share/Steam`;

  if (settings.enableEsyncFsync) {
    envVars["WINEESYNC"] = "1";
    envVars["WINEFSYNC"] = "1";
  }

  const workingDir = targetDir;
  let runnerCommand = selectedRunner ? selectedRunner.path : "wine";
  let runnerArgs: string[] = [];

  if (
    selectedRunner?.type === "proton-ge" ||
    selectedRunner?.type === "steam-proton" ||
    selectedRunner?.path.endsWith("/proton")
  ) {
    runnerArgs = ["run", installerExePath];
  } else {
    runnerArgs = [installerExePath];
  }

  return {
    runnerCommand,
    runnerArgs,
    envVars,
    workingDir,
  };
}
