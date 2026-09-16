"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Stack,
  Group,
  Paper,
  Title,
  Text,
  TextInput,
  Button,
  Badge,
  SimpleGrid,
  Card,
  Image,
  ActionIcon,
  Tooltip,
  Alert,
  SegmentedControl,
  Box,
  Select,
  MultiSelect,
  Pagination,
  Loader,
  Skeleton,
  Center,
  useComputedColorScheme,
  Menu,
} from "@mantine/core";
import { useDebouncedValue, useHover } from "@mantine/hooks";
import {
  Search,
  CheckCircle2,
  Circle,
  DownloadCloud,
  Eye,
  CheckCheck,
  Flame,
  Sparkles,
  ArrowUpDown,
  Play,
  LayoutGrid,
  List,
  X,
  Layers,
  Magnet,
  Film,
  Maximize2,
  Filter,
  Bookmark,
  RefreshCw,
  Database,
  AlertCircle,
  Lock,
  WifiOff,
  Gamepad2,
  Star,
  HardDrive,
  Check,
  RotateCcw,
  ChevronDown,
  Zap,
} from "lucide-react";
import { useOnlineStatus } from "../../lib/useOnlineStatus";
import { Carousel } from "@mantine/carousel";
import { RepackPost } from "../../lib/repackTypes";
import {
  loadRepacksPaginated,
  togglePostReadState,
  markPostsAsReadBatch,
  markAllRepacksAsRead,
  getRepackDatasetStats,
  RepackDatasetStats,
  isWishlistedInStorage,
  isCompletedRepackInStorage,
  isFavoriteRepackInStorage,
  isInstalledRepackInStorage,
  toggleFavoriteRepack,
  toggleWishlistRepack,
  toggleCompletedRepack,
  setRepackStatus,
  getCarouselVideoPosition,
} from "../../lib/db";
import {
  cleanGameTitle,
  extractGameVersion,
  getRiotpixels240pUrl,
} from "../../lib/gameLinker";
import { RepackDetailModal } from "./RepackDetailModal";

// Helper to format ISO dates nicely for UI display
const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "";
  if (!dateStr.includes("T")) return dateStr; // Simple date format YYYY-MM-DD
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-UK", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  } catch (_) {
    return dateStr;
  }
};

// Helper to convert YouTube watch links to embed links
const getYoutubeEmbedUrl = (url: string): string | null => {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/,
  );
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
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

// Helper to optimize image URLs for fast thumbnail loading (RiotPixels 240p CDN thumbnails)
const getOptimizedImageUrl = (url: string): string => {
  if (!url) return url;
  if (/\.gif(?:\?.*)?$/i.test(url)) return url;
  return getRiotpixels240pUrl(url);
};

// Sub-component: Mantine Carousel Media Slider for Repack Post Cards
const VideoSlide: React.FC<{
  item: { type: "video" | "image"; url: string; embedUrl?: string };
  title: string;
  isHovered?: boolean;
}> = ({ item, title, isHovered = false }) => {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [isSelfHovered, setIsSelfHovered] = useState(false);
  const activeHover = isHovered || isSelfHovered;

  useEffect(() => {
    if (videoRef.current) {
      if (activeHover) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [activeHover]);

  const sendLowQualityCommand = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: "setPlaybackQuality",
            args: ["tiny"],
          }),
          "*",
        );
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: "command",
            func: "setSuggestedQuality",
            args: ["tiny"],
          }),
          "*",
        );
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    if (activeHover) {
      sendLowQualityCommand();
    }
  }, [activeHover]);

  if (item.embedUrl) {
    return (
      <Box
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          pointerEvents: "none",
          backgroundColor: "#000000",
        }}
      >
        <iframe
          ref={iframeRef}
          src={item.embedUrl}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          tabIndex={-1}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            objectFit: "cover",
          }}
        />
      </Box>
    );
  }

  return (
    <Box
      style={{ width: "100%", height: "100%", position: "relative" }}
      onMouseEnter={() => setIsSelfHovered(true)}
      onMouseLeave={() => setIsSelfHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      <video
        ref={videoRef}
        src={item.url}
        loop
        muted
        playsInline
        preload="metadata"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </Box>
  );
};

interface RepackCardCarouselProps {
  post: RepackPost;
  onToggleRead: (e: React.MouseEvent) => void;
  onOpenModal: () => void;
  height?: number;
  isCardHovered?: boolean;
}

