import { Game } from "./types";

const cachedImageUrls = new Set<string>();

export function cacheAllLibraryImages(games: Game[]): void {
  if (typeof window === "undefined" || !games || games.length === 0) return;

  const defer =
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 200);

  defer(() => {
    // Only cache un-cached images and process in small batches
    const toCache: string[] = [];
    for (const game of games) {
      if (game.coverUrl && !cachedImageUrls.has(game.coverUrl)) {
        cachedImageUrls.add(game.coverUrl);
        toCache.push(game.coverUrl);
      }
      if (game.bannerUrl && !cachedImageUrls.has(game.bannerUrl)) {
        cachedImageUrls.add(game.bannerUrl);
        toCache.push(game.bannerUrl);
      }
    }

    if (toCache.length === 0) return;

    // Load progressively so it never lags UI
    let i = 0;
    const loadNextChunk = () => {
      const chunk = toCache.slice(i, i + 5);
      i += 5;
      chunk.forEach((url) => {
        const img = new Image();
        img.src = url;
      });
      if (i < toCache.length) {
        setTimeout(loadNextChunk, 100);
      }
    };
    loadNextChunk();
  });
}
