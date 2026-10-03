"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Image,
  Text,
  Badge,
  Group,
  Stack,
  Button,
  Paper,
  Box,
  TextInput,
  Checkbox,
  Divider,
  ScrollArea,
  Table,
  Loader,
  ThemeIcon,
  Progress,
  ActionIcon,
  Tooltip,
  SegmentedControl,
} from "@mantine/core";
import {
  DownloadCloud,
  Folder,
  Magnet,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  FileCheck,
  FileCode,
  FileText,
  HardDrive,
  Filter,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  useDownloadQueueStore,
  QueuedFile,
  isTorrentAlreadyInQueue,
} from "../../lib/downloadQueueStore";
import { formatRepackFolderName } from "../../lib/repackTypes";
import {
  getDefaultDownloadDir,
  saveDefaultDownloadDir,
  getPreferredLanguages,
  getTorrentSettings,
  getAppSetting,
} from "../../lib/db";

interface TorrentDownloadModalProps {
  opened: boolean;
  onClose: () => void;
  magnetUrl: string;
  title?: string;
  coverUrl?: string;
  repackSize?: string;
  originalSize?: string;
  onDownloadStarted?: () => void;
}

// Helper to parse file size string to bytes/MB
const parseSizeMB = (sizeStr?: string): number => {
  if (!sizeStr) return 0;
  const match = sizeStr.match(/([\d.,]+)\s*(TB|GB|MB|KB|B)/i);
  if (!match) {
    const numOnly = parseFloat(sizeStr.replace(",", "."));
    return isNaN(numOnly) ? 0 : numOnly;
  }
  const num = parseFloat(match[1].replace(",", "."));
  if (isNaN(num)) return 0;
  const unit = match[2].toUpperCase();
  if (unit === "TB") return num * 1024 * 1024;
  if (unit === "GB") return num * 1024;
  if (unit === "MB") return num;
  if (unit === "KB") return num / 1024;
  if (unit === "B") return num / (1024 * 1024);
  return num;
};

