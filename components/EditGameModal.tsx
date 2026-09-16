"use client";

import React, { useState } from "react";
import { Game, IgdbGameMetadata } from "../lib/types";
import { searchIgdbMetadata, cleanTitleForIgdb } from "../lib/igdb";
import {
  detectInstalledGameVersion,
  detectGameExeLastModified,
} from "../lib/db";
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
  Badge,
  ActionIcon,
  Tooltip,
  ScrollArea,
} from "@mantine/core";
import {
  Edit3,
  Search,
  Folder,
  Image as ImageIcon,
  Sparkles,
  Check,
  FileCode,
  RefreshCw,
} from "lucide-react";

interface EditGameModalProps {
  game: Game;
  onClose: () => void;
  onSaveGame: (updatedGame: Game) => void;
}

export const EditGameModal: React.FC<EditGameModalProps> = ({
  game,
  onClose,
  onSaveGame,
}) => {
  const [title, setTitle] = useState(game.title);
  const [exePath, setExePath] = useState(game.exePath || "");
  const [version, setVersion] = useState(game.version || "");
  const [coverUrl, setCoverUrl] = useState(game.coverUrl || "");
  const [bannerUrl, setBannerUrl] = useState(game.bannerUrl || "");
  const [summary, setSummary] = useState(game.summary || "");
  const [storyline, setStoryline] = useState(game.storyline || "");
  const [genres, setGenres] = useState((game.genres || []).join(", "));
  const [developer, setDeveloper] = useState(game.developer || "");
  const [releaseYear, setReleaseYear] = useState<number | undefined>(
    game.releaseYear,
  );
  const [releaseDate, setReleaseDate] = useState<string | undefined>(
    game.releaseDate,
  );
  const [rating, setRating] = useState<number | undefined>(game.rating);
  const [screenshots, setScreenshots] = useState<string[]>(
    game.screenshots || [],
  );
  const [videos, setVideos] = useState<string[]>(game.videos || []);
  const [alternateCovers, setAlternateCovers] = useState<string[]>([]);

  const [igdbSearchQuery, setIgdbSearchQuery] = useState(
    cleanTitleForIgdb(game.title),
  );
  const [isSearchingIgdb, setIsSearchingIgdb] = useState(false);
  const [igdbResults, setIgdbResults] = useState<IgdbGameMetadata[]>([]);

  // Native executable file picker dialog via Tauri plugin
  const handleBrowseExe = async () => {
    try {
      if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const chosen = await open({
          filters: [{ name: "Executable", extensions: ["exe"] }],
          multiple: false,
        });
        if (chosen && typeof chosen === "string") {
          setExePath(chosen);
          const autoVer = await detectInstalledGameVersion(chosen);
          if (autoVer && !version) {
            setVersion(autoVer);
          }
        }
      }
    } catch {
      // fallback
    }
  };

  const handleAutoDetectVersion = async () => {
    if (!exePath) return;
    const autoVer = await detectInstalledGameVersion(exePath);
    if (autoVer) {
      setVersion(autoVer);
    }
  };

  const handleSearchIgdb = async () => {
    if (!igdbSearchQuery.trim()) {
      return;
    }
    setIsSearchingIgdb(true);
    try {
      const results = await searchIgdbMetadata(igdbSearchQuery);
      setIgdbResults(results);
    } catch {
      // ignore
    } finally {
      setIsSearchingIgdb(false);
    }
  };

  const applyIgdbMatch = (match: IgdbGameMetadata) => {
    setTitle(match.name);
    setCoverUrl(match.coverUrl || "");
    setBannerUrl(match.bannerUrl || "");
    setSummary(match.summary || "");
    setStoryline(match.storyline || "");
    setGenres(match.genres.join(", "));
    setDeveloper(match.developer || "");
    setReleaseYear(match.releaseYear);
    setReleaseDate(match.releaseDate);
    setRating(match.rating);
    setScreenshots(match.screenshots || []);
    setVideos(match.videos || []);
    setAlternateCovers(match.alternateCovers || []);
    setIgdbResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      return;
    }

    const cleanExe = (exePath || "").trim();
    let lastModIso = game.installedLastModified;
    if (cleanExe) {
      const detectedLastMod = await detectGameExeLastModified(cleanExe);
      if (detectedLastMod) {
        lastModIso = detectedLastMod.toISOString();
      }
    }

    const updatedGame: Game = {
      ...game,
      title: title.trim(),
      exePath: cleanExe,
      version: version.trim() || undefined,
      installedLastModified: lastModIso,
      isInstalled: Boolean(cleanExe),
      workingDir: cleanExe.includes("\\")
        ? cleanExe.substring(0, cleanExe.lastIndexOf("\\"))
        : game.workingDir,
      installDirectory: cleanExe.includes("\\")
        ? cleanExe.substring(0, cleanExe.lastIndexOf("\\"))
        : game.installDirectory,
      coverUrl,
      bannerUrl: bannerUrl || undefined,
      summary: summary || undefined,
      storyline: storyline || undefined,
      genres: genres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
      developer: developer || undefined,
      releaseYear: releaseYear || undefined,
      releaseDate: releaseDate || undefined,
      rating: rating || undefined,
      screenshots: screenshots.length > 0 ? screenshots : undefined,
      videos: videos.length > 0 ? videos : undefined,
    };

    onSaveGame(updatedGame);
    onClose();
  };

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      radius="xl"
      title={null}
      padding="md"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Group gap="sm">
            <Paper radius="md" p="xs" bg="blue.9">
              <Edit3 size={22} color="#4dabf7" />
            </Paper>
            <Box>
              <Title order={4} c="white">
                Edit Game
              </Title>
              <Text size="xs" c="dimmed">
                Update game details, executable path, or match from IGDB
              </Text>
            </Box>
          </Group>

          {/* IGDB Re-Match Section */}
          <Paper
            p="sm"
            bg="var(--mantine-color-default)"
            style={{ border: "1px solid var(--mantine-color-blue-6)" }}
          >
            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap="xs">
                  <Sparkles size={16} color="#4dabf7" />
                  <Text size="xs" fw={700} c="blue.4">
                    Match from IGDB
                  </Text>
                </Group>
              </Group>

              <Group gap="xs">
                <TextInput
                  style={{ flexGrow: 1 }}
                  value={igdbSearchQuery}
                  onChange={(e) => setIgdbSearchQuery(e.target.value)}
                  placeholder="Search title or IGDB ID..."
                  radius="md"
                  size="xs"
                />
                <Button
                  color="blue"
                  size="xs"
                  onClick={handleSearchIgdb}
                  loading={isSearchingIgdb}
                  leftSection={<Search size={14} />}
                  radius="md"
                >
                  Search
                </Button>
              </Group>

              {igdbResults.length > 0 && (
                <Stack gap={6} mt="xs">
                  <Text size="xs" fw={700} c="dimmed">
                    {igdbResults.length} matches found:
                  </Text>
                  {igdbResults.map((match) => (
                    <Paper
                      key={match.id}
                      p="xs"
                      bg="var(--mantine-color-body)"
                      style={{
                        cursor: "pointer",
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                      onClick={() => applyIgdbMatch(match)}
                    >
                      <Group justify="space-between">
                        <Group gap="sm">
                          <Image
                            src={match.coverUrl}
                            h={44}
                            w={32}
                            radius="xs"
                            fit="cover"
                          />
                          <Box style={{ maxWidth: 300 }}>
                            <Group gap="xs">
                              <Text size="xs" fw={700} c="white">
                                {match.name}
                              </Text>
                              {match.releaseYear && (
                                <Badge size="xs" color="blue" variant="light">
                                  {match.releaseYear}
                                </Badge>
                              )}
                            </Group>
                            <Text size="xs" c="dimmed" truncate>
                              {match.developer
                                ? `Dev: ${match.developer} • `
                                : ""}
                              {match.genres.join(", ")}
                            </Text>
                          </Box>
                        </Group>

                        <Button
                          size="xs"
                          variant="filled"
                          color="teal"
                          leftSection={<RefreshCw size={12} />}
                        >
                          Use this match
                        </Button>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>

          <Stack gap="xs">
            <Text size="xs" fw={700} c="dimmed">
              Game Details
            </Text>
            <TextInput
              label="Game Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              radius="md"
            />
            <Group gap="xs">
              <TextInput
                style={{ flexGrow: 1 }}
                label="Executable Path (.exe)"
                placeholder="e.g. C:\Games\Doom\game.exe"
                value={exePath}
                onChange={(e) => setExePath(e.target.value)}
                leftSection={<Folder size={16} />}
                radius="md"
              />
              <Button
                variant="filled"
                color="dark"
                mt={24}
                onClick={handleBrowseExe}
                leftSection={<FileCode size={16} color="#4dabf7" />}
                radius="md"
              >
                Browse
              </Button>
            </Group>
            <Group gap="xs">
              <TextInput
                style={{ flexGrow: 1 }}
                label="Game Version (Optional)"
                placeholder="e.g. v1.0.4 or Build 11905845"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                radius="md"
              />
              {exePath && (
                <Button
                  variant="light"
                  color="blue"
                  mt={24}
                  onClick={handleAutoDetectVersion}
                  leftSection={<Sparkles size={15} />}
                  radius="md"
                >
                  Detect
                </Button>
              )}
            </Group>
          </Stack>

          <SimpleGrid cols={2} mt="xs">
            <Box>
              <TextInput
                label="Cover Image URL"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="https://..."
                leftSection={<ImageIcon size={16} />}
                radius="md"
              />
              {alternateCovers.length > 1 && (
                <Box mt="xs">
                  <Text size="10px" fw={700} c="dimmed" mb={4}>
                    ALTERNATE COVERS:
                  </Text>
                  <ScrollArea w="100%" type="never">
                    <Group gap="xs" wrap="nowrap">
                      {alternateCovers.map((cover, idx) => (
                        <Image
                          key={idx}
                          src={cover}
                          w={40}
                          h={56}
                          radius="xs"
                          style={{
                            cursor: "pointer",
                            border:
                              coverUrl === cover
                                ? "2px solid var(--mantine-color-blue-filled)"
                                : "2px solid transparent",
                            opacity: coverUrl === cover ? 1 : 0.6,
                          }}
                          onClick={() => setCoverUrl(cover)}
                        />
                      ))}
                    </Group>
                  </ScrollArea>
                </Box>
              )}
            </Box>
            <TextInput
              label="Banner Image URL"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              leftSection={<ImageIcon size={16} />}
              radius="md"
            />
          </SimpleGrid>

          <SimpleGrid cols={2}>
            <TextInput
              label="Genres (comma-separated)"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
              radius="md"
            />
            <TextInput
              label="Developer"
              value={developer}
              onChange={(e) => setDeveloper(e.target.value)}
              radius="md"
            />
          </SimpleGrid>

          <Textarea
            label="Summary"
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            radius="md"
          />

          <Textarea
            label="Storyline"
            rows={2}
            value={storyline}
            onChange={(e) => setStoryline(e.target.value)}
            radius="md"
          />

          <Group
            justify="flex-end"
            pt="xs"
            style={{ borderTop: "1px solid var(--mantine-color-dark-4)" }}
          >
            <Button variant="subtle" color="gray" onClick={onClose} size="xs">
              Cancel
            </Button>
            <Button
              type="submit"
              color="blue"
              size="xs"
              leftSection={<Check size={14} />}
            >
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};
