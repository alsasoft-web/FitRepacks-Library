import { isMediaOrBadDownloadUrl } from "./urlFilters";
import { RepackPost, RepackMirrorGroup } from "./repackTypes";
import { saveSteamRipPosts, getSteamRipExistingIds } from "./db";

const WP_API_URL = "https://steamrip.com/wp-json/wp/v2/posts";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface SteamRipScrapeProgress {
  isRunning: boolean;
  currentPage: number;
  totalPages: number;
  totalScraped: number;
  newOrUpdatedCount: number;
  statusMessage: string;
  error?: string | null;
}

let scrapeState: SteamRipScrapeProgress = {
  isRunning: false,
  currentPage: 0,
  totalPages: 0,
  totalScraped: 0,
  newOrUpdatedCount: 0,
  statusMessage: "Idle",
  error: null,
};

let isScrapeCancellationRequested = false;
const listeners = new Set<(state: SteamRipScrapeProgress) => void>();

export function getSteamRipScrapeState(): SteamRipScrapeProgress {
  return { ...scrapeState };
}

export function subscribeSteamRipScrape(
  cb: (state: SteamRipScrapeProgress) => void,
): () => void {
  listeners.add(cb);
  cb({ ...scrapeState });
  return () => {
    listeners.delete(cb);
  };
}

function updateScrapeState(patch: Partial<SteamRipScrapeProgress>) {
  scrapeState = { ...scrapeState, ...patch };
  for (const listener of listeners) {
    try {
      listener({ ...scrapeState });
    } catch (_) {}
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("steamrip-scrape-progress", {
          detail: { ...scrapeState },
        }),
      );
    } catch (_) {}
  }
}

function cleanText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<\/?[^>]+(>|$)/g, "")
    .trim()
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"');
}

