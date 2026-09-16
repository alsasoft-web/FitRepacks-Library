"use client";

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Stack,
  Group,
  Paper,
  Title,
  Text,
  TextInput,
  Button,
  Badge,
  Progress,
  ActionIcon,
  Tooltip,
  Box,
  Checkbox,
  Image,
  Modal,
  Alert,
  Divider,
} from "@mantine/core";
import {
  Download,
  DownloadCloud,
  Play,
  Pause,
  X,
  Magnet,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  FileCode,
  HardDrive,
  FileText,
  Trash2,
  AlertTriangle,
  Folder,
  FolderOpen,
  RotateCw,
} from "lucide-react";
import { addGameToStorage } from "../lib/db";
import { linkGameToIgdb } from "../lib/gameLinker";
import { Game } from "../lib/types";
import {
  useDownloadQueueStore,
  QueuedGame,
  MagnetDownloadItem,
} from "../lib/downloadQueueStore";
import { HoldToConfirmButton } from "./HoldToConfirmButton";

export const DownloadsView: React.FC = () => {
  const [magnetInput, setMagnetInput] = useState<string>("");
  const [expandedGames, setExpandedGames] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<MagnetDownloadItem | null>(null);

  const {
    queuedGames,
    magnetDownloads,
    aggregateStats,
    removeGameFromQueue,
    toggleFileSelection,
    moveFileOrder,
    toggleGamePause,
    addMagnetDownload,
    removeMagnetDownload,
    toggleMagnetPause,
    toggleMagnetFileSelection,
    syncFromLiveStats,
  } = useDownloadQueueStore();

  const [installStatusMsg, setInstallStatusMsg] = useState<{
    id: string;
    type: "success" | "info" | "error";
    text: string;
  } | null>(null);

  const handleOpenFolder = async (dir?: string) => {
    if (!dir) return;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        await invoke("open_folder_in_explorer", { folderPath: dir });
      } catch (err) {
        console.warn("Backend open_folder_in_explorer error, trying plugin-opener:", err);
        try {
          const { openPath } = await import("@tauri-apps/plugin-opener");
          await openPath(dir);
        } catch (fallbackErr) {
          console.error("Failed to open directory:", fallbackErr);
        }
      }
    }
  };

  const handleInstallDownloadedGame = async (item: MagnetDownloadItem) => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      alert("Installer auto-detection is available in the desktop application.");
      return;
    }

    const targetDir = item.downloadDir || "C:\\Games\\Downloads";
    setInstallStatusMsg({
      id: item.id,
      type: "info",
      text: "Scanning download directory for setup.exe...",
    });

    try {
      if (item.infoHash) {
        try {
          await invoke("release_torrent_for_install", { infoHash: item.infoHash });
        } catch (releaseErr) {
          console.warn("Could not release torrent handles before install:", releaseErr);
        }
      }

      const installerPath = await invoke<string | null>("find_installer_exe", {
        folderPath: targetDir,
      });

      if (!installerPath) {
        setInstallStatusMsg({
          id: item.id,
          type: "error",
          text: `No installer executable (setup.exe) found in ${targetDir}`,
        });
        return;
      }

      const initialShortcuts = await invoke<string[]>("get_desktop_shortcuts").catch(() => []);
      const initialSet = new Set(initialShortcuts);

      setInstallStatusMsg({
        id: item.id,
        type: "info",
        text: `Launching ${installerPath.split(/[\\/]/).pop()}... Watching desktop for new shortcuts!`,
      });

      await invoke("launch_game_exe", {
        exePath: installerPath,
        workingDir: targetDir,
        gameId: `installer-${item.id}`,
      });

      let checksLeft = 200;
      const watchInterval = setInterval(async () => {
        checksLeft -= 1;
        if (checksLeft <= 0) {
          clearInterval(watchInterval);
          return;
        }

        try {
          const currentShortcuts = await invoke<string[]>("get_desktop_shortcuts");
          const newShortcut = currentShortcuts.find((s) => !initialSet.has(s));

          if (newShortcut) {
            clearInterval(watchInterval);
            initialSet.add(newShortcut);

            const info = await invoke<{
              shortcut_path: string;
              target_exe: string;
              working_dir: string;
              name: string;
            }>("resolve_shortcut_target", { shortcutPath: newShortcut });

            if (info && info.target_exe) {
              const rawTitle = info.name || item.title;
              const newGame: Game = {
                id: `game-${Math.random().toString(36).substring(2, 9)}`,
                title: rawTitle,
                exePath: info.target_exe,
                workingDir: info.working_dir || undefined,
                installDirectory: info.working_dir || undefined,
                coverUrl:
                  item.coverUrl ||
                  `https://placehold.co/600x800/0f172a/3b82f6?text=${encodeURIComponent(rawTitle)}`,
                playtimeMinutes: 0,
                hoursPlayed: 0,
                playSessions: [],
                isFavorite: false,
                isInstalled: true,
                dateAdded: new Date().toISOString(),
                source: "manual",
                tags: ["Auto-Installed"],
              };

              addGameToStorage(newGame);
              linkGameToIgdb(newGame).catch(() => {});
              window.dispatchEvent(new CustomEvent("fitrepacks-games-updated"));

              setInstallStatusMsg({
                id: item.id,
                type: "success",
                text: `Installation complete! Added "${rawTitle}" to your Library.`,
              });
            }
          }
        } catch (_) {}
      }, 3000);
    } catch (err: any) {
      setInstallStatusMsg({
        id: item.id,
        type: "error",
        text: `Failed to launch installer: ${err?.message || err}`,
      });
    }
  };



  const handleToggleMagnetPause = async (
    id: string,
    infoHash?: string,
    currentStatus?: string,
  ) => {
    toggleMagnetPause(id);
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        if (currentStatus === "downloading" || currentStatus === "checking") {
          if (infoHash) {
            await invoke("pause_torrent_download", { infoHash });
          }
        } else {
          let resumed = false;
          if (infoHash) {
            resumed = await invoke<boolean>("resume_torrent_download", { infoHash });
          }
          if (!resumed) {
            const dl = magnetDownloads.find((d) => d.id === id);
            if (dl && dl.magnetUrl) {
              const selectedIndices: number[] = [];
              dl.files?.forEach((f, idx) => {
                if (f.isSelected) selectedIndices.push(idx);
              });
              const newHash = await invoke<string>("start_torrent_download", {
                magnetUrl: dl.magnetUrl,
                downloadDir: dl.downloadDir || "C:\\Games\\Downloads",
                selectedFileIndices:
                  dl.files && selectedIndices.length < dl.files.length
                    ? selectedIndices
                    : null,
              });
              if (newHash && newHash !== "list_only") {
                useDownloadQueueStore.setState((prev) => ({
                  magnetDownloads: prev.magnetDownloads.map((item) =>
                    item.id === id ? { ...item, infoHash: newHash } : item,
                  ),
                }));
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to toggle torrent pause:", err);
      }
    }
  };

  const handleRecheckMagnet = async (item: MagnetDownloadItem) => {
    if (!item.magnetUrl) return;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        useDownloadQueueStore.setState((prev) => ({
          magnetDownloads: prev.magnetDownloads.map((d) =>
            d.id === item.id
              ? {
                  ...d,
                  status: "checking" as const,
                  eta: "Rehashing / Verifying...",
                }
              : d,
          ),
        }));

        const selectedIndices: number[] = [];
        item.files?.forEach((f, idx) => {
          if (f.isSelected) selectedIndices.push(idx);
        });

        const newHash = await invoke<string>("recheck_torrent_download", {
          infoHash: item.infoHash || "",
          magnetUrl: item.magnetUrl,
          downloadDir: item.downloadDir || "C:\\Games\\Downloads",
          selectedFileIndices:
            item.files && selectedIndices.length < item.files.length
              ? selectedIndices
              : null,
        });

        if (newHash && newHash !== "list_only") {
          useDownloadQueueStore.setState((prev) => ({
            magnetDownloads: prev.magnetDownloads.map((d) =>
              d.id === item.id
                ? { ...d, infoHash: newHash, status: "downloading" as const }
                : d,
            ),
          }));
        }
      } catch (err) {
        console.error("Failed to recheck torrent:", err);
      }
    }
  };

  const handleRemoveMagnet = async (id: string, infoHash?: string) => {
    removeMagnetDownload(id);
    if (infoHash && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        await invoke("cancel_torrent_download", { infoHash });
      } catch (err) {
        console.error("Failed to cancel torrent:", err);
      }
    }
  };

  const handleConfirmDeleteFiles = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);

    await handleRemoveMagnet(target.id, target.infoHash);

    if (
      target.downloadDir &&
      typeof window !== "undefined" &&
      "__TAURI_INTERNALS__" in window
    ) {
      try {
        const { exists, remove } = await import("@tauri-apps/plugin-fs");
        if (await exists(target.downloadDir)) {
          await remove(target.downloadDir, { recursive: true });
        }
      } catch (err) {
        console.error("Failed to delete download folder from disk:", err);
      }
    }
  };

  const handleRemoveAppOnly = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await handleRemoveMagnet(target.id, target.infoHash);
  };

  const handleAddMagnet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magnetInput.trim()) return;

    let infoHash: string | undefined = undefined;
    const downloadDir = "C:\\Games\\Downloads";

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        infoHash = await invoke<string>("start_torrent_download", {
          magnetUrl: magnetInput.trim(),
          downloadDir,
          selectedFileIndices: null,
        });
      } catch (err) {
        console.error("Failed to start torrent download:", err);
      }
    }

    addMagnetDownload({
      title: magnetInput.startsWith("magnet:")
        ? decodeURIComponent(
            magnetInput.split("dn=")[1]?.split("&")[0] || "Direct Torrent Download",
          ).replace(/\+/g, " ")
        : "Manual Torrent Download",
      magnetUrl: magnetInput,
      size: "Dynamic",
      downloadDir,
      infoHash: infoHash && infoHash !== "list_only" ? infoHash : undefined,
    });

    setMagnetInput("");
  };

  const toggleExpandItem = (id: string) => {
    setExpandedGames((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const calculateGameProgress = (game: QueuedGame) => {
    const selectedFiles = game.files.filter((f) => f.isSelected);
    if (selectedFiles.length === 0) return 0;
    const completedFiles = selectedFiles.filter((f) => f.status === "completed").length;
    return Math.round((completedFiles / selectedFiles.length) * 100);
  };

  return (
    <Stack gap="lg">
      {/* Header section */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Box>
          <Group gap="xs">
            <Download size={24} color="#3b82f6" />
            <Title order={3}>Downloads</Title>
          </Group>
          <Text size="xs" c="dimmed">
            Track your downloads, active torrents, and repack packages
          </Text>
        </Box>

        {/* Aggregate Bandwidth Stats */}
        <Group gap="md">
          <Paper p="xs" radius="md" bg="var(--mantine-color-default)">
            <Group gap="xs">
              <ArrowDown size={16} color="#38d9a9" />
              <Box>
                <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>
                  Download
                </Text>
                <Text size="sm" fw={700} ff="monospace" c="teal.4">
                  {aggregateStats.totalDownSpeed}
                </Text>
              </Box>
            </Group>
          </Paper>

          <Paper p="xs" radius="md" bg="var(--mantine-color-default)">
            <Group gap="xs">
              <ArrowUp size={16} color="#4dabf7" />
              <Box>
                <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>
                  Upload
                </Text>
                <Text size="sm" fw={700} ff="monospace" c="blue.4">
                  {aggregateStats.totalUpSpeed}
                </Text>
              </Box>
            </Group>
          </Paper>
        </Group>
      </Group>

      {/* Magnet Link Quick Paste Bar */}
      <Paper p="md" radius="md" bg="var(--mantine-color-default)">
        <form onSubmit={handleAddMagnet}>
          <Group gap="sm">
            <TextInput
              style={{ flex: 1 }}
              placeholder="Paste a magnet link or torrent URL..."
              value={magnetInput}
              onChange={(e) => setMagnetInput(e.target.value)}
              leftSection={<Magnet size={16} color="#3b82f6" />}
              radius="md"
              size="sm"
            />
            <Button
              type="submit"
              color="blue"
              size="sm"
              radius="md"
              leftSection={<DownloadCloud size={16} />}
            >
              Add Download
            </Button>
          </Group>
        </form>
      </Paper>

      {/* In-App Magnet / Torrent Downloads List */}
      {magnetDownloads.length > 0 && (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={700} size="sm" c="blue.4">
              Torrent Downloads ({magnetDownloads.length})
            </Text>
          </Group>

          {magnetDownloads.map((item) => {
            const isExpanded = expandedGames[item.id] ?? false;
            const selectedFiles = item.files?.filter((f) => f.isSelected) || [];
            const completedCount = item.files?.filter((f) => f.isSelected && f.status === "completed").length || 0;

            return (
              <Paper
                key={item.id}
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border:
                    item.status === "downloading"
                      ? "1px solid var(--mantine-color-blue-8)"
                      : "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap="md" style={{ flex: 1, minWidth: 0 }}>
                      {item.coverUrl && (
                        <Image
                          src={item.coverUrl}
                          w={45}
                          h={60}
                          radius="xs"
                          fallbackSrc="https://placehold.co/45x60/12141d/3b82f6?text=DL"
                          style={{ objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
                        />
                      )}
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Group gap="xs" mb={2}>
                          <Text fw={700} size="sm" lineClamp={1}>
                            {item.title}
                          </Text>
                          <Badge color="blue" size="xs" variant="filled">
                            Torrent
                          </Badge>
                          <Badge
                            color={
                              item.status === "completed"
                                ? "teal"
                                : item.status === "downloading"
                                ? "cyan"
                                : item.status === "checking"
                                ? "orange"
                                : "yellow"
                            }
                            size="xs"
                            variant="light"
                          >
                            {item.status === "checking" ? "checking files" : item.status}
                          </Badge>
                        </Group>
                        <Group gap="md">
                          <Text size="xs" c="dimmed" ff="monospace">
                            {item.downloaded} / {item.size} (
                            {item.progress > 0 && item.progress < 1
                              ? item.progress.toFixed(2)
                              : item.progress.toFixed(1)}
                            %)
                          </Text>
                          {item.files && item.files.length > 0 && (
                            <Text size="xs" c="dimmed">
                              • {completedCount} / {selectedFiles.length} files
                            </Text>
                          )}
                          {(item.status === "downloading" || item.status === "checking") && (
                            <Group gap={6}>
                              {item.status === "downloading" && (
                                <>
                                  <Text size="xs" c="teal.4" ff="monospace" fw={600}>
                                    ⚡ ↓ {item.speed}
                                  </Text>
                                  {item.uploadSpeed && (
                                    <Text size="xs" c="blue.4" ff="monospace" fw={600}>
                                      ↑ {item.uploadSpeed}
                                    </Text>
                                  )}
                                  {typeof item.peers === "number" && item.peers > 0 && (
                                    <Badge size="xs" color="indigo" variant="outline">
                                      {item.peers} peers
                                    </Badge>
                                  )}
                                </>
                              )}
                              <Text size="xs" c="dimmed">
                                • {item.eta}
                              </Text>
                            </Group>
                          )}
                          {item.downloadDir && (
                            <Tooltip label="Open Download Folder in File Explorer">
                              <Group
                                gap={4}
                                style={{ cursor: "pointer" }}
                                onClick={() => handleOpenFolder(item.downloadDir)}
                              >
                                <FolderOpen size={12} color="var(--mantine-color-blue-4)" />
                                <Text
                                  size="11px"
                                  c="blue.4"
                                  truncate
                                  style={{
                                    maxWidth: 240,
                                    textDecoration: "underline",
                                    textUnderlineOffset: "2px",
                                  }}
                                >
                                  {item.downloadDir}
                                </Text>
                              </Group>
                            </Tooltip>
                          )}
                        </Group>
                      </Box>
                    </Group>

                    <Group gap="xs">
                      {(item.status === "completed" || item.progress >= 100) && (
                        <Tooltip label="Detect setup.exe, launch installer, and auto-add to Library via desktop shortcut watcher">
                          <Button
                            size="xs"
                            color="teal"
                            variant="filled"
                            leftSection={<Play size={13} fill="white" />}
                            radius="md"
                            onClick={() => handleInstallDownloadedGame(item)}
                          >
                            INSTALL
                          </Button>
                        </Tooltip>
                      )}

                      {item.downloadDir && (
                        <Tooltip label="Open Download Folder">
                          <ActionIcon
                            variant="light"
                            color="blue"
                            size="sm"
                            radius="md"
                            onClick={() => handleOpenFolder(item.downloadDir)}
                          >
                            <FolderOpen size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}

                      {item.magnetUrl && (
                        <Tooltip label="Force Recheck / Verify Existing Files on Disk">
                          <ActionIcon
                            variant="light"
                            color="indigo"
                            size="sm"
                            radius="md"
                            loading={item.status === "checking"}
                            onClick={() => handleRecheckMagnet(item)}
                          >
                            <RotateCw size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}

                      {item.status !== "completed" && (
                        <Tooltip label={item.status === "downloading" ? "Pause" : "Resume"}>
                          <ActionIcon
                            variant="light"
                            color={item.status === "downloading" ? "yellow" : "teal"}
                            size="sm"
                            radius="md"
                            onClick={() =>
                              handleToggleMagnetPause(
                                item.id,
                                item.infoHash,
                                item.status,
                              )
                            }
                          >
                            {item.status === "downloading" ? <Pause size={14} /> : <Play size={14} />}
                          </ActionIcon>
                        </Tooltip>
                      )}

                      {item.files && item.files.length > 0 && (
                        <Tooltip label="Expand/Collapse Selective Files">
                          <ActionIcon
                            variant="default"
                            size="sm"
                            radius="md"
                            onClick={() => toggleExpandItem(item.id)}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </ActionIcon>
                        </Tooltip>
                      )}

                      <Tooltip label="Remove / Delete from Downloads">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          radius="md"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <X size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>

                  <Progress
                    value={item.progress}
                    color={
                      item.status === "completed"
                        ? "teal"
                        : item.status === "checking"
                        ? "orange"
                        : "blue"
                    }
                    size="sm"
                    radius="xl"
                    animated={item.status === "downloading" || item.status === "checking"}
                  />

                  {installStatusMsg && installStatusMsg.id === item.id && (
                    <Alert
                      color={
                        installStatusMsg.type === "success"
                          ? "teal"
                          : installStatusMsg.type === "error"
                            ? "red"
                            : "blue"
                      }
                      radius="md"
                      p="xs"
                      withCloseButton
                      onClose={() => setInstallStatusMsg(null)}
                    >
                      <Text size="xs" fw={600}>
                        {installStatusMsg.text}
                      </Text>
                    </Alert>
                  )}

                  {/* Expandable Files List for Torrent */}
                  {isExpanded && item.files && (
                    <Paper
                      p="xs"
                      bg="var(--mantine-color-default)"
                      style={{ border: "1px solid var(--mantine-color-default-border)" }}
                      radius="sm"
                      mt="xs"
                    >
                      <Stack gap={6}>
                        <Text size="xs" fw={700} c="dimmed" mb={4}>
                          Selective Files Breakdown:
                        </Text>
                        {item.files.map((file) => {
                          const filePct = file.progressPercent ?? (file.status === "completed" ? 100 : 0);
                          return (
                            <Paper
                              key={file.id}
                              p="xs"
                              radius="xs"
                              bg={file.isSelected ? "var(--mantine-color-default)" : "var(--mantine-color-body)"}
                              style={{
                                opacity: file.isSelected ? 1 : 0.5,
                                border:
                                  file.status === "checking"
                                    ? "1px solid var(--mantine-color-orange-7)"
                                    : file.status === "downloading"
                                    ? "1px solid var(--mantine-color-teal-7)"
                                    : file.status === "paused"
                                    ? "1px solid var(--mantine-color-orange-7)"
                                    : "1px solid var(--mantine-color-default-border)",
                              }}
                            >
                              <Stack gap={4}>
                                <Group justify="space-between" align="center">
                                  <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                                    <Checkbox
                                      checked={file.isSelected}
                                      disabled={!file.isOptional}
                                      onChange={() =>
                                        toggleMagnetFileSelection(item.id, file.id)
                                      }
                                      size="xs"
                                    />
                                    {file.name.endsWith(".exe") ? (
                                      <FileCode size={13} color="#38d9a9" />
                                    ) : file.name.includes(".bin") ? (
                                      <HardDrive size={13} color="#4dabf7" />
                                    ) : (
                                      <FileText size={13} color="#adb5bd" />
                                    )}
                                    <Text size="xs" fw={600} lineClamp={1}>
                                      {file.name}
                                    </Text>
                                    {file.isOptional && (
                                      <Badge size="xs" color="violet" variant="subtle">
                                        Optional
                                      </Badge>
                                    )}
                                  </Group>

                                  <Group gap="xs">
                                    <Text size="11px" c="dimmed" ff="monospace">
                                      {file.downloadedFormatted
                                        ? `${file.downloadedFormatted} / ${file.size} (${filePct.toFixed(1)}%)`
                                        : `${file.size} (0.0%)`}
                                    </Text>
                                    {file.status === "completed" && (
                                      <Badge
                                        size="xs"
                                        color="teal"
                                        variant="light"
                                        leftSection={<CheckCircle2 size={10} />}
                                      >
                                        Done
                                      </Badge>
                                    )}
                                    {file.status === "checking" && (
                                      <Badge
                                        size="xs"
                                        color="orange"
                                        variant="light"
                                        leftSection={<RotateCw size={10} />}
                                      >
                                        Verifying
                                      </Badge>
                                    )}
                                    {file.status === "downloading" && (
                                      <Badge size="xs" color="teal" variant="filled">
                                        Downloading
                                      </Badge>
                                    )}
                                    {file.status === "paused" && (
                                      <Badge
                                        size="xs"
                                        color="orange"
                                        variant="light"
                                        leftSection={<Pause size={10} />}
                                      >
                                        Paused
                                      </Badge>
                                    )}
                                    {file.status === "pending" && (
                                      <Badge
                                        size="xs"
                                        color="gray"
                                        variant="light"
                                        leftSection={<Clock size={10} />}
                                      >
                                        Queued
                                      </Badge>
                                    )}
                                    {file.status === "skipped" && (
                                      <Badge size="xs" color="dark" variant="outline">
                                        Skipped
                                      </Badge>
                                    )}
                                  </Group>
                                </Group>

                                {file.isSelected && (
                                  <Progress
                                    value={filePct}
                                    color={
                                      file.status === "completed"
                                        ? "teal"
                                        : file.status === "checking"
                                        ? "orange"
                                        : file.status === "paused"
                                        ? "orange"
                                        : "teal"
                                    }
                                    size="xs"
                                    radius="xl"
                                    animated={file.status === "downloading" || file.status === "checking"}
                                  />
                                )}
                              </Stack>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Paper>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}

      {/* Queued Direct Filehost Repack Games */}
      {queuedGames.length > 0 && (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={700} size="sm" c="blue.4">
              Direct Filehost Repacks ({queuedGames.length})
            </Text>
          </Group>

          {queuedGames.map((game) => {
            const isExpanded = expandedGames[game.id] ?? true;
            const progress = calculateGameProgress(game);
            const totalSelected = game.files.filter((f) => f.isSelected).length;
            const completedCount = game.files.filter((f) => f.isSelected && f.status === "completed").length;

            return (
              <Paper
                key={game.id}
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{ border: "1px solid var(--mantine-color-blue-8)" }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="md" style={{ flex: 1, minWidth: 0 }}>
                      {game.coverUrl && (
                        <Image
                          src={game.coverUrl}
                          w={45}
                          h={60}
                          radius="xs"
                          style={{ objectFit: "cover", borderRadius: "4px" }}
                        />
                      )}
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Group gap="xs" mb={2}>
                          <Text fw={700} size="sm" lineClamp={1}>
                            {game.title}
                          </Text>
                          <Badge color="blue" size="xs" variant="filled">
                            Direct Link
                          </Badge>
                          <Badge color={game.status === "downloading" ? "teal" : "yellow"} size="xs" variant="light">
                            {game.status}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {completedCount} of {totalSelected} files finished
                        </Text>
                      </Box>
                    </Group>

                    <Group gap="xs">
                      <Tooltip label={game.status === "downloading" ? "Pause All" : "Resume All"}>
                        <ActionIcon
                          variant="light"
                          color={game.status === "downloading" ? "yellow" : "teal"}
                          size="sm"
                          radius="md"
                          onClick={() => toggleGamePause(game.id)}
                        >
                          {game.status === "downloading" ? <Pause size={14} /> : <Play size={14} />}
                        </ActionIcon>
                      </Tooltip>

                      <Tooltip label="Expand/Collapse Files Breakdown">
                        <ActionIcon
                          variant="default"
                          size="sm"
                          radius="md"
                          onClick={() => toggleExpandItem(game.id)}
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </ActionIcon>
                      </Tooltip>

                      <Tooltip label="Remove Game from Queue">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          radius="md"
                          onClick={() => removeGameFromQueue(game.id)}
                        >
                          <X size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>

                  <Progress value={progress} color="teal" size="sm" radius="xl" animated={game.status === "downloading"} />

                  {/* Expandable File List with Reordering & Selection */}
                  {isExpanded && (
                    <Paper
                      p="xs"
                      bg="var(--mantine-color-default)"
                      style={{ border: "1px solid var(--mantine-color-default-border)" }}
                      radius="sm"
                      mt="xs"
                    >
                      <Stack gap={6}>
                        <Text size="xs" fw={700} c="dimmed" mb={4}>
                          File Parts Breakdown & Download Priority Order:
                        </Text>
                        {game.files.map((file, idx) => (
                          <Paper
                            key={file.id}
                            p="xs"
                            radius="xs"
                            bg={file.isSelected ? "var(--mantine-color-default)" : "var(--mantine-color-body)"}
                            style={{
                              opacity: file.isSelected ? 1 : 0.6,
                              border:
                                file.status === "downloading"
                                  ? "1px solid var(--mantine-color-teal-7)"
                                  : "1px solid var(--mantine-color-default-border)",
                            }}
                          >
                            <Group justify="space-between" align="center">
                              <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                                <Badge size="xs" variant="outline" color="gray">
                                  #{file.order}
                                </Badge>

                                <Checkbox
                                  checked={file.isSelected}
                                  disabled={!file.isOptional}
                                  onChange={() => toggleFileSelection(game.id, file.id)}
                                  size="xs"
                                />

                                <Text size="xs" fw={600} lineClamp={1}>
                                  {file.name}
                                </Text>

                                {file.isOptional && (
                                  <Badge size="xs" color="violet" variant="subtle">
                                    Optional
                                  </Badge>
                                )}
                              </Group>

                              <Group gap="xs">
                                <Text size="11px" c="dimmed" ff="monospace">
                                  {file.size}
                                </Text>

                                {file.status === "completed" && (
                                  <Badge size="xs" color="teal" variant="light" leftSection={<CheckCircle2 size={10} />}>
                                    Done
                                  </Badge>
                                )}
                                {file.status === "downloading" && (
                                  <Badge size="xs" color="teal" variant="filled">
                                    Downloading
                                  </Badge>
                                )}
                                {file.status === "pending" && (
                                  <Badge size="xs" color="gray" variant="light" leftSection={<Clock size={10} />}>
                                    Queued
                                  </Badge>
                                )}
                                {file.status === "skipped" && (
                                  <Badge size="xs" color="dark" variant="outline">
                                    Skipped
                                  </Badge>
                                )}

                                {/* File Reordering Buttons */}
                                <Group gap={2}>
                                  <ActionIcon
                                    size="xs"
                                    variant="subtle"
                                    disabled={idx === 0}
                                    onClick={() => moveFileOrder(game.id, file.id, "up")}
                                  >
                                    <ChevronUp size={12} />
                                  </ActionIcon>
                                  <ActionIcon
                                    size="xs"
                                    variant="subtle"
                                    disabled={idx === game.files.length - 1}
                                    onClick={() => moveFileOrder(game.id, file.id, "down")}
                                  >
                                    <ChevronDown size={12} />
                                  </ActionIcon>
                                </Group>
                              </Group>
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    </Paper>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
      {queuedGames.length === 0 && magnetDownloads.length === 0 && (
        <Paper
          p={60}
          radius="lg"
          style={{ textAlign: "center" }}
          bg="var(--mantine-color-default)"
        >
          <DownloadCloud
            size={40}
            color="#5c5f66"
            style={{ margin: "0 auto" }}
          />
          <Text size="md" fw={700} c="white" mt="xs">
            No Active Downloads
          </Text>
          <Text size="xs" c="dimmed">
            Paste a magnet link or select download options on any FitGirl repack
            to start downloading.
          </Text>
        </Paper>
      )}

      {/* Delete Confirmation Modal with Hold to Delete */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={
          <Group gap="xs">
            <AlertTriangle size={18} color="var(--mantine-color-red-4)" />
            <Text fw={700} size="sm" c="red.4">
              Delete Torrent Download
            </Text>
          </Group>
        }
        radius="lg"
        centered
        size="md"
        styles={{
          content: {
            backgroundColor: "var(--mantine-color-body)",
            border: "1px solid var(--mantine-color-dark-4)",
          },
        }}
      >
        {deleteTarget && (
          <Stack gap="md">
            <Paper p="sm" radius="md" bg="var(--mantine-color-default)">
              <Group align="flex-start" gap="md" wrap="nowrap">
                {deleteTarget.coverUrl && (
                  <Image
                    src={deleteTarget.coverUrl}
                    w={55}
                    h={75}
                    radius="sm"
                    fallbackSrc="https://placehold.co/55x75/12141d/3b82f6?text=Cover"
                    style={{ objectFit: "cover", flexShrink: 0 }}
                  />
                )}
                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={700} size="sm" lineClamp={2}>
                    {deleteTarget.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {deleteTarget.downloaded} of {deleteTarget.size} ({deleteTarget.progress.toFixed(1)}%)
                  </Text>
                  {deleteTarget.downloadDir && (
                    <Group gap={4}>
                      <Folder size={12} color="var(--mantine-color-blue-4)" />
                      <Text size="11px" c="dimmed" truncate style={{ maxWidth: 280 }}>
                        {deleteTarget.downloadDir}
                      </Text>
                    </Group>
                  )}
                </Stack>
              </Group>
            </Paper>

            <Alert
              variant="light"
              color="red"
              title="Choose Deletion Scope"
              icon={<AlertTriangle size={16} />}
              radius="md"
            >
              <Text size="xs">
                You can remove this item from your app queue while keeping your files, or permanently delete the downloaded folder from disk.
              </Text>
            </Alert>

            <Divider my="xs" />

            <Stack gap="sm">
              <Button
                variant="light"
                color="gray"
                fullWidth
                radius="md"
                size="sm"
                onClick={handleRemoveAppOnly}
              >
                Remove from App Only (Keep Files on Disk)
              </Button>

              <HoldToConfirmButton
                label="HOLD TO DELETE FILES & REMOVE"
                holdingLabel="DELETING DOWNLOADED FILES..."
                color="red"
                size="sm"
                fullWidth
                onConfirmed={handleConfirmDeleteFiles}
              />
            </Stack>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
};
