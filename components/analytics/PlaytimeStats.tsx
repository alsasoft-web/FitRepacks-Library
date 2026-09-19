"use client";

import React, { useMemo, useState } from "react";
import { Game } from "../../lib/types";
import { CachedImage } from "../common/CachedImage";
import { deduplicatePlaySessions } from "../../lib/db";
import {
  SimpleGrid,
  Paper,
  Title,
  Text,
  Group,
  Progress,
  Stack,
  Box,
  Badge,
  SegmentedControl,
  ThemeIcon,
  RingProgress,
} from "@mantine/core";
import {
  Clock,
  Trophy,
  Flame,
  Gamepad2,
  PieChart,
  Calendar,
  Sparkles,
  Award,
  Bookmark,
  CheckCircle2,
  HardDrive,
  Star,
  Layers,
  TrendingUp,
  Percent,
} from "lucide-react";

interface PlaytimeStatsProps {
  games: Game[];
  searchQuery?: string;
}

type GenreRankCategory = "wishlisted" | "installed" | "completed" | "playtime";

export const PlaytimeStats: React.FC<PlaytimeStatsProps> = ({
  games,
  searchQuery = "",
}) => {
  const [genreCategory, setGenreCategory] =
    useState<GenreRankCategory>("wishlisted");

  // Filter games based on search query
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) return games;
    const q = searchQuery.toLowerCase().trim();
    const tokens = q
      .split(/[\s:,\-_/\\|.]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const strippedQ = q.replace(/[^a-z0-9]/g, "");

    return games.filter((g) => {
      const titleStr = (g.title || "").toLowerCase();
      const genresStr = (g.genres || []).join(" ").toLowerCase();
      const combined = `${titleStr} ${genresStr}`;
      const combinedStripped = combined.replace(/[^a-z0-9]/g, "");

      const matchesStripped =
        Boolean(strippedQ) && combinedStripped.includes(strippedQ);
      const matchesAllTokens =
        tokens.length > 0 && tokens.every((token) => combined.includes(token));

      return matchesStripped || matchesAllTokens;
    });
  }, [games, searchQuery]);

  const getHours = (g: Game) => {
    if (g.playSessions && g.playSessions.length > 0) {
      const cleanSessions = deduplicatePlaySessions(g.playSessions);
      const totalMins = cleanSessions.reduce(
        (acc, s) => acc + (s.durationMinutes || 0),
        0,
      );
      return totalMins / 60;
    }
    const mins =
      g.playtimeMinutes !== undefined && g.playtimeMinutes > 0
        ? g.playtimeMinutes
        : ((g.hoursPlayed ?? 0) * 60);
    return mins / 60;
  };

  // Overall Library Statistics
  const stats = useMemo(() => {
    const total = filteredGames.length;
    const installed = filteredGames.filter(
      (g) => g.isInstalled || (g.exePath && g.exePath.trim() !== ""),
    );
    const wishlisted = filteredGames.filter((g) => g.isWishlisted);
    const completed = filteredGames.filter((g) => g.isCompleted);
    const favorites = filteredGames.filter((g) => g.isFavorite);

    const totalHours = installed.reduce((acc, g) => acc + getHours(g), 0);
    const avgHours =
      installed.length > 0 ? (totalHours / installed.length).toFixed(1) : "0";

    const completionRate =
      total > 0 ? Math.round((completed.length / total) * 100) : 0;

    const sortedByPlaytime = [...installed].sort(
      (a, b) => getHours(b) - getHours(a),
    );
    const topGame = sortedByPlaytime[0] || null;

    return {
      total,
      installedCount: installed.length,
      wishlistedCount: wishlisted.length,
      completedCount: completed.length,
      favoritesCount: favorites.length,
      totalHours,
      avgHours,
      completionRate,
      topGame,
      sortedByPlaytime,
    };
  }, [filteredGames]);

  // Genre Rankings for Wishlisted, Installed, Completed, and Playtime
  const genreRankings = useMemo(() => {
    const map: Record<
      string,
      {
        wishlistedCount: number;
        installedCount: number;
        completedCount: number;
        totalPlaytimeHours: number;
        totalGamesCount: number;
        wishlistedTitles: string[];
        installedTitles: string[];
        completedTitles: string[];
        playtimeTitles: { title: string; hours: number }[];
      }
    > = {};

    filteredGames.forEach((g) => {
      const gHours = getHours(g);
      const isInstalled =
        Boolean(g.isInstalled) || Boolean(g.exePath && g.exePath.trim() !== "");
      const isWishlisted = Boolean(g.isWishlisted);
      const isCompleted = Boolean(g.isCompleted);

      const genres =
        g.genres && g.genres.length > 0 ? g.genres : ["Uncategorized"];

      genres.forEach((genre) => {
        if (!map[genre]) {
          map[genre] = {
            wishlistedCount: 0,
            installedCount: 0,
            completedCount: 0,
            totalPlaytimeHours: 0,
            totalGamesCount: 0,
            wishlistedTitles: [],
            installedTitles: [],
            completedTitles: [],
            playtimeTitles: [],
          };
        }

        map[genre].totalGamesCount += 1;
        if (isWishlisted) {
          map[genre].wishlistedCount += 1;
          if (
            map[genre].wishlistedTitles.length < 5 &&
            !map[genre].wishlistedTitles.includes(g.title)
          ) {
            map[genre].wishlistedTitles.push(g.title);
          }
        }
        if (isInstalled) {
          map[genre].installedCount += 1;
          map[genre].totalPlaytimeHours += gHours;
          if (
            map[genre].installedTitles.length < 5 &&
            !map[genre].installedTitles.includes(g.title)
          ) {
            map[genre].installedTitles.push(g.title);
          }
          if (gHours > 0 || (g.playtimeMinutes ?? 0) > 0) {
            map[genre].playtimeTitles.push({ title: g.title, hours: gHours });
          }
        }
        if (isCompleted) {
          map[genre].completedCount += 1;
          if (
            map[genre].completedTitles.length < 5 &&
            !map[genre].completedTitles.includes(g.title)
          ) {
            map[genre].completedTitles.push(g.title);
          }
        }
      });
    });

    return Object.entries(map).map(([genre, data]) => ({
      genre,
      ...data,
      totalPlaytimeHours: Number(data.totalPlaytimeHours.toFixed(1)),
      playtimeTitles: data.playtimeTitles
        .sort((a, b) => b.hours - a.hours)
        .map((t) => t.title),
    }));
  }, [filteredGames]);

  const activeGenreList = useMemo(() => {
    return [...genreRankings]
      .filter((item) => {
        if (genreCategory === "wishlisted") return item.wishlistedCount > 0;
        if (genreCategory === "installed") return item.installedCount > 0;
        if (genreCategory === "completed") return item.completedCount > 0;
        return item.totalPlaytimeHours > 0 || item.installedCount > 0;
      })
      .sort((a, b) => {
        switch (genreCategory) {
          case "wishlisted":
            return b.wishlistedCount - a.wishlistedCount;
          case "installed":
            return b.installedCount - a.installedCount;
          case "completed":
            return b.completedCount - a.completedCount;
          case "playtime":
            return b.totalPlaytimeHours - a.totalPlaytimeHours;
        }
      });
  }, [genreRankings, genreCategory]);

  const maxGenreValue = useMemo(() => {
    if (activeGenreList.length === 0) return 1;
    if (genreCategory === "wishlisted")
      return activeGenreList[0].wishlistedCount;
    if (genreCategory === "installed") return activeGenreList[0].installedCount;
    if (genreCategory === "completed") return activeGenreList[0].completedCount;
    return activeGenreList[0].totalPlaytimeHours;
  }, [activeGenreList, genreCategory]);

  // Recent Play Sessions
  const recentSessions = useMemo(() => {
    const sessions: {
      gameId: string;
      gameTitle: string;
      coverUrl?: string;
      startTime: string;
      durationMinutes: number;
    }[] = [];

    filteredGames.forEach((g) => {
      const cleanSessions = Array.isArray(g.playSessions) && g.playSessions.length > 0
        ? deduplicatePlaySessions(g.playSessions)
        : [];
      if (cleanSessions.length > 0) {
        cleanSessions.forEach((s) => {
          sessions.push({
            gameId: g.id,
            gameTitle: g.title,
            coverUrl: g.coverUrl,
            startTime: s.startTime,
            durationMinutes: s.durationMinutes,
          });
        });
      } else if (
        g.lastPlayed &&
        ((g.playtimeMinutes !== undefined && g.playtimeMinutes > 0) ||
          (g.hoursPlayed !== undefined && g.hoursPlayed > 0))
      ) {
        const mins =
          g.playtimeMinutes !== undefined && g.playtimeMinutes > 0
            ? g.playtimeMinutes
            : ((g.hoursPlayed ?? 0) * 60);
        sessions.push({
          gameId: g.id,
          gameTitle: g.title,
          coverUrl: g.coverUrl,
          startTime: g.lastPlayed,
          durationMinutes: mins,
        });
      }
    });

    return sessions
      .sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
      )
      .slice(0, 8);
  }, [filteredGames]);

  // Helper for rank badge styling
  const getRankBadgeProps = (index: number) => {
    if (index === 0) {
      return {
        bg: "linear-gradient(135deg, #ffd43b 0%, #fab005 100%)",
        color: "#000",
        label: "#1",
        borderColor: "rgba(250, 176, 5, 0.6)",
      };
    }
    if (index === 1) {
      return {
        bg: "linear-gradient(135deg, #dee2e6 0%, #adb5bd 100%)",
        color: "#000",
        label: "#2",
        borderColor: "rgba(173, 181, 189, 0.6)",
      };
    }
    if (index === 2) {
      return {
        bg: "linear-gradient(135deg, #f08c00 0%, #d9480f 100%)",
        color: "#fff",
        label: "#3",
        borderColor: "rgba(240, 140, 0, 0.6)",
      };
    }
    return {
      bg: "rgba(255, 255, 255, 0.08)",
      color: "#909296",
      label: `#${index + 1}`,
      borderColor: "rgba(255, 255, 255, 0.08)",
    };
  };

  const getCategoryColor = () => {
    switch (genreCategory) {
      case "wishlisted":
        return "orange";
      case "installed":
        return "blue";
      case "completed":
        return "teal";
      case "playtime":
        return "yellow";
    }
  };

  return (
    <Stack gap="xl" pb="xl">
      {/* Header Banner */}
      <Paper
        p="lg"
        radius="lg"
        bg="var(--mantine-color-default)"
        style={{
          border: "1px solid var(--mantine-color-default-border)",
          background:
            "linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(16, 185, 129, 0.04) 100%)",
        }}
      >
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="sm">
            <ThemeIcon size={42} radius="md" variant="light" color="blue">
              <TrendingUp size={22} />
            </ThemeIcon>
            <Box>
              <Title order={3} style={{ letterSpacing: "-0.3px" }}>
                Gaming Analytics & Telemetry
              </Title>
              <Text size="xs" c="dimmed">
                Interactive insights into playtime, completion milestones, and
                genre popularity
              </Text>
            </Box>
          </Group>

          <Group gap="xs">
            <Badge
              size="md"
              variant="filled"
              color="blue"
              leftSection={<HardDrive size={12} />}
            >
              {stats.installedCount} Installed
            </Badge>
            <Badge
              size="md"
              variant="filled"
              color="orange"
              leftSection={<Bookmark size={12} fill="white" />}
            >
              {stats.wishlistedCount} Wishlisted
            </Badge>
            <Badge
              size="md"
              variant="filled"
              color="teal"
              leftSection={<CheckCircle2 size={12} />}
            >
              {stats.completedCount} Completed
            </Badge>
          </Group>
        </Group>
      </Paper>

      {/* Primary KPI Metric Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {/* Total Playtime */}
        <Paper
          p="md"
          radius="md"
          bg="var(--mantine-color-default)"
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderLeft: "4px solid var(--mantine-color-blue-6)",
          }}
        >
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text size="xs" fw={700} c="blue.4" tt="uppercase" lts={0.5}>
              Total Playtime
            </Text>
            <ThemeIcon size="sm" radius="md" variant="light" color="blue">
              <Clock size={15} />
            </ThemeIcon>
          </Group>
          <Group align="baseline" gap={6}>
            <Text size="xl" fw={900}>
              {stats.totalHours.toFixed(1)}
            </Text>
            <Text size="sm" c="blue.4" fw={700}>
              hours
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            Across {stats.installedCount} installed titles
          </Text>
        </Paper>

        {/* Completion Rate Gauge */}
        <Paper
          p="md"
          radius="md"
          bg="var(--mantine-color-default)"
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderLeft: "4px solid var(--mantine-color-teal-6)",
          }}
        >
          <Group justify="space-between" align="center">
            <Box>
              <Text size="xs" fw={700} c="teal.4" tt="uppercase" lts={0.5}>
                Completion Rate
              </Text>
              <Group align="baseline" gap={6} mt={6}>
                <Text size="xl" fw={900}>
                  {stats.completionRate}%
                </Text>
                <Text size="xs" c="teal.4">
                  ({stats.completedCount}/{stats.total})
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                Finished games
              </Text>
            </Box>
            <RingProgress
              size={56}
              thickness={5}
              roundCaps
              sections={[{ value: stats.completionRate, color: "teal" }]}
              label={
                <CenterIcon>
                  <CheckCircle2 size={16} color="var(--mantine-color-teal-5)" />
                </CenterIcon>
              }
            />
          </Group>
        </Paper>

        {/* Most Played Title */}
        <Paper
          p="md"
          radius="md"
          bg="var(--mantine-color-default)"
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderLeft: "4px solid var(--mantine-color-yellow-6)",
          }}
        >
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text size="xs" fw={700} c="yellow.4" tt="uppercase" lts={0.5}>
              Top Title
            </Text>
            <ThemeIcon size="sm" radius="md" variant="light" color="yellow">
              <Trophy size={15} />
            </ThemeIcon>
          </Group>
          <Text size="sm" fw={700} lineClamp={1} title={stats.topGame?.title}>
            {stats.topGame ? stats.topGame.title : "None"}
          </Text>
          <Text size="xs" c="yellow.5" fw={600} mt={4}>
            {stats.topGame
              ? (() => {
                  const totalMins =
                    stats.topGame.playtimeMinutes !== undefined &&
                    stats.topGame.playtimeMinutes > 0
                      ? stats.topGame.playtimeMinutes
                      : (stats.topGame.hoursPlayed ?? 0) * 60;
                  const totalSecs = Math.round(totalMins * 60);
                  if (totalSecs < 3600) {
                    return `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s logged`;
                  }
                  return `${(totalSecs / 3600).toFixed(1)} hrs logged`;
                })()
              : "No game sessions"}
          </Text>
        </Paper>

        {/* Library Breadth */}
        <Paper
          p="md"
          radius="md"
          bg="var(--mantine-color-default)"
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            borderLeft: "4px solid var(--mantine-color-indigo-6)",
          }}
        >
          <Group justify="space-between" align="flex-start" mb="xs">
            <Text size="xs" fw={700} c="indigo.4" tt="uppercase" lts={0.5}>
              Average Playtime
            </Text>
            <ThemeIcon size="sm" radius="md" variant="light" color="indigo">
              <Flame size={15} />
            </ThemeIcon>
          </Group>
          <Group align="baseline" gap={6}>
            <Text size="xl" fw={900}>
              {stats.avgHours}
            </Text>
            <Text size="sm" c="indigo.4" fw={700}>
              hrs / title
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            {stats.favoritesCount} marked as favorite
          </Text>
        </Paper>
      </SimpleGrid>

      {/* GENRE RANKINGS INTELLIGENCE SECTION */}
      <Paper
        p="lg"
        radius="lg"
        bg="var(--mantine-color-default)"
        style={{
          border: "1px solid var(--mantine-color-default-border)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.25)",
        }}
      >
        <Stack gap="md">
          {/* Section Header with Category Switcher */}
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <Group gap="xs">
              <ThemeIcon size="md" radius="md" variant="light" color={getCategoryColor()}>
                <Layers size={18} />
              </ThemeIcon>
              <Box>
                <Title order={4}>Genre Leaderboard & Rankings</Title>
                <Text size="xs" c="dimmed">
                  Top genres ranked across your wishlist, installed library, and completions
                </Text>
              </Box>
            </Group>

            <SegmentedControl
              size="xs"
              value={genreCategory}
              onChange={(v) => setGenreCategory(v as GenreRankCategory)}
              data={[
                { label: "Most Wishlisted", value: "wishlisted" },
                { label: "Most Installed", value: "installed" },
                { label: "Most Completed", value: "completed" },
                { label: "Playtime Hours", value: "playtime" },
              ]}
              radius="md"
              color={getCategoryColor()}
            />
          </Group>

          {/* Ranking Cards Grid */}
          {activeGenreList.length > 0 ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mt="xs">
              {activeGenreList.slice(0, 3).map((item, idx) => {
                const rankStyle = getRankBadgeProps(idx);
                let metricValueText = "";
                let metricPercentage = 0;
                let subtext = `${item.totalGamesCount} total in library`;

                const categoryTitles =
                  genreCategory === "installed"
                    ? item.installedTitles
                    : genreCategory === "wishlisted"
                      ? item.wishlistedTitles
                      : genreCategory === "completed"
                        ? item.completedTitles
                        : item.playtimeTitles.length > 0
                          ? item.playtimeTitles
                          : item.installedTitles;

                if (genreCategory === "wishlisted") {
                  metricValueText = `${item.wishlistedCount} wishlisted`;
                  subtext = `${item.wishlistedCount} wishlisted (${item.totalGamesCount} in library)`;
                  metricPercentage =
                    stats.wishlistedCount > 0
                      ? Math.round(
                          (item.wishlistedCount / stats.wishlistedCount) * 100,
                        )
                      : 0;
                } else if (genreCategory === "installed") {
                  metricValueText = `${item.installedCount} installed`;
                  subtext = `${item.installedCount} installed (${item.totalGamesCount} in library)`;
                  metricPercentage =
                    stats.installedCount > 0
                      ? Math.round(
                          (item.installedCount / stats.installedCount) * 100,
                        )
                      : 0;
                } else if (genreCategory === "completed") {
                  metricValueText = `${item.completedCount} completed`;
                  subtext = `${item.completedCount} completed (${item.totalGamesCount} in library)`;
                  metricPercentage =
                    stats.completedCount > 0
                      ? Math.round(
                          (item.completedCount / stats.completedCount) * 100,
                        )
                      : item.totalGamesCount > 0
                        ? Math.round(
                            (item.completedCount / item.totalGamesCount) * 100,
                          )
                        : 0;
                } else {
                  metricValueText = `${item.totalPlaytimeHours.toFixed(1)} hrs`;
                  subtext = `${item.installedCount} installed games`;
                  metricPercentage =
                    stats.totalHours > 0
                      ? Math.round(
                          (item.totalPlaytimeHours / stats.totalHours) * 100,
                        )
                      : 0;
                }

                const progressFill =
                  maxGenreValue > 0
                    ? Math.min(
                        Math.round(
                          ((genreCategory === "wishlisted"
                            ? item.wishlistedCount
                            : genreCategory === "installed"
                              ? item.installedCount
                              : genreCategory === "completed"
                                ? item.completedCount
                                : item.totalPlaytimeHours) /
                            maxGenreValue) *
                            100,
                        ),
                        100,
                      )
                    : 0;

                return (
                  <Paper
                    key={item.genre}
                    p="md"
                    radius="md"
                    bg="var(--mantine-color-body)"
                    style={{
                      border: `1px solid ${
                        idx < 3
                          ? rankStyle.borderColor
                          : "var(--mantine-color-default-border)"
                      }`,
                      boxShadow:
                        idx === 0
                          ? "0 0 16px rgba(250, 176, 5, 0.15)"
                          : "none",
                      transition: "transform 150ms ease",
                    }}
                  >
                    <Group justify="space-between" align="center" mb="xs">
                      <Group gap="xs">
                        <Box
                          style={{
                            background: rankStyle.bg,
                            color: rankStyle.color,
                            fontWeight: 800,
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: "26px",
                          }}
                        >
                          {rankStyle.label}
                        </Box>
                        <Text size="sm" fw={700} truncate style={{ maxWidth: 160 }}>
                          {item.genre}
                        </Text>
                      </Group>

                      <Badge
                        size="sm"
                        variant="light"
                        color={getCategoryColor()}
                        style={{ fontWeight: 700 }}
                      >
                        {metricValueText}
                      </Badge>
                    </Group>

                    <Progress
                      value={progressFill}
                      color={getCategoryColor()}
                      size="sm"
                      radius="xl"
                      mb="xs"
                    />

                    <Group justify="space-between" align="center">
                      <Text size="11px" c="dimmed">
                        {subtext}
                      </Text>
                      <Text size="11px" fw={600} c={`${getCategoryColor()}.4`}>
                        {metricPercentage}% share
                      </Text>
                    </Group>

                    {categoryTitles.length > 0 && (
                      <Box
                        mt="xs"
                        pt="xs"
                        style={{
                          borderTop:
                            "1px solid var(--mantine-color-default-border)",
                        }}
                      >
                        <Text size="10px" c="dimmed" truncate>
                          e.g. {categoryTitles.slice(0, 3).join(", ")}
                        </Text>
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </SimpleGrid>
          ) : (
            <Paper p="xl" bg="var(--mantine-color-body)" radius="md">
              <Group justify="center" gap="sm">
                <Sparkles size={20} color="#909296" />
                <Text size="sm" c="dimmed">
                  No games found in the {genreCategory} category yet.
                </Text>
              </Group>
            </Paper>
          )}
        </Stack>
      </Paper>

      {/* Main Grid: Game Playtime Leaderboard vs Activity & Sessions */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* Most Played Games Progress */}
        <Paper
          p="lg"
          radius="lg"
          bg="var(--mantine-color-default)"
          style={{ border: "1px solid var(--mantine-color-default-border)" }}
        >
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <Award size={18} color="#fcc419" />
              <Title order={4}>Playtime Leaderboard</Title>
            </Group>
            <Badge size="xs" variant="light" color="blue">
              Top 6 Titles
            </Badge>
          </Group>

          <Stack gap="sm">
            {stats.sortedByPlaytime.slice(0, 6).map((game, idx) => {
              const hours = getHours(game);
              const maxHours = stats.topGame ? Math.max(getHours(stats.topGame), 1) : 1;
              const percentage = Math.min(
                Math.round((hours / maxHours) * 100),
                100,
              );
              const totalSecs = Math.round(hours * 3600);
              const timeDisplay =
                totalSecs < 3600
                  ? `${Math.floor(totalSecs / 60)}m ${totalSecs % 60}s`
                  : `${(totalSecs / 3600).toFixed(1)} hrs`;

              return (
                <Paper
                  key={game.id}
                  p="xs"
                  radius="md"
                  bg="var(--mantine-color-body)"
                  style={{
                    border: "1px solid var(--mantine-color-default-border)",
                  }}
                >
                  <Group justify="space-between" mb={4} wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                      <Box
                        style={{
                          width: 20,
                          textAlign: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                          color:
                            idx === 0
                              ? "#fcc419"
                              : idx === 1
                                ? "#adb5bd"
                                : idx === 2
                                  ? "#f08c00"
                                  : "#909296",
                        }}
                      >
                        {idx + 1}
                      </Box>
                      <CachedImage
                        src={game.coverUrl}
                        h={32}
                        w={24}
                        radius="xs"
                        fit="cover"
                        fallbackSrc="https://placehold.co/30x40/141517/3b82f6?text=Cover"
                      />
                      <Stack gap={0} style={{ minWidth: 0 }}>
                        <Text
                          size="xs"
                          fw={700}
                          truncate
                          style={{ maxWidth: 200 }}
                        >
                          {game.title}
                        </Text>
                        <Text size="10px" c="dimmed">
                          {game.genres?.slice(0, 2).join(", ") || "Game"}
                        </Text>
                      </Stack>
                    </Group>

                    <Badge color="blue" variant="light" size="sm">
                      {timeDisplay}
                    </Badge>
                  </Group>

                  <Progress
                    value={percentage}
                    color="blue"
                    radius="xl"
                    size="xs"
                    mt={4}
                  />
                </Paper>
              );
            })}

            {stats.sortedByPlaytime.length === 0 && (
              <Text size="xs" c="dimmed" fs="italic" p="sm">
                No installed games logged with playtime yet.
              </Text>
            )}
          </Stack>
        </Paper>

        {/* Recent Activity Timeline */}
        <Paper
          p="lg"
          radius="lg"
          bg="var(--mantine-color-default)"
          style={{ border: "1px solid var(--mantine-color-default-border)" }}
        >
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <Calendar size={18} color="#6366f1" />
              <Title order={4}>Recent Play Sessions</Title>
            </Group>
            <Badge size="xs" color="indigo" variant="light">
              Live Activity
            </Badge>
          </Group>

          {recentSessions.length > 0 ? (
            <Stack gap="xs">
              {recentSessions.map((session, idx) => {
                const sessionSecs = Math.round((session.durationMinutes || 0) * 60);
                const sessionDisplay =
                  sessionSecs < 3600
                    ? `${Math.floor(sessionSecs / 60)}m ${sessionSecs % 60}s`
                    : `${(sessionSecs / 3600).toFixed(1)} hrs`;

                return (
                  <Paper
                    key={idx}
                    p="xs"
                    bg="var(--mantine-color-body)"
                    radius="md"
                    style={{
                      border: "1px solid var(--mantine-color-default-border)",
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap">
                        <CachedImage
                          src={session.coverUrl}
                          w={26}
                          h={34}
                          radius="xs"
                          fit="cover"
                          fallbackSrc="https://placehold.co/30x40/141517/3b82f6?text=Cover"
                        />
                        <Stack gap={1}>
                          <Text
                            size="xs"
                            fw={700}
                            truncate
                            style={{ maxWidth: 200 }}
                          >
                            {session.gameTitle}
                          </Text>
                          <Text size="11px" c="dimmed">
                            {new Date(session.startTime).toLocaleString()}
                          </Text>
                        </Stack>
                      </Group>

                      <Badge color="teal" variant="light" size="sm">
                        +{sessionDisplay}
                      </Badge>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <Paper p="xl" bg="var(--mantine-color-body)" radius="md">
              <Group justify="center" gap="sm">
                <Sparkles size={18} color="#909296" />
                <Text size="xs" c="dimmed">
                  No sessions recorded yet. Launch an installed game to log playtime!
                </Text>
              </Group>
            </Paper>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
};

const CenterIcon: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </Box>
);
