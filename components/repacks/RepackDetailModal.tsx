"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  Image,
  Title,
  Text,
  Badge,
  Group,
  Stack,
  Tabs,
  Button,
  Paper,
  Box,
  ScrollArea,
  SimpleGrid,
  ActionIcon,
  Tooltip,
  CopyButton,
  Collapse,
  UnstyledButton,
  Menu,
} from "@mantine/core";
import {
  ExternalLink,
  Download,
  DownloadCloud,
  CheckCircle2,
  Circle,
  HardDrive,
  FileCode,
  Film,
  Image as ImageIcon,
  Sparkles,
  Zap,
  Copy,
  Check,
  Play,
  Calendar,
  Globe,
  Tag,
  Percent,
  Maximize2,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Trophy,
  Star,
  RotateCcw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { RepackPost } from "../../lib/repackTypes";
import {
  isWishlistedInStorage,
  toggleWishlistRepack,
  isCompletedRepackInStorage,
  toggleCompletedRepack,
  isFavoriteRepackInStorage,
  isInstalledRepackInStorage,
  toggleFavoriteRepack,
  setRepackStatus,
} from "../../lib/db";
import {
  cleanGameTitle,
  extractGameVersion,
  getRiotpixels240pUrl,
  getRiotpixelsFullResUrl,
} from "../../lib/gameLinker";
import { openInBrowser } from "../../lib/openUrl";

/** Extract a clean hoster display name from a URL */
function getHosterName(url: string): string {
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.replace(/^www\./, "");
    // Shorten very long subdomains
    const parts = host.split(".");
    if (parts.length > 2) host = parts.slice(-2).join(".");
    return host;
  } catch {
    // fallback: grab text before first /
    const m = url.match(/\/\/([^/]+)/);
    return m ? m[1].replace(/^www\./, "") : url.slice(0, 30);
  }
}

interface RepackDetailModalProps {
  post: RepackPost | null;
  opened: boolean;
  onClose: () => void;
  onToggleRead: (id: string, date?: string) => void;
  onOpenTorrentDownload?: (
    magnetUrl: string,
    title?: string,
    coverUrl?: string,
    repackSize?: string,
  ) => void;
}

/** Collapsible accordion row for a single hoster inside a mirror group */
interface HosterAccordionProps {
  hoster: string;
  links: { name: string; url: string }[];
  onOpenTorrentDownload?: RepackDetailModalProps["onOpenTorrentDownload"];
  postTitle: string;
  postCoverUrl: string;
  postRepackSize?: string;
}