function normalizeUrl(u: string): string {
  if (!u) return "";
  let clean = u.toLowerCase().trim();
  clean = clean.replace(/^https?:\/\//, "https://");
  if (!clean.endsWith("/")) clean += "/";
  return clean;
}

export function parseSteamRipGamePost(post: any): RepackPost | null {
  try {
    if (!post || !post.link) return null;

    const gameUrl = post.link;
    const contentHtml = post.content?.rendered || "";

    const rawTitle = cleanText(post.title?.rendered || "")
      .replace(/\s*Free Download\s*/gi, " ")
      .trim();

    if (!rawTitle) return null;

    let id =
      post.slug ||
      gameUrl.replace(/https?:\/\/steamrip\.com\//, "").replace(/\/$/, "");

    if (
      !id ||
      id === "games-list" ||
      id === "games-list-page" ||
      id === "steps-for-games" ||
      id === "top-games" ||
      id === "updated-games" ||
      id === "about" ||
      id === "faq" ||
      id === "privacy" ||
      id === "contact" ||
      id === "dmca"
    ) {
      return null;
    }

    let date = new Date().toISOString();
    if (post.date_gmt) {
      const parsed = new Date(`${post.date_gmt}Z`);
      if (!isNaN(parsed.getTime())) date = parsed.toISOString();
    } else if (post.date) {
      const parsed = new Date(post.date);
      if (!isNaN(parsed.getTime())) date = parsed.toISOString();
    }

    let coverUrl = "";
    if (
      post.yoast_head_json?.og_image &&
      Array.isArray(post.yoast_head_json.og_image) &&
      post.yoast_head_json.og_image.length > 0
    ) {
      coverUrl = post.yoast_head_json.og_image[0].url || "";
    }

    if (!coverUrl) {
      const featMatch = contentHtml.match(
        /<figure[^>]*class="[^"]*single-featured-image[^"]*"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src)=["']([^"']+)["']/i,
      );
      if (featMatch) coverUrl = featMatch[1];
      else {
        const entryImgMatch = contentHtml.match(
          /<img[^>]+(?:src|data-src)=["']([^"']+)["']/i,
        );
        if (entryImgMatch) coverUrl = entryImgMatch[1];
      }
    }

    if (coverUrl.startsWith("//")) coverUrl = `https:${coverUrl}`;
    else if (coverUrl.startsWith("/"))
      coverUrl = `https://steamrip.com${coverUrl}`;

    const screenshots: string[] = [];
    const ssMatch = contentHtml.match(
      /<h[234][^>]*>[\s\S]*?SCREENSHOTS[\s\S]*?<\/h[234]>([\s\S]*?)(?:<h[234]|\bSYSTEM REQUIREMENTS\b|\bGAME INFO\b|<p\s+style="text-align:\s*center"|$)/i,
    );
    const screenshotHtmlToScan = ssMatch ? ssMatch[1] : contentHtml;
    const imgMatches = [
      ...screenshotHtmlToScan.matchAll(
        /(?:src|data-src|href)=["']([^"']+\.(?:jpg|png|jpeg|webp))(?:\?[^"']*)?["']/gi,
      ),
    ];
    for (const im of imgMatches) {
      let src = im[1];
      if (src.startsWith("//")) src = `https:${src}`;
      else if (src.startsWith("/")) src = `https://steamrip.com${src}`;
      if (
        src &&
        src !== coverUrl &&
        !screenshots.includes(src) &&
        !src.includes("site-logo") &&
        !src.includes("avatar") &&
        !src.includes("tie-")
      ) {
        screenshots.push(src);
      }
    }

    const genres: string[] = [];
    if (
      post.yoast_head_json?.articleSection &&
      Array.isArray(post.yoast_head_json.articleSection)
    ) {
      for (const section of post.yoast_head_json.articleSection) {
        const cleaned = cleanText(section);
        if (
          cleaned &&
          cleaned.toLowerCase() !== "uncategorized" &&
          !genres.includes(cleaned) &&
          isNaN(Number(cleaned))
        ) {
          genres.push(cleaned);
        }
      }
    }

    const catMatches = [
      ...contentHtml.matchAll(
        /<a[^>]*class="[^"]*post-cat[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
      ),
    ];
    for (const cm of catMatches) {
      const catName = cleanText(cm[1]);
      if (
        catName &&
        catName.toLowerCase() !== "uncategorized" &&
        !genres.includes(catName) &&
        isNaN(Number(catName))
      ) {
        genres.push(catName);
      }
    }

    let developer = "";
    let platform = "";
    let version = "";
    let releasedBy = "";
    let gameSize = "N/A";

    const liItems = [...contentHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    for (const li of liItems) {
      const text = cleanText(li[1]);
      if (!text) continue;
      if (/^Genre:/i.test(text)) {
        const genreVal = text.replace(/^Genre:/i, "").trim();
        genreVal.split(",").forEach((g) => {
          const trimmedG = g.trim();
          if (
            trimmedG &&
            trimmedG.toLowerCase() !== "uncategorized" &&
            !genres.includes(trimmedG) &&
            isNaN(Number(trimmedG))
          ) {
            genres.push(trimmedG);
          }
        });
      } else if (/^Developer:/i.test(text)) {
        developer = text.replace(/^Developer:/i, "").trim();
      } else if (/^Platform:/i.test(text)) {
        platform = text.replace(/^Platform:/i, "").trim();
      } else if (/^Game Size:/i.test(text)) {
        gameSize = text.replace(/^Game Size:/i, "").trim();
      } else if (/^Released By:/i.test(text)) {
        releasedBy = text.replace(/^Released By:/i, "").trim();
      } else if (/^Version:/i.test(text)) {
        version = text.replace(/^Version:/i, "").trim();
      }
    }

    if (gameSize === "N/A") {
      const sizeMatch =
        contentHtml.match(/<strong>Game Size:<\/strong>\s*([^<]+)/i) ||
        contentHtml.match(/Game Size:<\/strong>\s*([^<]+)/i) ||
        contentHtml.match(/Game Size:?\s*([\d.,]+\s*(?:GB|MB|TB))/i);
      if (sizeMatch) gameSize = cleanText(sizeMatch[1]);
    }

    const companyParts = [developer, releasedBy].filter(Boolean).join(" / ");
    const companies = companyParts ? `Developer: ${companyParts}` : "SteamRIP";

    const downloadLinks: Array<{ name: string; url: string; sourceUrl?: string }> = [];
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = aRegex.exec(contentHtml)) !== null) {
      let href = match[1];
      if (href.startsWith("//")) href = `https:${href}`;
      if (!href.startsWith("http")) continue;

      if (isMediaOrBadDownloadUrl(href)) {
        if (
          (/\.(jpe?g|png|webp)(\?.*)?$/i.test(href) || href.includes("steamstatic.com")) &&
          href !== coverUrl &&
          !href.includes("site-logo") &&
          !href.includes("avatar") &&
          !href.includes("tie-") &&
          !screenshots.includes(href)
        ) {
          screenshots.push(href);
        }
        continue;
      }

      let providerName = "Mirror";
      try {
        const parsedUrl = new URL(href);
        const hostParts = parsedUrl.hostname.toLowerCase().split(".");
        const rawHost =
          hostParts.length > 1
            ? hostParts[hostParts.length - 2]
            : parsedUrl.hostname.toLowerCase();
        if (rawHost === "bzzhr" || rawHost === "buzzheavier")
          providerName = "BuzzHeavier";
        else if (rawHost === "gofile") providerName = "GoFile";
        else if (rawHost === "megadb" || rawHost === "mega")
          providerName = "MegaDB";
        else if (rawHost === "1fichier") providerName = "1Fichier";
        else if (rawHost === "qiwi") providerName = "Qiwi";
        else if (parsedUrl.hostname.toLowerCase().includes("fileditch"))
          providerName = "FileDitch";
        else if (rawHost === "datanodes") providerName = "DataNodes";
        else if (rawHost === "pixeldrain") providerName = "PixelDrain";
        else if (rawHost === "vikingfile") providerName = "VikingFile";
        else if (rawHost === "krakenfiles") providerName = "KrakenFiles";
        else if (rawHost === "rapidgator") providerName = "Rapidgator";
        else if (rawHost === "ddownload") providerName = "DDownload";
        else if (rawHost === "mediafire") providerName = "MediaFire";
        else if (rawHost === "filecrypt") providerName = "FileCrypt";
        else providerName = rawHost.charAt(0).toUpperCase() + rawHost.slice(1);
      } catch (_) {}

      if (!downloadLinks.some((l) => l.url === href)) {
        downloadLinks.push({
          name: providerName,
          url: href,
          sourceUrl: normalizeUrl(gameUrl),
        });
      }
    }

    const mirrorGroups: RepackMirrorGroup[] = [];
    if (downloadLinks.length > 0) {
      mirrorGroups.push({
        category: "Direct Download Links",
        links: downloadLinks,
      });
    }

    const pMatches = [...contentHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    const paragraphs: string[] = [];
    for (const pm of pMatches) {
      const pText = cleanText(pm[1]);
      if (
        pText &&
        !pText.includes("GOFILE") &&
        !pText.includes("BZZHR") &&
        !pText.includes("DOWNLOAD HERE") &&
        !pText.includes("SCREENSHOTS")
      ) {
        paragraphs.push(pText);
      }
    }
    let description = paragraphs.join("\n\n");
    if (description.length > 1000)
      description = description.substring(0, 1000) + "...";

    return {
      id,
      title: rawTitle,
      url: normalizeUrl(gameUrl),
      coverUrl,
      repackSize: gameSize,
      originalSize: gameSize,
      genres,
      companies,
      languages: "English",
      description,
      screenshots: screenshots.slice(0, 15),
      videos: [],
      mirrorGroups,
      gameUpdates: [],
      date,
      isRead: false,
      scrapedAt: new Date().toISOString(),
      source: "steamrip",
    };
  } catch (err: any) {
    console.error("Error parsing SteamRIP post:", err);
    return null;
  }
}

async function fetchHttp(url: string): Promise<{ data: any; headers: Record<string, string> }> {
  let rawText = "";
  let headersMap: Record<string, string> = {};
  let statusCode = 200;

  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const resp = await invoke<{
        status: number;
        body: string;
        headers: Record<string, string>;
      }>("fetch_http_url", {
        url,
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://steamrip.com/",
        },
      });

      statusCode = resp.status;
      headersMap = resp.headers || {};
      rawText = resp.body || "";

      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`HTTP ${statusCode}: ${rawText.slice(0, 150)}`);
      }
    } catch (invokeErr: any) {
      console.warn("fetch_http_url invoke failed, attempting fallback:", invokeErr);
      try {
        const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
        const resp = await tauriFetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        statusCode = resp.status;
        resp.headers.forEach((value, key) => {
          headersMap[key.toLowerCase()] = value;
        });

        rawText = await resp.text();
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
      } catch (pluginErr) {
        const resp = await fetch(url, {
          headers: {
            Accept: "application/json",
          },
        });
        statusCode = resp.status;
        resp.headers.forEach((value, key) => {
          headersMap[key.toLowerCase()] = value;
        });
        rawText = await resp.text();
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
      }
    }
  } else {
    const resp = await fetch(url);
    statusCode = resp.status;
    resp.headers.forEach((value, key) => {
      headersMap[key.toLowerCase()] = value;
    });
    rawText = await resp.text();
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
  }

  const trimmed = rawText.trim();
  if (trimmed.startsWith("<")) {
    throw new Error(
      `Received HTML from SteamRIP instead of JSON (HTTP ${statusCode}). Cloudflare challenge or endpoint error.`
    );
  }

  const data = JSON.parse(rawText);
  return { data, headers: headersMap };
}

