"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { LivePlayerPosition } from "../components/maps/types";

export interface UseLiveGameTrackerOptions {
  gameSlug?: string;
  mapSlug?: string;
  autoStart?: boolean;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

export function useLiveGameTracker({
  gameSlug,
  mapSlug = "default",
  autoStart = false,
}: UseLiveGameTrackerOptions) {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(autoStart);
  const [followPlayer, setFollowPlayer] = useState<boolean>(true);
  const [selectedPointerId, setSelectedPointerId] = useState<string | null>(null);
  const [position, setPosition] = useState<LivePlayerPosition | null>(null);

  // Check if live tracking is supported for the current game
  useEffect(() => {
    let isMounted = true;

    async function checkSupport() {
      if (!gameSlug || !isTauri()) {
        setIsSupported(false);
        return;
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const supported = await invoke<boolean>("is_live_tracking_supported", {
          gameSlug,
        });
        if (isMounted) {
          setIsSupported(Boolean(supported));
        }
      } catch (err) {
        if (isMounted) {
          setIsSupported(false);
        }
      }
    }

    checkSupport();

    return () => {
      isMounted = false;
    };
  }, [gameSlug]);

  // Polling loop when active
  useEffect(() => {
    if (!isActive || !gameSlug || !isSupported || !isTauri()) {
      return;
    }

    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    async function pollPosition() {
      if (!isMounted || !isActive) return;

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<LivePlayerPosition>(
          "get_live_player_position",
          {
            gameSlug,
            mapSlug,
            selectedPointerId,
          }
        );

        if (isMounted) {
          setPosition(result);
        }

        // Adjust polling interval: faster (60ms) if game is running/tracked, slower (1000ms) if searching
        const nextInterval = result.tracked
          ? 60
          : result.game_running
          ? 250
          : 1000;
        timeoutId = setTimeout(pollPosition, nextInterval);
      } catch (err) {
        if (isMounted) {
          timeoutId = setTimeout(pollPosition, 1500);
        }
      }
    }

    pollPosition();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isActive, gameSlug, mapSlug, isSupported, selectedPointerId]);

  const startTracking = useCallback(() => {
    setIsActive(true);
  }, []);

  const stopTracking = useCallback(() => {
    setIsActive(false);
    setPosition(null);
  }, []);

  const toggleTracking = useCallback(() => {
    setIsActive((prev) => {
      if (prev) {
        setPosition(null);
        return false;
      }
      return true;
    });
  }, []);

  const toggleFollowPlayer = useCallback(() => {
    setFollowPlayer((prev) => !prev);
  }, []);

  return {
    isSupported,
    isActive,
    isGameRunning: position?.game_running ?? false,
    isTracking: position?.tracked ?? false,
    position,
    candidates: position?.candidates || [],
    selectedPointerId: selectedPointerId || position?.selected_candidate_id || null,
    setSelectedPointerId,
    followPlayer,
    setFollowPlayer,
    startTracking,
    stopTracking,
    toggleTracking,
    toggleFollowPlayer,
  };
}