const RepackCardCarousel: React.FC<RepackCardCarouselProps> = React.memo(
  ({
    post,
    onToggleRead,
    onOpenModal,
    height = 230,
    isCardHovered = false,
  }) => {
    const [isCarouselHovered, setIsCarouselHovered] = useState(false);
    const [videoPosition, setVideoPosition] = useState<"first" | "last">(
      getCarouselVideoPosition(),
    );
    const activeHover = isCardHovered || isCarouselHovered;

    useEffect(() => {
      const handleSettingUpdated = (event: any) => {
        if (event?.detail?.key === "carousel_video_position") {
          const val = event.detail.value;
          if (val === "first" || val === "last") {
            setVideoPosition(val);
          }
        }
      };
      window.addEventListener(
        "fitrepacks-settings-updated",
        handleSettingUpdated,
      );
      return () => {
        window.removeEventListener(
          "fitrepacks-settings-updated",
          handleSettingUpdated,
        );
      };
    }, []);

    const mediaItems = useMemo(() => {
      const videoItems: Array<{
        type: "video" | "image";
        url: string;
        embedUrl?: string;
        label: string;
        isGif?: boolean;
      }> = [];

      if (post.videos && post.videos.length > 0) {
        post.videos.forEach((vid, i) => {
          if (!vid) return;
          const ytEmbed = getYoutubeEmbedUrl(vid);
          if (ytEmbed) {
            videoItems.push({
              type: "video",
              url: vid,
              embedUrl: ytEmbed,
              label: `Trailer #${i + 1}`,
            });
          } else {
            videoItems.push({
              type: "video",
              url: vid,
              label: `Trailer #${i + 1}`,
            });
          }
        });
      }

      // Animated GIFs (always shown before static images)
      const gifItems: Array<{
        type: "video" | "image";
        url: string;
        embedUrl?: string;
        label: string;
        isGif?: boolean;
      }> = [];

      const allScreenshots = post.screenshots || [];
      const gifScreenshots = allScreenshots.filter(
        (sc) => sc && /\.gif(?:\?.*)?$/i.test(sc),
      );
      const staticScreenshots = allScreenshots.filter(
        (sc) => sc && !/\.gif(?:\?.*)?$/i.test(sc),
      );

      gifScreenshots.forEach((gifUrl, i) => {
        gifItems.push({
          type: "image",
          url: gifUrl,
          label: `Gameplay GIF #${i + 1}`,
          isGif: true,
        });
      });

      // Static Screenshots (using fast 240p thumbnails)
      const screenshotItems: Array<{
        type: "video" | "image";
        url: string;
        embedUrl?: string;
        label: string;
        isGif?: boolean;
      }> = [];

      staticScreenshots.forEach((sc, i) => {
        screenshotItems.push({
          type: "image",
          url: getOptimizedImageUrl(sc),
          label: `Screenshot #${i + 1}`,
        });
      });

      // Arrange order based on user's carousel_video_position setting
      const items: Array<{
        type: "video" | "image";
        url: string;
        embedUrl?: string;
        label: string;
        isGif?: boolean;
      }> =
        videoPosition === "last"
          ? [...gifItems, ...screenshotItems, ...videoItems]
          : [...videoItems, ...gifItems, ...screenshotItems];

      // Fallback to Cover image if no screenshots/videos
      if (items.length === 0 && post.coverUrl) {
        items.push({
          type: "image",
          url: getOptimizedImageUrl(post.coverUrl),
          label: "Cover Art",
        });
      }

      // Fallback image if totally empty
      if (items.length === 0) {
        items.push({
          type: "image",
          url: "https://placehold.co/380x230/12141d/3b82f6?text=FitGirl+Repack",
          label: "FitGirl Repack",
        });
      }

      return items;
    }, [post, videoPosition]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const currentItem = mediaItems[currentIndex] || mediaItems[0];
    const isCurrentGif = Boolean(
      (currentItem as any)?.isGif ||
      (currentItem?.url && /\.gif(?:\?.*)?$/i.test(currentItem.url)),
    );
    const isUnread = !post.isRead;

    return (
      <Box
        className="repack-carousel-container"
        style={{ position: "relative", height }}
        onMouseEnter={() => setIsCarouselHovered(true)}
        onMouseLeave={() => setIsCarouselHovered(false)}
      >
        {/* Mantine Carousel Component */}
        <Carousel
          withIndicators={mediaItems.length > 1}
          withControls={mediaItems.length > 1}
          height={height}
          slideSize="100%"
          onSlideChange={(index) => setCurrentIndex(index)}
          styles={{
            control: {
              backgroundColor: "rgba(10, 10, 20, 0.85)",
              borderColor: "var(--mantine-color-dark-5)",
              color: "#3b82f6",
              transition: "all 150ms ease",
              zIndex: 4,
            },
            indicators: {
              bottom: 8,
              zIndex: 4,
            },
            indicator: {
              width: 6,
              height: 6,
              backgroundColor: "rgba(255, 255, 255, 0.5)",
              transition: "all 200ms ease",
            },
          }}
        >
          {mediaItems.map((item, idx) => (
            <Carousel.Slide key={idx}>
              {item.type === "video" ? (
                <VideoSlide
                  item={item}
                  title={post.title}
                  isHovered={activeHover}
                />
              ) : (
                <Image
                  src={item.url}
                  className="repack-carousel-image"
                  h={height}
                  loading="lazy"
                  decoding="async"
                  fallbackSrc="https://placehold.co/380x230/12141d/3b82f6?text=FitGirl+Repack"
                  alt={post.title}
                />
              )}
            </Carousel.Slide>
          ))}
        </Carousel>

        {/* Subtle Bottom Overlay Gradient */}
        {currentItem?.type === "image" && (
          <Box
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "linear-gradient(to top, var(--mantine-color-dark-9) 0%, rgba(11, 12, 16, 0.25) 50%, rgba(11, 12, 16, 0.4) 100%)",
              zIndex: 2,
            }}
          />
        )}

        {/* Top Left: Counter & Media Type Badge */}
        <Group
          gap={6}
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 3,
          }}
        >
          <Badge
            color={
              currentItem?.type === "video"
                ? "blue"
                : isCurrentGif
                  ? "violet"
                  : "dark"
            }
            variant="filled"
            size="xs"
            leftSection={
              currentItem?.type === "video" ? (
                <Play size={10} fill="currentColor" />
              ) : isCurrentGif ? (
                <Film size={10} />
              ) : (
                <Layers size={10} />
              )
            }
            style={{
              backgroundColor:
                currentItem?.type === "video"
                  ? "rgba(59, 130, 246, 0.9)"
                  : isCurrentGif
                    ? "rgba(139, 92, 246, 0.9)"
                    : "rgba(15, 15, 25, 0.8)",
              backdropFilter: "blur(6px)",
              border: "1px solid var(--mantine-color-dark-4)",
              fontFamily: "monospace",
            }}
          >
            {mediaItems.length > 1
              ? `${currentIndex + 1}/${mediaItems.length}${isCurrentGif ? " (GIF)" : ""}`
              : currentItem?.type === "video"
                ? "TRAILER"
                : isCurrentGif
                  ? "GAMEPLAY GIF"
                  : "IMAGE"}
          </Badge>
        </Group>

        {/* Top Right Action: Expand Lightbox */}
        <Box
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 3,
          }}
        >
          <Tooltip label="Expand Details">
            <ActionIcon
              variant="filled"
              color="dark"
              size="sm"
              radius="xl"
              style={{
                backdropFilter: "blur(4px)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenModal();
              }}
            >
              <Maximize2 size={13} color="#e2e8f0" />
            </ActionIcon>
          </Tooltip>
        </Box>
      </Box>
    );
  },
);

// Helper to extract first magnet or torrent link from post mirror groups
const getMagnetLink = (post: RepackPost): string | null => {
  for (const group of post.mirrorGroups || []) {
    for (const link of group.links || []) {
      if (link.url && link.url.startsWith("magnet:")) {
        return link.url;
      }
    }
  }
  for (const group of post.mirrorGroups || []) {
    for (const link of group.links || []) {
      if (
        link.url &&
        (link.url.includes(".torrent") ||
          link.name.toLowerCase().includes("torrent") ||
          link.name.toLowerCase().includes("magnet"))
      ) {
        return link.url;
      }
    }
  }
  const firstLink = post.mirrorGroups?.[0]?.links?.[0]?.url;
  return firstLink || post.url || null;
};

