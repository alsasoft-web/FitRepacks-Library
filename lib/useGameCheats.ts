"use client";

import { useState, useCallback, useEffect } from "react";

export interface CheatDefinition {
  id: string;
  label: string;
  description: string;
  category: string;
  has_value: boolean;
  value_type: "float" | "int32" | "int64" | "bool" | null;
  default_value: string | null;
  min_value: number | null;
  max_value: number | null;
}

export interface CheatState {
  id: string;
  enabled: boolean;
  current_value: string | null;
}

export interface CheatStatus {
  supported: boolean;
  game_running: boolean;
  game_title: string;
  game_slug: string;
  cheats: CheatDefinition[];
  states: CheatState[];
  status_message: string;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
}

export function useGameCheats(gameSlug?: string) {
  const [status, setStatus] = useState<CheatStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!gameSlug || !isTauri()) return;
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<CheatStatus>("get_game_cheat_status", { gameSlug });
      setStatus(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [gameSlug]);

  // Poll every 2 seconds when game is not running to detect game start.
  // Stop polling once game is detected.
  useEffect(() => {
    if (!gameSlug || !isTauri()) return;
    fetchStatus();
    const interval = setInterval(() => {
      setStatus((prev) => {
        // Only keep polling if the game is not running yet
        if (!prev || !prev.game_running) {
          fetchStatus();
        }
        return prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [gameSlug, fetchStatus]);

  const applyCheat = useCallback(
    async (cheatId: string, enabled: boolean, value?: number) => {
      if (!gameSlug || !isTauri()) return;
      setApplyingId(cheatId);
      setError(null);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<CheatStatus>("apply_game_cheat", {
          gameSlug,
          cheatId,
          enabled,
          value: value ?? null,
        });
        setStatus(result);
      } catch (err) {
        setError(String(err));
      } finally {
        setApplyingId(null);
      }
    },
    [gameSlug]
  );

  const getState = useCallback(
    (cheatId: string): CheatState => {
      return (
        status?.states.find((s) => s.id === cheatId) ?? {
          id: cheatId,
          enabled: false,
          current_value: null,
        }
      );
    },
    [status]
  );

  const getDefinition = useCallback(
    (cheatId: string): CheatDefinition | undefined => {
      return status?.cheats.find((c) => c.id === cheatId);
    },
    [status]
  );

  return {
    status,
    loading,
    applyingId,
    error,
    fetchStatus,
    applyCheat,
    getState,
    getDefinition,
  };
}