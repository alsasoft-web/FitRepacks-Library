/**
 * Opens a URL in the user's default system web browser (Chrome, Firefox, Edge, etc.)
 * using Tauri v2's plugin-opener, with graceful web browser fallback.
 */
export async function openInBrowser(url?: string): Promise<void> {
  if (!url || typeof url !== "string") return;
  const target = url.trim();
  if (!target) return;

  try {
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(target);
      return;
    }
  } catch (err) {
    console.warn("Failed to open URL via @tauri-apps/plugin-opener:", err);
  }

  if (typeof window !== "undefined") {
    window.open(target, "_blank", "noopener,noreferrer");
  }
}
