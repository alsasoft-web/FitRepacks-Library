"use client";

import React, { useState, useEffect } from "react";
import { Game } from "../../lib/types";
import {
  SourceCandidate,
  searchSourceCandidates,
  applyCandidateMatch,
  linkGameToAllSources,
  cleanSearchTitle,
} from "../../lib/gameLinker";
import { openInBrowser } from "../../lib/openUrl";
import {
  Modal,
  TextInput,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  Paper,
  Tabs,
  SimpleGrid,
  Image,
  Loader,
  Card,
  Alert,
  Box,
  ScrollArea,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import {
  Search,
  Sparkles,
  Globe,
  DownloadCloud,
  Flame,
  Check,
  ExternalLink,
  Magnet,
  Star,
  Tag,
  RefreshCw,
  X,
  Info,
} from "lucide-react";

interface SourceLinkerModalProps {
  opened: boolean;
  game: Game | null;
  onClose: () => void;
  onGameUpdated: (updatedGame: Game) => void;
}

export const SourceLinkerModal: React.FC<SourceLinkerModalProps> = ({
  opened,
  game,
  onClose,
  onGameUpdated,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (game && opened) {
      const initialQuery = cleanSearchTitle(game.title) || game.title;
      setSearchQuery(initialQuery);
      setFeedback(null);
      handleSearch(initialQuery);
    }
  }, [game, opened]);

  const handleSearch = async (queryOverride?: string) => {
    const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
    if (!q) return;

    setIsLoading(true);
    setFeedback(null);
    try {
      const results = await searchSourceCandidates(q, "all");
      setCandidates(results);
      if (results.length === 0) {
        setFeedback({
          type: "info",
          text: `No matching candidates found for "${q}". Try modifying the search query above.`,
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "Error searching source candidates.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyMatch = (candidate: SourceCandidate) => {
    if (!game) return;
    const updated = applyCandidateMatch(game, candidate);
    onGameUpdated(updated);
    setFeedback({
      type: "success",
      text: `Successfully linked ${candidate.source.toUpperCase()} metadata! (Version: ${
        candidate.version || "Attached"
      })`,
    });
  };

  const handleAutoLinkAll = async () => {
    if (!game) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const res = await linkGameToAllSources(game, searchQuery);
      if (res.igdbSuccess || res.fitgirlSuccess || res.steamripSuccess) {
        onGameUpdated(res.game);
        const linked: string[] = [];
        if (res.igdbSuccess) linked.push("IGDB");
        if (res.fitgirlSuccess) linked.push("FitGirl");
        if (res.steamripSuccess) linked.push("SteamRIP");
        setFeedback({
          type: "success",
          text: `Auto-linked ${linked.join(", ")} successfully!`,
        });
      } else {
        setFeedback({
          type: "info",
          text: "Auto-link could not find matching records. Try picking an exact candidate below.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "Auto-link failed.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!game) return null;

  const igdbCandidates = candidates.filter((c) => c.source === "igdb");
  const fitgirlCandidates = candidates.filter((c) => c.source === "fitgirl");
  const steamripCandidates = candidates.filter((c) => c.source === "steamrip");

  const filteredCandidates =
    activeTab === "all"
      ? candidates
      : activeTab === "igdb"
        ? igdbCandidates
        : activeTab === "fitgirl"
          ? fitgirlCandidates
          : steamripCandidates;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      radius="xl"
      title={
        <Group gap="xs">
          <Sparkles size={20} color="#4dabf7" />
          <Text fw={700} size="md">
            Match Game Sources
          </Text>
        </Group>
      }
      styles={{
        content: {
          maxWidth: "800px",
          width: "95vw",
        },
      }}
    >
      <Stack gap="md">
        {/* Prominent Search Parameter Input */}
        <Paper
          p="sm"
          radius="md"
          bg="var(--mantine-color-default)"
          style={{ border: "1px solid var(--mantine-color-blue-6)" }}
        >
          <Stack gap="xs">
            <Text size="xs" fw={700} c="dimmed">
              Search Title
            </Text>
            <Group gap="xs">
              <TextInput
                placeholder="Search title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                style={{ flex: 1 }}
                radius="md"
                leftSection={<Search size={16} />}
              />
              <Button
                color="blue"
                radius="md"
                onClick={() => handleSearch()}
                loading={isLoading}
                leftSection={<Search size={14} />}
              >
                Search
              </Button>
              <Button
                color="indigo"
                variant="light"
                radius="md"
                onClick={handleAutoLinkAll}
                loading={isLoading}
                leftSection={<Sparkles size={14} />}
              >
                Auto Match
              </Button>
            </Group>

            {/* Quick preset chips */}
            <Group gap={6} wrap="wrap">
              <Text size="10px" c="dimmed">
                Presets:
              </Text>
              <Badge
                size="xs"
                variant="light"
                color="gray"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  const c = cleanSearchTitle(game.title);
                  setSearchQuery(c);
                  handleSearch(c);
                }}
              >
                Clean Title ({cleanSearchTitle(game.title)})
              </Badge>
              <Badge
                size="xs"
                variant="light"
                color="gray"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setSearchQuery(game.title);
                  handleSearch(game.title);
                }}
              >
                Original Title ({game.title})
              </Badge>
            </Group>
          </Stack>
        </Paper>

        {/* Feedback Alert */}
        {feedback && (
          <Alert
            color={
              feedback.type === "success"
                ? "teal"
                : feedback.type === "error"
                  ? "red"
                  : "blue"
            }
            radius="md"
            withCloseButton
            onClose={() => setFeedback(null)}
          >
            <Text size="xs" fw={600}>
              {feedback.text}
            </Text>
          </Alert>
        )}

        {/* Source Filter Tabs */}
        <Tabs value={activeTab} onChange={(val) => setActiveTab(val || "all")} radius="md">
          <Tabs.List>
            <Tabs.Tab value="all">All ({candidates.length})</Tabs.Tab>
            <Tabs.Tab
              value="igdb"
              leftSection={<Globe size={14} color="#845ef7" />}
            >
              IGDB ({igdbCandidates.length})
            </Tabs.Tab>
            <Tabs.Tab
              value="fitgirl"
              leftSection={<DownloadCloud size={14} color="#f783ac" />}
            >
              FitGirl Repacks ({fitgirlCandidates.length})
            </Tabs.Tab>
            <Tabs.Tab
              value="steamrip"
              leftSection={<Flame size={14} color="#22b8cf" />}
            >
              SteamRIP ({steamripCandidates.length})
            </Tabs.Tab>
          </Tabs.List>

          {/* Results List */}
          <Box pt="sm">
            {isLoading ? (
              <Stack align="center" py="xl" gap="xs">
                <Loader size="md" color="blue" />
                <Text size="xs" c="dimmed">
                  Searching across IGDB, FitGirl & SteamRIP...
                </Text>
              </Stack>
            ) : filteredCandidates.length === 0 ? (
              <Paper
                p="xl"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  textAlign: "center",
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Info size={32} color="#6c757d" style={{ margin: "0 auto 8px" }} />
                <Text size="sm" fw={700}>
                  No matches found
                </Text>
                <Text size="xs" c="dimmed">
                  Try shortening the game title in the search parameter above.
                </Text>
              </Paper>
            ) : (
              <ScrollArea h={400} offsetScrollbars>
                <Stack gap="xs">
                  {filteredCandidates.map((c) => (
                    <Card
                      key={c.id}
                      p="xs"
                      radius="md"
                      bg="var(--mantine-color-default)"
                      style={{
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Group align="flex-start" justify="space-between" wrap="nowrap">
                        <Group align="flex-start" gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                          {c.coverUrl && (
                            <Image
                              src={c.coverUrl}
                              w={50}
                              h={65}
                              radius="xs"
                              fit="cover"
                              style={{ flexShrink: 0 }}
                            />
                          )}

                          <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
                            <Group gap={6} wrap="wrap">
                              <Badge
                                size="xs"
                                color={
                                  c.source === "igdb"
                                    ? "violet"
                                    : c.source === "fitgirl"
                                      ? "pink"
                                      : "cyan"
                                }
                                variant="filled"
                              >
                                {c.source === "igdb"
                                  ? "IGDB"
                                  : c.source === "fitgirl"
                                    ? "FitGirl Repacks"
                                    : "SteamRIP"}
                              </Badge>

                              {/* Detected Version */}
                              {c.version && (
                                <Badge size="xs" color="teal" variant="light">
                                  Version: {c.version}
                                </Badge>
                              )}

                              {c.repackSize && (
                                <Badge size="xs" color="grape" variant="light">
                                  {c.repackSize}
                                </Badge>
                              )}

                              {(c.releaseDate || c.releaseYear) && (
                                <Badge size="xs" color="blue" variant="light">
                                  {c.releaseDate
                                    ? new Date(c.releaseDate).toLocaleDateString("en-US", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                      })
                                    : c.releaseYear}
                                </Badge>
                              )}

                              {c.rating && (
                                <Badge size="xs" color="yellow" variant="light">
                                  {c.rating}/100
                                </Badge>
                              )}
                            </Group>

                            <Text size="xs" fw={700} style={{ wordBreak: "break-word" }}>
                              {c.title}
                            </Text>

                            {c.genres && c.genres.length > 0 && (
                              <Text size="10px" c="dimmed">
                                {c.genres.slice(0, 3).join(", ")}
                              </Text>
                            )}

                            {c.magnetCount !== undefined && (
                              <Group gap={8} mt={2}>
                                <Text size="10px" c="grape.3">
                                  ⚡ {c.magnetCount} Torrent Magnets
                                </Text>
                                <Text size="10px" c="blue.3">
                                  📦 {c.directLinkCount} Direct Mirrors
                                </Text>
                              </Group>
                            )}
                          </Stack>
                        </Group>

                        <Group gap="xs" style={{ flexShrink: 0 }}>
                          {c.url && (
                            <Tooltip label="Open source website" withArrow>
                              <ActionIcon
                                size="sm"
                                variant="subtle"
                                color="gray"
                                onClick={() => openInBrowser(c.url)}
                              >
                                <ExternalLink size={14} />
                              </ActionIcon>
                            </Tooltip>
                          )}

                          <Button
                            size="xs"
                            color="blue"
                            radius="md"
                            leftSection={<Check size={13} />}
                            onClick={() => handleApplyMatch(c)}
                          >
                            Select & Link
                          </Button>
                        </Group>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              </ScrollArea>
            )}
          </Box>
        </Tabs>
      </Stack>
    </Modal>
  );
};
