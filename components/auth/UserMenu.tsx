"use client";

import { useState, useEffect } from "react";
import {
  Menu,
  UnstyledButton,
  Group,
  Avatar,
  Text,
  Badge,
  Stack,
  Button,
  Divider,
  Box,
  Tooltip,
} from "@mantine/core";
import {
  User,
  LogOut,
  Image as ImageIcon,
  ChevronDown,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "../../lib/authStore";
import { AuthModal } from "./AuthModal";
import { AvatarEditModal } from "./AvatarEditModal";

export function UserMenu() {
  const { user, isAuthenticated, logout, getAvatarUrl, initialize } =
    useAuthStore();

  const [mounted, setMounted] = useState(false);
  const [authModalOpened, setAuthModalOpened] = useState(false);
  const [avatarModalOpened, setAvatarModalOpened] = useState(false);

  useEffect(() => {
    setMounted(true);
    initialize();
  }, [initialize]);

  if (!mounted) {
    return null;
  }

  const avatarUrl = getAvatarUrl(user);

  if (!isAuthenticated || !user) {
    return (
      <>
        <Button
          variant="light"
          color="blue"
          size="xs"
          radius="md"
          leftSection={<User size={14} />}
          onClick={() => setAuthModalOpened(true)}
        >
          Sign In
        </Button>

        <AuthModal
          opened={authModalOpened}
          onClose={() => setAuthModalOpened(false)}
        />
      </>
    );
  }

  const displayName = user.name || user.username || "Gamer";
  const userHandle =
    user.username ||
    (user.email ? user.email.split("@")[0] : "") ||
    (user.name ? user.name.toLowerCase().replace(/\s+/g, "") : "gamer");

  return (
    <>
      <Menu
        shadow="md"
        width={240}
        position="bottom-end"
        radius="md"
        transitionProps={{ transition: "pop-top-right", duration: 150 }}
      >
        <Menu.Target>
          <UnstyledButton
            style={{
              padding: "4px 8px",
              borderRadius: 20,
              backgroundColor: "var(--mantine-color-default)",
              border: "1px solid var(--mantine-color-default-border)",
              transition: "all 0.15s ease",
            }}
          >
            <Group gap={6} align="center">
              <Box style={{ position: "relative" }}>
                <Avatar
                  src={avatarUrl}
                  alt={displayName}
                  size={26}
                  radius="xl"
                  style={{
                    border: "1.5px solid var(--mantine-color-blue-5)",
                  }}
                />
                <Box
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    backgroundColor: "var(--mantine-color-teal-5)",
                    border: "1.5px solid var(--mantine-color-body)",
                  }}
                />
              </Box>

              <Text size="xs" fw={600} maw={110} truncate>
                {displayName}
              </Text>

              <ChevronDown size={13} color="#909296" />
            </Group>
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          {/* User Profile Summary Header */}
          <Box p="xs">
            <Group gap="sm" align="center">
              <Avatar
                src={avatarUrl}
                alt={displayName}
                size={40}
                radius="xl"
                style={{
                  border: "2px solid var(--mantine-color-blue-5)",
                }}
              />
              <Stack gap={1} style={{ overflow: "hidden" }}>
                <Text fw={700} size="sm" truncate>
                  {displayName}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  @{userHandle}
                </Text>
              </Stack>
            </Group>
            <Group mt="xs" gap={4}>
              <Badge size="xs" variant="dot" color="teal">
                Online
              </Badge>
              <Badge size="xs" variant="light" color="blue">
                Member
              </Badge>
            </Group>
          </Box>

          <Menu.Divider />

          <Menu.Item
            leftSection={<User size={15} color="var(--mantine-color-blue-4)" />}
            onClick={() => setAvatarModalOpened(true)}
          >
            Edit Profile
          </Menu.Item>

          <Menu.Divider />

          <Menu.Item
            color="red"
            leftSection={<LogOut size={15} />}
            onClick={() => logout()}
          >
            Sign Out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <AvatarEditModal
        opened={avatarModalOpened}
        onClose={() => setAvatarModalOpened(false)}
      />
      <AuthModal
        opened={authModalOpened}
        onClose={() => setAuthModalOpened(false)}
      />
    </>
  );
}
