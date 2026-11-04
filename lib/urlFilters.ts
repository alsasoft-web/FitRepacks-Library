/**
 * URL Filtering and hoster recognition utilities
 */

export function isMediaOrBadDownloadUrl(url?: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    // Check media / image extensions
    if (
      /\.(jpe?g|png|webp|gif|svg|bmp|ico|tiff?|mp4|webm|mkv|avi)(\?.*)?$/i.test(
        path,
      )
    ) {
      return true;
    }

    // Check known image / screenshot hosts
    if (
      host.includes("steamstatic.com") ||
      host.includes("steampowered.com") ||
      host.includes("steamuserimages") ||
      host.includes("steamusercontent.com") ||
      host.includes("media-amazon.com") ||
      host.includes("ssl-images-amazon") ||
      host.includes("images-amazon") ||
      host.includes("imageban.ru") ||
      host.includes("postimg.cc") ||
      host.includes("postimages.org") ||
      host.includes("imgur.com") ||
      host.includes("imgbox.com") ||
      host.includes("fastly.net") ||
      host.includes("ibb.co") ||
      host.includes("igdb.com") ||
      host.includes("halocdn.com") ||
      host.includes("gog-statics.com") ||
      host.includes("riotpixels.net") ||
      host.includes("riotpixels.com")
    ) {
      return true;
    }

    // Check non-download domains (HOST ONLY, so files named Game-SteamRIP.com.rar are preserved!)
    const badHosts = [
      "steamrip.com",
      "discord.gg",
      "discord.com",
      "reddit.com",
      "t.me",
      "telegram.me",
      "paypal.com",
      "paypal.me",
      "patreon.com",
      "ko-fi.com",
      "twitter.com",
      "x.com",
      "youtube.com",
      "youtu.be",
      "twitch.tv",
      "facebook.com",
      "instagram.com",
      "tiktok.com",
      "microsoft.com",
      "s-microsoft.com",
      "playstation.com",
      "epicgames.com",
      "xbox.com",
      "origin.com",
      "ea.com",
      "ubisoft.com",
      "unrealengine.com",
      "github.com",
      "internetdownloadmanager.com",
      "wikipedia.org",
      "fandom.com",
      "imdb.com",
      "support.hytale.com",
    ];

    if (badHosts.some((bh) => host === bh || host.endsWith("." + bh))) {
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Returns true if the URL or hoster requires special referrer handling (e.g. MegaDB)
 */
export function isReferrerRestrictedUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("megadb.net");
  } catch {
    return url.includes("megadb.net");
  }
}