// Dedicated reactive Quick Status & Favorite Action Group for repack cards
const RepackStatusActionGroup: React.FC<{
  post: RepackPost;
  size?: "xs" | "sm" | "md" | "lg";
}> = React.memo(({ post, size = "sm" }) => {
  const [isWish, setIsWish] = useState(() =>
    isWishlistedInStorage(post.id, post),
  );
  const [isComp, setIsComp] = useState(() =>
    isCompletedRepackInStorage(post.id, post),
  );
  const [isInst, setIsInst] = useState(() =>
    isInstalledRepackInStorage(post.id, post),
  );
  const [isFav, setIsFav] = useState(() =>
    isFavoriteRepackInStorage(post.id, post),
  );

  const syncState = useCallback(() => {
    setIsWish(isWishlistedInStorage(post.id, post));
    setIsComp(isCompletedRepackInStorage(post.id, post));
    setIsInst(isInstalledRepackInStorage(post.id, post));
    setIsFav(isFavoriteRepackInStorage(post.id, post));
  }, [post]);

  useEffect(() => {
    syncState();
    window.addEventListener("fitrepacks-games-updated", syncState);
    return () =>
      window.removeEventListener("fitrepacks-games-updated", syncState);
  }, [syncState]);

  const handleStatusChange = (
    status: "installed" | "wishlist" | "completed" | "none",
  ) => {
    let targetStatus = status;
    if (status === "installed" && isInst) targetStatus = "none";
    else if (status === "wishlist" && isWish) targetStatus = "none";
    else if (status === "completed" && isComp) targetStatus = "none";

    setRepackStatus(post.id, post, targetStatus);
    syncState();
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = toggleFavoriteRepack(post.id, post);
    setIsFav(next);
  };

  const isAssigned = isInst || isWish || isComp;

  return (
    <Group
      gap={6}
      wrap="nowrap"
      align="center"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Favorite Star Button */}
      <Tooltip label={isFav ? "Remove from Favorites" : "Add to Favorites"}>
        <ActionIcon
          variant={isFav ? "filled" : "light"}
          color={isFav ? "yellow" : "gray"}
          size={size === "xs" ? "sm" : size}
          radius="md"
          style={{
            backgroundColor: isFav ? "#fcc419" : undefined,
            color: isFav ? "#000" : undefined,
            boxShadow: isFav ? "0 0 8px rgba(252, 196, 25, 0.4)" : undefined,
            transition: "all 0.15s ease",
          }}
          onClick={handleToggleFavorite}
        >
          <Star size={13} fill={isFav ? "#000" : "none"} strokeWidth={2.2} />
        </ActionIcon>
      </Tooltip>

      {/* Quick Status Dropdown Menu */}
      <Menu
        shadow="md"
        width={180}
        position="bottom-end"
        withinPortal
        radius="md"
      >
        <Menu.Target>
          <Box
            component="div"
            style={{ display: "inline-flex", cursor: "pointer" }}
          >
            {isInst ? (
              <Badge
                color="blue"
                variant="filled"
                size={size === "xs" ? "xs" : "sm"}
                leftSection={<HardDrive size={11} />}
                rightSection={<ChevronDown size={9} style={{ opacity: 0.8 }} />}
                style={{
                  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                  cursor: "pointer",
                  fontWeight: 600,
                  letterSpacing: "0.3px",
                  height: size === "xs" ? 24 : 28,
                  padding: "0 8px",
                }}
              >
                INSTALLED
              </Badge>
            ) : isWish ? (
              <Badge
                color="orange"
                variant="filled"
                size={size === "xs" ? "xs" : "sm"}
                leftSection={<Bookmark size={11} fill="white" />}
                rightSection={<ChevronDown size={9} style={{ opacity: 0.8 }} />}
                style={{
                  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                  cursor: "pointer",
                  fontWeight: 600,
                  letterSpacing: "0.3px",
                  height: size === "xs" ? 24 : 28,
                  padding: "0 8px",
                }}
              >
                WISHLIST
              </Badge>
            ) : isComp ? (
              <Badge
                color="teal"
                variant="filled"
                size={size === "xs" ? "xs" : "sm"}
                leftSection={<CheckCircle2 size={12} />}
                rightSection={<ChevronDown size={9} style={{ opacity: 0.8 }} />}
                style={{
                  boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                  cursor: "pointer",
                  fontWeight: 600,
                  letterSpacing: "0.3px",
                  height: size === "xs" ? 24 : 28,
                  padding: "0 8px",
                }}
              >
                COMPLETED
              </Badge>
            ) : (
              <Tooltip label="Set Status (Installed, Wishlist, Completed)">
                <ActionIcon
                  variant="light"
                  color="gray"
                  size={size === "xs" ? "sm" : size}
                  radius="md"
                >
                  <Bookmark size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Box>
        </Menu.Target>

        <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
          <Menu.Label>Library Status</Menu.Label>
          <Menu.Item
            leftSection={<HardDrive size={14} color="#3b82f6" />}
            rightSection={
              isInst ? <Check size={13} color="#3b82f6" /> : undefined
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
                fill={isWish ? "#f97316" : "none"}
              />
            }
            rightSection={
              isWish ? <Check size={13} color="#f97316" /> : undefined
            }
            onClick={() => handleStatusChange("wishlist")}
          >
            Mark as Wishlist
          </Menu.Item>
          <Menu.Item
            leftSection={<CheckCircle2 size={14} color="#10b981" />}
            rightSection={
              isComp ? <Check size={13} color="#10b981" /> : undefined
            }
            onClick={() => handleStatusChange("completed")}
          >
            Mark as Completed
          </Menu.Item>
          {isAssigned && (
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
    </Group>
  );
});

// Sub-component for Grid View Repack Post Card with hover handling
const RepackGridCard: React.FC<{
  post: RepackPost;
  setSelectedPost: (post: RepackPost) => void;
  handleToggleRead: (id: string, date?: string, e?: React.MouseEvent) => void;
  onOpenTorrentDownload?: (
    magnetUrl: string,
    title?: string,
    coverUrl?: string,
    repackSize?: string,
  ) => void;
}> = React.memo(
  ({ post, setSelectedPost, handleToggleRead, onOpenTorrentDownload }) => {
    const { ref: cardRef, hovered: isCardHovered } = useHover<HTMLDivElement>();
    const [isWishlisted, setIsWishlisted] = useState(() =>
      isWishlistedInStorage(post.id, post),
    );
    const [isCompleted, setIsCompleted] = useState(() =>
      isCompletedRepackInStorage(post.id, post),
    );
    const [isInstalled, setIsInstalled] = useState(() =>
      isInstalledRepackInStorage(post.id, post),
    );
    const [isFavorite, setIsFavorite] = useState(() =>
      isFavoriteRepackInStorage(post.id, post),
    );

    useEffect(() => {
      const sync = () => {
        setIsWishlisted(isWishlistedInStorage(post.id, post));
        setIsCompleted(isCompletedRepackInStorage(post.id, post));
        setIsInstalled(isInstalledRepackInStorage(post.id, post));
        setIsFavorite(isFavoriteRepackInStorage(post.id, post));
      };
      sync();
      window.addEventListener("fitrepacks-games-updated", sync);
      return () => window.removeEventListener("fitrepacks-games-updated", sync);
    }, [post]);

    const computedColorScheme = useComputedColorScheme("light", {
      getInitialValueInEffect: true,
    });
    const isDark = computedColorScheme === "dark";

    const [mounted, setMounted] = React.useState(false);

    const isUnread = !post.isRead;
    const isHyperVisor = post.genres.includes("Hypervisor");
    const magnetUrl = getMagnetLink(post);

    return (
      <Card
        ref={cardRef}
        p="0"
        radius="lg"
        bg="var(--mantine-color-default)"
        className={`repack-card ${isUnread ? "unread-border" : "read-card"}`}
        onClick={() => setSelectedPost(post)}
        style={{
          cursor: "pointer",
          overflow: "hidden",
          contentVisibility: "auto" as any,
          containIntrinsicSize: "800px 230px",
        }}
      >
        <Group wrap="nowrap" align="stretch" gap={0} style={{ maxHeight: 230 }}>
          {/* LEFT SIDE: Cover Image */}
          <Box
            style={{
              position: "relative",
              width: 220,
              minWidth: 200,
              minHeight: 230,
              overflow: "hidden",
              backgroundColor: "var(--mantine-color-body)",
              alignSelf: "stretch",
            }}
          >
            <Image
              src={post.coverUrl}
              alt={post.title}
              h="100%"
              w="100%"
              loading="lazy"
              decoding="async"
              fallbackSrc="https://placehold.co/220x230/12141d/3b82f6?text=Cover"
              style={{ objectFit: "cover" }}
            />
            {/* Subtle Overlay Gradient on cover */}
            <Box
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "linear-gradient(to right, transparent 60%, var(--mantine-color-default) 100%)",
              }}
            />
            {isUnread && (
              <Badge
                color="blue"
                variant="filled"
                size="xs"
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  fontWeight: 700,
                }}
              >
                NEW REPACK
              </Badge>
            )}
            {isHyperVisor && (
              <Badge
                color="red"
                variant="filled"
                size="xs"
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  fontWeight: 700,
                }}
              >
                HYPERVISOR
              </Badge>
            )}
            {isInstalled ? (
              <Badge
                color="blue"
                variant="filled"
                size="xs"
                style={{
                  position: "absolute",
                  top: isHyperVisor ? 32 : 10,
                  right: 10,
                  fontWeight: 700,
                }}
              >
                INSTALLED
              </Badge>
            ) : isCompleted ? (
              <Badge
                color="teal"
                variant="filled"
                size="xs"
                style={{
                  position: "absolute",
                  top: isHyperVisor ? 32 : 10,
                  right: 10,
                  fontWeight: 700,
                }}
              >
                COMPLETED
              </Badge>
            ) : isWishlisted ? (
              <Badge
                color="orange"
                variant="filled"
                size="xs"
                style={{
                  position: "absolute",
                  top: isHyperVisor ? 32 : 10,
                  right: 10,
                  fontWeight: 700,
                }}
              >
                WISHLIST
              </Badge>
            ) : null}
            {isFavorite && (
              <Badge
                color="yellow"
                variant="filled"
                size="xs"
                c="dark.9"
                leftSection={<Star size={10} fill="currentColor" />}
                style={{
                  position: "absolute",
                  top: isHyperVisor
                    ? isInstalled || isCompleted || isWishlisted
                      ? 54
                      : 32
                    : isInstalled || isCompleted || isWishlisted
                      ? 32
                      : 10,
                  right: 10,
                  fontWeight: 700,
                }}
              >
                FAVORITE
              </Badge>
            )}
            <Badge
              size="xs"
              color="dark"
              variant="filled"
              leftSection={<Zap size={10} />}
              style={{
                position: "absolute",
                bottom: 10,
                left: 10,
              }}
            >
              {post.repackSize}
            </Badge>
          </Box>

          {/* CENTER / MIDDLE: Content & Metadata */}
          <Stack
            justify="space-between"
            p="sm"
            style={{ flex: 1, minWidth: 260, maxHeight: 230 }}
          >
            <Stack gap={4}>
              <Group justify="space-between" align="center">
                <Text size="11px" c="dimmed" ff="monospace">
                  {formatDate(post.date)}
                </Text>
                <Group gap={4}>
                  {post.topMonthlyRank && (
                    <Badge color="orange" variant="light" size="xs">
                      🔥 #{post.topMonthlyRank} Month
                    </Badge>
                  )}
                  {post.topYearlyRank && (
                    <Badge color="yellow" variant="light" size="xs">
                      🏆 #{post.topYearlyRank} Year
                    </Badge>
                  )}
                </Group>
              </Group>

              <Text
                size="lg"
                fw={700}
                lineClamp={1}
                style={{
                  fontFamily: "Chakra Petch, sans-serif",
                  lineHeight: 1.25,
                }}
              >
                {cleanGameTitle(post.title)}
              </Text>

              <Group gap="xs" wrap="wrap" mt={-2} mb={1}>
                {extractGameVersion(post.title, post.description) && (
                  <Badge color="teal" variant="light" size="xs">
                    {extractGameVersion(post.title, post.description)}
                  </Badge>
                )}
              </Group>

              {post.companies && (
                <Text size="11px" c="blue.4" truncate fw={600}>
                  {post.companies}
                </Text>
              )}

              {/* Description Preview */}
              {post.description && (
                <Text
                  size="11px"
                  c="dimmed"
                  lineClamp={1}
                  style={{ lineHeight: 1.35 }}
                >
                  {post.description.replace(/<[^>]*>?/gm, "")}
                </Text>
              )}

              {/* Genre Badges */}
              <Group gap={4} wrap="wrap" mt={1}>
                {post.genres.slice(0, 3).map((g, gIdx) => (
                  <Badge
                    key={gIdx}
                    variant={isDark ? "filled" : "light"}
                    color={isDark ? "dark.5" : "gray"}
                    size="xs"
                    radius="xs"
                    c={isDark ? "gray.3" : "dark.4"}
                  >
                    {g}
                  </Badge>
                ))}
                {post.genres.length > 10 && (
                  <Text size="10px" c="dimmed" style={{ fontStyle: "italic" }}>
                    and {post.genres.length - 3} more
                  </Text>
                )}
              </Group>
            </Stack>

            {/* Card Action Bar */}
            <Group
              justify="space-between"
              align="center"
              pt={6}
              mt={4}
              style={{
                borderTop: "1px solid var(--mantine-color-default-border)",
              }}
            >
              <Group gap="xs">
                <Tooltip label="Download Torrent Magnet (In-App)">
                  <Button
                    variant="filled"
                    color="blue"
                    size="xs"
                    leftSection={<Magnet size={13} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenTorrentDownload) {
                        onOpenTorrentDownload(
                          magnetUrl || post.url,
                          post.title,
                          post.coverUrl,
                          post.repackSize,
                        );
                      }
                    }}
                  >
                    Torrent Magnet
                  </Button>
                </Tooltip>
              </Group>

              <Group gap="xs">
                <RepackStatusActionGroup post={post} size="sm" />

                <Tooltip label={post.isRead ? "Mark Unread" : "Mark Read"}>
                  <ActionIcon
                    variant="light"
                    color={post.isRead ? "teal" : "blue"}
                    size="md"
                    radius="md"
                    onClick={(e) => handleToggleRead(post.id, post.date, e)}
                  >
                    {post.isRead ? (
                      <CheckCircle2 size={15} color="#38d9a9" />
                    ) : (
                      <Circle size={15} />
                    )}
                  </ActionIcon>
                </Tooltip>

                <Button
                  variant="light"
                  color="blue"
                  size="xs"
                  rightSection={<Eye size={13} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPost(post);
                  }}
                >
                  View Details
                </Button>
              </Group>
            </Group>
          </Stack>

          {/* RIGHT SIDE: Mantine Carousel displaying Post Screenshots & Videos */}
          <Box
            style={{
              width: 380,
              minWidth: 300,
              maxWidth: 420,
              minHeight: 230,
              position: "relative",
              borderLeft: "1px solid var(--mantine-color-default-border)",
              overflow: "hidden",
              alignSelf: "stretch",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <RepackCardCarousel
              post={post}
              onToggleRead={(e) => handleToggleRead(post.id, post.date, e)}
              onOpenModal={() => setSelectedPost(post)}
              height={230}
              isCardHovered={isCardHovered}
            />
          </Box>
        </Group>
      </Card>
    );
  },
);

