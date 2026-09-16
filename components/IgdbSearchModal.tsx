"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Modal,
  TextInput,
  Button,
  Stack,
  Group,
  Paper,
  Image,
  Text,
  Title,
  Box,
  Badge,
  ScrollArea,
  ActionIcon,
  Loader,
  Divider,
  Alert,
  Tooltip,
  SimpleGrid,
  ThemeIcon,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  Search,
  X,
  Plus,
  Star,
  Calendar,
  Gamepad2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Bookmark,
  Heart,
} from "lucide-react";
import { IgdbGameMetadata, Game } from "../lib/types";
import { searchIgdbMetadata } from "../lib/igdb";
import {
  addGameToStorage,
  getStoredGames,
  toggleWishlistGame,
  toggleCompletedGame,
  toggleFavoriteGame,
} from "../lib/db";

interface IgdbSearchModalProps {
  opened: boolean;
  onClose: () => void;
  initialQuery?: string;
  onGameAdded?: (game: Game) => void;
}

export const IgdbSearchModal: React.FC<IgdbSearchModalProps> = ({
  opened,
  onClose,
  initialQuery = "",
  onGameAdded,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery] = useDebouncedValue(query, 400);
  const [results, setResults] = useState<IgdbGameMetadata[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState<IgdbGameMetadata | null>(null);
  const [libraryGames, setLibraryGames] = useState<Game[]>(() => getStoredGames());
  const [lastError, setLastError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleUpdate = () => {
      setLibraryGames(getStoredGames());
    };
    window.addEventListener("fitrepacks-games-updated", handleUpdate);
    return () => {
      window.removeEventListener("fitrepacks-games-updated", handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (opened) {
      setLibraryGames(getStoredGames());
      setQuery(initialQuery);
      setResults([]);
      setSelectedGame(null);
      setLastError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [opened, initialQuery]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }
    (async () => {
      setIsSearching(true);
      setLastError(null);
      try {
        const res = await searchIgdbMetadata(debouncedQuery);
        setResults(res);
      } catch {
        setLastError("IGDB search failed. Check your internet connection.");
      } finally {
        setIsSearching(false);
      }
    })();
  }, [debouncedQuery]);

  const getLibGame = (igdbId: number): Game | undefined => {
    return libraryGames.find((g) => g.igdbId === igdbId);
  };

  const handleToggleWishlist = (igdbGame: IgdbGameMetadata, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const existing = getLibGame(igdbGame.id);
    if (existing) {
      toggleWishlistGame(existing.id);
      const updated = getStoredGames();
      setLibraryGames(updated);
      const updatedGame = updated.find((g) => g.id === existing.id);
      if (updatedGame) onGameAdded?.(updatedGame);
    } else {
      const newGame: Game = {
        id: `igdb-${igdbGame.id}-${Date.now()}`,
        title: igdbGame.name,
        exePath: "",
        igdbId: igdbGame.id,
        coverUrl:
          igdbGame.coverUrl ||
          `https://placehold.co/600x800/0f172a/3b82f6?text=${encodeURIComponent(igdbGame.name)}`,
        bannerUrl: igdbGame.bannerUrl || igdbGame.coverUrl,
        summary: igdbGame.summary,
        storyline: igdbGame.storyline,
        screenshots: igdbGame.screenshots || [],
        videos: igdbGame.videos || [],
        genres: igdbGame.genres || [],
        developer: igdbGame.developer,
        releaseYear: igdbGame.releaseYear,
        releaseDate: igdbGame.releaseDate,
        rating: igdbGame.rating,
        playtimeMinutes: 0,
        hoursPlayed: 0,
        isFavorite: false,
        isInstalled: false,
        isWishlisted: true,
        isCompleted: false,
        dateAdded: new Date().toISOString(),
        source: "manual",
        tags: ["IGDB", "Wishlist"],
      };
      addGameToStorage(newGame);
      setLibraryGames(getStoredGames());
      onGameAdded?.(newGame);
    }
  };

  const handleToggleCompleted = (igdbGame: IgdbGameMetadata, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const existing = getLibGame(igdbGame.id);
    if (existing) {
      toggleCompletedGame(existing.id);
      const updated = getStoredGames();
      setLibraryGames(updated);
      const updatedGame = updated.find((g) => g.id === existing.id);
      if (updatedGame) onGameAdded?.(updatedGame);
    } else {
      const newGame: Game = {
        id: `igdb-${igdbGame.id}-${Date.now()}`,
        title: igdbGame.name,
        exePath: "",
        igdbId: igdbGame.id,
        coverUrl:
          igdbGame.coverUrl ||
          `https://placehold.co/600x800/0f172a/3b82f6?text=${encodeURIComponent(igdbGame.name)}`,
        bannerUrl: igdbGame.bannerUrl || igdbGame.coverUrl,
        summary: igdbGame.summary,
        storyline: igdbGame.storyline,
        screenshots: igdbGame.screenshots || [],
        videos: igdbGame.videos || [],
        genres: igdbGame.genres || [],
        developer: igdbGame.developer,
        releaseYear: igdbGame.releaseYear,
        releaseDate: igdbGame.releaseDate,
        rating: igdbGame.rating,
        playtimeMinutes: 0,
        hoursPlayed: 0,
        isFavorite: false,
        isInstalled: false,
        isWishlisted: false,
        isCompleted: true,
        completedAt: new Date().toISOString(),
        dateAdded: new Date().toISOString(),
        source: "manual",
        tags: ["IGDB", "Completed"],
      };
      addGameToStorage(newGame);
      setLibraryGames(getStoredGames());
      onGameAdded?.(newGame);
    }
  };

  const handleToggleFavorite = (igdbGame: IgdbGameMetadata, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const existing = getLibGame(igdbGame.id);
    if (existing) {
      toggleFavoriteGame(existing.id);
      const updated = getStoredGames();
      setLibraryGames(updated);
      const updatedGame = updated.find((g) => g.id === existing.id);
      if (updatedGame) onGameAdded?.(updatedGame);
    } else {
      const newGame: Game = {
        id: `igdb-${igdbGame.id}-${Date.now()}`,
        title: igdbGame.name,
        exePath: "",
        igdbId: igdbGame.id,
        coverUrl:
          igdbGame.coverUrl ||
          `https://placehold.co/600x800/0f172a/3b82f6?text=${encodeURIComponent(igdbGame.name)}`,
        bannerUrl: igdbGame.bannerUrl || igdbGame.coverUrl,
        summary: igdbGame.summary,
        storyline: igdbGame.storyline,
        screenshots: igdbGame.screenshots || [],
        videos: igdbGame.videos || [],
        genres: igdbGame.genres || [],
        developer: igdbGame.developer,
        releaseYear: igdbGame.releaseYear,
        releaseDate: igdbGame.releaseDate,
        rating: igdbGame.rating,
        playtimeMinutes: 0,
        hoursPlayed: 0,
        isFavorite: true,
        isInstalled: false,
        isWishlisted: false,
        isCompleted: false,
        dateAdded: new Date().toISOString(),
        source: "manual",
        tags: ["IGDB"],
      };
      addGameToStorage(newGame);
      setLibraryGames(getStoredGames());
      onGameAdded?.(newGame);
    }
  };

  const renderStars = (rating?: number) => {
    if (!rating) return null;
    const stars = Math.round(rating / 20);
    return (
      <Group gap={2}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={11}
            fill={i < stars ? "#f59e0b" : "none"}
            color={i < stars ? "#f59e0b" : "#4b5563"}
          />
        ))}
        <Text size="10px" c="dimmed" ml={2}>
          {rating}
        </Text>
      </Group>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm">
          <ThemeIcon
            variant="gradient"
            gradient={{ from: "blue", to: "violet" }}
            size="md"
            radius="md"
          >
            <Sparkles size={16} />
          </ThemeIcon>
          <div>
            <Title order={4} style={{ letterSpacing: "-0.3px" }}>
              Search IGDB
            </Title>
            <Text size="xs" c="dimmed">
              Find any game and add it to your library
            </Text>
          </div>
        </Group>
      }
      size="xl"
      radius="lg"
      styles={{
        content: {
          background: "var(--mantine-color-default)",
          border: "1px solid var(--mantine-color-default-border)",
        },
        header: {
          background: "var(--mantine-color-default)",
          borderBottom: "1px solid var(--mantine-color-default-border)",
          paddingBottom: 12,
        },
      }}
    >
      <Stack gap="md">
        <TextInput
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search for a game by title or ID (e.g. 103261)..."
          size="md"
          radius="md"
          leftSection={
            isSearching ? (
              <Loader size="xs" color="blue" />
            ) : (
              <Search size={16} />
            )
          }
          rightSection={
            query ? (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setResults([]);
                  setSelectedGame(null);
                }}
              >
                <X size={14} />
              </ActionIcon>
            ) : null
          }
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              if (query) {
                setQuery("");
                setResults([]);
              } else {
                onClose();
              }
            }
          }}
        />

        {lastError && (
          <Alert
            icon={<AlertCircle size={14} />}
            color="red"
            variant="light"
            radius="md"
            p="sm"
          >
            {lastError}
          </Alert>
        )}

        {results.length > 0 && !selectedGame && (
          <ScrollArea h={460} offsetScrollbars>
            <Stack gap="xs">
              {results.map((game) => {
                const libGame = getLibGame(game.id);
                const isWish = Boolean(libGame?.isWishlisted);
                const isComp = Boolean(libGame?.isCompleted);
                const isFav = Boolean(libGame?.isFavorite);
                const isInst = Boolean(libGame?.isInstalled);

                return (
                  <Paper
                    key={game.id}
                    radius="md"
                    p="sm"
                    style={{
                      border: "1px solid var(--mantine-color-default-border)",
                      cursor: "pointer",
                      transition: "border-color 150ms, background 150ms",
                    }}
                    className="repack-card"
                    onClick={() => setSelectedGame(game)}
                  >
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                      <Box
                        style={{
                          width: 60,
                          minWidth: 60,
                          height: 80,
                          borderRadius: 8,
                          overflow: "hidden",
                          flexShrink: 0,
                        }}
                      >
                        <Image
                          src={game.coverUrl}
                          alt={game.name}
                          h={80}
                          w={60}
                          style={{ objectFit: "cover" }}
                          fallbackSrc={`https://placehold.co/60x80/0f172a/3b82f6?text=${encodeURIComponent(game.name.slice(0, 3))}`}
                        />
                      </Box>

                      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                        <Group justify="space-between" align="flex-start" gap="xs">
                          <Text fw={700} size="sm" lineClamp={1} style={{ flex: 1 }}>
                            {game.name}
                          </Text>
                          <Group gap={6} style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                            {isInst && (
                              <Badge
                                color="blue"
                                variant="light"
                                size="xs"
                              >
                                Installed
                              </Badge>
                            )}

                            {/* Quick Wishlist Button */}
                            <Tooltip label={isWish ? "In Wishlist (Click to remove)" : "Add to Wishlist"}>
                              <ActionIcon
                                variant={isWish ? "filled" : "subtle"}
                                color="orange"
                                size="sm"
                                radius="md"
                                onClick={(e) => handleToggleWishlist(game, e)}
                              >
                                <Bookmark size={13} fill={isWish ? "currentColor" : "none"} />
                              </ActionIcon>
                            </Tooltip>

                            {/* Quick Completed Button */}
                            <Tooltip label={isComp ? "Completed (Click to unmark)" : "Mark Completed"}>
                              <ActionIcon
                                variant={isComp ? "filled" : "subtle"}
                                color="teal"
                                size="sm"
                                radius="md"
                                onClick={(e) => handleToggleCompleted(game, e)}
                              >
                                <CheckCircle2 size={13} />
                              </ActionIcon>
                            </Tooltip>

                            {/* Quick Favorite Button */}
                            <Tooltip label={isFav ? "Favorited (Click to unfavorite)" : "Add to Favorites"}>
                              <ActionIcon
                                variant={isFav ? "filled" : "subtle"}
                                color="red"
                                size="sm"
                                radius="md"
                                onClick={(e) => handleToggleFavorite(game, e)}
                              >
                                <Heart size={13} fill={isFav ? "currentColor" : "none"} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Group>

                        <Group gap="xs">
                          {game.releaseYear && (
                            <Group gap={3}>
                              <Calendar size={11} color="var(--mantine-color-dimmed)" />
                              <Text size="10px" c="dimmed">
                                {game.releaseYear}
                              </Text>
                            </Group>
                          )}
                          {game.developer && (
                            <Group gap={3}>
                              <Gamepad2 size={11} color="var(--mantine-color-dimmed)" />
                              <Text size="10px" c="dimmed" lineClamp={1}>
                                {game.developer}
                              </Text>
                            </Group>
                          )}
                        </Group>

                        {renderStars(game.rating)}

                        <Group gap={4} wrap="wrap">
                          {game.genres.slice(0, 4).map((g) => (
                            <Badge key={g} variant="light" color="gray" size="xs" radius="xs">
                              {g}
                            </Badge>
                          ))}
                        </Group>

                        {game.summary && (
                          <Text size="10px" c="dimmed" lineClamp={2} mt={2}>
                            {game.summary}
                          </Text>
                        )}
                      </Stack>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>
        )}

        {selectedGame && (
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Button
                variant="subtle"
                size="xs"
                leftSection={<X size={13} />}
                onClick={() => setSelectedGame(null)}
              >
                Back to results
              </Button>
              <Group gap="xs">
                {(() => {
                  const libGame = getLibGame(selectedGame.id);
                  const isWish = Boolean(libGame?.isWishlisted);
                  const isComp = Boolean(libGame?.isCompleted);
                  const isFav = Boolean(libGame?.isFavorite);

                  return (
                    <>
                      <Button
                        size="xs"
                        variant={isWish ? "filled" : "light"}
                        color="orange"
                        radius="md"
                        leftSection={<Bookmark size={13} fill={isWish ? "currentColor" : "none"} />}
                        onClick={() => handleToggleWishlist(selectedGame)}
                      >
                        {isWish ? "In Wishlist" : "Wishlist"}
                      </Button>

                      <Button
                        size="xs"
                        variant={isComp ? "filled" : "light"}
                        color="teal"
                        radius="md"
                        leftSection={<CheckCircle2 size={13} />}
                        onClick={() => handleToggleCompleted(selectedGame)}
                      >
                        {isComp ? "Completed" : "Complete"}
                      </Button>

                      <Button
                        size="xs"
                        variant={isFav ? "filled" : "light"}
                        color="red"
                        radius="md"
                        leftSection={<Heart size={13} fill={isFav ? "currentColor" : "none"} />}
                        onClick={() => handleToggleFavorite(selectedGame)}
                      >
                        {isFav ? "Favorited" : "Favorite"}
                      </Button>
                    </>
                  );
                })()}
              </Group>
            </Group>

            <Paper
              radius="md"
              p={0}
              style={{
                border: "1px solid var(--mantine-color-default-border)",
                overflow: "hidden",
              }}
            >
              {selectedGame.bannerUrl && (
                <Box style={{ position: "relative", height: 180, overflow: "hidden" }}>
                  <Image
                    src={selectedGame.bannerUrl}
                    alt={selectedGame.name}
                    h={180}
                    w="100%"
                    style={{ objectFit: "cover" }}
                  />
                  <Box
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(to top, var(--mantine-color-default) 0%, transparent 50%)",
                    }}
                  />
                </Box>
              )}

              <Group gap="md" align="flex-start" p="md" wrap="nowrap">
                <Box
                  style={{
                    width: 100,
                    minWidth: 100,
                    height: 133,
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "2px solid var(--mantine-color-default-border)",
                    flexShrink: 0,
                    marginTop: selectedGame.bannerUrl ? -60 : 0,
                    boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
                  }}
                >
                  <Image
                    src={selectedGame.coverUrl}
                    alt={selectedGame.name}
                    h={133}
                    w={100}
                    style={{ objectFit: "cover" }}
                  />
                </Box>

                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  <Title order={3} style={{ letterSpacing: "-0.5px" }}>
                    {selectedGame.name}
                  </Title>
                  <Group gap="md">
                    {selectedGame.releaseYear && (
                      <Group gap={4}>
                        <Calendar size={13} color="var(--mantine-color-dimmed)" />
                        <Text size="sm" c="dimmed">{selectedGame.releaseYear}</Text>
                      </Group>
                    )}
                    {selectedGame.developer && (
                      <Group gap={4}>
                        <Gamepad2 size={13} color="var(--mantine-color-dimmed)" />
                        <Text size="sm" c="dimmed">{selectedGame.developer}</Text>
                      </Group>
                    )}
                  </Group>
                  {renderStars(selectedGame.rating)}
                  <Group gap={4} wrap="wrap">
                    {selectedGame.genres.map((g) => (
                      <Badge key={g} variant="light" color="blue" size="sm" radius="sm">
                        {g}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              </Group>

              {selectedGame.alternateCovers && selectedGame.alternateCovers.length > 1 && (
                <>
                  <Divider />
                  <Box p="md">
                    <Text size="xs" c="dimmed" fw={600} mb={8} tt="uppercase" style={{ letterSpacing: "0.06em" }}>
                      Alternate Covers
                    </Text>
                    <ScrollArea w="100%" type="never">
                      <Group gap="xs" wrap="nowrap">
                        {selectedGame.alternateCovers.map((cover, idx) => (
                          <Image
                            key={idx}
                            src={cover}
                            w={60}
                            h={80}
                            radius="xs"
                            style={{
                              cursor: "pointer",
                              border: selectedGame.coverUrl === cover ? "2px solid var(--mantine-color-blue-filled)" : "2px solid transparent",
                              opacity: selectedGame.coverUrl === cover ? 1 : 0.6,
                            }}
                            onClick={() => setSelectedGame({ ...selectedGame, coverUrl: cover })}
                          />
                        ))}
                      </Group>
                    </ScrollArea>
                  </Box>
                </>
              )}

              {selectedGame.summary && (
                <>
                  <Divider />
                  <Box p="md">
                    <Text size="xs" c="dimmed" fw={600} mb={6} tt="uppercase" style={{ letterSpacing: "0.06em" }}>
                      About
                    </Text>
                    <Text size="sm" style={{ lineHeight: 1.6 }}>
                      {selectedGame.summary}
                    </Text>
                  </Box>
                </>
              )}

              {selectedGame.screenshots && selectedGame.screenshots.length > 0 && (
                <>
                  <Divider />
                  <Box p="md">
                    <Text size="xs" c="dimmed" fw={600} mb={8} tt="uppercase" style={{ letterSpacing: "0.06em" }}>
                      Screenshots ({selectedGame.screenshots.length})
                    </Text>
                    <SimpleGrid cols={3} spacing="xs">
                      {selectedGame.screenshots.slice(0, 6).map((s, i) => (
                        <Box
                          key={i}
                          style={{
                            height: 80,
                            borderRadius: 6,
                            overflow: "hidden",
                            border: "1px solid var(--mantine-color-default-border)",
                          }}
                        >
                          <Image
                            src={s}
                            alt={`screenshot ${i + 1}`}
                            h={80}
                            w="100%"
                            style={{ objectFit: "cover" }}
                          />
                        </Box>
                      ))}
                    </SimpleGrid>
                  </Box>
                </>
              )}
            </Paper>
          </Stack>
        )}

        {!isSearching && query.trim() && results.length === 0 && !selectedGame && (
          <Paper
            p="xl"
            radius="md"
            style={{ border: "1px solid var(--mantine-color-default-border)", textAlign: "center" }}
          >
            <ThemeIcon size={48} radius="xl" variant="light" color="gray" mx="auto" mb="md">
              <Search size={22} />
            </ThemeIcon>
            <Text fw={600}>No results found</Text>
            <Text size="sm" c="dimmed" mt={4}>
              Try a different search term or check your spelling
            </Text>
          </Paper>
        )}

        {!query.trim() && results.length === 0 && !selectedGame && (
          <Paper
            p="xl"
            radius="md"
            style={{ border: "1px dashed var(--mantine-color-default-border)", textAlign: "center" }}
          >
            <ThemeIcon
              size={48}
              radius="xl"
              variant="gradient"
              gradient={{ from: "blue", to: "violet" }}
              mx="auto"
              mb="md"
            >
              <Sparkles size={22} />
            </ThemeIcon>
            <Text fw={600}>Search any game on IGDB</Text>
            <Text size="sm" c="dimmed" mt={4} style={{ maxWidth: 340, margin: "4px auto 0" }}>
              Over 200,000 games available. Type a title above to find cover art,
              screenshots, descriptions, ratings and more.
            </Text>
          </Paper>
        )}
      </Stack>
    </Modal>
  );
};