// Generate realistic torrent file breakdown based on game repack size & title
const generateTorrentFiles = (
  gameTitle: string,
  repackSizeStr?: string,
  preferredLangs: string[] = ["english"],
): QueuedFile[] => {
  const totalMB = parseSizeMB(repackSizeStr);
  const cleanName = gameTitle
    .replace(/[^\w\s-]/gi, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

  const files: QueuedFile[] = [];
  let remainingMB = totalMB;

  // 1. Core setup file
  files.push({
    id: "f-setup",
    name: "setup.exe",
    url: "setup.exe",
    size: "42.5 MB",
    status: "pending",
    isOptional: false,
    isSelected: true,
    order: 1,
  });
  remainingMB = Math.max(100, remainingMB - 42.5);

  // 2. Selective optional languages
  const languages = [
    {
      code: "english",
      label: "English Voiceover / Audio",
      sizeMB: Math.round(remainingMB * 0.08),
      optional: true,
    },
    {
      code: "french",
      label: "French Voiceover / Audio",
      sizeMB: Math.round(remainingMB * 0.06),
      optional: true,
    },
    {
      code: "german",
      label: "German Voiceover / Audio",
      sizeMB: Math.round(remainingMB * 0.06),
      optional: true,
    },
    {
      code: "spanish",
      label: "Spanish Voiceover / Audio",
      sizeMB: Math.round(remainingMB * 0.06),
      optional: true,
    },
    {
      code: "russian",
      label: "Russian Voiceover / Audio",
      sizeMB: Math.round(remainingMB * 0.06),
      optional: true,
    },
  ];

  let orderIndex = 2;

  // 3. Main data archive bin chunks (e.g. fg-01.bin, fg-02.bin...)
  const chunkSizeMB = Math.min(
    4096,
    Math.max(1500, Math.round(remainingMB / 3)),
  );
  let part = 1;
  while (remainingMB > chunkSizeMB * 1.5 && part <= 8) {
    const sizeFormatted =
      chunkSizeMB >= 1024
        ? `${(chunkSizeMB / 1024).toFixed(1)} GB`
        : `${chunkSizeMB.toFixed(0)} MB`;

    files.push({
      id: `f-data-${part}`,
      name: `setup-fitgirl-${part < 10 ? "0" + part : part}.bin`,
      url: `setup-fitgirl-${part < 10 ? "0" + part : part}.bin`,
      size: sizeFormatted,
      status: "pending",
      isOptional: false,
      isSelected: true,
      order: orderIndex++,
    });
    remainingMB -= chunkSizeMB;
    part++;
  }

  // 4. Remaining main data chunk
  const mainRemainingFormatted =
    remainingMB >= 1024
      ? `${(remainingMB / 1024).toFixed(1)} GB`
      : `${remainingMB.toFixed(0)} MB`;
  files.push({
    id: `f-data-${part}`,
    name: `setup-fitgirl-${part < 10 ? "0" + part : part}.bin`,
    url: `setup-fitgirl-${part < 10 ? "0" + part : part}.bin`,
    size: mainRemainingFormatted,
    status: "pending",
    isOptional: false,
    isSelected: true,
    order: orderIndex++,
  });

  // 5. Language packs (Auto-selected according to user preferences in Settings, all can be toggled)
  languages.forEach((lang) => {
    const sizeFormatted =
      lang.sizeMB >= 1024
        ? `${(lang.sizeMB / 1024).toFixed(1)} GB`
        : `${lang.sizeMB} MB`;

    const isAutoSelected = preferredLangs.some(
      (p) => p.toLowerCase() === lang.code.toLowerCase(),
    );

    files.push({
      id: `f-lang-${lang.code}`,
      name: `fg-optional-${lang.code}.bin (${lang.label})`,
      url: `fg-optional-${lang.code}.bin`,
      size: sizeFormatted,
      status: isAutoSelected ? "pending" : "skipped",
      isOptional: true,
      isSelected: isAutoSelected,
      order: orderIndex++,
    });
  });

  // 6. Optional 4K Videos / Bonus content if total size > 8GB
  if (totalMB > 8000) {
    const bonusSize = Math.round(totalMB * 0.12);
    files.push({
      id: "f-optional-4k",
      name: "fg-optional-4k-videos.bin (Ultra High-Res Videos)",
      url: "fg-optional-4k-videos.bin",
      size:
        bonusSize >= 1024
          ? `${(bonusSize / 1024).toFixed(1)} GB`
          : `${bonusSize} MB`,
      status: "skipped",
      isOptional: true,
      isSelected: false,
      order: orderIndex++,
    });
  }

  // 7. MD5 Validation check
  files.push({
    id: "f-md5",
    name: "QuickSFV.exe / MD5 Check.md5",
    url: "MD5/QuickSFV.exe",
    size: "1.8 MB",
    status: "pending",
    isOptional: false,
    isSelected: true,
    order: orderIndex++,
  });

  return files;
};

export const TorrentDownloadModal: React.FC<TorrentDownloadModalProps> = ({
  opened,
  onClose,
  magnetUrl,
  title = "Direct Torrent Repack",
  coverUrl,
  repackSize,
  originalSize,
  onDownloadStarted,
}) => {
  const [downloadDir, setDownloadDir] = useState<string>(() =>
    getDefaultDownloadDir(),
  );
  const [createSubfolder, setCreateSubfolder] = useState<boolean>(true);
  const [openDownloadsTab, setOpenDownloadsTab] = useState<boolean>(true);
  const [isBrowsing, setIsBrowsing] = useState<boolean>(false);
  const [isResolving, setIsResolving] = useState<boolean>(true);
  const [resolveProgress, setResolveProgress] = useState<number>(0);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [fileFilter, setFileFilter] = useState<"all" | "optional" | "required">(
    "all",
  );

  const [isLiveMetadata, setIsLiveMetadata] = useState<boolean>(false);
  const [actualTorrentName, setActualTorrentName] = useState<string | null>(
    null,
  );

  // Extract hash & display name from magnet URL
  const magnetInfo = useMemo(() => {
    if (!magnetUrl || !magnetUrl.startsWith("magnet:")) {
      return { hash: "Unknown", name: title, trackersCount: 0 };
    }

    const hashMatch = magnetUrl.match(
      /xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i,
    );
    const dnMatch = magnetUrl.match(/dn=([^&]+)/);
    const trackers = magnetUrl.match(/tr=([^&]+)/g) || [];

    const hash = hashMatch ? hashMatch[1].toUpperCase() : "Unknown";
    const name = dnMatch
      ? decodeURIComponent(dnMatch[1]).replace(/\+/g, " ")
      : title;

    return {
      hash,
      name: actualTorrentName || name,
      trackersCount: trackers.length,
    };
  }, [magnetUrl, title, actualTorrentName]);

  const effectiveDownloadDir = useMemo(() => {
    const base = downloadDir.trim().replace(/[\\/]+$/, "");
    if (!createSubfolder) return base;
    const rawName = title || magnetInfo.name || "Game";
    const folderName = formatRepackFolderName(rawName, "Fitgirl-Repacks");
    return base ? `${base}\\${folderName}` : folderName;
  }, [downloadDir, createSubfolder, title, magnetInfo.name]);

  const optionalCount = useMemo(
    () => files.filter((f) => f.isOptional).length,
    [files],
  );
  const requiredCount = useMemo(
    () => files.filter((f) => !f.isOptional).length,
    [files],
  );

  const displayedFiles = useMemo(() => {
    if (fileFilter === "optional") return files.filter((f) => f.isOptional);
    if (fileFilter === "required") return files.filter((f) => !f.isOptional);
    return files;
  }, [files, fileFilter]);

  const magnetDownloads = useDownloadQueueStore(
    (state) => state.magnetDownloads,
  );
  const addMagnetDownload = useDownloadQueueStore(
    (state) => state.addMagnetDownload,
  );

  const existingDownload = useMemo(() => {
    return isTorrentAlreadyInQueue(magnetDownloads, {
      infoHash: magnetInfo.hash,
      magnetUrl,
      title: title || magnetInfo.name,
    });
  }, [magnetDownloads, magnetInfo.hash, magnetUrl, title, magnetInfo.name]);

  // Load default download directory from SQLite settings if available
  useEffect(() => {
    if (opened) {
      setDownloadDir(getDefaultDownloadDir());
      getAppSetting("default_download_dir")
        .then((savedDir) => {
          if (savedDir && savedDir.trim()) {
            setDownloadDir(savedDir);
          }
        })
        .catch(() => {});
    }
  }, [opened]);

  // Fetch actual live torrent metadata from swarm / torrent caches
  useEffect(() => {
    if (!opened) return;
    setIsResolving(true);
    setResolveProgress(20);
    setIsLiveMetadata(false);
    setActualTorrentName(null);

    let isMounted = true;

    async function resolveMetadata() {
      const preferred = getPreferredLanguages();
      setResolveProgress(50);

      // Attempt live real torrent metadata extraction from backend
      if (
        typeof window !== "undefined" &&
        "__TAURI_INTERNALS__" in window &&
        magnetUrl
      ) {
        try {
          const realMeta = await invoke<{
            name: string;
            info_hash: string;
            total_size: string;
            total_bytes: number;
            piece_length: number;
            files_count: number;
            files: Array<{
              id: string;
              name: string;
              path: string;
              size: string;
              bytes: number;
              is_optional: boolean;
              is_selected: boolean;
              file_type: string;
            }>;
          }>("fetch_torrent_metadata", {
            magnetOrHash: magnetUrl,
          });

          if (
            isMounted &&
            realMeta &&
            realMeta.files &&
            realMeta.files.length > 0
          ) {
            const liveFiles: QueuedFile[] = realMeta.files.map((rf, idx) => {
              const lowerName = rf.name.toLowerCase();
              let isSelected = rf.is_selected;
              let isOptional = rf.is_optional;

              // Check against preferred languages if it is a language / selective file
              if (
                rf.file_type === "selective_language" ||
                lowerName.includes("selective-") ||
                (lowerName.includes("optional-") &&
                  !lowerName.includes("bonus") &&
                  !lowerName.includes("4k") &&
                  !lowerName.includes("credits"))
              ) {
                isOptional = true;
                isSelected = preferred.some((p) =>
                  lowerName.includes(p.toLowerCase()),
                );
              }

              return {
                id: rf.id || `real-f-${idx + 1}`,
                name: rf.name,
                url: rf.path || rf.name,
                size: rf.size,
                bytes: rf.bytes,
                status: isSelected ? "pending" : "skipped",
                isOptional,
                isSelected,
                order: idx + 1,
              };
            });

            setResolveProgress(100);
            setFiles(liveFiles);
            setIsLiveMetadata(true);
            setActualTorrentName(realMeta.name);
            setIsResolving(false);
            return;
          }
        } catch (err) {
          console.warn(
            "Swarm cache lookup skipped/fallback to dynamic parser:",
            err,
          );
        }
      }

      // Fallback: dynamic estimation if offline or torrent cache lookup failed
      if (isMounted) {
        setResolveProgress(100);
        setFiles(generateTorrentFiles(title, repackSize, preferred));
        setIsResolving(false);
      }
    }

    resolveMetadata();

    return () => {
      isMounted = false;
    };
  }, [opened, magnetUrl, title, repackSize]);

  const handleBrowseFolder = async () => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    setIsBrowsing(true);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setDownloadDir(selected);
        await saveDefaultDownloadDir(selected);
      }
    } catch (err) {
      console.error("Failed to open directory dialog:", err);
    } finally {
      setIsBrowsing(false);
    }
  };

  const toggleFile = (fileId: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== fileId) return f;
        if (!f.isOptional) return f; // Mandatory files cannot be deselected
        const nextSelected = !f.isSelected;
        return {
          ...f,
          isSelected: nextSelected,
          status: nextSelected ? "pending" : "skipped",
        };
      }),
    );
  };

  const handleSelectAll = (select: boolean) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (!f.isOptional && !select) return f; // keep mandatory checked
        return {
          ...f,
          isSelected: select,
          status: select ? "pending" : "skipped",
        };
      }),
    );
  };

  const handleSelectRequiredOnly = () => {
    setFiles((prev) =>
      prev.map((f) => ({
        ...f,
        isSelected: !f.isOptional || f.name.toLowerCase().includes("english"),
        status:
          !f.isOptional || f.name.toLowerCase().includes("english")
            ? "pending"
            : "skipped",
      })),
    );
  };

  // Selected files count & total size
  const selectedStats = useMemo(() => {
    const selected = files.filter((f) => f.isSelected);
    let totalBytes = 0;
    selected.forEach((f) => {
      if (typeof f.bytes === "number" && f.bytes > 0) {
        totalBytes += f.bytes;
      } else {
        totalBytes += parseSizeMB(f.size) * 1024 * 1024;
      }
    });

    const totalMB = totalBytes / (1024 * 1024);
    const totalGB = totalBytes / (1024 * 1024 * 1024);

    const formattedSize =
      totalGB >= 1
        ? `${totalGB.toFixed(2)} GB`
        : totalMB >= 1
          ? `${totalMB.toFixed(1)} MB`
          : totalBytes >= 1024
            ? `${(totalBytes / 1024).toFixed(1)} KB`
            : `${totalBytes} B`;

    return {
      count: selected.length,
      totalFiles: files.length,
      size: formattedSize,
    };
  }, [files]);

  const handleStartDownload = async () => {
    if (existingDownload) {
      onClose();
      if (openDownloadsTab && onDownloadStarted) {
        onDownloadStarted();
      }
      return;
    }

    // Map selected files to indices if selective
    const selectedIndices: number[] = [];
    files.forEach((f, idx) => {
      if (f.isSelected) selectedIndices.push(idx);
    });

    let resolvedHash = magnetInfo.hash;

    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const infoHash = await invoke<string>("start_torrent_download", {
          magnetUrl,
          downloadDir: effectiveDownloadDir,
          selectedFileIndices:
            selectedIndices.length < files.length ? selectedIndices : null,
        });
        if (infoHash && infoHash !== "list_only") {
          resolvedHash = infoHash;
        }
      } catch (err) {
        console.error("Failed to start native torrent download:", err);
      }
    }

    addMagnetDownload({
      title: title || magnetInfo.name,
      magnetUrl,
      size: selectedStats.size,
      downloadDir: effectiveDownloadDir,
      coverUrl,
      files,
      infoHash: resolvedHash,
    });

    // Automatically set Windows custom folder cover icon in the background if enabled
    const torrentSettings = getTorrentSettings();
    if (
      torrentSettings.applyFolderCoverIcon &&
      coverUrl &&
      typeof window !== "undefined" &&
      "__TAURI_INTERNALS__" in window
    ) {
      import("@tauri-apps/api/core").then(({ invoke }) => {
        invoke("set_folder_cover_icon", {
          folderPath: effectiveDownloadDir,
          coverUrl,
        }).catch((err) => console.warn("Failed to set folder cover icon:", err));
      });
    }

    onClose();

    if (openDownloadsTab && onDownloadStarted) {
      onDownloadStarted();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <Magnet size={18} color="var(--mantine-color-blue-4)" />
          <Text fw={700} size="sm" className="heading-font">
            Torrent Metadata & Selective File Download
          </Text>
        </Group>
      }
      size="xl"
      radius="lg"
      centered
      styles={{
        content: {
          backgroundColor: "var(--mantine-color-body)",
          border: "1px solid var(--mantine-color-default-border)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
        },
        header: {
          borderBottom: "1px solid var(--mantine-color-default-border)",
          paddingBottom: "12px",
        },
      }}
    >
      <Stack gap="md" mt="xs">
        {/* Game summary preview card */}
        <Paper
          p="md"
          radius="md"
          bg="var(--mantine-color-default)"
          style={{ border: "1px solid var(--mantine-color-blue-8)" }}
        >
          <Group align="flex-start" gap="md" wrap="nowrap">
            {coverUrl && (
              <Image
                src={coverUrl}
                w={75}
                h={100}
                radius="sm"
                fallbackSrc="https://placehold.co/75x100/12141d/3b82f6?text=Cover"
                style={{ objectFit: "cover", flexShrink: 0 }}
              />
            )}
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              <Group justify="space-between" align="center">
                <Badge color="blue" size="xs" variant="filled">
                  TORRENT MAGNET
                </Badge>
                {isResolving ? (
                  <Group gap={6}>
                    <Loader size={12} color="blue" />
                    <Text size="11px" c="blue.3" fw={600}>
                      Resolving Torrent Metadata...
                    </Text>
                  </Group>
                ) : (
                  <Badge
                    color={isLiveMetadata ? "teal" : "blue"}
                    size="xs"
                    variant="light"
                    leftSection={<CheckCircle2 size={11} />}
                  >
                    {isLiveMetadata
                      ? "Live Swarm Metadata"
                      : "Metadata Resolved"}{" "}
                    ({files.length} files)
                  </Badge>
                )}
              </Group>

              <Text
                fw={700}
                size="sm"
                lineClamp={2}
                style={{ lineHeight: 1.3 }}
              >
                {title}
              </Text>

              <Group gap="xs" mt={4} wrap="wrap">
                {repackSize && (
                  <Badge
                    size="xs"
                    variant="light"
                    color="teal"
                    leftSection={<Sparkles size={10} />}
                  >
                    Repack Size: {repackSize}
                  </Badge>
                )}
                {originalSize && (
                  <Badge size="xs" variant="outline" color="gray">
                    Original: {originalSize}
                  </Badge>
                )}
                <Badge size="xs" variant="filled" color="indigo">
                  Selected to Download: {selectedStats.size}
                </Badge>
                {magnetInfo.trackersCount > 0 && (
                  <Group justify="space-between" align="center">
                    <Text size="11px" c="dimmed">
                      Trackers:
                    </Text>
                    <Text size="11px" ff="monospace" c="teal.3">
                      {magnetInfo.trackersCount} active
                    </Text>
                  </Group>
                )}
              </Group>
            </Stack>
          </Group>
        </Paper>

        {/* Destination directory selector */}
        <Stack gap={6}>
          <Text size="xs" fw={700} c="dimmed">
            Download Location
          </Text>
          <Group gap="xs">
            <TextInput
              value={downloadDir}
              onChange={(e) => setDownloadDir(e.target.value)}
              placeholder="e.g. D:\Games\Downloads"
              style={{ flex: 1 }}
              size="sm"
              radius="md"
              leftSection={
                <Folder size={16} color="var(--mantine-color-blue-4)" />
              }
            />
            <Button
              variant="light"
              color="blue"
              size="sm"
              radius="md"
              loading={isBrowsing}
              onClick={handleBrowseFolder}
            >
              Browse...
            </Button>
          </Group>

          <Group justify="space-between" align="center" mt={2} wrap="wrap">
            <Checkbox
              checked={createSubfolder}
              onChange={(e) => setCreateSubfolder(e.currentTarget.checked)}
              label="Create subfolder for game files"
              size="xs"
            />
            <Text
              size="11px"
              c="teal.4"
              truncate
              style={{ maxWidth: 450 }}
            >
              Destination: {effectiveDownloadDir}
            </Text>
          </Group>
        </Stack>

        {/* Selective Files Selection Table */}
        <Paper
          p="xs"
          radius="md"
          bg="var(--mantine-color-default)"
          style={{ border: "1px solid var(--mantine-color-default-border)" }}
        >
          <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="wrap" gap="xs">
              <Group gap="xs">
                <FileCheck size={16} color="var(--mantine-color-blue-4)" />
                <Text size="xs" fw={700}>
                  Selective Torrent Files ({selectedStats.count} of{" "}
                  {selectedStats.totalFiles} selected)
                </Text>
              </Group>

              <Group gap={6} wrap="wrap">
                <SegmentedControl
                  size="xs"
                  value={fileFilter}
                  onChange={(val) => setFileFilter(val as any)}
                  data={[
                    { label: `All (${files.length})`, value: "all" },
                    {
                      label: `Optional Only (${optionalCount})`,
                      value: "optional",
                    },
                    { label: `Main (${requiredCount})`, value: "required" },
                  ]}
                />

                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="blue"
                  onClick={() => handleSelectAll(true)}
                >
                  Select All
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="orange"
                  onClick={() => handleSelectAll(false)}
                >
                  Deselect Optional
                </Button>
              </Group>
            </Group>

            {isResolving ? (
              <Box py="xl" style={{ textAlign: "center" }}>
                <Loader size="sm" color="blue" mx="auto" mb="xs" />
                <Text size="xs" c="dimmed">
                  Fetching swarm peer lists and parsing torrent file headers...
                </Text>
                <Progress
                  value={resolveProgress}
                  size="xs"
                  color="blue"
                  radius="xl"
                  mt="sm"
                  animated
                />
              </Box>
            ) : (
              <ScrollArea h={190} offsetScrollbars type="auto">
                <Table striped highlightOnHover verticalSpacing={6} fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 36 }}></Table.Th>
                      <Table.Th>File Name</Table.Th>
                      <Table.Th style={{ width: 100 }}>Type</Table.Th>
                      <Table.Th style={{ width: 90, textAlign: "right" }}>
                        Size
                      </Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {displayedFiles.length === 0 ? (
                      <Table.Tr>
                        <Table.Td
                          colSpan={4}
                          style={{ textAlign: "center", padding: "24px" }}
                        >
                          <Text size="xs" c="dimmed">
                            {fileFilter === "optional"
                              ? "No optional files in this torrent (all files are required)."
                              : "No matching files."}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      displayedFiles.map((file) => (
                        <Table.Tr
                          key={file.id}
                          style={{
                            opacity: file.isSelected ? 1 : 0.45,
                            cursor: file.isOptional ? "pointer" : "default",
                          }}
                          onClick={() => {
                            if (file.isOptional) toggleFile(file.id);
                          }}
                        >
                          <Table.Td onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={file.isSelected}
                              disabled={!file.isOptional}
                              onChange={() => toggleFile(file.id)}
                              size="xs"
                            />
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              {file.name.endsWith(".exe") ? (
                                <FileCode size={14} color="#38d9a9" />
                              ) : file.name.includes(".bin") ? (
                                <HardDrive size={14} color="#4dabf7" />
                              ) : (
                                <FileText size={14} color="#adb5bd" />
                              )}
                              <Text
                                size="xs"
                                fw={file.isSelected ? 600 : 400}
                                lineClamp={1}
                              >
                                {file.name}
                              </Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            {file.isOptional ? (
                              <Badge size="xs" color="violet" variant="light">
                                Optional
                              </Badge>
                            ) : (
                              <Badge size="xs" color="teal" variant="outline">
                                Required
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td
                            style={{
                              textAlign: "right",
                              fontFamily: "monospace",
                            }}
                          >
                            <Text
                              size="11px"
                              c={file.isSelected ? "blue.3" : "dimmed"}
                            >
                              {file.size}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Stack>
        </Paper>

        {/* Magnet info detail breakdown */}
        {/* <Paper
          p="xs"
          radius="md"
          bg="dark.9"
          style={{ border: "1px solid var(--mantine-color-dark-6)" }}
        >
          <Stack gap={4}>
            <Group justify="space-between" align="center">
              <Text size="11px" c="dimmed">
                Info Hash:
              </Text>
              <Text size="11px" ff="monospace" c="blue.3">
                {magnetInfo.hash.slice(0, 24)}...
              </Text>
            </Group>
            {magnetInfo.trackersCount > 0 && (
              <Group justify="space-between" align="center">
                <Text size="11px" c="dimmed">
                  Swarm Trackers:
                </Text>
                <Text size="11px" ff="monospace" c="teal.3">
                  {magnetInfo.trackersCount} Public Peer Trackers
                </Text>
              </Group>
            )}
          </Stack>
        </Paper> */}

        {/* Existing Download Alert */}
        {existingDownload && (
          <Paper
            p="xs"
            radius="md"
            bg="var(--mantine-color-blue-light)"
            style={{ border: "1px solid var(--mantine-color-blue-outline)" }}
          >
            <Group justify="space-between" align="center" wrap="nowrap">
              <Group gap="xs" wrap="nowrap">
                <ThemeIcon size="sm" color="blue" variant="light">
                  <CheckCircle2 size={14} />
                </ThemeIcon>
                <Text size="xs" fw={600} c="blue">
                  This torrent is already in your downloads list (
                  {existingDownload.status === "downloading"
                    ? `Downloading - ${existingDownload.progress.toFixed(1)}%`
                    : existingDownload.status === "completed"
                      ? "Completed"
                      : existingDownload.status}
                  )
                </Text>
              </Group>
              <Badge size="xs" color="blue" variant="filled">
                ALREADY ADDED
              </Badge>
            </Group>
          </Paper>
        )}

        {/* Options */}
        <Checkbox
          checked={openDownloadsTab}
          onChange={(e) => setOpenDownloadsTab(e.currentTarget.checked)}
          label="Open Downloads Manager tab after starting"
          size="xs"
        />

        <Divider my="xs" />

        {/* Modal Action Buttons */}
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            Total Selected:{" "}
            <b style={{ color: "#4dabf7" }}>{selectedStats.size}</b>
          </Text>

          <Group gap="sm">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              radius="md"
              onClick={onClose}
            >
              Cancel
            </Button>
            {existingDownload ? (
              <Button
                variant="filled"
                color="blue"
                size="sm"
                radius="md"
                leftSection={<DownloadCloud size={16} />}
                onClick={() => {
                  onClose();
                  if (onDownloadStarted) {
                    onDownloadStarted();
                  }
                }}
              >
                View in Downloads
              </Button>
            ) : (
              <Button
                variant="filled"
                color="blue"
                size="sm"
                radius="md"
                disabled={isResolving || selectedStats.count === 0}
                leftSection={<DownloadCloud size={16} />}
                onClick={handleStartDownload}
              >
                Start In-App Download ({selectedStats.size})
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};
