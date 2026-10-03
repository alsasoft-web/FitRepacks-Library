"use client";

import React from "react";
import { Game, ActiveTab, ViewMode } from "../../lib/types";
import { toggleThemeWithRipple } from "../../lib/themeRipple";
import {
  Stack,
  Group,
  Text,
  Badge,
  UnstyledButton,
  ThemeIcon,
  Box,
  Divider,
  ScrollArea,
  Paper,
  useMantineColorScheme,
  useComputedColorScheme,
  ActionIcon,
  Tooltip,
  Image,
  Select,
  SegmentedControl,
  Center,
} from "@mantine/core";
import {
  Gamepad2,
  BarChart3,
  DownloadCloud,
  Download,
  Settings,
  Flame,
  Star,
  Sun,
  Moon,
  Lock,
  WifiOff,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Filter,
  Pin,
} from "lucide-react";
import { useNetwork } from "@mantine/hooks";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  gameCount: number;
  activeGameTitle?: string;
  activeGameMinutes?: number;
  // List view integration props
  viewMode?: ViewMode;
  onViewModeChange?: (mode: string) => void;
  categoryFilter?: string;
  onCategoryFilterChange?: (cat: string | null) => void;
  sortOption?: string;
  onSortOptionChange?: (sort: string | null) => void;
  allGames?: Game[];
  games?: Game[];
  pinnedGameIds?: string[];
  selectedGameId?: string | null;
  onSelectGame?: (id: string) => void;
  onLaunchGame?: (game: Game) => void;
  activeGameId?: string | null;
  onOpenSettings?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  activeTab,
  setActiveTab,
  gameCount,
  activeGameTitle,
  activeGameMinutes = 0,
  viewMode = "grid",
  onViewModeChange,
  categoryFilter = "all",
  onCategoryFilterChange,
  sortOption = "playtime-desc",
  onSortOptionChange,
  allGames = [],
  games = [],
  pinnedGameIds = [],
  selectedGameId,
  onSelectGame,
  onLaunchGame,
  activeGameId,
  onOpenSettings,
}) => {
  const { online: isOnline = true } = useNetwork();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme("dark", {
    getInitialValueInEffect: true,
  });

  const isDark = computedColorScheme === "dark";
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const categorySelectData = React.useMemo(() => {
    let installed = 0;
    let completed = 0;
    let wishlist = 0;
    let favorites = 0;
    for (let i = 0; i < allGames.length; i++) {
      const g = allGames[i];
      if (g.isInstalled) installed++;
      if (g.isCompleted) completed++;
      if (g.isWishlisted) wishlist++;
      if (g.isFavorite) favorites++;
    }
    return [
      { label: `All (${allGames.length || gameCount})`, value: "all" },
      { label: `Installed (${installed})`, value: "installed" },
      { label: `Completed (${completed})`, value: "completed" },
      { label: `Wishlist (${wishlist})`, value: "wishlist" },
      { label: `Favorites (${favorites})`, value: "favorites" },
    ];
  }, [allGames, gameCount]);

  const navItems: {
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    badge?: string;
    badgeColor?: string;
    isLocked?: boolean;
  }[] = React.useMemo(() => [
    {
      id: "library",
      label: "Library",
      icon: <Gamepad2 size={20} />,
      badge: `${gameCount}`,
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: <BarChart3 size={20} />,
    },
    {
      id: "repacks",
      label: "FitGirl Repacks",
      icon: isOnline ? <DownloadCloud size={20} /> : <Lock size={20} color="#ff6b6b" />,
      badge: isOnline ? undefined : "OFFLINE",
      badgeColor: isOnline ? undefined : "red",
      isLocked: !isOnline,
    },
    {
      id: "steamrip",
      label: "SteamRIP Games",
      icon: isOnline ? <Flame size={20} /> : <Lock size={20} color="#ff6b6b" />,
      badge: isOnline ? undefined : "OFFLINE",
      badgeColor: isOnline ? undefined : "red",
      isLocked: !isOnline,
    },
    {
      id: "downloads",
      label: "Downloads",
      icon: <Download size={20} />,
    },
  ], [gameCount, isOnline]);

  const showIntegratedList = viewMode === "list";

  return (
    <Box
      w="100%"
      p="md"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        userSelect: "none",
      }}
    >
      <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
        {/* Active Game Monitor */}
        {activeGameTitle && (
          <Box
            p="xs"
            style={{
              borderRadius: 8,
              backgroundColor: "var(--mantine-color-teal-9)",
              border: "1px solid var(--mantine-color-teal-6)",
            }}
          >
            <Group justify="space-between" mb={4}>
              <Group gap={4}>
                <Flame size={14} color="#38d9a9" />
                <Text
                  size="xs"
                  fw={700}
                  c="teal.2"
                >
                  NOW PLAYING
                </Text>
              </Group>
              <Badge size="xs" color="teal" variant="filled">
                ACTIVE
              </Badge>
            </Group>
            <Text size="xs" fw={700} c="white" truncate>
              {activeGameTitle}
            </Text>
            <Text size="xs" c="teal.3">
              Session: {activeGameMinutes} min
            </Text>
          </Box>
        )}

        {/* Navigation Section */}
        <Stack gap={4}>
          <Text size="xs" fw={700} c="dimmed" px="xs" tt="uppercase">
            Menu
          </Text>

          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const buttonNode = (
              <UnstyledButton
                key={item.id}
                onClick={() => {
                  if (item.isLocked) return;
                  setActiveTab(item.id);
                }}
                p="xs"
                className={isActive ? undefined : "sidebar-nav-btn"}
                style={{
                  borderRadius: 8,
                  backgroundColor: isActive
                    ? "var(--mantine-color-blue-filled)"
                    : "transparent",
                  border: isActive
                    ? "1px solid var(--mantine-color-blue-filled)"
                    : "1px solid transparent",
                  opacity: item.isLocked ? 0.55 : 1,
                  cursor: item.isLocked ? "not-allowed" : "pointer",
                  transition: "all 150ms ease",
                  width: "100%",
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon
                      variant={isActive ? "filled" : "transparent"}
                      color={item.isLocked ? "red" : isActive ? "blue" : undefined}
                      size="sm"
                      style={{
                        backgroundColor: "transparent",
                        color: isActive ? "#ffffff" : "var(--mantine-color-text)",
                      }}
                    >
                      {item.icon}
                    </ThemeIcon>
                    <Text
                      size="sm"
                      fw={isActive ? 700 : 500}
                      c={item.isLocked ? "dimmed" : isActive ? "white" : "var(--mantine-color-text)"}
                    >
                      {item.label}
                    </Text>
                  </Group>
                  {item.badge && (
                    <Badge
                      size="xs"
                      color={item.badgeColor || (isActive ? "white" : "gray")}
                      variant={item.isLocked ? "filled" : isActive ? "outline" : "light"}
                      style={isActive ? { color: "#ffffff", borderColor: "rgba(255, 255, 255, 0.4)" } : undefined}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </Group>
              </UnstyledButton>
            );

            if (item.isLocked) {
              return (
                <Tooltip
                  key={item.id}
                  label="Internet connection required to browse online catalog"
                  position="right"
                  withArrow
                >
                  <Box>{buttonNode}</Box>
                </Tooltip>
              );
            }

            return buttonNode;
          })}
        </Stack>

        {/* Integrated Game List in Sidebar for List View Mode */}
        {showIntegratedList && (
          <Stack gap={6} style={{ flex: 1, minHeight: 0, marginTop: 4 }}>
            <Divider color={isDark ? "dark.5" : "gray.3"} my={2} />
            <Group justify="space-between" align="center" px="xs">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                Games ({games.length})
              </Text>
              {onViewModeChange && (
                <SegmentedControl
                  size="xs"
                  value={viewMode}
                  onChange={onViewModeChange}
                  data={[
                    {
                      label: (
                        <Center style={{ gap: 4 }}>
                          <LayoutGrid size={12} />
                          <Box component="span">Grid</Box>
                        </Center>
                      ),
                      value: "grid",
                    },
                    {
                      label: (
                        <Center style={{ gap: 4 }}>
                          <List size={12} />
                          <Box component="span">List</Box>
                        </Center>
                      ),
                      value: "list",
                    },
                  ]}
                  radius="md"
                  color="blue"
                />
              )}
            </Group>

            {/* Sidebar Category Filter Select */}
            {onCategoryFilterChange && (
              <Box px="xs">
                <Select
                  size="xs"
                  value={categoryFilter || "all"}
                  onChange={onCategoryFilterChange}
                  data={categorySelectData}
                  radius="md"
                  leftSection={<Filter size={13} color="var(--mantine-color-dimmed)" />}
                  comboboxProps={{ shadow: "md", transitionProps: { transition: "pop", duration: 150 } }}
                />
              </Box>
            )}

            {/* Sidebar Sort By Select */}
            {onSortOptionChange && (
              <Box px="xs">
                <Select
                  size="xs"
                  value={sortOption || "playtime-desc"}
                  onChange={onSortOptionChange}
                  data={[
                    { label: "Most Played", value: "playtime-desc" },
                    { label: "Least Played", value: "playtime-asc" },
                    { label: "Recently Played", value: "recent" },
                    { label: "Release (Newest)", value: "release-desc" },
                    { label: "Release (Oldest)", value: "release-asc" },
                    { label: "Date Added (Newest)", value: "added-desc" },
                    { label: "Date Added (Oldest)", value: "added-asc" },
                    { label: "Name (A-Z)", value: "title-asc" },
                    { label: "Highest Rating", value: "rating-desc" },
                  ]}
                  radius="md"
                  leftSection={<SlidersHorizontal size={13} color="var(--mantine-color-dimmed)" />}
                  comboboxProps={{ shadow: "md", transitionProps: { transition: "pop", duration: 150 } }}
                />
              </Box>
            )}

            <ScrollArea type="auto" style={{ flex: 1, marginTop: 4 }}>
              <Stack gap={4} pr={4}>
                {games.map((g) => {
                  const isSelected = selectedGameId === g.id;
                  const isRunning = activeGameId === g.id;

                  return (
                    <Paper
                      key={g.id}
                      p="xs"
                      radius="md"
                      bg={
                        isSelected
                          ? isDark
                            ? "dark.6"
                            : "blue.0"
                          : isDark
                            ? "dark.9"
                            : "white"
                      }
                      onClick={() => {
                        if (activeTab !== "library") {
                          setActiveTab("library");
                        }
                        if (onSelectGame) {
                          onSelectGame(g.id);
                        }
                      }}
                      onDoubleClick={() => onLaunchGame && onLaunchGame(g)}
                      style={{
                        cursor: "pointer",
                        border: isSelected
                          ? "1px solid var(--mantine-color-blue-5)"
                          : "1px solid var(--mantine-color-default-border)",
                        transition: "all 150ms ease",
                        contentVisibility: "auto" as any,
                        containIntrinsicSize: "200px 58px",
                      }}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Image
                          src={g.coverUrl}
                          w={28}
                          h={38}
                          radius="xs"
                          fit="cover"
                          fallbackSrc="https://placehold.co/30x40/141517/3b82f6?text=Cover"
                          loading="lazy"
                          decoding="async"
                        />
                        <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
                          <Group
                            justify="space-between"
                            align="center"
                            wrap="nowrap"
                          >
                            <Text
                              size="xs"
                              fw={isSelected ? 700 : 500}
                              c={
                                isSelected
                                  ? isDark
                                    ? "white"
                                    : "blue.9"
                                  : undefined
                              }
                              truncate
                            >
                              {g.title}
                            </Text>
                            <Group gap={2} wrap="nowrap" align="center">
                              {pinnedGameIds?.includes(g.id) && (
                                <Pin
                                  size={10}
                                  fill="#7950f2"
                                  color="#7950f2"
                                  style={{ transform: "rotate(45deg)" }}
                                />
                              )}
                              {g.isFavorite && (
                                <Star size={10} fill="#fcc419" color="#fcc419" />
                              )}
                            </Group>
                          </Group>

                          <Group justify="space-between" align="center">
                            <Text
                              size="10px"
                              c="dimmed"
                              truncate
                              style={{ maxWidth: 100 }}
                            >
                              {g.genres?.[0] ||
                                (g.releaseYear ? `${g.releaseYear}` : "Game")}
                            </Text>

                            <Group gap={4} align="center">
                              {g.hasUpdate && (
                                <Badge
                                  size="10px"
                                  color="yellow"
                                  variant="filled"
                                  px={4}
                                >
                                  UPDATE
                                </Badge>
                              )}
                              {g.isCompleted && (
                                <Badge
                                  size="10px"
                                  color="teal"
                                  variant="light"
                                  px={4}
                                >
                                  DONE
                                </Badge>
                              )}
                              {isRunning ? (
                                <Badge
                                  size="10px"
                                  color="teal"
                                  variant="filled"
                                  px={4}
                                >
                                  RUNNING
                                </Badge>
                              ) : !g.isInstalled ||
                                g.isWishlisted ? (
                                <Badge
                                  size="10px"
                                  color="pink"
                                  variant="light"
                                  px={4}
                                >
                                  WISHLIST
                                </Badge>
                               ) : (
                                 <Text size="10px" c="teal.4" ff="monospace">
                                   {(() => {
                                     const totalMins = (g.playtimeMinutes !== undefined && g.playtimeMinutes > 0)
                                       ? g.playtimeMinutes
                                       : ((g.hoursPlayed ?? 0) * 60);
                                     if (totalMins < 60) {
                                       return `${Math.floor(totalMins)}m`;
                                     }
                                     return `${(totalMins / 60).toFixed(1)}h`;
                                   })()}
                                 </Text>
                               )}
                            </Group>
                          </Group>
                        </Stack>
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            </ScrollArea>
          </Stack>
        )}
      </Stack>

      {/* Footer Info & Settings */}
      <Stack gap="xs" mt="xs">
        <Divider color="var(--mantine-color-default-border)" />
        <Group justify="space-between" align="center" p="xs">
          <Tooltip label="Settings & Download Path">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              radius="md"
              onClick={onOpenSettings}
              aria-label="Settings"
            >
              <Settings size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
    </Box>
  );
});