interface RepacksPostsViewProps {
  activeGameTitle?: string;
  externalSearchQuery?: string;
  onSearchChange?: (query: string) => void;
  dataSource?: "fitgirl" | "steamrip";
  onOpenTorrentDownload?: (
    magnetUrl: string,
    title?: string,
    coverUrl?: string,
    repackSize?: string,
  ) => void;
}

export const RepacksPostsView: React.FC<RepacksPostsViewProps> = ({
  activeGameTitle,
  externalSearchQuery,
  onSearchChange,
  dataSource = "fitgirl",
  onOpenTorrentDownload,
}) => {
  const [posts, setPosts] = useState<RepackPost[]>([]);
  const [popularFilter, setPopularFilter] = useState<
    "all" | "popular_month" | "popular_year"
  >("all");

  const FITGIRL_CATALOG_GENRES = [
    "18+",
    "2D",
    "2D/3D",
    "3D",
    "3D models on 2D backgrounds",
    "3D on 2D",
    "3rd Person",
    "4X",
    "Action",
    "Action (Shooter)",
    "Action RPG",
    "Active time battle",
    "Adeventure",
    "Adevnture",
    "Adult",
    "Adventure",
    "adventure",
    "Adventure. RPG",
    "Agricultural machinery",
    "Alternative history",
    "American Football",
    "Ancient history",
    "Angling",
    "Arcade",
    "Artificial life",
    "Artillery",
    "ATV",
    "Australian Rules Football",
    "Auto battler",
    "Autobattler",
    "Badminton",
    "Baseball",
    "Basketball",
    "Beat 'em up",
    "Beat 'em up (Brawler)",
    "Beat'em up",
    "Bicycles",
    "Billiards",
    "Blackjack",
    "Board game",
    "Bowling",
    "Boxing",
    "Brawler",
    "Building",
    "Bullet hell",
    "Buses",
    "Card game",
    "Cars",
    "Cats",
    "CCG",
    "Chess",
    "City Builder",
    "Civil aircraft",
    "Civilian aircraft",
    "Civilian ships",
    "Cold War",
    "Combat aircraft",
    "Combat helicopters",
    "Combat ships",
    "Compilation",
    "Contemporary history",
    "Content randomization",
    "Cover-based",
    "Crafting",
    "Creating items",
    "Cricket",
    "Cyberpunk",
    "Cyperpunk",
    "Dance",
    "Dating sim",
    "Deck-building",
    "Detective",
    "Detective fiction",
    "Detective Fiction",
    "Digital pets",
    "Dinosaurs",
    "Drinking Simulator",
    "Driving",
    "Dungeon crawl",
    "Dungeon Crawler",
    "Edutainment",
    "Endless running",
    "etc.",
    "Exploration",
    "Extreme sports",
    "Fantasy",
    "fantasy",
    "Fighting",
    "First person view",
    "First-person",
    "First-Person",
    "First-person/Third-person",
    "Fishing",
    "Fitness game",
    "Fixed camera angles",
    "Football",
    "Formula cars",
    "Future",
    "God sim",
    "Golf",
    "Golf. 3D",
    "Grand strategy",
    "Grand Strategy",
    "GT",
    "Gun game",
    "Hack n'Slash",
    "Hack'n Slash",
    "Hack'n slash",
    "Half-Life 3",
    "Handball",
    "Helicopters",
    "Hidden object",
    "Hockey",
    "Horizontal",
    "Horror",
    "Horses",
    "Hunting",
    "Hypervisor",
    "Incremental game",
    "Indirect control",
    "Interactive fiction",
    "Interactive movie",
    "Isomatric",
    "Isometric",
    "Isometry",
    "Istometric",
    "Item crafting",
    "Item Crafting",
    "Japanese",
    "Jump and run",
    "Karaoke",
    "Karts",
    "Kids",
    "Le Cartel / Devolver Digital",
    "LEGO",
    "Level randomization",
    "Lifestyle",
    "Logic",
    "Logical",
    "Mahjong",
    "Management",
    "Managerial",
    "Mecha",
    "Medieval",
    "Middle Ages",
    "MOBA",
    "Monster trucks",
    "Motorboats",
    "Motorcycles",
    "Multiplayer-only",
    "Music",
    "Mystery",
    "Online-only",
    "Open world",
    "Open World",
    "Open-wheel cars",
    "Paid Demo",
    "Party game",
    "Party-based",
    "Party-Based",
    "Pausable real-time",
    "Pausable Real-time",
    "Permanent death",
    "Physics",
    "Physics-based",
    "Pinball",
    "Pirate/Privateer",
    "Platform adventure",
    "Platform Adventure",
    "Platformer",
    "Point & Click",
    "Point-and-click",
    "Point-and-Click",
    "Post-apocalypse",
    "Post-apocalypstic",
    "Post-apocalyptic",
    "Post-Apocalyptic",
    "Post-apocalyse",
    "Pseudo-3D",
    "Psychological",
    "psychological",
    "Puzzle",
    "Puzzle solving",
    "Puzzle Solving",
    "Puzzle-like",
    "QTE",
    "Quiz",
    "Racing",
    "Rally",
    "Real world",
    "Real-time",
    "Real-Time",
    "Retro",
    "Retro look",
    "Rhythm",
    "Rhythm game",
    "Robots",
    "Rogue-like",
    "Roguelike",
    "Roguelite",
    "Round-based",
    "RPG",
    "RTS",
    "Rugby",
    "Run and gun",
    "Russian Soul Simulator",
    "Sandbox",
    "Science fiction",
    "Shoot 'em up",
    "Shoot 'em Up",
    "Shoot 'em upm Isometric",
    "Shoot'Em-Up",
    "Shooter",
    "Side",
    "Side view",
    "Simulation",
    "Simulator",
    "Simulator (Space)",
    "Simultaneous turns",
    "Size",
    "Slasher",
    "Slow motion",
    "Snooker",
    "Soccer",
    "Space",
    "Space fiction",
    "Space science fiction",
    "Spacecraft",
    "Spaceships",
    "Sport",
    "Sports",
    "Spy fiction",
    "Star Wars",
    "Stealth",
    "Steampunk",
    "Strategy",
    "Submarines",
    "Superheroes",
    "Supernatural fiction",
    "Survival",
    "Tactical",
    "Tactical shooter",
    "Tactics",
    "Talking Simulator",
    "Tanks",
    "Tennis",
    "Text adventure",
    "Third peron",
    "Third person",
    "Third person view",
    "Third-person",
    "Third-Person",
    "Third-person. 3D",
    "Thriller",
    "Tile-matching",
    "Tile-matching (Match-3)",
    "Time flow",
    "Time loop",
    "Time management",
    "Top",
    "Top view",
    "Top View",
    "Top-down",
    "Top-Down",
    "Tower defence",
    "Tower defense",
    "Tower Defense",
    "Tower offense",
    "TPS",
    "Trains",
    "Trucks",
    "Turn-based",
    "Turn-Based",
    "UAV",
    "Vampires",
    "Vehicles",
    "Vehicular Combat",
    "Vehicular combat",
    "Vertical",
    "Virtual world",
    "Visual novel",
    "Visual Novel",
    "VR",
    "Walking Simulator",
    "Wargame",
    "Warhammer 40",
    "Western",
    "Winter sports",
    "Word game",
    "World War I",
    "World War II",
    "Zombie",
    "Zombies",
  ];

  const STEAMRIP_CATALOG_GENRES = [
    "18+",
    "1st person",
    "2D",
    "3D",
    "3rd Person",
    "3rd person",
    "Action",
    "Action Adventure Comedy Sci-Fi",
    "Action Developer: Remedy Entertainment",
    "Action Developer: Ubisoft Montreal",
    "Action game",
    "Action-Adventure",
    "action-adventure",
    "Action-adventure game",
    "ActionA ction",
    "Adult",
    "Adventure",
    "adventure",
    "Adventure Developer: Beenox",
    "Adventure Developer: CAPCOM Co.",
    "Adventure Developer: Quantic Dream",
    "Adventure Developer: Ryu Ga Gotoku Studio",
    "Adventure game",
    "American Football",
    "Animation & Modeling",
    "Anime",
    "Arcade",
    "Beat’em up",
    "Blind Squirrel Games",
    "Building",
    "Cars",
    "Casual",
    "Casual VR",
    "Design & Illustration",
    "Download Manager",
    "driving Developer: Radical Entertainment",
    "Early Access",
    "Early access",
    "Education",
    "Fantasy",
    "Fighting",
    "Fighting game",
    "First-person Shooter",
    "FPS",
    "Free To Play",
    "Free to Play",
    "Game Development",
    "Horror",
    "Indie",
    "Interactive fiction",
    "Jump and run",
    "Ltd.",
    "Massively Multiplayer",
    "Metroidvania",
    "Multiplayer",
    "N/A",
    "Nudity",
    "Online Co-op",
    "Open World",
    "Open world",
    "Photo Editing",
    "Platformer",
    "Puzzle",
    "Racing",
    "RACING",
    "Role-Playing",
    "Role-playing Game",
    "RPG",
    "RPG Developer: Gearbox Software",
    "Sandbox",
    "Sci-fi",
    "Shooter",
    "Shooter Video Game",
    "Shooters",
    "Side",
    "Simulation",
    "SIMULATION",
    "Simulator",
    "Singleplayer",
    "Soccer",
    "Sport",
    "SPORT.",
    "Sports",
    "Sports games",
    "Squid Game",
    "Stealth",
    "Strategy",
    "Survival",
    "Survival Horror",
    "Survival horror",
    "Team-Based",
    "Third-person",
    "third-person shooter",
    "Third-person Shooter",
    "Uncategorized",
    "Utilities",
    "Vehicular combat",
    "Video Production",
    "Virtual Reality",
    "Visual novel",
    "VR",
    "Web Publishing",
  ];

  // Extract or hardcode unique genres for the category filter
  const availableGenres = useMemo(() => {
    if (dataSource === "fitgirl") {
      return FITGIRL_CATALOG_GENRES;
    }
    if (dataSource === "steamrip") {
      return STEAMRIP_CATALOG_GENRES;
    }
    const genreSet = new Set<string>();
    posts.forEach((p) => {
      if (p.genres && Array.isArray(p.genres)) {
        p.genres.forEach((g) => {
          const str = typeof g === "string" ? g.trim() : String(g || "").trim();
          if (str) {
            genreSet.add(str);
          }
        });
      }
    });
    return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  }, [dataSource, posts]);

  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQuery =
    externalSearchQuery !== undefined
      ? externalSearchQuery
      : internalSearchQuery;
  const setSearchQuery = onSearchChange || setInternalSearchQuery;
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 250);

  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">(
    "all",
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    "All",
  ]);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedPost, setSelectedPost] = useState<RepackPost | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const topContainerRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  const scrollToTop = () => {
    if (topContainerRef.current) {
      topContainerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    const mainEl =
      document.querySelector(".mantine-AppShell-main") ||
      document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    scrollToTop();
  }, [currentPage]);

  const isGameRunning = Boolean(activeGameTitle);
  const colorScheme = useComputedColorScheme("dark");
  const isDark = colorScheme === "dark";

  // Fetch only the open page on-demand from PocketBase (or local JSON fallback)
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    loadRepacksPaginated({
      page: currentPage,
      perPage: itemsPerPage,
      searchQuery: debouncedSearchQuery,
      sortBy,
      popularFilter,
      selectedCategories,
      readFilter,
      dataSource,
    })
      .then((res) => {
        if (!isMounted) return;
        setPosts(res.items);
        setTotalItems(res.totalItems);
        setTotalPages(res.totalPages);
      })
      .catch((err) => console.error("Error loading paginated repacks:", err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    currentPage,
    itemsPerPage,
    debouncedSearchQuery,
    sortBy,
    popularFilter,
    selectedCategories,
    readFilter,
    dataSource,
    isGameRunning,
  ]);

  // Reset to page 1 whenever any filter/search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearchQuery,
    readFilter,
    selectedCategories,
    sortBy,
    popularFilter,
    itemsPerPage,
    dataSource,
  ]);

  // Realtime PocketBase event listener to refresh view when new repack/game arrives
  useEffect(() => {
    const handleNewRepackCreated = (event: any) => {
      const eventSource = event?.detail?.source || "fitgirl";
      if (dataSource === eventSource && currentPage === 1) {
        loadRepacksPaginated({
          page: 1,
          perPage: itemsPerPage,
          searchQuery: debouncedSearchQuery,
          sortBy,
          popularFilter,
          selectedCategories,
          readFilter,
          dataSource,
        })
          .then((res) => {
            setPosts(res.items);
            setTotalItems(res.totalItems);
            setTotalPages(res.totalPages);
          })
          .catch(() => {});
      }
    };

    const handleSettingsUpdated = (event: any) => {
      if (event?.detail?.key === "excluded_genres") {
        loadRepacksPaginated({
          page: currentPage,
          perPage: itemsPerPage,
          searchQuery: debouncedSearchQuery,
          sortBy,
          popularFilter,
          selectedCategories,
          readFilter,
          dataSource,
        })
          .then((res) => {
            setPosts(res.items);
            setTotalItems(res.totalItems);
            setTotalPages(res.totalPages);
          })
          .catch(() => {});
      }
    };

    window.addEventListener(
      "fitrepacks-repack-created",
      handleNewRepackCreated,
    );
    window.addEventListener(
      "fitrepacks-settings-updated",
      handleSettingsUpdated,
    );
    return () => {
      window.removeEventListener(
        "fitrepacks-repack-created",
        handleNewRepackCreated,
      );
      window.removeEventListener(
        "fitrepacks-settings-updated",
        handleSettingsUpdated,
      );
    };
  }, [
    currentPage,
    itemsPerPage,
    debouncedSearchQuery,
    sortBy,
    popularFilter,
    selectedCategories,
    readFilter,
    dataSource,
  ]);

  const handleReloadFromDb = async () => {
    setIsLoading(true);
    try {
      const res = await loadRepacksPaginated({
        page: currentPage,
        perPage: itemsPerPage,
        searchQuery: debouncedSearchQuery,
        sortBy,
        popularFilter,
        selectedCategories,
        readFilter,
        dataSource,
      });
      setPosts(res.items);
      setTotalItems(res.totalItems);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error("Failed to load DB data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleRead = (
    id: string,
    date?: string,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    const targetPost = posts.find((p) => p.id === id);
    const postDate = date || targetPost?.date;
    const newIsRead = togglePostReadState(id, postDate);
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, isRead: newIsRead } : p)),
    );
    if (selectedPost && selectedPost.id === id) {
      setSelectedPost((prev) => (prev ? { ...prev, isRead: newIsRead } : null));
    }
    refreshGlobalStats();
  };

  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [globalStats, setGlobalStats] = useState<RepackDatasetStats>({
    totalCount: 0,
    unreadCount: 0,
    readCount: 0,
    topMonthCount: 0,
    topYearCount: 0,
  });

  const refreshGlobalStats = useCallback(() => {
    getRepackDatasetStats(dataSource)
      .then((stats) => {
        setGlobalStats(stats);
      })
      .catch(() => {});
  }, [dataSource]);

  useEffect(() => {
    refreshGlobalStats();
  }, [refreshGlobalStats]);

  const handleMarkAllRead = async () => {
    setIsMarkingAllRead(true);
    try {
      await markAllRepacksAsRead(dataSource);
      setPosts((prev) => prev.map((p) => ({ ...p, isRead: true })));
      refreshGlobalStats();
      const res = await loadRepacksPaginated({
        page: currentPage,
        perPage: itemsPerPage,
        searchQuery: debouncedSearchQuery,
        sortBy,
        popularFilter,
        selectedCategories,
        readFilter,
        dataSource,
      });
      setPosts(res.items);
      setTotalItems(res.totalItems);
      setTotalPages(res.totalPages);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const unreadCount = useMemo(
    () => posts.filter((p) => !p.isRead).length,
    [posts],
  );

  const paginatedPosts = posts;

  // Helper to extract first magnet link from post mirror groups
  const getMagnetLink = (post: RepackPost): string | null => {
    for (const group of post.mirrorGroups || []) {
      for (const link of group.links || []) {
        if (
          link.url &&
          (link.url.startsWith("magnet:") ||
            link.name.toLowerCase().includes("magnet") ||
            link.name.toLowerCase().includes("torrent"))
        ) {
          return link.url;
        }
      }
    }
    return null;
  };

  const isOnline = useOnlineStatus();

  if (!isOnline) {
    return (
      <Paper
        p={60}
        radius="lg"
        bg="var(--mantine-color-default)"
        style={{
          textAlign: "center",
          border: "1px solid var(--mantine-color-default-border)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
          marginTop: 10,
        }}
      >
        <Box
          w={72}
          h={72}
          bg="var(--mantine-color-red-9)"
          style={{
            borderRadius: "50%",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--mantine-color-red-7)",
            boxShadow: "0 0 24px rgba(239, 68, 68, 0.25)",
          }}
        >
          <WifiOff size={36} color="#ffffff" />
        </Box>

        <Title order={2} mt="lg" className="heading-font">
          Offline Mode
        </Title>

        <Text
          size="sm"
          c="dimmed"
          mt="xs"
          style={{ maxWidth: 460, margin: "8px auto 0" }}
        >
          Connect to the internet to browse, search, and download releases from{" "}
          {dataSource === "steamrip" ? "SteamRIP" : "FitGirl"}.
        </Text>

        <Group justify="center" mt="xl" gap="md">
          <Badge
            color="red"
            variant="filled"
            size="lg"
            radius="md"
            leftSection={<Lock size={14} />}
          >
            Offline
          </Badge>
        </Group>
      </Paper>
    );
  }

  return (
    <Stack gap="md" ref={topContainerRef}>
      {/* Search Header Banner */}
      <Paper
        p="md"
        radius="lg"
        bg="var(--mantine-color-default)"
        style={{
          border: "1px solid var(--mantine-color-default-border)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
        }}
        mb="md"
      >
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="xs">
            <Box
              p={8}
              style={{
                borderRadius: 10,
                background:
                  dataSource === "steamrip"
                    ? "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)"
                    : "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {dataSource === "steamrip" ? (
                <Flame size={22} color="white" />
              ) : (
                <Sparkles size={22} color="white" />
              )}
            </Box>
            <div>
              <Title order={3} fw={800} style={{ letterSpacing: "-0.5px" }}>
                {dataSource === "steamrip"
                  ? "SteamRIP Games"
                  : "FitGirl Repacks"}
              </Title>
              <Text size="xs" c="dimmed">
                {dataSource === "steamrip"
                  ? "Direct game downloads and pre-installed updates"
                  : "Verified game repacks with fast search and selective downloads"}
              </Text>
            </div>
          </Group>

          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              color="blue"
              leftSection={<RefreshCw size={14} />}
              onClick={handleReloadFromDb}
              loading={isLoading}
              radius="md"
            >
              Refresh
            </Button>
          </Group>
        </Group>

        {isGameRunning && (
          <Alert
            icon={<AlertCircle size={16} />}
            color="orange"
            radius="md"
            mt="md"
            p="xs"
          >
            <Text size="xs" fw={700}>
              Game Running ({activeGameTitle}): Background sync is paused while
              playing.
            </Text>
          </Alert>
        )}
      </Paper>

      {/* Controls & Filter Toolbar */}
      <Paper
        p="sm"
        radius="lg"
        bg="var(--mantine-color-default)"
        style={{
          border: "1px solid var(--mantine-color-default-border)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.08)",
        }}
      >
        <Stack gap="sm">
          {/* Row 1: Primary Filter & View Controls */}
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap="sm" wrap="wrap" style={{ flex: 1, minWidth: 260 }}>
              {dataSource === "fitgirl" && (
                <SegmentedControl
                  value={popularFilter}
                  onChange={(val: string) =>
                    setPopularFilter(
                      val as "all" | "popular_month" | "popular_year",
                    )
                  }
                  size="xs"
                  radius="md"
                  data={[
                    { label: "All Repacks", value: "all" },
                    {
                      label: `Top Month (${globalStats.topMonthCount})`,
                      value: "popular_month",
                    },
                    {
                      label: `Top Year (${globalStats.topYearCount})`,
                      value: "popular_year",
                    },
                  ]}
                />
              )}

              <MultiSelect
                placeholder="Filter genres..."
                data={availableGenres}
                value={selectedCategories.filter((c) => c !== "All")}
                onChange={(selected) =>
                  setSelectedCategories(
                    selected.length === 0 ? ["All"] : selected,
                  )
                }
                searchable
                clearable
                leftSection={<Filter size={14} color="#00adb5" />}
                radius="md"
                size="xs"
                w={{ base: "100%", sm: 220 }}
                maxDropdownHeight={240}
              />
            </Group>

            {/* Sorting, Grid/List view toggle & Count */}
            <Group gap="xs" wrap="nowrap">
              <Select
                leftSection={<ArrowUpDown size={14} color="#00adb5" />}
                value={sortBy}
                onChange={(val: any) => setSortBy(val)}
                data={[
                  { label: "Newest First", value: "newest" },
                  { label: "Oldest First", value: "oldest" },
                  { label: "Title (A-Z)", value: "title" },
                ]}
                w={145}
                radius="md"
                size="xs"
              />

              <SegmentedControl
                value={viewMode}
                onChange={(val: any) => setViewMode(val)}
                data={[
                  {
                    label: (
                      <Tooltip label="Grid View" withArrow position="top">
                        <Center style={{ width: "100%", height: "100%" }}>
                          <LayoutGrid size={15} />
                        </Center>
                      </Tooltip>
                    ),
                    value: "grid",
                  },
                  {
                    label: (
                      <Tooltip label="List View" withArrow position="top">
                        <Center style={{ width: "100%", height: "100%" }}>
                          <List size={15} />
                        </Center>
                      </Tooltip>
                    ),
                    value: "list",
                  },
                ]}
                color="brandCyan"
                radius="md"
                bg="var(--mantine-color-body)"
                size="xs"
              />

              {isLoading ? (
                <Badge
                  size="sm"
                  color="brandCyan"
                  variant="light"
                  radius="md"
                  leftSection={<Loader size={10} color="brandCyan" />}
                >
                  Loading...
                </Badge>
              ) : (
                <Badge
                  size="sm"
                  variant="subtle"
                  color="gray"
                  radius="md"
                  style={{ textTransform: "none" }}
                >
                  {totalItems.toLocaleString()} items
                </Badge>
              )}
            </Group>
          </Group>

          {/* Row 2: Read Status and Batch Read Action */}
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap="xs" wrap="wrap">
              <SegmentedControl
                value={readFilter}
                onChange={(val: any) => setReadFilter(val)}
                data={[
                  {
                    label: `All (${(globalStats.totalCount || totalItems).toLocaleString()})`,
                    value: "all",
                  },
                  {
                    label: `Unread (${globalStats.unreadCount.toLocaleString()})`,
                    value: "unread",
                  },
                  {
                    label: `Read (${globalStats.readCount.toLocaleString()})`,
                    value: "read",
                  },
                ]}
                color="brandCyan"
                radius="md"
                bg="var(--mantine-color-body)"
                size="xs"
              />

              <Tooltip
                label={
                  globalStats.unreadCount === 0
                    ? "All releases marked as read"
                    : "Mark all releases as read"
                }
                withArrow
              >
                <Button
                  size="xs"
                  variant="light"
                  color="brandCyan"
                  leftSection={<CheckCheck size={14} />}
                  onClick={handleMarkAllRead}
                  loading={isMarkingAllRead}
                  disabled={globalStats.unreadCount === 0 || isMarkingAllRead}
                  radius="md"
                >
                  Mark All Read
                </Button>
              </Tooltip>
            </Group>

            {/* Clear Filters if any active */}
            {(popularFilter !== "all" ||
              readFilter !== "all" ||
              (selectedCategories.length > 0 &&
                (selectedCategories.length > 1 ||
                  selectedCategories[0] !== "All"))) && (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<RotateCcw size={13} />}
                onClick={() => {
                  setPopularFilter("all");
                  setReadFilter("all");
                  setSelectedCategories(["All"]);
                }}
                radius="md"
              >
                Reset Filters
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>

      {/* Main Repack Posts Listing */}
      {isLoading && posts.length === 0 ? (
        /* Initial / Empty Skeletons Loading View */
        <Stack gap="md">
          <Center p="xs">
            <Badge
              size="md"
              color="blue"
              variant="light"
              leftSection={<Loader size={13} color="blue" />}
              radius="xl"
            >
              Loading {dataSource === "steamrip" ? "SteamRIP" : "FitGirl"}{" "}
              repacks...
            </Badge>
          </Center>

          {viewMode === "grid" ? (
            <SimpleGrid cols={1} spacing="md">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card
                  key={i}
                  p="md"
                  radius="md"
                  bg="var(--mantine-color-default)"
                  style={{
                    border: "1px solid var(--mantine-color-default-border)",
                    minHeight: 200,
                  }}
                >
                  <Group align="flex-start" gap="md" wrap="nowrap">
                    <Skeleton
                      height={180}
                      w={{ base: 140, sm: 260 }}
                      radius="md"
                    />
                    <Stack gap="sm" style={{ flex: 1 }}>
                      <Group justify="space-between">
                        <Skeleton height={22} width="45%" radius="sm" />
                        <Skeleton height={22} width={75} radius="xl" />
                      </Group>
                      <Skeleton height={14} width="85%" radius="sm" />
                      <Skeleton height={14} width="65%" radius="sm" />
                      <Group gap="xs" mt="xs">
                        <Skeleton height={18} width={60} radius="xl" />
                        <Skeleton height={18} width={70} radius="xl" />
                        <Skeleton height={18} width={50} radius="xl" />
                      </Group>
                      <Group justify="space-between" mt="auto">
                        <Skeleton height={28} width={110} radius="md" />
                        <Group gap="xs">
                          <Skeleton height={28} width={28} radius="md" />
                          <Skeleton height={28} width={70} radius="md" />
                        </Group>
                      </Group>
                    </Stack>
                  </Group>
                </Card>
              ))}
            </SimpleGrid>
          ) : (
            <Stack gap="xs">
              {Array.from({ length: 7 }).map((_, i) => (
                <Paper
                  key={i}
                  p="sm"
                  radius="md"
                  bg="var(--mantine-color-default)"
                  style={{
                    border: "1px solid var(--mantine-color-default-border)",
                  }}
                >
                  <Group justify="space-between" align="center">
                    <Group gap="md">
                      <Skeleton height={50} width={80} radius="sm" />
                      <Stack gap={6}>
                        <Skeleton height={16} width={200} radius="sm" />
                        <Skeleton height={12} width={130} radius="sm" />
                      </Stack>
                    </Group>
                    <Group gap="xs">
                      <Skeleton height={28} width={28} radius="md" />
                      <Skeleton height={28} width={28} radius="md" />
                      <Skeleton height={28} width={70} radius="md" />
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      ) : paginatedPosts.length > 0 ? (
        <Box
          style={{
            opacity: isLoading ? 0.6 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          {viewMode === "grid" ? (
            /* Full-Row Horizontal Card Grid View Mode */
            <SimpleGrid cols={1} spacing="md">
              {paginatedPosts.map((post, idx) => (
                <RepackGridCard
                  key={`${post.id}-${idx}`}
                  post={post}
                  setSelectedPost={setSelectedPost}
                  handleToggleRead={handleToggleRead}
                  onOpenTorrentDownload={onOpenTorrentDownload}
                />
              ))}
            </SimpleGrid>
          ) : (
            /* Compact List View Mode */
            <Stack gap="xs">
              {paginatedPosts.map((post, idx) => {
                const isUnread = !post.isRead;
                const magnetUrl = getMagnetLink(post);

                return (
                  <Paper
                    key={`${post.id}-${idx}`}
                    p="sm"
                    className="repack-list-row"
                    onClick={() => setSelectedPost(post)}
                    style={{
                      cursor: "pointer",
                      contentVisibility: "auto" as any,
                      containIntrinsicSize: "800px 70px",
                    }}
                  >
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Group
                        gap="md"
                        wrap="nowrap"
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <Image
                          src={post.coverUrl}
                          w={80}
                          h={50}
                          radius="sm"
                          loading="lazy"
                          decoding="async"
                          fallbackSrc="https://placehold.co/120x80/12141d/3b82f6?text=Repack"
                          alt={post.title}
                          style={{ objectFit: "cover" }}
                        />

                        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                          <Group gap="xs" wrap="nowrap">
                            {isUnread && (
                              <Badge color="blue" size="10px" variant="filled">
                                NEW
                              </Badge>
                            )}
                            <Text
                              size="sm"
                              fw={700}
                              truncate
                              style={{ fontFamily: "Chakra Petch, sans-serif" }}
                            >
                              {cleanGameTitle(post.title)}
                            </Text>
                          </Group>

                          <Group gap="xs" wrap="nowrap">
                            {extractGameVersion(
                              post.title,
                              post.description,
                            ) && (
                              <Badge color="teal" variant="light" size="xs">
                                {extractGameVersion(
                                  post.title,
                                  post.description,
                                )}
                              </Badge>
                            )}
                            <Text size="11px" c="blue.4" truncate>
                              {post.companies || "FitGirl"}
                            </Text>
                            <Text size="11px" c="dimmed">
                              • {formatDate(post.date)}
                            </Text>
                            <Badge
                              size="xs"
                              variant={isDark ? "filled" : "light"}
                              color={isDark ? "dark.5" : "gray"}
                              c={isDark ? "gray.3" : "dark.4"}
                            >
                              {post.repackSize}
                            </Badge>
                          </Group>
                        </Stack>
                      </Group>

                      <Group gap="xs" wrap="nowrap">
                        <Tooltip label="Download Torrent">
                          <ActionIcon
                            variant="filled"
                            color="blue"
                            size="md"
                            radius="md"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onOpenTorrentDownload) {
                                onOpenTorrentDownload(
                                  magnetUrl || post.url,
                                  post.title,
                                  post.coverUrl,
                                  post.repackSize,
                                );
                              }
                            }}
                          >
                            <Magnet size={15} />
                          </ActionIcon>
                        </Tooltip>

                        <RepackStatusActionGroup post={post} size="sm" />

                        <Tooltip
                          label={post.isRead ? "Mark Unread" : "Mark Read"}
                        >
                          <ActionIcon
                            variant="filled"
                            color={post.isRead ? "dark.6" : "blue"}
                            size="md"
                            radius="md"
                            onClick={(e) =>
                              handleToggleRead(post.id, post.date, e)
                            }
                          >
                            {post.isRead ? (
                              <CheckCircle2 size={15} color="#38d9a9" />
                            ) : (
                              <Circle size={15} />
                            )}
                          </ActionIcon>
                        </Tooltip>

                        <Button
                          variant="light"
                          color="blue"
                          size="xs"
                          rightSection={<Eye size={13} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPost(post);
                          }}
                        >
                          Details
                        </Button>
                      </Group>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <Group justify="space-between" align="center" mt="md">
              <Group gap="sm" align="center">
                <Text size="sm" c="dimmed">
                  Items per page:
                </Text>
                <Select
                  value={String(itemsPerPage)}
                  onChange={(val) => {
                    setItemsPerPage(Number(val));
                    setCurrentPage(1);
                    scrollToTop();
                  }}
                  data={[
                    { label: "10", value: "10" },
                    { label: "25", value: "25" },
                    { label: "50", value: "50" },
                    { label: "100", value: "100" },
                  ]}
                  w={100}
                  size="sm"
                  radius="md"
                />
                <Text size="sm" c="dimmed">
                  Showing {(currentPage - 1) * itemsPerPage + 1} -{" "}
                  {Math.min(currentPage * itemsPerPage, totalItems)} of{" "}
                  {totalItems}
                </Text>
              </Group>

              <Pagination
                value={currentPage}
                onChange={(p) => {
                  setCurrentPage(p);
                  scrollToTop();
                }}
                total={totalPages}
                color="blue"
                radius="md"
                size="sm"
                withEdges
              />
            </Group>
          )}
        </Box>
      ) : (
        /* Empty Filter Results View */
        <Paper
          p={60}
          radius="lg"
          className="repack-glass-card"
          style={{ textAlign: "center" }}
        >
          <Box
            w={64}
            h={64}
            bg="var(--mantine-color-default)"
            style={{
              borderRadius: "50%",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--mantine-color-default-border)",
            }}
          >
            <DownloadCloud size={32} color="#a78bfa" />
          </Box>

          <Title order={3} mt="md" className="heading-font">
            {posts.length === 0
              ? "No Repack Posts Available"
              : "No Matching Repacks Found"}
          </Title>

          <Text
            size="xs"
            c="dimmed"
            mt={6}
            style={{ maxWidth: 450, margin: "6px auto 0" }}
          >
            {posts.length === 0
              ? 'Click "Reload from DB" to load the latest repack catalog.'
              : "Try adjusting your search query, clearing category filter, or toggling read status."}
          </Text>
        </Paper>
      )}

      {/* Repack Detail View Modal */}
      <RepackDetailModal
        post={selectedPost}
        opened={Boolean(selectedPost)}
        onClose={() => setSelectedPost(null)}
        onToggleRead={(id, date) =>
          handleToggleRead(id, date || selectedPost?.date)
        }
        onOpenTorrentDownload={onOpenTorrentDownload}
      />
    </Stack>
  );
};

// Helper for centered segmented control icons
const CenterIcon: React.FC<{ tooltip: string; children: React.ReactNode }> = ({
  tooltip,
  children,
}) => (
  <Tooltip label={tooltip}>
    <Box
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </Box>
  </Tooltip>
);
