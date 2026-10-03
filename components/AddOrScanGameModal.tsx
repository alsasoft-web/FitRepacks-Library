"use client";

import React, { useState } from "react";
import { Game, IgdbGameMetadata, ScannedExecutable } from "../lib/types";
import {
  parseScannedPath,
  isLikelyGameExecutable,
  detectIsFitgirlRepack,
  scanDirectory,
} from "../lib/scanner";
import { searchIgdbMetadata } from "../lib/igdb";
import { getLastScannedPath, saveLastScannedPath, detectInstalledGameVersion } from "../lib/db";
import { invoke } from "@tauri-apps/api/core";
import {
  Modal,
  TextInput,
  Textarea,
  Button,
  Stack,
  Group,
  Paper,
  Image,
  Text,
  Title,
  Box,
  SimpleGrid,
  SegmentedControl,
  Checkbox,
  Badge,
  Alert,
  ScrollArea,
  Tooltip,
  ActionIcon,
  Divider,
} from "@mantine/core";
import {
  Plus,
  Search,
  Folder,
  Image as ImageIcon,
  Sparkles,
  Check,
  FileCode,
  FolderSearch,
  AlertCircle,
  Edit3,
  X,
  RefreshCw,
} from "lucide-react";

interface AddOrScanGameModalProps {
  opened: boolean;
  onClose: () => void;
  onAddGame: (game: Game) => void;
  onImportGames: (games: Game[]) => void;
  initialTab?: "scan" | "manual";
}