const HosterAccordion: React.FC<HosterAccordionProps> = ({
  hoster,
  links,
  onOpenTorrentDownload,
  postTitle,
  postCoverUrl,
  postRepackSize,
}) => {
  const [open, setOpen] = useState(false);
  const isMultiPart = links.length > 1;

  return (
    <Box>
      <UnstyledButton
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%" }}
      >
        <Group
          justify="space-between"
          align="center"
          px="xs"
          py={6}
          style={{
            borderRadius: 6,
            background: "var(--mantine-color-default-hover)",
            cursor: "pointer",
          }}
        >
          <Group gap="xs">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Globe size={13} color="var(--mantine-color-dimmed)" />
            <Text size="xs" fw={600}>
              {hoster}
            </Text>
          </Group>
          <Badge size="xs" variant="dot" color="blue">
            {links.length} {isMultiPart ? "parts" : "link"}
          </Badge>
        </Group>
      </UnstyledButton>

      <Collapse expanded={open}>
        <Stack gap={4} pt={4} pl="xs">
          {links.map((link, lIdx) => (
            <Group key={lIdx} gap={4} wrap="nowrap">
              <Button
                onClick={() => openInBrowser(link.url)}
                variant="light"
                color="blue"
                size="xs"
                radius="md"
                justify="space-between"
                rightSection={<ExternalLink size={12} />}
                style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
              >
                <Text size="xs" truncate style={{ maxWidth: "100%" }}>
                  {link.name}
                </Text>
              </Button>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
};

// Helper to convert YouTube watch links to embed links
const getYoutubeEmbedUrl = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/,
  );
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}?autoplay=0&rel=0`;
  }
  if (url.includes("youtube.com/embed/")) {
    return url.split("?")[0];
  }
  return null;
};

// Helper to parse size string to numerical gigabytes for comparison
const parseSizeGB = (sizeStr: string): number | null => {
  if (!sizeStr) return null;
  const match = sizeStr.match(/([\d.,]+)\s*(GB|MB|TB)/i);
  if (!match) return null;
  const num = parseFloat(match[1].replace(",", "."));
  const unit = match[2].toUpperCase();
  if (isNaN(num)) return null;
  if (unit === "TB") return num * 1024;
  if (unit === "MB") return num / 1024;
  return num;
};

export const RepackDetailModal: React.FC<RepackDetailModalProps> = ({
  post,
  opened,
  onClose,
  onToggleRead,
  onOpenTorrentDownload,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [activeVideoIndex, setActiveVideoIndex] = useState<number>(0);
  const [isWishlisted, setIsWishlisted] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  useEffect(() => {
    if (post) {
      const sync = () => {
        setIsWishlisted(isWishlistedInStorage(post.id, post));
        setIsCompleted(isCompletedRepackInStorage(post.id, post));
        setIsInstalled(isInstalledRepackInStorage(post.id, post));
        setIsFavorite(isFavoriteRepackInStorage(post.id, post));
      };
      sync();
      window.addEventListener("fitrepacks-games-updated", sync);
      return () =>
        window.removeEventListener("fitrepacks-games-updated", sync);
    }
  }, [post]);

  if (!post) return null;

  const handleToggleFavorite = () => {
    const newState = toggleFavoriteRepack(post.id, post);
    setIsFavorite(newState);
  };

  const handleStatusChange = (status: "installed" | "wishlist" | "completed" | "none") => {
    let targetStatus = status;
    if (status === "installed" && isInstalled) targetStatus = "none";
    else if (status === "wishlist" && isWishlisted) targetStatus = "none";
    else if (status === "completed" && isCompleted) targetStatus = "none";

    setRepackStatus(post.id, post, targetStatus);
  };

  const handleToggleWishlist = () => {
    const newState = toggleWishlistRepack(post.id, post);
    setIsWishlisted(newState);
  };

  const handleToggleCompleted = () => {
    const newState = toggleCompletedRepack(post.id, post);
    setIsCompleted(newState);
  };

  // Calculate compression savings percentage if both sizes available
  const repackGB = parseSizeGB(post.repackSize);
  const origGB = parseSizeGB(post.originalSize);
  let savingsPercent: number | null = null;
  if (repackGB && origGB && origGB > repackGB) {
    savingsPercent = Math.round(((origGB - repackGB) / origGB) * 100);
  }

  // Find primary magnet link if exists
  const allMagnetLinks = post.mirrorGroups
    .flatMap((g) => g.links)
    .filter((l) => l.url.startsWith("magnet:"));
  const mainMagnetUrl =
    allMagnetLinks.length > 0 ? allMagnetLinks[0].url : null;

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        size="55rem"
        radius="lg"
        padding="0"
        withCloseButton={true}
        centered
        styles={{
          content: {
            backgroundColor: "var(--mantine-color-body)",
            border: "1px solid var(--mantine-color-default-border)",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
            overflow: "hidden",
            color: "var(--mantine-color-text)",
          },
          header: {
            backgroundColor: "transparent",
            position: "absolute",
            right: 12,
            top: 12,
            zIndex: 10,
          },
          close: {
            color: "var(--mantine-color-dark-2)",
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(6px)",
            borderRadius: "50%",
            transition: "all 150ms ease",
          },
        }}
      >
        <Box style={{ position: "relative" }}>
          {/* Header Banner / Cover Hero */}
          <Box
            h={250}
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(11, 12, 16, 0.3) 0%, rgba(20, 21, 26, 0.95) 75%, var(--mantine-color-dark-7) 100%), url(${
                post.coverUrl ||
                "https://placehold.co/1000x500/141517/3b82f6?text=FitGirl+Repack"
              })`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              display: "flex",
              alignItems: "flex-end",
              padding: "20px 24px 16px 24px",
              position: "relative",
            }}
          >
            {/* Accent Line */}
            <Box
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "3px",
                backgroundColor: "var(--mantine-color-blue-6)",
              }}
            />

            <Group
              justify="space-between"
              align="flex-end"
              w="100%"
              wrap="nowrap"
              gap="md"
            >
              <Group
                gap="lg"
                wrap="nowrap"
                align="flex-end"
                style={{ minWidth: 0 }}
              >
                {/* Poster Artwork */}
                <Box style={{ position: "relative", flexShrink: 0 }}>
                  <Image
                    src={post.coverUrl}
                    w={115}
                    h={150}
                    radius="md"
                    fallbackSrc="https://placehold.co/115x150/141517/3b82f6?text=No+Cover"
                    style={{
                      border: "2px solid var(--mantine-color-blue-6)",
                      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.6)",
                      objectFit: "cover",
                    }}
                  />
                  {savingsPercent !== null && (
                    <Badge
                      size="xs"
                      variant="filled"
                      color="blue"
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -8,
                        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
                        fontWeight: 700,
                      }}
                    >
                      -{savingsPercent}%
                    </Badge>
                  )}
                </Box>

                {/* Main Details */}
                <Stack gap={6} style={{ minWidth: 0, flex: 1 }}>
                  <Group gap="xs" wrap="wrap">
                    <Badge
                      variant="filled"
                      color="blue"
                      size="sm"
                      leftSection={<Zap size={11} />}
                      style={{
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {post.source && post.source == "steamrip"
                        ? "SteamRip"
                        : "FITGIRL REPACK"}
                    </Badge>

                    {post.date && (
                      <Badge
                        variant="outline"
                        color="gray"
                        size="sm"
                        leftSection={<Calendar size={11} />}
                      >
                        {(() => {
                          if (!post.date.includes("T")) return post.date;
                          try {
                            const d = new Date(post.date);
                            return isNaN(d.getTime())
                              ? post.date
                              : d.toLocaleDateString("en-UK", {
                                  year: "numeric",
                                  month: "numeric",
                                  day: "numeric",
                                });
                          } catch (_) {
                            return post.date;
                          }
                        })()}
                      </Badge>
                    )}
                  </Group>

                  <Title
                    order={3}
                    c="white"
                    className="heading-font"
                    style={{
                      lineHeight: 1.25,
                      fontSize: "1.35rem",
                    }}
                    lineClamp={2}
                  >
                    {cleanGameTitle(post.title)}
                  </Title>

                  <Group gap="xs" wrap="wrap" mt={2}>
                    {extractGameVersion(post.title, post.description) && (
                      <Badge variant="light" color="teal" size="sm">
                        {extractGameVersion(post.title, post.description)}
                      </Badge>
                    )}

                    <Badge
                      variant="filled"
                      color="dark"
                      size="sm"
                      leftSection={<HardDrive size={11} />}
                    >
                      Repack: {post.repackSize}
                    </Badge>

                    {post.originalSize && (
                      <Badge variant="outline" color="gray" size="sm">
                        Original: {post.originalSize}
                      </Badge>
                    )}

                    {savingsPercent !== null && (
                      <Badge
                        variant="light"
                        color="teal"
                        size="sm"
                        leftSection={<Percent size={11} />}
                      >
                        Saved {savingsPercent}% Data
                      </Badge>
                    )}
                  </Group>
                </Stack>
              </Group>

              {/* Action Buttons */}
              <Stack gap="xs" style={{ flexShrink: 0 }} align="flex-end">
                <Group gap="xs">
                  {/* In-App Torrent Download Button */}
                  {mainMagnetUrl && (
                    <Tooltip
                      label="Download Torrent Magnet (In-App)"
                      position="top"
                      withArrow
                    >
                      <Button
                        variant="gradient"
                        gradient={{ from: "blue.6", to: "cyan.6", deg: 90 }}
                        size="xs"
                        radius="md"
                        leftSection={<DownloadCloud size={15} />}
                        onClick={() => {
                          if (onOpenTorrentDownload) {
                            onOpenTorrentDownload(
                              mainMagnetUrl,
                              post.title,
                              post.coverUrl,
                              post.repackSize,
                            );
                          }
                        }}
                        style={{
                          cursor: "pointer",
                          fontWeight: 700,
                          boxShadow: "0 2px 10px rgba(34, 139, 230, 0.35)",
                          transition: "all 150ms ease",
                        }}
                      >
                        Download
                      </Button>
                    </Tooltip>
                  )}

                  {/* Favorite Star Button */}
                  <Tooltip
                    label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                    position="top"
                    withArrow
                  >
                    <ActionIcon
                      variant={isFavorite ? "filled" : "outline"}
                      color={isFavorite ? "yellow" : "gray"}
                      size={28}
                      radius="md"
                      style={{
                        backgroundColor: isFavorite ? "#fcc419" : undefined,
                        color: isFavorite ? "#000" : undefined,
                        boxShadow: isFavorite
                          ? "0 0 10px rgba(252, 196, 25, 0.4)"
                          : undefined,
                        transition: "all 150ms ease",
                      }}
                      onClick={handleToggleFavorite}
                    >
                      <Star
                        size={15}
                        fill={isFavorite ? "#000" : "none"}
                        strokeWidth={2.2}
                      />
                    </ActionIcon>
                  </Tooltip>

                  {/* Status Dropdown Menu */}
                  <Menu
                    shadow="md"
                    width={185}
                    position="bottom-end"
                    withinPortal
                    radius="md"
                  >
                    <Menu.Target>
                      <Button
                        variant={
                          isInstalled || isCompleted || isWishlisted
                            ? "filled"
                            : "outline"
                        }
                        color={
                          isInstalled
                            ? "blue"
                            : isCompleted
                              ? "teal"
                              : isWishlisted
                                ? "orange"
                                : "gray"
                        }
                        size="xs"
                        radius="md"
                        leftSection={
                          isInstalled ? (
                            <HardDrive size={14} />
                          ) : isCompleted ? (
                            <CheckCircle2 size={14} />
                          ) : isWishlisted ? (
                            <Bookmark size={14} fill="white" />
                          ) : (
                            <Bookmark size={14} />
                          )
                        }
                        rightSection={<ChevronDown size={12} />}
                        style={{
                          cursor: "pointer",
                          transition: "all 150ms ease",
                          fontWeight: 600,
                        }}
                      >
                        {isInstalled
                          ? "Installed"
                          : isCompleted
                            ? "Completed"
                            : isWishlisted
                              ? "Wishlist"
                              : "Set Status"}
                      </Button>
                    </Menu.Target>

                    <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                      <Menu.Label>Library Status</Menu.Label>
                      <Menu.Item
                        leftSection={<HardDrive size={14} color="#3b82f6" />}
                        rightSection={
                          isInstalled ? (
                            <Check size={13} color="#3b82f6" />
                          ) : undefined
                        }
                        onClick={() => handleStatusChange("installed")}
                      >
                        Mark as Installed
                      </Menu.Item>
                      <Menu.Item
                        leftSection={
                          <Bookmark
                            size={14}
                            color="#f97316"
                            fill={isWishlisted ? "#f97316" : "none"}
                          />
                        }
                        rightSection={
                          isWishlisted ? (
                            <Check size={13} color="#f97316" />
                          ) : undefined
                        }
                        onClick={() => handleStatusChange("wishlist")}
                      >
                        Mark as Wishlist
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<CheckCircle2 size={14} color="#10b981" />}
                        rightSection={
                          isCompleted ? (
                            <Check size={13} color="#10b981" />
                          ) : undefined
                        }
                        onClick={() => handleStatusChange("completed")}
                      >
                        Mark as Completed
                      </Menu.Item>
                      {(isInstalled || isWishlisted || isCompleted) && (
                        <>
                          <Menu.Divider />
                          <Menu.Item
                            leftSection={<RotateCcw size={14} />}
                            color="dimmed"
                            onClick={() => handleStatusChange("none")}
                          >
                            Clear Status
                          </Menu.Item>
                        </>
                      )}
                    </Menu.Dropdown>
                  </Menu>

                  <Button
                    variant={post.isRead ? "light" : "filled"}
                    color={post.isRead ? "gray" : "blue"}
                    size="xs"
                    radius="md"
                    leftSection={
                      post.isRead ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <Circle size={15} />
                      )
                    }
                    onClick={() => onToggleRead(post.id, post.date)}
                    style={{
                      cursor: "pointer",
                      transition: "all 150ms ease",
                    }}
                  >
                    {post.isRead ? "Marked Read" : "Mark as Read"}
                  </Button>

                  <Tooltip
                    label={
                      post.source && post.source == "steamrip"
                        ? "Open on SteamRip Website"
                        : "Open on FitGirl Website"
                    }
                    position="top"
                    withArrow
                  >
                    <ActionIcon
                      onClick={() => openInBrowser(post.url)}
                      size="md"
                      variant="default"
                      radius="md"
                      aria-label={
                        post.source && post.source == "steamrip"
                          ? "Open on SteamRip Website"
                          : "Open on FitGirl Website"
                      }
                      style={{
                        cursor: "pointer",
                      }}
                    >
                      <ExternalLink size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Stack>
            </Group>
          </Box>

          {/* Modal Body & Navigation Tabs */}
          <Box p="md" bg="var(--mantine-color-body)">
            <Tabs defaultValue="links" color="blue" variant="outline">
              <Tabs.List
                mb="md"
                style={{
                  borderColor: "var(--mantine-color-default-border)",
                  gap: "4px",
                }}
              >
                <Tabs.Tab
                  value="links"
                  leftSection={<Download size={15} />}
                  className="heading-font"
                  style={{ fontWeight: 600, cursor: "pointer" }}
                >
                  Download Mirrors (
                  {post.mirrorGroups.reduce(
                    (acc, g) => acc + g.links.length,
                    0,
                  )}
                  )
                </Tabs.Tab>

                {post.gameUpdates.length > 0 && (
                  <Tabs.Tab
                    value="updates"
                    leftSection={<FileCode size={15} />}
                    className="heading-font"
                    style={{ fontWeight: 600, cursor: "pointer" }}
                  >
                    Updates & Patches ({post.gameUpdates.length})
                  </Tabs.Tab>
                )}

                {post.screenshots.length > 0 && (
                  <Tabs.Tab
                    value="gallery"
                    leftSection={<ImageIcon size={15} />}
                    className="heading-font"
                    style={{ fontWeight: 600, cursor: "pointer" }}
                  >
                    Screenshots ({post.screenshots.length})
                  </Tabs.Tab>
                )}

                {post.videos.length > 0 && (
                  <Tabs.Tab
                    value="videos"
                    leftSection={<Film size={15} />}
                    className="heading-font"
                    style={{ fontWeight: 600, cursor: "pointer" }}
                  >
                    Trailers ({post.videos.length})
                  </Tabs.Tab>
                )}

                <Tabs.Tab
                  value="details"
                  leftSection={<HardDrive size={15} />}
                  className="heading-font"
                  style={{ fontWeight: 600, cursor: "pointer" }}
                >
                  Game Info & Specs
                </Tabs.Tab>
              </Tabs.List>

              {/* TAB 1: Download Mirrors */}
              <Tabs.Panel value="links">
                <ScrollArea h={340} offsetScrollbars type="auto">
                  <Stack gap="md" pr="xs">
                    {post.mirrorGroups.length > 0 ? (
                      post.mirrorGroups.map((group, idx) => {
                        const isMagnetGroup = group.category
                          .toLowerCase()
                          .includes("magnet");

                        if (isMagnetGroup) {
                          // Magnet links — flat display as before
                          return (
                            <Paper
                              key={idx}
                              p="md"
                              bg="var(--mantine-color-default)"
                              radius="md"
                              style={{
                                border: "1px solid var(--mantine-color-blue-6)",
                              }}
                            >
                              <Group justify="space-between" align="center" mb="sm">
                                <Group gap="xs">
                                  <Sparkles size={16} color="var(--mantine-color-blue-4)" />
                                  <Text size="sm" fw={700} c="blue.4" className="heading-font">
                                    {group.category}
                                  </Text>
                                </Group>
                                <Badge size="xs" variant="light" color="blue">
                                  {group.links.length} {group.links.length === 1 ? "Link" : "Torrents"}
                                </Badge>
                              </Group>

                              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                                {group.links.map((link, lIdx) => {
                                  const isMagnet = link.url.startsWith("magnet:");
                                  return (
                                    <Group key={lIdx} gap={4} wrap="nowrap">
                                      <Button
                                        onClick={() => openInBrowser(link.url)}
                                        variant={isMagnet ? "filled" : "light"}
                                        color="blue"
                                        size="xs"
                                        radius="md"
                                        justify="space-between"
                                        rightSection={<ExternalLink size={12} />}
                                        style={{ flex: 1, cursor: "pointer", minWidth: 0 }}
                                      >
                                        <Text size="xs" truncate style={{ maxWidth: "100%" }}>
                                          {isMagnet ? `⚡ ${link.name || "Launch Magnet"}` : link.name}
                                        </Text>
                                      </Button>

                                      {isMagnet && (
                                        <>
                                          <Tooltip label="Download in-app (Torrent Manager)" withArrow position="top">
                                            <ActionIcon
                                              color="blue"
                                              variant="light"
                                              size="md"
                                              onClick={() => {
                                                if (onOpenTorrentDownload) {
                                                  onOpenTorrentDownload(link.url, post.title, post.coverUrl, post.repackSize);
                                                }
                                              }}
                                              radius="md"
                                              aria-label="Download in-app"
                                              style={{ cursor: "pointer" }}
                                            >
                                              <DownloadCloud size={14} />
                                            </ActionIcon>
                                          </Tooltip>

                                          <CopyButton value={link.url} timeout={2000}>
                                            {({ copied, copy }) => (
                                              <Tooltip label={copied ? "Copied Magnet!" : "Copy Magnet URL"} withArrow position="top">
                                                <ActionIcon
                                                  color={copied ? "teal" : "gray"}
                                                  variant="subtle"
                                                  size="md"
                                                  onClick={copy}
                                                  radius="md"
                                                  aria-label="Copy Magnet URL"
                                                  style={{ cursor: "pointer" }}
                                                >
                                                  {copied ? <Check size={14} /> : <Copy size={14} />}
                                                </ActionIcon>
                                              </Tooltip>
                                            )}
                                          </CopyButton>
                                        </>
                                      )}
                                    </Group>
                                  );
                                })}
                              </SimpleGrid>
                            </Paper>
                          );
                        }

                        // Non-magnet group — group links by hoster with collapsible sections
                        const linksByHoster = group.links.reduce<Record<string, typeof group.links>>((acc, link) => {
                          const hoster = getHosterName(link.url);
                          if (!acc[hoster]) acc[hoster] = [];
                          acc[hoster].push(link);
                          return acc;
                        }, {});
                        const hosters = Object.entries(linksByHoster).sort((a, b) => b[1].length - a[1].length);

                        return (
                          <Paper
                            key={idx}
                            p="md"
                            bg="var(--mantine-color-default)"
                            radius="md"
                            style={{ border: "1px solid var(--mantine-color-default-border)" }}
                          >
                            <Group justify="space-between" align="center" mb="sm">
                              <Group gap="xs">
                                <Download size={16} color="var(--mantine-color-blue-4)" />
                                <Text size="sm" fw={700} c="blue.5" className="heading-font">
                                  {group.category}
                                </Text>
                              </Group>
                              <Badge size="xs" variant="light" color="gray">
                                {group.links.length} {group.links.length === 1 ? "Link" : "Links"} · {hosters.length} Hosters
                              </Badge>
                            </Group>

                            <Stack gap={4}>
                              {hosters.map(([hoster, links]) => (
                                <HosterAccordion
                                  key={hoster}
                                  hoster={hoster}
                                  links={links}
                                  onOpenTorrentDownload={onOpenTorrentDownload}
                                  postTitle={post.title}
                                  postCoverUrl={post.coverUrl}
                                  postRepackSize={post.repackSize}
                                />
                              ))}
                            </Stack>
                          </Paper>
                        );
                      })
                    ) : (
                      <Paper
                        p="xl"
                        bg="var(--mantine-color-default)"
                        radius="md"
                        style={{
                          textAlign: "center",
                          border: "1px dashed var(--mantine-color-default-border)",
                        }}
                      >
                        <Text size="sm" c="dimmed" mb="xs">
                          No direct mirror links extracted automatically.
                        </Text>
                        <Button
                          onClick={() => openInBrowser(post.url)}
                          variant="light"
                          color="blue"
                          size="xs"
                          radius="md"
                          rightSection={<ExternalLink size={13} />}
                          style={{ cursor: "pointer" }}
                        >
                          {post.source && post.source == "steamrip"
                            ? "View Mirrors on Official SteamRip Site"
                            : "View Mirrors on Official FitGirl Site"}
                        </Button>
                      </Paper>
                    )}
                  </Stack>
                </ScrollArea>
              </Tabs.Panel>

              {/* TAB 2: Game Updates & Patches */}
              <Tabs.Panel value="updates">
                <ScrollArea h={340} offsetScrollbars type="auto">
                  <Stack gap="sm" pr="xs">
                    {post.gameUpdates.length > 0 ? (
                      post.gameUpdates.map((update, idx) => (
                        <Paper
                          key={idx}
                          p="md"
                          bg="var(--mantine-color-default)"
                          radius="md"
                          style={{
                            border: "1px solid var(--mantine-color-teal-6)",
                          }}
                        >
                          <Stack gap="xs">
                            <Group
                              justify="space-between"
                              align="center"
                              wrap="wrap"
                              gap="xs"
                            >
                              <Group gap="xs">
                                <FileCode
                                  size={16}
                                  color="var(--mantine-color-teal-5)"
                                />
                                <Text
                                  size="xs"
                                  fw={700}
                                  c="teal.4"
                                  className="heading-font"
                                >
                                  {update.title}
                                </Text>
                              </Group>

                              <Button
                                onClick={() => openInBrowser(update.url)}
                                size="xs"
                                color="teal"
                                radius="md"
                                variant="filled"
                                rightSection={<ExternalLink size={13} />}
                                style={{ cursor: "pointer" }}
                              >
                                Download Patch / Update
                              </Button>
                            </Group>

                            {update.notes && (
                              <Paper
                                p="xs"
                                bg="var(--mantine-color-body)"
                                radius="sm"
                                style={{
                                  borderLeft:
                                    "3px solid var(--mantine-color-teal-5)",
                                  borderTop: "1px solid var(--mantine-color-default-border)",
                                  borderRight: "1px solid var(--mantine-color-default-border)",
                                  borderBottom: "1px solid var(--mantine-color-default-border)",
                                }}
                              >
                                <Text
                                  size="xs"
                                  c="dimmed"
                                  style={{
                                    whiteSpace: "pre-line",
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {update.notes}
                                </Text>
                              </Paper>
                            )}
                          </Stack>
                        </Paper>
                      ))
                    ) : (
                      <Paper
                        p="xl"
                        bg="var(--mantine-color-default)"
                        radius="md"
                        style={{
                          textAlign: "center",
                          border: "1px dashed var(--mantine-color-default-border)",
                        }}
                      >
                        <Text size="xs" c="dimmed">
                          No separate update patches or standalone converters
                          reported for this repack yet.
                        </Text>
                      </Paper>
                    )}
                  </Stack>
                </ScrollArea>
              </Tabs.Panel>

              {/* TAB 3: Screenshots Gallery (with Lightbox click preview) */}
              <Tabs.Panel value="gallery">
                <ScrollArea h={340} offsetScrollbars type="auto">
                  {(() => {
                    const allScreenshots = post.screenshots || [];
                    const gifScreenshots = allScreenshots.filter(
                      (s) => s && /\.gif(?:\?.*)?$/i.test(s),
                    );
                    const staticScreenshots = allScreenshots.filter(
                      (s) => s && !/\.gif(?:\?.*)?$/i.test(s),
                    );
                    const sortedScreenshots = [
                      ...gifScreenshots,
                      ...staticScreenshots,
                    ];

                    return (
                      <SimpleGrid
                        cols={{ base: 2, sm: 3 }}
                        spacing="sm"
                        pr="xs"
                      >
                        {sortedScreenshots.map((src, idx) => {
                          const isGif = /\.gif(?:\?.*)?$/i.test(src);
                          const thumbUrl = getRiotpixels240pUrl(src);
                          const fullUrl = getRiotpixelsFullResUrl(src);
                          return (
                            <Box
                              key={idx}
                              onClick={() => setSelectedImage(fullUrl)}
                              style={{
                                position: "relative",
                                borderRadius: "8px",
                                overflow: "hidden",
                                border: isGif
                                  ? "1px solid var(--mantine-color-grape-6)"
                                  : "1px solid var(--mantine-color-default-border)",
                                cursor: "pointer",
                                transition: "all 150ms ease",
                                contentVisibility: "auto" as any,
                                containIntrinsicSize: "200px 130px",
                              }}
                            >
                              <Image
                                src={thumbUrl}
                                radius="md"
                                h={130}
                                loading="lazy"
                                decoding="async"
                                fallbackSrc="https://placehold.co/300x180/1a1b1e/909296?text=Screenshot"
                                style={{ objectFit: "cover" }}
                              />
                              {isGif && (
                                <Badge
                                  size="xs"
                                  color="grape"
                                  variant="filled"
                                  style={{
                                    position: "absolute",
                                    top: 6,
                                    left: 6,
                                    zIndex: 2,
                                    pointerEvents: "none",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                                  }}
                                >
                                  GIF
                                </Badge>
                              )}
                              <Box
                                style={{
                                  position: "absolute",
                                  bottom: 6,
                                  right: 6,
                                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                                  padding: "4px",
                                  borderRadius: "4px",
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              >
                                <Maximize2 size={12} color="#ffffff" />
                              </Box>
                            </Box>
                          );
                        })}
                      </SimpleGrid>
                    );
                  })()}
                </ScrollArea>
              </Tabs.Panel>

              {/* TAB 4: Videos & Trailers (Interactive Inline Embed) */}
              <Tabs.Panel value="videos">
                <ScrollArea h={340} offsetScrollbars type="auto">
                  <Stack gap="md" pr="xs">
                    {post.videos.length > 0 ? (
                      <>
                        {/* Currently Selected Active Video Player */}
                        {(() => {
                          const currentVidUrl =
                            post.videos[activeVideoIndex] || post.videos[0];
                          const embedUrl = getYoutubeEmbedUrl(currentVidUrl);

                          return (
                            <Paper
                              p="xs"
                              bg="var(--mantine-color-default)"
                              radius="md"
                              style={{
                                border: "1px solid var(--mantine-color-blue-6)",
                              }}
                            >
                              {embedUrl ? (
                                <Box
                                  style={{
                                    position: "relative",
                                    paddingTop: "56.25%",
                                    borderRadius: "8px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <iframe
                                    src={embedUrl}
                                    title={`Trailer ${activeVideoIndex + 1}`}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    style={{
                                      position: "absolute",
                                      top: 0,
                                      left: 0,
                                      width: "100%",
                                      height: "100%",
                                      border: "none",
                                    }}
                                  />
                                </Box>
                              ) : (
                                <Paper
                                  p="lg"
                                  bg="var(--mantine-color-body)"
                                  style={{
                                    textAlign: "center",
                                    border: "1px solid var(--mantine-color-default-border)",
                                  }}
                                >
                                  <Text size="sm" c="dimmed" mb="xs">
                                    External Video Trailer
                                  </Text>
                                  <Button
                                    component="a"
                                    href={currentVidUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    size="xs"
                                    color="blue"
                                    radius="md"
                                    leftSection={<Play size={14} />}
                                    rightSection={<ExternalLink size={12} />}
                                  >
                                    Watch Video
                                  </Button>
                                </Paper>
                              )}
                            </Paper>
                          );
                        })()}

                        {/* Video Selector Buttons */}
                        {post.videos.length > 1 && (
                          <Group gap="xs" wrap="wrap">
                            {post.videos.map((vid, idx) => (
                              <Button
                                key={idx}
                                size="xs"
                                radius="md"
                                variant={
                                  activeVideoIndex === idx
                                    ? "filled"
                                    : "outline"
                                }
                                color="blue"
                                leftSection={<Play size={12} />}
                                onClick={() => setActiveVideoIndex(idx)}
                                style={{ cursor: "pointer" }}
                              >
                                Video #{idx + 1}
                              </Button>
                            ))}
                          </Group>
                        )}
                      </>
                    ) : (
                      <Paper
                        p="xl"
                        bg="var(--mantine-color-default)"
                        radius="md"
                        style={{
                          textAlign: "center",
                          border: "1px dashed var(--mantine-color-default-border)",
                        }}
                      >
                        <Text size="xs" c="dimmed">
                          No video trailers available for this repack post.
                        </Text>
                      </Paper>
                    )}
                  </Stack>
                </ScrollArea>
              </Tabs.Panel>

              {/* TAB 5: Game Info & Specs */}
              <Tabs.Panel value="details">
                <ScrollArea h={340} offsetScrollbars type="auto">
                  <Stack gap="md" pr="xs">
                    {/* Key Attributes Pills */}
                    <Paper
                      p="md"
                      bg="var(--mantine-color-default)"
                      radius="md"
                      style={{
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Stack gap="xs">
                        {post.companies && (
                          <Group gap="xs" align="flex-start">
                            <Globe
                              size={14}
                              color="var(--mantine-color-blue-4)"
                              style={{ marginTop: 2 }}
                            />
                            <Text size="xs" c="dimmed">
                              <Text span fw={700} c="var(--mantine-color-text)">
                                Companies / Developers:
                              </Text>{" "}
                              {post.companies}
                            </Text>
                          </Group>
                        )}

                        {post.languages && (
                          <Group gap="xs" align="flex-start">
                            <Tag
                              size={14}
                              color="var(--mantine-color-blue-4)"
                              style={{ marginTop: 2 }}
                            />
                            <Text size="xs" c="dimmed">
                              <Text span fw={700} c="var(--mantine-color-text)">
                                Languages Supported:
                              </Text>{" "}
                              {post.languages}
                            </Text>
                          </Group>
                        )}

                        {post.genres.length > 0 && (
                          <Group gap="xs" align="center" mt={4}>
                            <Text size="xs" fw={700} c="var(--mantine-color-text)">
                              Genres:
                            </Text>
                            <Group gap={6} wrap="wrap">
                              {post.genres.map((g, i) => (
                                <Badge
                                  key={i}
                                  size="xs"
                                  variant="outline"
                                  color="blue"
                                >
                                  {g}
                                </Badge>
                              ))}
                            </Group>
                          </Group>
                        )}
                      </Stack>
                    </Paper>

                    {/* Game Description */}
                    <Paper
                      p="md"
                      bg="var(--mantine-color-default)"
                      radius="md"
                      style={{
                        border: "1px solid var(--mantine-color-default-border)",
                      }}
                    >
                      <Title
                        order={5}
                        c="blue.4"
                        mb="xs"
                        className="heading-font"
                      >
                        Repack Features & Overview
                      </Title>
                      <Text
                        size="xs"
                        c="var(--mantine-color-text)"
                        style={{
                          whiteSpace: "pre-line",
                          lineHeight: 1.5,
                          opacity: 0.9,
                        }}
                      >
                        {post.description ||
                          "No detailed description provided for this repack."}
                      </Text>
                    </Paper>
                  </Stack>
                </ScrollArea>
              </Tabs.Panel>
            </Tabs>
          </Box>
        </Box>
      </Modal>

      {/* Lightbox Screenshot Modal */}
      <Modal
        opened={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        size="calc(100vw - 3rem)"
        padding="0"
        withCloseButton={true}
        centered
        styles={{
          content: {
            backgroundColor: "var(--mantine-color-dark-9)",
            border: "1px solid var(--mantine-color-dark-4)",
            overflow: "hidden",
          },
        }}
      >
        {selectedImage && (
          <Box p="xs" style={{ display: "flex", justifyContent: "center" }}>
            <Image
              src={selectedImage}
              alt="Screenshot Preview"
              fit="contain"
              style={{ maxHeight: "85vh", borderRadius: "8px" }}
            />
          </Box>
        )}
      </Modal>
    </>
  );
};
