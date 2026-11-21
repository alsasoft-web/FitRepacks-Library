export interface RepackNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  image?: string;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Check if notification permission is granted across Tauri and Web environments
 */
async function checkNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") {return false;}

  if (isTauri()) {
    try {
      const { isPermissionGranted } = await import(
        "@tauri-apps/plugin-notification"
      );
      return await isPermissionGranted();
    } catch (err) {
      console.warn("Tauri notification isPermissionGranted check failed:", err);
    }
  }

  if ("Notification" in window) {
    return Notification.permission === "granted";
  }

  return false;
}

/**
 * Request notification permissions from the user
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") {return false;}

  if (isTauri()) {
    try {
      const { isPermissionGranted, requestPermission } = await import(
        "@tauri-apps/plugin-notification"
      );
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      return granted;
    } catch (err) {
      console.warn("Tauri requestPermission failed:", err);
    }
  }

  if ("Notification" in window) {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  }

  return false;
}

/**
 * Send a desktop / Windows notification
 */
export async function sendDesktopNotification(
  payload: RepackNotificationPayload,
): Promise<boolean> {
  if (typeof window === "undefined") {return false;}

  const { title, body, icon, image } = payload;
  if (process.env.NODE_ENV === "development") {
    console.log("[sendDesktopNotification] Sending notification:", { title, body });
  }

  if (isTauri()) {
    try {
      const plugin = await import("@tauri-apps/plugin-notification");
      const { invoke } = await import("@tauri-apps/api/core");

      try {
        const isGranted = await plugin.isPermissionGranted();
        if (!isGranted) {
          const perm = await plugin.requestPermission();
          console.log("[sendDesktopNotification] Permission request result:", perm);
        }
      } catch (pErr) {
        console.warn("[sendDesktopNotification] Permission check:", pErr);
      }

      const targetImage = image || (icon && icon.startsWith("http") ? icon : undefined);

      // Prefer native rich Windows toast (supports hero cover image + app icon)
      try {
        await invoke("send_rich_notification", {
          title,
          body,
          imageUrl: targetImage ?? null,
        });
        console.log("[sendDesktopNotification] Tauri send_rich_notification succeeded.");
        return true;
      } catch (richErr) {
        console.warn("[sendDesktopNotification] Rich toast unavailable, falling back to plugin:", richErr);
      }

      let appIconPath: string | undefined;
      let attachmentPath: string | undefined;

      try {
        appIconPath = await invoke<string>("prepare_notification_image", {
          imageUrl: icon && !icon.startsWith("/") ? icon : null,
        });
        if (targetImage) {
          attachmentPath = await invoke<string>("prepare_notification_image", {
            imageUrl: targetImage,
          });
        }
      } catch (imgErr) {
        console.warn("[sendDesktopNotification] Image prep failed:", imgErr);
      }

      const fileUri = (p: string) => {
        const normalized = p.replace(/\\/g, "/");
        return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
      };

      const heroOrLogo = attachmentPath || appIconPath;

      plugin.sendNotification({
        title,
        body,
        icon: appIconPath,
        attachments: heroOrLogo
          ? [{ id: "cover", url: fileUri(heroOrLogo) }]
          : undefined,
      });
      console.log("[sendDesktopNotification] Tauri sendNotification succeeded.");
      return true;
    } catch (err) {
      console.warn("Failed to send Tauri notification, trying web fallback:", err);
    }
  }

  // Fallback to Web Notification API
  if ("Notification" in window) {
    try {
      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: icon || "/favicon.svg",
        });
        console.log("[sendDesktopNotification] Web Notification sent.");
        return true;
      } else if (Notification.permission !== "denied") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
          new Notification(title, {
            body,
            icon: icon || "/favicon.svg",
          });
          console.log("[sendDesktopNotification] Web Notification sent after grant.");
          return true;
        }
      }
    } catch (err) {
      console.error("Failed to send web notification:", err);
    }
  }

  return false;
}
