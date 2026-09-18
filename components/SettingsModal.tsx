"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  Title,
  Text,
  Stack,
  Group,
  TextInput,
  NumberInput,
  Switch,
  Button,
  Paper,
  Divider,
  Badge,
  MultiSelect,
  Select,
  Tabs,
  Progress,
  Alert,
} from "@mantine/core";
import {
  Settings,
  Folder,
  Check,
  HardDrive,
  DownloadCloud,
  Languages,
  Globe,
  Gauge,
  ArrowDown,
  ArrowUp,
  Bell,
  BellRing,
  RefreshCw,
  Filter,
  Film,
  Power,
  Minimize2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useAppUpdater } from "../lib/updater";
import { invoke } from "@tauri-apps/api/core";
import {
  getDefaultDownloadDir,
  saveDefaultDownloadDir,
  getPreferredLanguages,
  savePreferredLanguages,
  getTorrentSettings,
  saveTorrentSettings,
  getNotificationSettings,
  saveNotificationSettings,
  getExcludedGenres,
  saveExcludedGenres,
  getCarouselVideoPosition,
  saveCarouselVideoPosition,
  getAppSetting,
  NotificationSettings,
  getAutostartStatus,
  setAutostartStatus,
  getCloseToTraySetting,
  saveCloseToTraySetting,
} from "../lib/db";
import {
  sendDesktopNotification,
  requestNotificationPermission,
} from "../lib/notification";
import {
  isLinuxPlatform,
  getLinuxCompatibilitySettings,
  saveLinuxCompatibilitySettings,
  discoverLinuxRunners,
  ensureProtonGeInstalled,
  LinuxRunner,
  LinuxCompatibilitySettings,
  DEFAULT_LINUX_SETTINGS,
} from "../lib/linuxRunner";

interface SettingsModalProps {
  opened: boolean;
  onClose: () => void;
}

const AVAILABLE_LANGUAGES = [
  { value: "english", label: "English" },
  { value: "french", label: "French (Français)" },
  { value: "german", label: "German (Deutsch)" },
  { value: "spanish", label: "Spanish (Español)" },
  { value: "russian", label: "Russian (Русский)" },
  { value: "italian", label: "Italian (Italiano)" },
  { value: "portuguese", label: "Portuguese (Português / Brazil)" },
  { value: "japanese", label: "Japanese (日本語)" },
  { value: "chinese", label: "Chinese (Simplified / Traditional)" },
  { value: "arabic", label: "Arabic (العربية)" },
  { value: "korean", label: "Korean (한국어)" },
  { value: "polish", label: "Polish (Polski)" },
];