export async function startSteamRipScrape(options?: {
  maxPages?: number;
}): Promise<void> {
  if (scrapeState.isRunning) {
    console.warn("SteamRIP scrape is already running.");
    return;
  }

  isScrapeCancellationRequested = false;
  updateScrapeState({
    isRunning: true,
    currentPage: 0,
    totalPages: 1,
    totalScraped: 0,
    newOrUpdatedCount: 0,
    statusMessage: "Connecting to SteamRIP...",
    error: null,
  });

  const perPage = 100;
  let determinedTotalPages = options?.maxPages || 50;
  let totalProcessed = 0;
  let completedPagesCount = 0;
  let lastUiEventTime = Date.now();

  const triggerUiEvent = (force = false) => {
    const now = Date.now();
    if (typeof window !== "undefined" && (force || now - lastUiEventTime > 2000)) {
      lastUiEventTime = now;
      window.dispatchEvent(new CustomEvent("steamrip-data-updated"));
    }
  };

  try {
    // 1. Fetch page 1 first to determine total pages and show initial results
    updateScrapeState({
      currentPage: 1,
      totalPages: determinedTotalPages,
      statusMessage: `Fetching page 1 of ${determinedTotalPages}...`,
    });

    const page1Url = `${WP_API_URL}?per_page=${perPage}&page=1&_fields=id,date,date_gmt,slug,link,title,content,yoast_head_json`;
    const { data: page1Posts, headers } = await fetchHttp(page1Url);

    const headerTotalPages =
      headers["x-wp-totalpages"] || headers["x-wp-total-pages"];
    if (headerTotalPages) {
      const parsedPages = parseInt(headerTotalPages, 10);
      if (!isNaN(parsedPages) && parsedPages > 0) {
        determinedTotalPages = options?.maxPages
          ? Math.min(options.maxPages, parsedPages)
          : parsedPages;
      }
    }

    if (Array.isArray(page1Posts) && page1Posts.length > 0) {
      const parsedBatch: RepackPost[] = [];
      for (const rawPost of page1Posts) {
        const parsed = parseSteamRipGamePost(rawPost);
        if (parsed) parsedBatch.push(parsed);
      }
      if (parsedBatch.length > 0) {
        await saveSteamRipPosts(parsedBatch);
        totalProcessed += parsedBatch.length;
      }
    }

    completedPagesCount = 1;
    updateScrapeState({
      currentPage: 1,
      totalPages: determinedTotalPages,
      totalScraped: totalProcessed,
      newOrUpdatedCount: totalProcessed,
      statusMessage: `Scraped page 1 of ${determinedTotalPages} (${totalProcessed} games saved)`,
    });
    triggerUiEvent(true);

    // 2. Fetch remaining pages with concurrency pool
    const remainingPages: number[] = [];
    for (let p = 2; p <= determinedTotalPages; p++) {
      if (options?.maxPages && p > options.maxPages) break;
      remainingPages.push(p);
    }

    if (remainingPages.length > 0 && !isScrapeCancellationRequested) {
      const CONCURRENCY = 4;
      let nextPageIndex = 0;

      async function worker() {
        while (nextPageIndex < remainingPages.length && !isScrapeCancellationRequested) {
          const currentPageNum = remainingPages[nextPageIndex++];
          try {
            const pageUrl = `${WP_API_URL}?per_page=${perPage}&page=${currentPageNum}&_fields=id,date,date_gmt,slug,link,title,content,yoast_head_json`;
            const { data: posts } = await fetchHttp(pageUrl);

            if (Array.isArray(posts) && posts.length > 0 && !isScrapeCancellationRequested) {
              const batch: RepackPost[] = [];
              for (const rawPost of posts) {
                const parsed = parseSteamRipGamePost(rawPost);
                if (parsed) batch.push(parsed);
              }

              if (batch.length > 0 && !isScrapeCancellationRequested) {
                await saveSteamRipPosts(batch);
                totalProcessed += batch.length;
              }
            }

            completedPagesCount++;
            updateScrapeState({
              currentPage: completedPagesCount,
              totalPages: determinedTotalPages,
              totalScraped: totalProcessed,
              newOrUpdatedCount: totalProcessed,
              statusMessage: `Scraped ${completedPagesCount} of ${determinedTotalPages} pages (${totalProcessed} games saved)`,
            });
            triggerUiEvent(false);
          } catch (pageErr: any) {
            console.warn(`Error scraping page ${currentPageNum}:`, pageErr);
            completedPagesCount++;
            updateScrapeState({
              currentPage: completedPagesCount,
              totalPages: determinedTotalPages,
            });
          }
        }
      }

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, remainingPages.length) },
        () => worker()
      );
      await Promise.all(workers);
    }

    if (isScrapeCancellationRequested) {
      updateScrapeState({
        isRunning: false,
        statusMessage: `Scraping stopped. ${totalProcessed} games saved in local database.`,
      });
    } else {
      updateScrapeState({
        isRunning: false,
        statusMessage: `Scraping completed. ${totalProcessed} games saved in local database.`,
      });
    }
  } catch (err: any) {
    console.error("SteamRIP Scrape error:", err);
    updateScrapeState({
      isRunning: false,
      error: err?.message || String(err),
      statusMessage: `Scraping paused: ${err?.message || "Connection failed"}`,
    });
  } finally {
    isScrapeCancellationRequested = false;
    triggerUiEvent(true);
  }
}

