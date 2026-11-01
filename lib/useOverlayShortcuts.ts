"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getMapOverlayShortcutSettings, MapOverlayShortcutSettings } from "./db";
import { toggleMapOverlay, isTauriEnvironment } from "./mapOverlay";
import { Game } from "./types";
import { findMatchingMap } from "./gameMaps";

export interface UseOverlayShortcutsOptions {
  activeGame?: Game | null;
  enabled?: boolean;
}

export function useOverlayShortcuts(options: UseOverlayShortcutsOptions = {}) {
  const { activeGame, enabled: enabledOverride } = options;
  const [settings, setSettings] = useState<MapOverlayShortcutSettings>(() =>
    getMapOverlayShortcutSettings()
  );
  const [connectedGamepad, setConnectedGamepad] = useState<string | null>(null);

  const isComboActiveRef = useRef(false);
  const lastTriggerTimeRef = useRef(0);
  const activeGameRef = useRef(activeGame);

  useEffect(() => {
    activeGameRef.current = activeGame;
    if (activeGame && typeof window !== "undefined") {
      try {
        localStorage.setItem("fitrepacks_active_game_slug", activeGame.id || activeGame.title);
        localStorage.setItem("fitrepacks_active_game_title", activeGame.title);
      } catch (_) {}
      if (Boolean((window as any).__TAURI_INTERNALS__)) {
        import("@tauri-apps/api/core").then(({ invoke }) => {
          invoke("set_active_overlay_game", {
            gameSlug: activeGame.id || activeGame.title,
            mapSlug: "default",
            gameTitle: activeGame.title,
          }).catch(() => {});
        });
      }
    }
  }, [activeGame]);

  // Sync settings when modified
  useEffect(() => {
    const handleSettingsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MapOverlayShortcutSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      } else {
        setSettings(getMapOverlayShortcutSettings());
      }
    };

    window.addEventListener("fitrepacks-overlay-shortcut-updated", handleSettingsUpdate);
    return () => {
      window.removeEventListener("fitrepacks-overlay-shortcut-updated", handleSettingsUpdate);
    };
  }, []);

  // Sync settings to native Tauri backend for system-wide in-game shortcut detection
  useEffect(() => {
    const isMasterEnabled = enabledOverride !== undefined ? enabledOverride : settings.enabled;
    if (typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__)) {
      import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke("update_overlay_shortcut_config", {
          config: {
            enabled: isMasterEnabled,
            keyboard_shortcut: settings.keyboardShortcut || "",
            controller_shortcut: settings.controllerShortcut || "",
          },
        }).catch(() => {});
      });
    }
  }, [settings, enabledOverride]);

  const triggerOverlayToggle = useCallback(async () => {
    const now = Date.now();
    if (now - lastTriggerTimeRef.current < 500) {
      return; // Debounce rapid triggers within window
    }

    if (typeof window !== "undefined") {
      try {
        const lastTs = Number(localStorage.getItem("fitrepacks_last_overlay_toggle_ts") || 0);
        if (now - lastTs < 500) {
          return; // Debounce triggers across multiple Tauri webviews/windows
        }
      } catch (_) {}
    }

    lastTriggerTimeRef.current = now;

    let targetGameSlug: string | undefined;
    let targetMapSlug: string | undefined;
    let targetGameTitle: string | undefined;

    const currentActive = activeGameRef.current;
    if (currentActive && settings.autoOpenForActiveGame) {
      const match = findMatchingMap(currentActive.title, currentActive.id);
      if (match) {
        targetGameSlug = match.game_slug || match.slug;
        targetMapSlug = match.map_slug || "default";
        targetGameTitle = match.game_title || match.title;
      } else {
        targetGameSlug = currentActive.id || currentActive.title;
        targetMapSlug = "default";
        targetGameTitle = currentActive.title;
      }
    }

    try {
      await toggleMapOverlay({
        gameSlug: targetGameSlug,
        mapSlug: targetMapSlug,
        gameTitle: targetGameTitle,
      });
    } catch (err) {
      console.warn("Failed to toggle map overlay via shortcut:", err);
    }
  }, [settings.autoOpenForActiveGame]);

  // Local window keyboard shortcut listener (fallback for browser / non-Tauri)
  useEffect(() => {
    // In Tauri, the Rust backend handles global keyboard shortcuts OS-wide natively
    if (isTauriEnvironment()) {
      return;
    }

    const isMasterEnabled = enabledOverride !== undefined ? enabledOverride : settings.enabled;
    if (!isMasterEnabled || settings.keyboardShortcut === "Disabled" || !settings.keyboardShortcut) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing shortcut if typing into input / textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const shortcut = settings.keyboardShortcut.trim();
      let matched = false;

      if (shortcut === "F9" && e.key === "F9") matched = true;
      else if (shortcut === "F8" && e.key === "F8") matched = true;
      else if (shortcut === "F10" && e.key === "F10") matched = true;
      else if (shortcut === "F11" && e.key === "F11") matched = true;
      else if (shortcut === "F7" && e.key === "F7") matched = true;
      else if (
        (shortcut === "Ctrl+M" || shortcut === "Ctrl + M") &&
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "m"
      ) {
        matched = true;
      } else if (
        (shortcut === "Alt+M" || shortcut === "Alt + M") &&
        e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "m"
      ) {
        matched = true;
      } else if (
        (shortcut === "Ctrl+Shift+M" || shortcut === "Ctrl + Shift + M") &&
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "m"
      ) {
        matched = true;
      }

      if (matched) {
        e.preventDefault();
        e.stopPropagation();
        triggerOverlayToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings.enabled, settings.keyboardShortcut, enabledOverride, triggerOverlayToggle]);

  // Gamepad controller shortcut poller
  useEffect(() => {
    const isMasterEnabled = enabledOverride !== undefined ? enabledOverride : settings.enabled;
    if (
      !isMasterEnabled ||
      settings.controllerShortcut === "Disabled" ||
      !settings.controllerShortcut ||
      typeof window === "undefined" ||
      typeof navigator.getGamepads !== "function"
    ) {
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;

    const checkGamepads = () => {
      const gamepads = navigator.getGamepads();
      let foundActivePad: Gamepad | null = null;

      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp && gp.connected) {
          foundActivePad = gp;
          break;
        }
      }

      if (foundActivePad) {
        setConnectedGamepad(foundActivePad.id || "Gamepad Connected");
      } else {
        setConnectedGamepad(null);
        isComboActiveRef.current = false;
        return;
      }

      let isPressed = false;
      const b = foundActivePad.buttons;
      const shortcut = settings.controllerShortcut;

      if (shortcut === "Select+Start" || shortcut === "Select + Start") {
        // Back/Select/Share (8) + Start/Options (9)
        isPressed = Boolean(b[8]?.pressed && b[9]?.pressed);
      } else if (shortcut === "Guide") {
        // Xbox / PlayStation / Home button (16)
        isPressed = Boolean(b[16]?.pressed);
      } else if (shortcut === "LB+RB+Down" || shortcut === "LB + RB + Down") {
        // LB/L1 (4) + RB/R1 (5) + D-Pad Down (13)
        isPressed = Boolean(b[4]?.pressed && b[5]?.pressed && b[13]?.pressed);
      } else if (shortcut === "LT+RT+Down" || shortcut === "LT + RT + Down") {
        // LT/L2 (6) + RT/R2 (7) + D-Pad Down (13)
        const lt = typeof b[6]?.value === "number" ? b[6].value > 0.5 : b[6]?.pressed;
        const rt = typeof b[7]?.value === "number" ? b[7].value > 0.5 : b[7]?.pressed;
        isPressed = Boolean(lt && rt && b[13]?.pressed);
      }

      if (isPressed) {
        if (!isComboActiveRef.current) {
          isComboActiveRef.current = true;
          if (!isTauriEnvironment()) {
            triggerOverlayToggle();
          }
        }
      } else {
        isComboActiveRef.current = false;
      }
    };

    intervalId = setInterval(checkGamepads, 32); // ~30 FPS poll

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [settings.enabled, settings.controllerShortcut, enabledOverride, triggerOverlayToggle]);

  return {
    settings,
    connectedGamepad,
    triggerOverlayToggle,
  };
}