const ALL_GENRE_OPTIONS = [
  "18+",
  "1st person",
  "2D",
  "2D/3D",
  "3D",
  "3D models on 2D backgrounds",
  "3D on 2D",
  "3rd Person",
  "3rd person",
  "4X",
  "Action",
  "Action (Shooter)",
  "Action Adventure Comedy Sci-Fi",
  "Action Developer: Remedy Entertainment",
  "Action Developer: Ubisoft Montreal",
  "Action game",
  "Action RPG",
  "Action-Adventure",
  "action-adventure",
  "Action-adventure game",
  "ActionA ction",
  "Active time battle",
  "Adeventure",
  "Adevnture",
  "Adult",
  "Adventure",
  "adventure",
  "Adventure Developer: Beenox",
  "Adventure Developer: CAPCOM Co.",
  "Adventure Developer: Quantic Dream",
  "Adventure Developer: Ryu Ga Gotoku Studio",
  "Adventure game",
  "Adventure. RPG",
  "Agricultural machinery",
  "Alternative history",
  "American Football",
  "Ancient history",
  "Angling",
  "Animation & Modeling",
  "Anime",
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
  "Beat’em up",
  "Bicycles",
  "Billiards",
  "Blackjack",
  "Blind Squirrel Games",
  "Board game",
  "Bowling",
  "Boxing",
  "Brawler",
  "Building",
  "Bullet hell",
  "Buses",
  "Card game",
  "Cars",
  "Casual",
  "Casual VR",
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
  "Design & Illustration",
  "Detective",
  "Detective fiction",
  "Detective Fiction",
  "Digital pets",
  "Dinosaurs",
  "Download Manager",
  "Drinking Simulator",
  "Driving",
  "driving Developer: Radical Entertainment",
  "Dungeon crawl",
  "Dungeon Crawler",
  "Early Access",
  "Early access",
  "Education",
  "Edutainment",
  "Endless running",
  "etc.",
  "Exploration",
  "Extreme sports",
  "Fantasy",
  "fantasy",
  "Fighting",
  "Fighting game",
  "First person view",
  "First-person",
  "First-Person",
  "First-person Shooter",
  "First-person/Third-person",
  "Fishing",
  "Fitness game",
  "Fixed camera angles",
  "Football",
  "Formula cars",
  "FPS",
  "Free To Play",
  "Free to Play",
  "Future",
  "Game Development",
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
  "Indie",
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
  "Ltd.",
  "Mahjong",
  "Management",
  "Managerial",
  "Massively Multiplayer",
  "Mecha",
  "Medieval",
  "Metroidvania",
  "Middle Ages",
  "MOBA",
  "Monster trucks",
  "Motorboats",
  "Motorcycles",
  "Multiplayer",
  "Multiplayer-only",
  "Music",
  "Mystery",
  "N/A",
  "Nudity",
  "Online Co-op",
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
  "Photo Editing",
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
  "RACING",
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
  "Role-Playing",
  "Role-playing Game",
  "Round-based",
  "RPG",
  "RPG Developer: Gearbox Software",
  "RTS",
  "Rugby",
  "Run and gun",
  "Russian Soul Simulator",
  "Sandbox",
  "Sci-fi",
  "Science fiction",
  "Shoot 'em up",
  "Shoot 'em Up",
  "Shoot 'em upm Isometric",
  "Shoot'Em-Up",
  "Shooter",
  "Shooter Video Game",
  "Shooters",
  "Side",
  "Side view",
  "Simulation",
  "SIMULATION",
  "Simulator",
  "Simulator (Space)",
  "Simultaneous turns",
  "Singleplayer",
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
  "SPORT.",
  "Sports",
  "Sports games",
  "Spy fiction",
  "Squid Game",
  "Star Wars",
  "Stealth",
  "Steampunk",
  "Strategy",
  "Submarines",
  "Superheroes",
  "Supernatural fiction",
  "Survival",
  "Survival Horror",
  "Survival horror",
  "Tactical",
  "Tactical shooter",
  "Tactics",
  "Talking Simulator",
  "Tanks",
  "Team-Based",
  "Tennis",
  "Text adventure",
  "Third peron",
  "Third person",
  "Third person view",
  "Third-person",
  "Third-Person",
  "third-person shooter",
  "Third-person Shooter",
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
  "Uncategorized",
  "Utilities",
  "Vampires",
  "Vehicles",
  "Vehicular Combat",
  "Vehicular combat",
  "Vertical",
  "Video Production",
  "Virtual Reality",
  "Virtual world",
  "Visual novel",
  "Visual Novel",
  "VR",
  "Walking Simulator",
  "Wargame",
  "Warhammer 40",
  "Web Publishing",
  "Western",
  "Winter sports",
  "Word game",
  "World War I",
  "World War II",
  "Zombie",
  "Zombies",
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  opened,
  onClose,
}) => {
  const [downloadDir, setDownloadDir] = useState<string>(
    "C:\\Games\\Downloads",
  );
  const [preferredLangs, setPreferredLangs] = useState<string[]>(["english"]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [carouselVideoPosition, setCarouselVideoPosition] = useState<
    "first" | "last"
  >("first");
  const [downloadLimit, setDownloadLimit] = useState<number>(0);
  const [uploadLimit, setUploadLimit] = useState<number>(0);
  const [maxActiveTorrents, setMaxActiveTorrents] = useState<number>(3);
  const [seedAfterComplete, setSeedAfterComplete] = useState<boolean>(false);
  const [applyFolderCoverIcon, setApplyFolderCoverIcon] =
    useState<boolean>(true);
  const [isLinux, setIsLinux] = useState<boolean>(false);
  const [linuxSettings, setLinuxSettings] =
    useState<LinuxCompatibilitySettings>(DEFAULT_LINUX_SETTINGS);
  const [availableRunners, setAvailableRunners] = useState<LinuxRunner[]>([]);
  const [isUpdatingProton, setIsUpdatingProton] = useState<boolean>(false);
  const [protonUpdateMsg, setProtonUpdateMsg] = useState<string>("");
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    masterEnabled: true,
    fitgirlNotifications: true,
    steamripNotifications: true,
    libraryGameUpdates: true,
    showUpdateBadge: true,
  });
  const [isTestingNotification, setIsTestingNotification] =
    useState<boolean>(false);
  const [testNotificationSuccess, setTestNotificationSuccess] =
    useState<boolean>(false);
  const [isBrowsing, setIsBrowsing] = useState<boolean>(false);
  const [autostartEnabled, setAutostartEnabled] = useState<boolean>(false);
  const [isAutostartLoading, setIsAutostartLoading] = useState<boolean>(false);
  const [closeToTrayEnabled, setCloseToTrayEnabled] = useState<boolean>(false);
  const [isCloseToTrayLoading, setIsCloseToTrayLoading] =
    useState<boolean>(false);

  const {
    status: updaterStatus,
    currentVersion,
    updateDetails,
    progress: updateProgress,
    error: updaterError,
    checkForUpdates,
    installUpdate,
    restartApp,
  } = useAppUpdater();

  useEffect(() => {
    if (opened) {
      const isLin = isLinuxPlatform();
      setIsLinux(isLin);

      getAutostartStatus()
        .then(setAutostartEnabled)
        .catch(() => {});

      setCloseToTrayEnabled(getCloseToTraySetting());
      getAppSetting("close_to_tray")
        .then((saved) => {
          if (saved !== null && saved !== undefined) {
            setCloseToTrayEnabled(saved === "true" || saved === "1");
          }
        })
        .catch(() => {});

      setDownloadDir(getDefaultDownloadDir());
      setPreferredLangs(getPreferredLanguages());
      setExcludedGenres(getExcludedGenres());
      setCarouselVideoPosition(getCarouselVideoPosition());
      setNotifSettings(getNotificationSettings());
      const torrentSettings = getTorrentSettings();
      setDownloadLimit(torrentSettings.downloadLimitKbps);
      setUploadLimit(torrentSettings.uploadLimitKbps);
      setMaxActiveTorrents(torrentSettings.maxActiveDownloads);
      setSeedAfterComplete(torrentSettings.seedAfterComplete);
      setApplyFolderCoverIcon(torrentSettings.applyFolderCoverIcon);

      getAppSetting("default_download_dir")
        .then((saved) => {
          if (saved && saved.trim()) {
            setDownloadDir(saved);
          }
        })
        .catch(() => {});

      getAppSetting("preferred_languages")
        .then((savedLangs) => {
          if (savedLangs) {
            try {
              const parsed = JSON.parse(savedLangs);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setPreferredLangs(parsed);
              }
            } catch (_) {}
          }
        })
        .catch(() => {});

      getAppSetting("excluded_genres")
        .then((savedGenres) => {
          if (savedGenres) {
            try {
              const parsed = JSON.parse(savedGenres);
              if (Array.isArray(parsed)) {
                setExcludedGenres(parsed);
              }
            } catch (_) {}
          }
        })
        .catch(() => {});

      getAppSetting("carousel_video_position")
        .then((savedPos) => {
          if (savedPos === "first" || savedPos === "last") {
            setCarouselVideoPosition(savedPos);
          }
        })
        .catch(() => {});

      getAppSetting("torrent_settings")
        .then((savedTorrentSettings) => {
          if (savedTorrentSettings) {
            try {
              const parsed = JSON.parse(savedTorrentSettings);
              if (typeof parsed.downloadLimitKbps === "number")
                setDownloadLimit(parsed.downloadLimitKbps);
              if (typeof parsed.uploadLimitKbps === "number")
                setUploadLimit(parsed.uploadLimitKbps);
              if (typeof parsed.maxActiveDownloads === "number")
                setMaxActiveTorrents(parsed.maxActiveDownloads);
              if (typeof parsed.seedAfterComplete === "boolean")
                setSeedAfterComplete(parsed.seedAfterComplete);
              if (typeof parsed.applyFolderCoverIcon === "boolean")
                setApplyFolderCoverIcon(parsed.applyFolderCoverIcon);
            } catch (_) {}
          }
        })
        .catch(() => {});

      if (isLin) {
        getLinuxCompatibilitySettings()
          .then(setLinuxSettings)
          .catch(() => {});

        discoverLinuxRunners()
          .then(setAvailableRunners)
          .catch(() => {});
      }
    }
  }, [opened]);

  const updateLinuxSetting = <K extends keyof LinuxCompatibilitySettings>(
    key: K,
    value: LinuxCompatibilitySettings[K],
  ) => {
    setLinuxSettings((prev) => {
      const updated = { ...prev, [key]: value };
      saveLinuxCompatibilitySettings(updated).catch(console.error);
      return updated;
    });
  };

  const handleCheckUpdateProton = async () => {
    setIsUpdatingProton(true);
    setProtonUpdateMsg("Checking for latest GE-Proton release...");
    try {
      await ensureProtonGeInstalled((msg) => setProtonUpdateMsg(msg));
      const runners = await discoverLinuxRunners();
      setAvailableRunners(runners);
    } catch (err) {
      setProtonUpdateMsg("Failed to check / update GE-Proton.");
    } finally {
      setIsUpdatingProton(false);
    }
  };

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
      console.error("Failed to pick folder:", err);
    } finally {
      setIsBrowsing(false);
    }
  };

  const updateTorrentSetting = <
    K extends keyof import("../lib/db").TorrentSettings,
  >(
    key: K,
    value: import("../lib/db").TorrentSettings[K],
  ) => {
    if (key === "downloadLimitKbps") setDownloadLimit(value as number);
    if (key === "uploadLimitKbps") setUploadLimit(value as number);
    if (key === "maxActiveDownloads") setMaxActiveTorrents(value as number);
    if (key === "seedAfterComplete") setSeedAfterComplete(value as boolean);
    if (key === "applyFolderCoverIcon")
      setApplyFolderCoverIcon(value as boolean);

    const updated = {
      downloadLimitKbps:
        key === "downloadLimitKbps" ? (value as number) : downloadLimit,
      uploadLimitKbps:
        key === "uploadLimitKbps" ? (value as number) : uploadLimit,
      maxActiveDownloads:
        key === "maxActiveDownloads" ? (value as number) : maxActiveTorrents,
      seedAfterComplete:
        key === "seedAfterComplete" ? (value as boolean) : seedAfterComplete,
      applyFolderCoverIcon:
        key === "applyFolderCoverIcon"
          ? (value as boolean)
          : applyFolderCoverIcon,
    };
    saveTorrentSettings(updated);
  };

  const updateNotifSetting = (
    key: keyof NotificationSettings,
    value: boolean,
  ) => {
    const updated = {
      ...notifSettings,
      [key]: value,
    };
    setNotifSettings(updated);
    saveNotificationSettings({ [key]: value });
  };

  const handleTestNotification = async () => {
    setIsTestingNotification(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        await sendDesktopNotification({
          title: "FitRepacks Library",
          body: "Notifications are working properly.",
        });
        setTestNotificationSuccess(true);
        setTimeout(() => setTestNotificationSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Failed to send test notification:", err);
    } finally {
      setIsTestingNotification(false);
    }
  };

  const handleToggleAutostart = async (checked: boolean) => {
    setIsAutostartLoading(true);
    try {
      const res = await setAutostartStatus(checked);
      setAutostartEnabled(res);
    } catch (err) {
      console.error("Failed to update autostart:", err);
    } finally {
      setIsAutostartLoading(false);
    }
  };

  const handleToggleCloseToTray = async (checked: boolean) => {
    setIsCloseToTrayLoading(true);
    setCloseToTrayEnabled(checked);
    try {
      await saveCloseToTraySetting(checked);
    } catch (err) {
      console.error("Failed to update close to tray setting:", err);
    } finally {
      setIsCloseToTrayLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group
          justify="space-between"
          align="center"
          style={{ width: "100%" }}
          pr="md"
        >
          <Group gap="xs">
            <Settings size={18} color="var(--mantine-color-blue-4)" />
            <Text fw={700} size="sm" className="heading-font">
              Settings
            </Text>
          </Group>
          <Badge color="teal" variant="light" size="xs">
            Saved automatically
          </Badge>
        </Group>
      }
      size="lg"
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
        <Tabs
          defaultValue="application"
          color="blue"
          radius="md"
          variant="pills"
        >
          <Tabs.List grow mb="sm">
            <Tabs.Tab
              value="application"
              leftSection={
                <Settings size={15} color="var(--mantine-color-blue-4)" />
              }
            >
              General
            </Tabs.Tab>
            <Tabs.Tab
              value="downloads"
              leftSection={
                <DownloadCloud size={15} color="var(--mantine-color-teal-4)" />
              }
            >
              Downloads
            </Tabs.Tab>
            {isLinux && (
              <Tabs.Tab
                value="linux"
                leftSection={
                  <Gauge size={15} color="var(--mantine-color-cyan-4)" />
                }
              >
                Linux Compatibility
              </Tabs.Tab>
            )}
          </Tabs.List>

          {/* APPLICATION / GENERAL TAB */}
          <Tabs.Panel value="application">
            <Stack gap="md">
              {/* Application Updates */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Sparkles size={16} color="var(--mantine-color-blue-4)" />
                      <Text size="sm" fw={700}>
                        Application Updates
                      </Text>
                    </Group>
                    <Badge color="blue" size="xs" variant="light">
                      v{currentVersion || updateDetails?.currentVersion}
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    Check for new versions, bug fixes, and feature updates
                    directly from GitHub Releases.
                  </Text>

                  {updaterStatus === "error" && updaterError && (
                    <Alert
                      icon={<AlertCircle size={15} />}
                      title="Update Check Error"
                      color="red"
                      variant="light"
                      radius="md"
                      p="xs"
                    >
                      <Text size="xs">{updaterError}</Text>
                    </Alert>
                  )}

                  {updaterStatus === "up-to-date" && (
                    <Paper
                      p="xs"
                      radius="md"
                      bg="var(--mantine-color-body)"
                      withBorder
                    >
                      <Group gap="xs">
                        <CheckCircle2
                          size={16}
                          color="var(--mantine-color-teal-5)"
                        />
                        <Text size="xs" fw={600} c="teal">
                          FitRepacks Library is up to date!
                        </Text>
                      </Group>
                    </Paper>
                  )}

                  {updaterStatus === "available" && updateDetails && (
                    <Paper
                      p="sm"
                      radius="md"
                      bg="var(--mantine-color-body)"
                      style={{
                        border: "1px solid var(--mantine-color-blue-6)",
                      }}
                    >
                      <Stack gap="xs">
                        <Group justify="space-between" align="center">
                          <Group gap="xs">
                            <Badge color="blue" size="sm" variant="filled">
                              Update Available: v{updateDetails.version}
                            </Badge>
                            {updateDetails.date && (
                              <Text size="xs" c="dimmed">
                                {new Date(
                                  updateDetails.date,
                                ).toLocaleDateString()}
                              </Text>
                            )}
                          </Group>
                          <Button
                            size="xs"
                            color="blue"
                            radius="md"
                            leftSection={<DownloadCloud size={14} />}
                            onClick={installUpdate}
                          >
                            Download & Install
                          </Button>
                        </Group>

                        {updateDetails.body && (
                          <Paper
                            p="xs"
                            radius="sm"
                            bg="var(--mantine-color-default)"
                            style={{ maxHeight: 120, overflowY: "auto" }}
                          >
                            <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>
                              {updateDetails.body}
                            </Text>
                          </Paper>
                        )}
                      </Stack>
                    </Paper>
                  )}

                  {updaterStatus === "downloading" && (
                    <Paper
                      p="sm"
                      radius="md"
                      bg="var(--mantine-color-body)"
                      withBorder
                    >
                      <Stack gap="xs">
                        <Group justify="space-between" align="center">
                          <Text size="xs" fw={600}>
                            Downloading Update ({updateProgress.percent}%)...
                          </Text>
                          <Text size="xs" c="dimmed">
                            {(
                              updateProgress.downloadedBytes /
                              (1024 * 1024)
                            ).toFixed(1)}{" "}
                            MB
                            {updateProgress.totalBytes > 0 &&
                              ` / ${(updateProgress.totalBytes / (1024 * 1024)).toFixed(1)} MB`}
                          </Text>
                        </Group>
                        <Progress
                          value={updateProgress.percent}
                          animated
                          color="blue"
                          size="sm"
                          radius="xl"
                        />
                      </Stack>
                    </Paper>
                  )}

                  {updaterStatus === "ready-to-restart" && (
                    <Paper
                      p="sm"
                      radius="md"
                      bg="var(--mantine-color-body)"
                      style={{
                        border: "1px solid var(--mantine-color-teal-6)",
                      }}
                    >
                      <Group justify="space-between" align="center">
                        <Group gap="xs">
                          <CheckCircle2
                            size={18}
                            color="var(--mantine-color-teal-5)"
                          />
                          <Stack gap={2}>
                            <Text size="xs" fw={700} c="teal">
                              Update Downloaded!
                            </Text>
                            <Text size="xs" c="dimmed">
                              Restart the application to finish applying the
                              update.
                            </Text>
                          </Stack>
                        </Group>
                        <Button
                          size="xs"
                          color="teal"
                          radius="md"
                          leftSection={<RefreshCw size={14} />}
                          onClick={restartApp}
                        >
                          Restart Now
                        </Button>
                      </Group>
                    </Paper>
                  )}

                  {updaterStatus !== "downloading" &&
                    updaterStatus !== "ready-to-restart" && (
                      <Group justify="flex-end">
                        <Button
                          variant="light"
                          color="blue"
                          size="xs"
                          radius="md"
                          loading={updaterStatus === "checking"}
                          leftSection={<RefreshCw size={14} />}
                          onClick={() => checkForUpdates()}
                        >
                          Check for Updates
                        </Button>
                      </Group>
                    )}
                </Stack>
              </Paper>

              {/* System Startup / Autostart */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Power size={16} color="var(--mantine-color-teal-4)" />
                      <Text size="sm" fw={700}>
                        System Startup
                      </Text>
                    </Group>
                    <Badge color="teal" size="xs" variant="light">
                      Windows
                    </Badge>
                  </Group>

                  <Switch
                    label="Auto-run on system startup"
                    description="Automatically launch FitRepacks Library when your computer boots up"
                    checked={autostartEnabled}
                    disabled={isAutostartLoading}
                    onChange={(e) =>
                      handleToggleAutostart(e.currentTarget.checked)
                    }
                    color="teal"
                    size="sm"
                  />
                </Stack>
              </Paper>

              {/* System Tray & Close Behavior */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Minimize2
                        size={16}
                        color="var(--mantine-color-blue-4)"
                      />
                      <Text size="sm" fw={700}>
                        System Tray & Close Action
                      </Text>
                    </Group>
                    <Badge color="blue" size="xs" variant="light">
                      System Tray
                    </Badge>
                  </Group>

                  <Switch
                    label="Close to system tray"
                    description="When closing the app window, keep FitRepacks Library running minimized in the system tray"
                    checked={closeToTrayEnabled}
                    disabled={isCloseToTrayLoading}
                    onChange={(e) =>
                      handleToggleCloseToTray(e.currentTarget.checked)
                    }
                    color="blue"
                    size="sm"
                  />
                </Stack>
              </Paper>

              {/* Notifications */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <BellRing
                        size={16}
                        color="var(--mantine-color-violet-4)"
                      />
                      <Text size="sm" fw={700}>
                        Notifications
                      </Text>
                    </Group>
                    <Badge color="violet" size="xs" variant="light">
                      Alerts
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    Get notified when new repacks drop or games in your library
                    receive updates.
                  </Text>

                  <Group justify="space-between" align="center">
                    <Switch
                      label="Desktop Notifications"
                      description="Show system notifications for game updates and releases"
                      checked={notifSettings.masterEnabled}
                      onChange={(e) =>
                        updateNotifSetting(
                          "masterEnabled",
                          e.currentTarget.checked,
                        )
                      }
                      color="violet"
                      size="sm"
                    />

                    <Button
                      variant="light"
                      color={testNotificationSuccess ? "teal" : "violet"}
                      size="xs"
                      radius="md"
                      loading={isTestingNotification}
                      leftSection={
                        testNotificationSuccess ? (
                          <Check size={14} />
                        ) : (
                          <Bell size={14} />
                        )
                      }
                      onClick={handleTestNotification}
                    >
                      {testNotificationSuccess ? "Sent!" : "Test Notification"}
                    </Button>
                  </Group>

                  {notifSettings.masterEnabled && (
                    <Paper
                      p="sm"
                      radius="md"
                      bg="var(--mantine-color-body)"
                      style={{
                        border: "1px solid var(--mantine-color-default-border)",
                        marginTop: "6px",
                      }}
                    >
                      <Stack gap="md">
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                          Notify me about
                        </Text>

                        {/* 1. FitGirl Posts & Updates */}
                        <Switch
                          label="FitGirl Repacks"
                          description="New repacks and patch updates"
                          checked={notifSettings.fitgirlNotifications}
                          onChange={(e) =>
                            updateNotifSetting(
                              "fitgirlNotifications",
                              e.currentTarget.checked,
                            )
                          }
                          color="pink"
                          size="sm"
                        />

                        <Divider my={2} />

                        {/* 2. SteamRIP Posts & Updates */}
                        <Switch
                          label="SteamRIP Games"
                          description="New direct-play releases and updates"
                          checked={notifSettings.steamripNotifications}
                          onChange={(e) =>
                            updateNotifSetting(
                              "steamripNotifications",
                              e.currentTarget.checked,
                            )
                          }
                          color="cyan"
                          size="sm"
                        />

                        <Divider my={2} />

                        {/* 3. My Library Game Updates */}
                        <Switch
                          label="Library Updates"
                          description="When a game you have installed receives a newer version"
                          checked={notifSettings.libraryGameUpdates}
                          onChange={(e) =>
                            updateNotifSetting(
                              "libraryGameUpdates",
                              e.currentTarget.checked,
                            )
                          }
                          color="teal"
                          size="sm"
                        />

                        <Divider my={2} />

                        {/* 4. Show Update Badge on Game Cards */}
                        <Switch
                          label="Update Badges on Cards"
                          description="Show an UPDATE badge on games with available patches"
                          checked={notifSettings.showUpdateBadge}
                          onChange={(e) =>
                            updateNotifSetting(
                              "showUpdateBadge",
                              e.currentTarget.checked,
                            )
                          }
                          color="yellow"
                          size="sm"
                        />
                      </Stack>
                    </Paper>
                  )}
                </Stack>
              </Paper>

              {/* Windows Explorer Custom Folder Icon */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Folder size={16} color="var(--mantine-color-blue-4)" />
                      <Text size="sm" fw={700}>
                        Folder Artwork
                      </Text>
                    </Group>
                    <Badge color="blue" size="xs" variant="light">
                      Explorer
                    </Badge>
                  </Group>

                  <Switch
                    label="Use game cover as folder icon"
                    description="Automatically sets folder.ico so Windows Explorer displays the cover image"
                    checked={applyFolderCoverIcon}
                    onChange={(e) => {
                      updateTorrentSetting(
                        "applyFolderCoverIcon",
                        e.currentTarget.checked,
                      );
                    }}
                    color="blue"
                    size="sm"
                  />
                </Stack>
              </Paper>

              {/* Feed Genre Blacklist (Hidden Genres) */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Filter size={16} color="var(--mantine-color-red-4)" />
                      <Text size="sm" fw={700}>
                        Hidden Genres
                      </Text>
                    </Group>
                    <Badge color="red" size="xs" variant="light">
                      Filter
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    Hide games from specific genres in your FitGirl and SteamRIP
                    feeds.
                  </Text>

                  <MultiSelect
                    data={ALL_GENRE_OPTIONS}
                    value={excludedGenres}
                    onChange={(genres) => {
                      setExcludedGenres(genres);
                      saveExcludedGenres(genres);
                    }}
                    placeholder="Choose genres to hide (e.g. Adult, Anime)..."
                    searchable
                    clearable
                    size="sm"
                    radius="md"
                    leftSection={
                      <Filter size={14} color="var(--mantine-color-red-4)" />
                    }
                  />
                </Stack>
              </Paper>

              {/* Card Carousel Media Ordering */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Film size={16} color="var(--mantine-color-blue-4)" />
                      <Text size="sm" fw={700}>
                        Game Preview Order
                      </Text>
                    </Group>
                    <Badge color="blue" size="xs" variant="light">
                      Media
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    Choose what appears first when previewing a game.
                  </Text>

                  <Select
                    data={[
                      {
                        value: "first",
                        label:
                          "Trailers First (Play video trailers first, then screenshots)",
                      },
                      {
                        value: "last",
                        label:
                          "Screenshots First (Show screenshots first, video trailers last)",
                      },
                    ]}
                    value={carouselVideoPosition}
                    onChange={(val) => {
                      if (val === "first" || val === "last") {
                        setCarouselVideoPosition(val);
                        saveCarouselVideoPosition(val);
                      }
                    }}
                    size="sm"
                    radius="md"
                    leftSection={
                      <Film size={14} color="var(--mantine-color-blue-4)" />
                    }
                  />
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>

          {/* DOWNLOADS TAB */}
          <Tabs.Panel value="downloads">
            <Stack gap="md">
              {/* Default Download Directory */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <DownloadCloud
                        size={16}
                        color="var(--mantine-color-blue-4)"
                      />
                      <Text size="sm" fw={700}>
                        Download Location
                      </Text>
                    </Group>
                    <Badge color="blue" size="xs" variant="light">
                      Storage
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    Where downloaded games and torrent files are saved.
                  </Text>

                  <Group gap="xs">
                    <TextInput
                      value={downloadDir}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDownloadDir(val);
                        saveDefaultDownloadDir(val);
                      }}
                      placeholder="e.g. C:\Games\Downloads"
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
                </Stack>
              </Paper>

              {/* Preferred Download Languages */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Globe size={16} color="var(--mantine-color-teal-4)" />
                      <Text size="sm" fw={700}>
                        Language Packs
                      </Text>
                    </Group>
                    <Badge color="teal" size="xs" variant="light">
                      Auto-Select
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    Automatically select these voiceover and audio packs when
                    adding a game.
                  </Text>

                  <MultiSelect
                    data={AVAILABLE_LANGUAGES}
                    value={preferredLangs}
                    onChange={(langs) => {
                      setPreferredLangs(langs);
                      savePreferredLanguages(
                        langs.length > 0 ? langs : ["english"],
                      );
                    }}
                    placeholder="Choose languages..."
                    searchable
                    clearable
                    size="sm"
                    radius="md"
                    leftSection={
                      <Languages
                        size={16}
                        color="var(--mantine-color-teal-4)"
                      />
                    }
                  />
                </Stack>
              </Paper>

              {/* Speed & Queue Limits */}
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Gauge size={16} color="var(--mantine-color-orange-4)" />
                      <Text size="sm" fw={700}>
                        Speed & Queue Limits
                      </Text>
                    </Group>
                    <Badge color="orange" size="xs" variant="light">
                      Network
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    Set transfer limits and manage concurrent downloads.
                  </Text>

                  <Group grow align="flex-start">
                    <NumberInput
                      label="Max Download Speed (KB/s)"
                      description="0 for unlimited"
                      placeholder="0 (Unlimited)"
                      min={0}
                      max={1000000}
                      step={500}
                      value={downloadLimit}
                      onChange={(val) => {
                        const num = typeof val === "number" ? val : 0;
                        updateTorrentSetting("downloadLimitKbps", num);
                      }}
                      size="sm"
                      radius="md"
                      leftSection={
                        <ArrowDown
                          size={14}
                          color="var(--mantine-color-teal-4)"
                        />
                      }
                    />

                    <NumberInput
                      label="Max Upload Speed (KB/s)"
                      description="0 for unlimited"
                      placeholder="0 (Unlimited)"
                      min={0}
                      max={1000000}
                      step={250}
                      value={uploadLimit}
                      onChange={(val) => {
                        const num = typeof val === "number" ? val : 0;
                        updateTorrentSetting("uploadLimitKbps", num);
                      }}
                      size="sm"
                      radius="md"
                      leftSection={
                        <ArrowUp
                          size={14}
                          color="var(--mantine-color-blue-4)"
                        />
                      }
                    />
                  </Group>

                  <Group grow align="flex-start" mt="xs">
                    <NumberInput
                      label="Simultaneous Downloads"
                      description="Max active downloads at once"
                      placeholder="3"
                      min={1}
                      max={20}
                      value={maxActiveTorrents}
                      onChange={(val) => {
                        const num = typeof val === "number" ? val : 3;
                        updateTorrentSetting("maxActiveDownloads", num);
                      }}
                      size="sm"
                      radius="md"
                      leftSection={
                        <HardDrive
                          size={14}
                          color="var(--mantine-color-orange-4)"
                        />
                      }
                    />

                    <Stack gap={6} justify="center" mt="xs">
                      <Text size="xs" fw={500}>
                        Seeding
                      </Text>
                      <Switch
                        label="Seed after download finishes"
                        description="Keep uploading to peers once download reaches 100%"
                        checked={seedAfterComplete}
                        onChange={(e) => {
                          updateTorrentSetting(
                            "seedAfterComplete",
                            e.currentTarget.checked,
                          );
                        }}
                        color="teal"
                        size="sm"
                      />
                    </Stack>
                  </Group>
                </Stack>
              </Paper>
            </Stack>
          </Tabs.Panel>

          {/* LINUX COMPATIBILITY TAB (Shown ONLY on Linux) */}
          {isLinux && (
            <Tabs.Panel value="linux">
              <Paper
                p="md"
                radius="md"
                bg="var(--mantine-color-default)"
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Gauge size={16} color="var(--mantine-color-cyan-4)" />
                      <Text size="sm" fw={700}>
                        Linux Compatibility
                      </Text>
                    </Group>
                    <Badge color="cyan" size="xs" variant="light">
                      Runner
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    Run Windows games on Linux using Proton GE or Wine.
                  </Text>

                  <Group justify="space-between" align="center">
                    <Select
                      label="Runner"
                      description="Proton or Wine runtime used to launch games"
                      data={
                        availableRunners.length > 0
                          ? availableRunners.map((r) => ({
                              value: r.id,
                              label: `${r.name} (${r.version})`,
                            }))
                          : [
                              {
                                value: "managed-ge-proton",
                                label:
                                  "GloriousEggroll GE-Proton (Auto-Managed)",
                              },
                            ]
                      }
                      value={linuxSettings.preferredRunnerId}
                      onChange={(val) => {
                        if (val) updateLinuxSetting("preferredRunnerId", val);
                      }}
                      style={{ flex: 1 }}
                      size="xs"
                    />

                    <Button
                      variant="light"
                      color="cyan"
                      size="xs"
                      radius="md"
                      loading={isUpdatingProton}
                      leftSection={<RefreshCw size={14} />}
                      onClick={handleCheckUpdateProton}
                      mt="md"
                    >
                      Check for Updates
                    </Button>
                  </Group>

                  {protonUpdateMsg && (
                    <Text size="xs" c="cyan.4" fw={500}>
                      {protonUpdateMsg}
                    </Text>
                  )}

                  <Divider my={2} />

                  <Switch
                    label="Automatic GE-Proton Updates"
                    description="Keep GE-Proton updated to the latest release"
                    checked={linuxSettings.autoUpdateProtonGe}
                    onChange={(e) =>
                      updateLinuxSetting(
                        "autoUpdateProtonGe",
                        e.currentTarget.checked,
                      )
                    }
                    color="cyan"
                    size="sm"
                  />

                  <Switch
                    label="GameMode"
                    description="Temporary system optimizations while gaming"
                    checked={linuxSettings.enableGameMode}
                    onChange={(e) =>
                      updateLinuxSetting(
                        "enableGameMode",
                        e.currentTarget.checked,
                      )
                    }
                    color="cyan"
                    size="sm"
                  />

                  <Switch
                    label="DXVK & Async Pipeline"
                    description="Vulkan graphics translation for DirectX games"
                    checked={linuxSettings.enableDxvkAsync}
                    onChange={(e) =>
                      updateLinuxSetting(
                        "enableDxvkAsync",
                        e.currentTarget.checked,
                      )
                    }
                    color="cyan"
                    size="sm"
                  />

                  <Switch
                    label="Esync & Fsync"
                    description="Reduced CPU overhead for multi-threaded games"
                    checked={linuxSettings.enableEsyncFsync}
                    onChange={(e) =>
                      updateLinuxSetting(
                        "enableEsyncFsync",
                        e.currentTarget.checked,
                      )
                    }
                    color="cyan"
                    size="sm"
                  />

                  <Switch
                    label="MangoHud Overlay"
                    description="In-game FPS and hardware monitoring"
                    checked={linuxSettings.enableMangoHud}
                    onChange={(e) =>
                      updateLinuxSetting(
                        "enableMangoHud",
                        e.currentTarget.checked,
                      )
                    }
                    color="cyan"
                    size="sm"
                  />
                </Stack>
              </Paper>
            </Tabs.Panel>
          )}
        </Tabs>

        <Divider my="xs" />

        <Group justify="flex-end">
          <Button
            variant="light"
            color="blue"
            size="sm"
            radius="md"
            onClick={onClose}
          >
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
