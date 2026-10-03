"use client";

import React, { useState, useCallback } from "react";
import {
  Stack,
  Text,
  Group,
  Badge,
  Switch,
  NumberInput,
  Slider,
  Paper,
  Alert,
  Button,
  Divider,
  ActionIcon,
  Tooltip,
  Box,
  Loader,
} from "@mantine/core";
import {
  Sword,
  AlertTriangle,
  RefreshCw,
  Zap,
  Shield,
  Car,
  Coins,
  Star,
} from "lucide-react";
import { useGameCheats, CheatDefinition, CheatState } from "../lib/useGameCheats";

// ---- helpers ---------------------------------------------------------------

function deriveGameSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function categoryIcon(category: string) {
  switch (category.toLowerCase()) {
    case "player":
      return <Shield size={13} />;
    case "weapons":
      return <Sword size={13} />;
    case "vehicle":
      return <Car size={13} />;
    default:
      return <Star size={13} />;
  }
}

// ---- CheatRow --------------------------------------------------------------

interface CheatRowProps {
  def: CheatDefinition;
  state: CheatState;
  applying: boolean;
  onToggle: (id: string, enabled: boolean, value?: number) => void;
}

const CheatRow: React.FC<CheatRowProps> = ({ def, state, applying, onToggle }) => {
  const [localValue, setLocalValue] = useState<number>(
    parseFloat(state.current_value ?? def.default_value ?? "0") || 0
  );

  const handleToggle = useCallback(
    (checked: boolean) => {
      onToggle(def.id, checked, def.has_value ? localValue : undefined);
    },
    [def.id, def.has_value, localValue, onToggle]
  );

  const handleApplyValue = useCallback(() => {
    onToggle(def.id, state.enabled, localValue);
  }, [def.id, state.enabled, localValue, onToggle]);

  return (
    <Paper
      p="sm"
      radius="md"
      style={{
        border: state.enabled
          ? "1px solid var(--mantine-color-blue-5)"
          : "1px solid var(--mantine-color-default-border)",
        background: state.enabled
          ? "color-mix(in srgb, var(--mantine-color-blue-filled) 8%, transparent)"
          : "var(--mantine-color-default)",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs" align="center">
            <Text size="sm" fw={600} style={{ lineHeight: 1.3 }}>
              {def.label}
            </Text>
            {state.enabled && (
              <Badge size="xs" variant="filled" color="blue" px={5}>
                Active
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" style={{ lineHeight: 1.4 }}>
            {def.description}
          </Text>

          {/* Value controls (only when has_value is true) */}
          {def.has_value && (
            <Box mt="xs">
              {def.value_type === "float" ? (
                <Stack gap="xs">
                  <Slider
                    value={localValue}
                    onChange={setLocalValue}
                    min={def.min_value ?? 0}
                    max={def.max_value ?? 10}
                    step={0.01}
                    size="xs"
                    marks={[
                      { value: def.min_value ?? 0, label: String(def.min_value ?? 0) },
                      { value: def.max_value ?? 10, label: String(def.max_value ?? 10) },
                    ]}
                  />
                  <Group gap="xs" align="center">
                    <Text size="xs" c="dimmed">
                      Value: <strong>{localValue.toFixed(2)}</strong>
                    </Text>
                    {state.enabled && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="blue"
                        leftSection={<Zap size={10} />}
                        onClick={handleApplyValue}
                        loading={applying}
                      >
                        Apply
                      </Button>
                    )}
                  </Group>
                </Stack>
              ) : (
                <Group gap="xs" align="center">
                  <NumberInput
                    size="xs"
                    value={localValue}
                    onChange={(v) => setLocalValue(Number(v) || 0)}
                    min={def.min_value ?? 0}
                    max={def.max_value ?? 9999999}
                    step={1}
                    style={{ width: 140 }}
                    leftSection={<Coins size={12} />}
                  />
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="teal"
                    leftSection={<Zap size={10} />}
                    onClick={handleApplyValue}
                    loading={applying}
                  >
                    Set
                  </Button>
                </Group>
              )}
            </Box>
          )}
        </Stack>

        {/* Toggle switch (not shown for add_money which is apply-only) */}
        {!def.has_value || def.value_type === "float" ? (
          <Switch
            checked={state.enabled}
            onChange={(e) => handleToggle(e.currentTarget.checked)}
            disabled={applying}
            size="md"
            color="blue"
            styles={{ track: { cursor: "pointer" } }}
          />
        ) : null}
      </Group>
    </Paper>
  );
};

// ---- GameCheatsPanel -------------------------------------------------------

interface GameCheatsPanelProps {
  gameTitle: string;
}

export const GameCheatsPanel: React.FC<GameCheatsPanelProps> = ({ gameTitle }) => {
  const gameSlug = deriveGameSlug(gameTitle);
  const { status, loading, applyingId, error, fetchStatus, applyCheat, getState } =
    useGameCheats(gameSlug);

  // Group cheats by category
  const byCategory = React.useMemo(() => {
    if (!status?.cheats) return {};
    const map: Record<string, CheatDefinition[]> = {};
    for (const c of status.cheats) {
      (map[c.category] ??= []).push(c);
    }
    return map;
  }, [status?.cheats]);

  if (!status && loading) {
    return (
      <Stack align="center" py="xl" gap="sm">
        <Loader size="sm" />
        <Text size="xs" c="dimmed">
          Initializing cheat engine...
        </Text>
      </Stack>
    );
  }

  if (!status?.supported) {
    return (
      <Alert
        icon={<AlertTriangle size={16} />}
        color="orange"
        variant="light"
        title="Cheats Not Available"
        radius="md"
      >
        <Text size="sm">
          Cheats are not configured for <strong>{gameTitle}</strong>. Only Mafia II
          Definitive Edition is currently supported.
        </Text>
      </Alert>
    );
  }

  return (
    <Stack gap="md">
      {/* Status bar */}
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Badge
            size="sm"
            color={status.game_running ? "teal" : "gray"}
            variant={status.game_running ? "filled" : "light"}
            leftSection={<Zap size={10} />}
          >
            {status.game_running ? "Game Running" : "Game Not Running"}
          </Badge>
          {status.game_running && (
            <Badge size="sm" color="blue" variant="light">
              {status.states.filter((s) => s.enabled).length} active
            </Badge>
          )}
        </Group>
        <Tooltip label="Refresh status" position="left">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={fetchStatus}
            loading={loading}
          >
            <RefreshCw size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Text size="xs" c="dimmed">
        {status.status_message}
      </Text>

      {/* Error alert */}
      {error && (
        <Alert
          icon={<AlertTriangle size={16} />}
          color="red"
          variant="light"
          radius="md"
          withCloseButton
        >
          <Text size="xs">{error}</Text>
        </Alert>
      )}

      {/* Warning if game not running */}
      {!status.game_running && (
        <Alert
          icon={<AlertTriangle size={16} />}
          color="yellow"
          variant="light"
          radius="md"
        >
          <Text size="sm">
            Start <strong>{gameTitle}</strong> and load a save game before activating
            cheats.
          </Text>
        </Alert>
      )}

      {/* Cheats grouped by category */}
      {Object.entries(byCategory).map(([category, defs]) => (
        <Stack key={category} gap="sm">
          <Group gap="xs">
            {categoryIcon(category)}
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              {category}
            </Text>
            <Divider style={{ flex: 1 }} />
          </Group>

          <Stack gap="xs">
            {defs.map((def) => (
              <CheatRow
                key={def.id}
                def={def}
                state={getState(def.id)}
                applying={applyingId === def.id}
                onToggle={(id, enabled, value) => applyCheat(id, enabled, value)}
              />
            ))}
          </Stack>
        </Stack>
      ))}

      <Text size="xs" c="dimmed" mt="sm" ta="center">
        Disabling a cheat restores the original game value. Cheats are session-only
        and reset when the game exits.
      </Text>
    </Stack>
  );
};