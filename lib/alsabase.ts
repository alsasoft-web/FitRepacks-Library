import AlsaBase from "alsabase";

export const DEFAULT_ALSABASE_URL = process.env.NEXT_PUBLIC_ALSABASE_URL||"";

const rawUrl = process.env.NEXT_PUBLIC_ALSABASE_URL;
const ALSABASE_URL =
  rawUrl && rawUrl.trim() !== "" ? rawUrl.trim() : DEFAULT_ALSABASE_URL;

export const ab = new AlsaBase(ALSABASE_URL);

// In Tauri desktop environment, provide automatic fallback to native @tauri-apps/plugin-http
// if window.fetch in WebView2 fails due to network isolation, CORS, or DNS resolution
if (typeof window !== "undefined") {
  const originalSend = ab.send.bind(ab);
  ab.send = async (path: string, options: any = {}) => {
    try {
      return await originalSend(path, options);
    } catch (err: any) {
      if ("__TAURI_INTERNALS__" in window) {
        try {
          const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
          const url = ab.buildUrl(path, options.query || options.params);
          const headers: Record<string, string> = {
            ...(options.headers || {}),
          };
          if (
            !headers["Authorization"] &&
            !headers["authorization"] &&
            ab.authStore.token
          ) {
            headers["Authorization"] = `Bearer ${ab.authStore.token}`;
          }

          let body = options.body;
          if (
            body !== undefined &&
            body !== null &&
            typeof body === "object" &&
            typeof body.append !== "function"
          ) {
            if (!headers["Content-Type"] && !headers["content-type"]) {
              headers["Content-Type"] = "application/json";
            }
            body = JSON.stringify(body);
          }

          const resp = await tauriFetch(url, {
            method: options.method || "GET",
            headers,
            body,
            signal: options.signal,
          });

          const contentType = resp.headers.get("content-type") || "";
          let data = null;
          if (contentType.includes("application/json")) {
            data = await resp.json().catch(() => null);
          } else {
            data = await resp.text().catch(() => null);
          }

          if (!resp.ok) {
            throw err;
          }
          return data;
        } catch (_) {
          throw err;
        }
      }
      throw err;
    }
  };
}

export default ab;