export const AddOrScanGameModal: React.FC<AddOrScanGameModalProps> = ({
  opened,
  onClose,
  onAddGame,
  onImportGames,
  initialTab = "scan",
}) => {
  const [activeTab, setActiveTab] = useState<"scan" | "manual">(initialTab);

  // --- Manual Add State ---
  const [manualTitle, setManualTitle] = useState("");
  const [manualExePath, setManualExePath] = useState("");
  const [manualVersion, setManualVersion] = useState("");
  const [manualCoverUrl, setManualCoverUrl] = useState("");
  const [manualBannerUrl, setManualBannerUrl] = useState("");
  const [manualSummary, setManualSummary] = useState("");
  const [manualGenres, setManualGenres] = useState("Action, RPG");
  const [manualDeveloper, setManualDeveloper] = useState("");
  const [manualSelectedIgdb, setManualSelectedIgdb] = useState<IgdbGameMetadata | null>(null);
  const [isSearchingManualIgdb, setIsSearchingManualIgdb] = useState(false);
  const [manualIgdbResults, setManualIgdbResults] = useState<IgdbGameMetadata[]>([]);

  // --- Scan State ---
  const [folderPath, setFolderPath] = useState<string>(() => getLastScannedPath());
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<ScannedExecutable[]>([]);
  const [selectedScanIds, setSelectedScanIds] = useState<Set<string>>(new Set());
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Inline IGDB re-match state for scanned items
  const [activeEditingId, setActiveEditingId] = useState<string | null>(null);
  const [customSearchQuery, setCustomSearchQuery] = useState("");
  const [isSearchingItemIgdb, setIsSearchingItemIgdb] = useState(false);
  const [itemIgdbResults, setItemIgdbResults] = useState<IgdbGameMetadata[]>([]);

  // --- Manual Add Handlers ---
  const handleBrowseManualExe = async () => {
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const chosen = await open({
          filters: [{ name: "Executable", extensions: ["exe"] }],
          multiple: false,
        });
        if (chosen && typeof chosen === "string") {
          setManualExePath(chosen);
          if (!manualTitle) {
            const fileName =
              chosen.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") || "";
            setManualTitle(fileName);
          }
          const autoVer = await detectInstalledGameVersion(chosen);
          if (autoVer && !manualVersion) {
            setManualVersion(autoVer);
          }
        }
      }
    } catch {}
  };

  const handleAutoDetectManualVersion = async () => {
    if (!manualExePath) return;
    const autoVer = await detectInstalledGameVersion(manualExePath);
    if (autoVer) setManualVersion(autoVer);
  };

  const handleSearchManualIgdb = async () => {
    if (!manualTitle.trim()) return;
    setIsSearchingManualIgdb(true);
    try {
      const results = await searchIgdbMetadata(manualTitle);
      setManualIgdbResults(results);
    } catch {
    } finally {
      setIsSearchingManualIgdb(false);
    }
  };

  const applyManualIgdbMatch = (match: IgdbGameMetadata) => {
    setManualTitle(match.name);
    setManualCoverUrl(match.coverUrl);
    setManualBannerUrl(match.bannerUrl || "");
    setManualSummary(match.summary);
    setManualGenres(match.genres.join(", "));
    setManualDeveloper(match.developer || "");
    setManualSelectedIgdb(match);
    setManualIgdbResults([]);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    const cleanExe = (manualExePath || "").trim();
    const isFitgirl = cleanExe ? await detectIsFitgirlRepack(cleanExe) : false;

    const newGame: Game = {
      id: `game-${Math.random().toString(36).substring(2, 9)}`,
      title: manualTitle.trim(),
      exePath: cleanExe,
      igdbId: manualSelectedIgdb?.id,
      version: manualVersion.trim() || undefined,
      installedVersion: manualVersion.trim() || undefined,
      workingDir: cleanExe.includes("\\")
        ? cleanExe.substring(0, cleanExe.lastIndexOf("\\"))
        : undefined,
      installDirectory: cleanExe.includes("\\")
        ? cleanExe.substring(0, cleanExe.lastIndexOf("\\"))
        : undefined,
      coverUrl:
        manualCoverUrl ||
        `https://placehold.co/600x800/0f172a/3b82f6?text=${encodeURIComponent(manualTitle)}`,
      bannerUrl: manualBannerUrl || undefined,
      summary: manualSummary || undefined,
      screenshots: manualSelectedIgdb?.screenshots,
      videos: manualSelectedIgdb?.videos,
      genres: manualGenres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
      developer: manualDeveloper || undefined,
      releaseYear: manualSelectedIgdb?.releaseYear,
      releaseDate: manualSelectedIgdb?.releaseDate,
      rating: manualSelectedIgdb?.rating,
      playtimeMinutes: 0,
      hoursPlayed: 0,
      playSessions: [],
      isFavorite: false,
      isInstalled: Boolean(cleanExe),
      source: "manual",
      dateAdded: new Date().toISOString(),
      isWishlisted: false,
      tags: cleanExe ? ["Manual"] : [],
    };

    onAddGame(newGame);
    onClose();
  };

  // --- Scan Handlers ---
  const handleBrowseScanFolder = async () => {
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const chosen = await open({ directory: true, multiple: false });
        if (chosen && typeof chosen === "string") {
          setFolderPath(chosen);
          saveLastScannedPath(chosen);
        }
      }
    } catch {}
  };

  const handleScan = async () => {
    if (!folderPath.trim()) return;
    const rawTarget = folderPath.trim();
    saveLastScannedPath(rawTarget);

    setIsScanning(true);
    setScanResults([]);
    setSelectedScanIds(new Set());
    setScanMessage(null);
    setActiveEditingId(null);

    try {
      let exePaths: string[] = [];

      const scanned = await scanDirectory(rawTarget);
      if (scanned && scanned.length > 0) {
        exePaths = scanned.map((s) => s.path).filter(isLikelyGameExecutable);
      } else if (rawTarget.toLowerCase().endsWith(".exe")) {
        if (isLikelyGameExecutable(rawTarget)) {
          exePaths = [rawTarget];
        }
      }

      if (exePaths.length === 0) {
        setScanMessage(
          `No valid game executable (.exe) files found in "${rawTarget}". Utility installers and crash reporters were ignored.`,
        );
        setIsScanning(false);
        return;
      }

      const instantScannedItems = exePaths.map((p) =>
        parseScannedPath(p, rawTarget),
      );
      setScanResults(instantScannedItems);
      setSelectedScanIds(new Set());
      setIsScanning(false);

      // Async background IGDB cover enrichment
      instantScannedItems.forEach(async (item) => {
        try {
          const matches = await searchIgdbMetadata(item.detectedGameTitle);
          if (matches.length > 0) {
            setScanResults((prev) =>
              prev.map((r) =>
                r.id === item.id && !r.igdbMatch
                  ? {
                      ...r,
                      igdbMatch: matches[0],
                    }
                  : r,
              ),
            );
          }
        } catch {}
      });
    } catch (err) {
      setScanMessage(
        `Directory scan failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      setIsScanning(false);
    }
  };

  const toggleSelectScanItem = (id: string) => {
    setSelectedScanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllScan = () => {
    if (selectedScanIds.size === scanResults.length) {
      setSelectedScanIds(new Set());
    } else {
      setSelectedScanIds(new Set(scanResults.map((r) => r.id)));
    }
  };

  const handleStartSearchItemMatch = async (item: ScannedExecutable) => {
    setActiveEditingId(item.id);
    setCustomSearchQuery(item.detectedGameTitle);
    setIsSearchingItemIgdb(true);
    try {
      const results = await searchIgdbMetadata(item.detectedGameTitle);
      setItemIgdbResults(results);
    } catch {
      setItemIgdbResults([]);
    } finally {
      setIsSearchingItemIgdb(false);
    }
  };

  const handleExecuteCustomSearch = async () => {
    if (!customSearchQuery.trim()) return;
    setIsSearchingItemIgdb(true);
    try {
      const results = await searchIgdbMetadata(customSearchQuery);
      setItemIgdbResults(results);
    } catch {
      setItemIgdbResults([]);
    } finally {
      setIsSearchingItemIgdb(false);
    }
  };

  const applyItemMatch = (itemId: string, match: IgdbGameMetadata) => {
    setScanResults((prev) =>
      prev.map((r) =>
        r.id === itemId
          ? {
              ...r,
              detectedGameTitle: match.name,
              igdbMatch: match,
            }
          : r,
      ),
    );
    setActiveEditingId(null);
    setItemIgdbResults([]);
  };

  const handleConfirmImport = async () => {
    const selectedItems = scanResults.filter((r) => selectedScanIds.has(r.id));
    const toImport: Game[] = await Promise.all(
      selectedItems.map(async (r) => {
        const igdb = r.igdbMatch;
        const autoVersion = await detectInstalledGameVersion(r.fullPath);
        return {
          id: `game-${Math.random().toString(36).substring(2, 9)}`,
          title: igdb?.name || r.detectedGameTitle,
          exePath: r.fullPath,
          igdbId: igdb?.id,
          version: autoVersion,
          installedVersion: autoVersion,
          workingDir: r.fullPath.includes("\\")
            ? r.fullPath.substring(0, r.fullPath.lastIndexOf("\\"))
            : undefined,
          installDirectory: r.fullPath.includes("\\")
            ? r.fullPath.substring(0, r.fullPath.lastIndexOf("\\"))
            : undefined,
          coverUrl:
            igdb?.coverUrl ||
            `https://placehold.co/600x800/0f172a/3b82f6?text=${encodeURIComponent(r.detectedGameTitle)}`,
          bannerUrl: igdb?.bannerUrl,
          summary: igdb?.summary,
          screenshots: igdb?.screenshots,
          videos: igdb?.videos,
          genres: igdb?.genres || ["Action", "Scanned"],
          developer: igdb?.developer,
          releaseYear: igdb?.releaseYear,
          releaseDate: igdb?.releaseDate,
          rating: igdb?.rating,
          playtimeMinutes: 0,
          hoursPlayed: 0,
          playSessions: [],
          isFavorite: false,
          isInstalled: true,
          source: "manual",
          dateAdded: new Date().toISOString(),
          tags: ["Imported"],
        };
      }),
    );

    onImportGames(toImport);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      radius="lg"
      title={
        <Group gap="xs">
          <Paper radius="md" p={6} bg="blue.9">
            <Plus size={18} color="#74c0fc" />
          </Paper>
          <Box>
            <Text fw={700} size="md" c="white">
              Add Games to Library
            </Text>
            <Text size="xs" c="dimmed">
              Scan directories to batch discover games, or add a single game manually
            </Text>
          </Box>
        </Group>
      }
      styles={{
        content: {
          backgroundColor: "var(--mantine-color-body)",
          border: "1px solid var(--mantine-color-dark-4)",
        },
      }}
    >
      <Stack gap="md">
        <SegmentedControl
          value={activeTab}
          onChange={(val) => setActiveTab(val as "scan" | "manual")}
          data={[
            {
              value: "scan",
              label: (
                <Group gap="xs" justify="center">
                  <FolderSearch size={15} color="#4dabf7" />
                  <Text size="xs" fw={700}>
                    Scan Folder
                  </Text>
                </Group>
              ),
            },
            {
              value: "manual",
              label: (
                <Group gap="xs" justify="center">
                  <FileCode size={15} color="#38d9a9" />
                  <Text size="xs" fw={700}>
                    Add Manually
                  </Text>
                </Group>
              ),
            },
          ]}
          fullWidth
          radius="md"
          color="blue"
        />

        {/* TAB 1: SCAN DIRECTORY */}
        {activeTab === "scan" && (
          <Stack gap="sm">
            <Paper p="sm" bg="var(--mantine-color-default)" radius="md">
              <Stack gap="xs">
                <Text size="xs" fw={700} c="dimmed">
                  Games Folder
                </Text>
                <Group gap="xs">
                  <TextInput
                    style={{ flex: 1 }}
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder="D:\Games or C:\Program Files"
                    leftSection={<Folder size={16} />}
                    radius="md"
                  />
                  <Button
                    variant="light"
                    color="gray"
                    onClick={handleBrowseScanFolder}
                    leftSection={<Folder size={16} color="#4dabf7" />}
                    radius="md"
                  >
                    Browse
                  </Button>
                  <Button
                    color="blue"
                    onClick={handleScan}
                    loading={isScanning}
                    leftSection={<FolderSearch size={16} />}
                    radius="md"
                  >
                    Scan
                  </Button>
                </Group>
              </Stack>
            </Paper>

            {scanMessage && (
              <Alert
                icon={<AlertCircle size={16} />}
                color="yellow"
                variant="light"
                radius="md"
              >
                {scanMessage}
              </Alert>
            )}

            {scanResults.length > 0 && (
              <Group justify="space-between" align="center" px={4}>
                <Checkbox
                  label={`Select All (${scanResults.length} executables found)`}
                  checked={
                    selectedScanIds.size === scanResults.length &&
                    scanResults.length > 0
                  }
                  indeterminate={
                    selectedScanIds.size > 0 &&
                    selectedScanIds.size < scanResults.length
                  }
                  onChange={toggleSelectAllScan}
                  size="xs"
                />
                <Text size="xs" c="dimmed" ff="monospace">
                  {selectedScanIds.size} of {scanResults.length} selected
                </Text>
              </Group>
            )}

            <ScrollArea h={340} offsetScrollbars>
              {scanResults.length > 0 ? (
                <Stack gap={8}>
                  {scanResults.map((item) => {
                    const isSelected = selectedScanIds.has(item.id);
                    const isEditing = activeEditingId === item.id;
                    return (
                      <Stack key={item.id} gap={4}>
                        <Paper
                          p="xs"
                          radius="md"
                          bg={isSelected ? "dark.6" : "dark.8"}
                          style={{
                            border: isSelected
                              ? "1px solid var(--mantine-color-blue-6)"
                              : "1px solid var(--mantine-color-dark-4)",
                          }}
                        >
                          <Group justify="space-between" align="center" wrap="nowrap">
                            <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleSelectScanItem(item.id)}
                                size="xs"
                              />
                              <Image
                                src={
                                  item.igdbMatch?.coverUrl ||
                                  `https://placehold.co/40x54/12141d/3b82f6?text=${encodeURIComponent(item.detectedGameTitle)}`
                                }
                                w={40}
                                h={54}
                                radius="xs"
                                fallbackSrc="https://placehold.co/40x54/12141d/3b82f6?text=Cover"
                                style={{ objectFit: "cover", flexShrink: 0 }}
                              />
                              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                                <Group gap="xs" wrap="nowrap">
                                  <Text fw={700} size="sm" truncate>
                                    {item.igdbMatch?.name || item.detectedGameTitle}
                                  </Text>
                                  {item.igdbMatch ? (
                                    <Badge size="xs" color="teal" variant="light">
                                      IGDB Matched
                                    </Badge>
                                  ) : (
                                    <Badge size="xs" color="yellow" variant="light">
                                      Local Parse
                                    </Badge>
                                  )}
                                </Group>
                                <Text size="11px" c="dimmed" truncate>
                                  {item.fullPath}
                                </Text>
                              </Stack>
                            </Group>

                            <Tooltip label="Change / Fix IGDB Metadata Match">
                              <ActionIcon
                                variant="subtle"
                                color="blue"
                                size="sm"
                                radius="md"
                                onClick={() =>
                                  isEditing
                                    ? setActiveEditingId(null)
                                    : handleStartSearchItemMatch(item)
                                }
                              >
                                {isEditing ? <X size={14} /> : <Edit3 size={14} />}
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Paper>

                        {/* Inline IGDB Match Search Panel */}
                        {isEditing && (
                          <Paper
                            p="xs"
                            bg="var(--mantine-color-default)"
                            style={{ border: "1px solid var(--mantine-color-default-border)" }}
                            radius="md"
                            ml={30}
                          >
                            <Stack gap="xs">
                              <Group gap="xs">
                                <TextInput
                                  size="xs"
                                  placeholder="Search title or IGDB ID (e.g. 103261)..."
                                  value={customSearchQuery}
                                  onChange={(e) => setCustomSearchQuery(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      handleExecuteCustomSearch();
                                    }
                                  }}
                                  style={{ flex: 1 }}
                                />
                                <Button
                                  size="xs"
                                  color="blue"
                                  loading={isSearchingItemIgdb}
                                  onClick={handleExecuteCustomSearch}
                                >
                                  Search
                                </Button>
                              </Group>

                              {itemIgdbResults.length === 0 && !isSearchingItemIgdb && customSearchQuery.trim() && (
                                <Text size="xs" c="dimmed" ta="center" py="xs">
                                  No matches found on IGDB for &quot;{customSearchQuery}&quot;
                                </Text>
                              )}

                              {itemIgdbResults.map((match) => (
                                <Paper
                                  key={match.id}
                                  p="xs"
                                  bg="var(--mantine-color-body)"
                                  style={{
                                    cursor: "pointer",
                                    border: "1px solid var(--mantine-color-default-border)",
                                  }}
                                  onClick={() => applyItemMatch(item.id, match)}
                                >
                                  <Group justify="space-between">
                                    <Group gap="sm">
                                      <Image
                                        src={match.coverUrl}
                                        h={36}
                                        w={26}
                                        radius="xs"
                                        fit="cover"
                                      />
                                      <Box>
                                        <Text size="xs" fw={700} c="white">
                                          {match.name}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                          {match.genres.join(", ")}
                                        </Text>
                                      </Box>
                                    </Group>
                                    <Button size="xs" color="teal" variant="light">
                                      Select Match
                                    </Button>
                                  </Group>
                                </Paper>
                              ))}
                            </Stack>
                          </Paper>
                        )}
                      </Stack>
                    );
                  })}
                </Stack>
              ) : (
                <Box py={60} style={{ textAlign: "center" }}>
                  <FolderSearch size={40} color="#5c5f66" style={{ margin: "0 auto" }} />
                  <Text size="sm" c="dimmed" mt="xs">
                    Choose a folder and click "Start Scan" to discover installed game executables.
                  </Text>
                </Box>
              )}
            </ScrollArea>

            <Divider my="xs" />

            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {selectedScanIds.size} games selected for import
              </Text>
              <Group gap="sm">
                <Button variant="subtle" color="gray" size="sm" radius="md" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  color="blue"
                  size="sm"
                  radius="md"
                  disabled={selectedScanIds.size === 0}
                  leftSection={<Check size={14} />}
                  onClick={handleConfirmImport}
                >
                  Import {selectedScanIds.size} Games
                </Button>
              </Group>
            </Group>
          </Stack>
        )}

        {/* TAB 2: MANUAL ADD */}
        {activeTab === "manual" && (
          <form onSubmit={handleManualSubmit}>
            <Stack gap="md">
              <Stack gap="xs">
                <Text size="xs" fw={700} c="dimmed">
                  Game Title & IGDB Auto-Sync
                </Text>
                <Group gap="xs">
                  <TextInput
                    style={{ flexGrow: 1 }}
                    required
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder="Search title or IGDB ID (e.g. 103261)..."
                    radius="md"
                  />
                  <Button
                    color="gray"
                    variant="filled"
                    onClick={handleSearchManualIgdb}
                    loading={isSearchingManualIgdb}
                    leftSection={<Search size={14} color="#4dabf7" />}
                    radius="md"
                  >
                    Search IGDB
                  </Button>
                </Group>
              </Stack>

              {manualIgdbResults.length > 0 && (
                <Paper
                  p="xs"
                  bg="var(--mantine-color-default)"
                  style={{ border: "1px solid var(--mantine-color-blue-6)" }}
                  radius="md"
                >
                  <Group gap="xs" mb="xs">
                    <Sparkles size={14} color="#4dabf7" />
                    <Text size="xs" fw={700} c="blue.4">
                      Select IGDB Metadata Match
                    </Text>
                  </Group>
                  <Stack gap={6}>
                    {manualIgdbResults.map((match) => (
                      <Paper
                        key={match.id}
                        p="xs"
                        bg="var(--mantine-color-body)"
                        style={{
                          cursor: "pointer",
                          border: "1px solid var(--mantine-color-default-border)",
                        }}
                        onClick={() => applyManualIgdbMatch(match)}
                      >
                        <Group justify="space-between">
                          <Group gap="sm">
                            <Image
                              src={match.coverUrl}
                              h={40}
                              w={30}
                              radius="xs"
                              fit="cover"
                            />
                            <Box>
                              <Text size="xs" fw={700}>
                                {match.name}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {match.genres.join(", ")}
                              </Text>
                            </Box>
                          </Group>
                          <Badge size="xs" color="blue" variant="light">
                            {match.releaseYear || "Match"}
                          </Badge>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              )}

              <Stack gap="xs">
                <Text size="xs" fw={700} c="dimmed">
                  Executable Target (.exe) (Optional)
                </Text>
                <Group gap="xs">
                  <TextInput
                    style={{ flexGrow: 1 }}
                    value={manualExePath}
                    onChange={(e) => setManualExePath(e.target.value)}
                    placeholder="Optional (e.g. C:\Games\MyGame\bin\x64\game.exe)"
                    leftSection={<Folder size={16} />}
                    radius="md"
                  />
                  <Button
                    variant="filled"
                    color="dark"
                    onClick={handleBrowseManualExe}
                    leftSection={<FileCode size={16} color="#4dabf7" />}
                    radius="md"
                  >
                    Browse Exe
                  </Button>
                </Group>
              </Stack>

              <Group gap="xs">
                <TextInput
                  style={{ flexGrow: 1 }}
                  label="Game Version / Build (Optional)"
                  placeholder="e.g. v1.0.0.0 (Build 16050355) or Build 11905845"
                  value={manualVersion}
                  onChange={(e) => setManualVersion(e.target.value)}
                  radius="md"
                />
                {manualExePath && (
                  <Button
                    variant="light"
                    color="blue"
                    mt={24}
                    onClick={handleAutoDetectManualVersion}
                    leftSection={<Sparkles size={15} />}
                    radius="md"
                  >
                    Auto-Detect
                  </Button>
                )}
              </Group>

              <SimpleGrid cols={2}>
                <TextInput
                  label="Cover Poster URL"
                  value={manualCoverUrl}
                  onChange={(e) => setManualCoverUrl(e.target.value)}
                  placeholder="https://..."
                  leftSection={<ImageIcon size={16} />}
                  radius="md"
                />
                <TextInput
                  label="Banner Backdrop URL"
                  value={manualBannerUrl}
                  onChange={(e) => setManualBannerUrl(e.target.value)}
                  placeholder="https://..."
                  leftSection={<ImageIcon size={16} />}
                  radius="md"
                />
              </SimpleGrid>

              <SimpleGrid cols={2}>
                <TextInput
                  label="Genres (Comma separated)"
                  value={manualGenres}
                  onChange={(e) => setManualGenres(e.target.value)}
                  placeholder="Action, RPG"
                  radius="md"
                />
                <TextInput
                  label="Developer"
                  value={manualDeveloper}
                  onChange={(e) => setManualDeveloper(e.target.value)}
                  placeholder="e.g. CD PROJEKT RED"
                  radius="md"
                />
              </SimpleGrid>

              <Textarea
                label="Game Description"
                rows={3}
                value={manualSummary}
                onChange={(e) => setManualSummary(e.target.value)}
                placeholder="Synopsis..."
                radius="md"
              />

              <Divider my="xs" />

              <Group justify="flex-end">
                <Button variant="subtle" color="gray" onClick={onClose} size="sm" radius="md">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  color="teal"
                  size="sm"
                  radius="md"
                  leftSection={<Check size={14} />}
                >
                  Save Game to Library
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Modal>
  );
};
