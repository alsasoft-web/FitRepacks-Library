interface RepackMirror {
  name: string;
  url: string;
}

export interface RepackMirrorGroup {
  category: string; // e.g. "Torrents", "Direct Links", "Filehosters"
  links: RepackMirror[];
}

export interface RepackUpdateLink {
  title: string;
  url: string;
  notes?: string;
}

export interface RepackPost {
  id: string; // canonical slug / link key
  title: string;
  url: string;
  coverUrl: string;
  repackSize: string;
  originalSize: string;
  genres: string[];
  companies: string;
  languages: string;
  description: string;
  screenshots: string[];
  videos: string[];
  mirrorGroups: RepackMirrorGroup[];
  gameUpdates: RepackUpdateLink[];
  date: string;
  isRead: boolean;
  scrapedAt: string;
  topMonthlyRank?: number;
  source?: string;
  topYearlyRank?: number;
  isHypervisor?: boolean;
}

/**
 * Format folder name as `game-name [Fitgirl-Repacks] version` (or `[SteamRIP]`)
 * and sanitize illegal Windows filename characters.
 */
export function formatRepackFolderName(
  title: string,
  source: string = "Fitgirl-Repacks",
): string {
  if (!title) return `Game [${source}]`;

  // Standardize source tag
  const cleanSource = source.toLowerCase().includes("steamrip")
    ? "SteamRIP"
    : "Fitgirl-Repacks";

  // Split on standard separators like '–', '-', '—', '+'
  const parts = title.split(/\s+[–—-]\s+/);
  let gameName = parts[0]?.trim() || title.trim();
  let version = "";

  if (parts.length > 1) {
    const rest = parts.slice(1).join(" ").trim();
    const verMatch = rest.match(
      /(v?\d+(\.\d+)+[a-z0-9_]*|\bv\d+\b|Build\s*\d+|v\d{4}\.\d{2}\.\d{2})/i,
    );
    if (verMatch) {
      version = verMatch[0];
    }
  } else {
    const verMatch = title.match(
      /(v\d+(\.\d+)+[a-z0-9_]*|\bv\d+\b|Build\s*\d+|v\d{4}\.\d{2}\.\d{2})/i,
    );
    if (verMatch) {
      version = verMatch[0];
      gameName = title
        .replace(verMatch[0], "")
        .replace(/\s+[–—-]\s*$/, "")
        .trim();
    }
  }

  // Sanitize Windows illegal path characters
  const cleanGameName = gameName.replace(/[<>:"/\\|?*]+/g, "").trim();
  const cleanVersion = version.replace(/[<>:"/\\|?*]+/g, "").trim();

  if (cleanVersion) {
    return `${cleanGameName} [${cleanSource}] ${cleanVersion}`;
  }
  return `${cleanGameName} [${cleanSource}]`;
}