export function stopSteamRipScrape(): void {
  if (!scrapeState.isRunning) return;
  isScrapeCancellationRequested = true;
  updateScrapeState({
    statusMessage: "Stopping scraper...",
  });
}

/**
 * Checks SteamRIP API for newly published posts that are not yet in the local database.
 * If new posts are discovered, they are parsed and stored in SQLite.
 */
export async function checkForNewSteamRipPosts(): Promise<{ newCount: number }> {
  if (scrapeState.isRunning) {
    return { newCount: 0 };
  }

  const existingIds = await getSteamRipExistingIds();
  const perPage = 50;
  let page = 1;
  const newPosts: RepackPost[] = [];
  const maxPages = 5;

  while (page <= maxPages) {
    const pageUrl = `${WP_API_URL}?per_page=${perPage}&page=${page}&_fields=id,date,date_gmt,slug,link,title,content,yoast_head_json`;
    let posts: any[] = [];
    try {
      const res = await fetchHttp(pageUrl);
      posts = res.data;
    } catch (e) {
      console.warn(`checkForNewSteamRipPosts failed on page ${page}:`, e);
      break;
    }

    if (!Array.isArray(posts) || posts.length === 0) {
      break;
    }

    let foundExisting = false;
    for (const rawPost of posts) {
      const postId = String(rawPost.id || rawPost.link || rawPost.slug).trim();
      const postUrl = String(rawPost.link || "").trim();

      if (existingIds.has(postId) || (postUrl && existingIds.has(postUrl))) {
        foundExisting = true;
        continue;
      }

      const parsed = parseSteamRipGamePost(rawPost);
      if (parsed) {
        newPosts.push(parsed);
      }
    }

    if (foundExisting || newPosts.length === 0) {
      break;
    }

    page++;
  }

  if (newPosts.length > 0) {
    await saveSteamRipPosts(newPosts);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("steamrip-data-updated"));
    }
  }

  return { newCount: newPosts.length };
}
