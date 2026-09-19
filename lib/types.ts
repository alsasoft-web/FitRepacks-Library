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
  | "rating-desc";

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
  repackUrl?: string;
  linkedFitgirlUrl?: string;
  linkedSteamripUrl?: string;
  fitgirlUploadDate?: string;
  steamripUploadDate?: string;
  ignoredUpdateDate?: string;
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
