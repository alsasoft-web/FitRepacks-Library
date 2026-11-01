export type ActiveTab =
  | "library"
  | "analytics"
  | "repacks"
  | "steamrip"
  | "downloads"
  | "controllers"
  | "settings"
  | "scanner";


export type ViewMode = "grid" | "list";

export type SortOption =
  | "title-asc"
  | "title-desc"
  | "playtime-desc"
  | "playtime-asc"
  | "release-desc"
  | "release-asc"
  | "added-desc"
  | "recent"
  | "added-asc"
  | "rating-desc"
  | "size-desc"
  | "size-asc";

/**
 * Helper to parse file size string (e.g. "45.2 GB", "850 MB", "12.4 GB ~ 28.1 GB") to MB
 */
export function parseSizeToMB(sizeStr?: string | null): number {
  if (!sizeStr) return 0;
  const matches = Array.from(
    sizeStr.matchAll(/([\d.,]+)\s*(TB|GB|MB|KB|B)\b/gi)
  );
  if (matches.length > 0) {
    let maxMB = 0;
    for (const m of matches) {
      const cleaned = m[1].trim();
      let num = NaN;
      if (cleaned.includes(",") && cleaned.includes(".")) {
        if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
          num = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
        } else {
          num = parseFloat(cleaned.replace(/,/g, ""));
        }
      } else if (cleaned.includes(",")) {
        const parts = cleaned.split(",");
        if (parts.length === 2 && parts[1].length !== 3) {
          num = parseFloat(cleaned.replace(",", "."));
        } else {
          num = parseFloat(cleaned.replace(/,/g, ""));
        }
      } else {
        num = parseFloat(cleaned);
      }
      if (isNaN(num)) continue;
      const unit = m[2].toUpperCase();
      let mb = num;
      if (unit === "TB") mb = num * 1024 * 1024;
      else if (unit === "GB") mb = num * 1024;
      else if (unit === "MB") mb = num;
      else if (unit === "KB") mb = num / 1024;
      else if (unit === "B") mb = num / (1024 * 1024);
      if (mb > maxMB) maxMB = mb;
    }
    return maxMB;
  }
  const numOnly = parseFloat(sizeStr.replace(/,/g, ""));
  return isNaN(numOnly) ? 0 : numOnly;
}

export interface IgdbGameMetadata {
  id: number;
  name: string;
  summary: string;
  storyline?: string;
  coverUrl: string;
  bannerUrl?: string;
  alternateCovers?: string[];
  screenshots: string[];
  videos: string[];
  genres: string[];
  rating?: number;
  releaseYear?: number;
  releaseDate?: string;
  developer?: string;
}

export interface PlaySession {
  id?: string;
  startTime: string;
  durationMinutes: number;
}

export interface GameUpdateInfo {
  hasUpdate: boolean;
  version?: string;
  source?: string;
  postTitle?: string;
  date?: string;
  url?: string;
}

import { RepackMirrorGroup, RepackUpdateLink } from "./repackTypes";

export interface Game {
  id: string;
  title: string;
  exePath: string;
  iconUrl?: string;
  bannerUrl?: string;
  coverUrl?: string;
  igdbId?: number;
  storyline?: string;
  summary?: string;
  genres?: string[];
  rating?: number;
  releaseYear?: number;
  releaseDate?: string;
  version?: string;
  installedVersion?: string;
  installedLastModified?: string;
  fitgirlVersion?: string;
  steamripVersion?: string;
  developer?: string;
  publisher?: string;
  screenshots?: string[];
  videos?: string[];
  uninstallerPath?: string;
  installDirectory?: string;
  workingDir?: string;
  playtimeMinutes: number;
  hoursPlayed?: number;
  lastPlayed?: string;
  dateAdded?: string;
  isFavorite?: boolean;
  isWishlisted?: boolean;
  isInstalled?: boolean;
  isCompleted?: boolean;
  completedAt?: string;
  notes?: string;
  source?: "fitgirl" | "steamrip" | "manual" | string;
  hasUpdate?: boolean;
  updateInfo?: GameUpdateInfo;
  tags?: string[];
  playSessions?: PlaySession[];
  mirrorGroups?: RepackMirrorGroup[];
  gameUpdates?: RepackUpdateLink[];
  repackSize?: string;
  fitgirlSize?: string;
  steamripSize?: string;
  repackUrl?: string;
  linkedFitgirlUrl?: string;
  linkedSteamripUrl?: string;
  fitgirlUploadDate?: string;
  steamripUploadDate?: string;
  ignoredUpdateDate?: string;
  isHypervisor?: boolean;
}

export interface ScannedExecutable {
  id: string;
  fileName: string;
  fullPath: string;
  detectedGameTitle: string;
  detectedRootFolder: string;
  isLikelyGameExe: boolean;
  igdbMatch?: IgdbGameMetadata;
}
