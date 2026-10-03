import { openUrl } from "@tauri-apps/plugin-opener";

export async function openInBrowser(url?: string): Promise<void> {
  const target = url?.trim();
  if (!target) return;
  try {
    await openUrl(target);
  } catch {
    if (typeof window !== "undefined") {
      window.open(target, "_blank", "noopener,noreferrer");
    }
  }
}
