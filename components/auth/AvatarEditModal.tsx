"use client";

import { useState, useEffect } from "react";
import {
  Modal,
  Button,
  Stack,
  Group,
  Text,
  Alert,
  Avatar,
  FileButton,
  SimpleGrid,
  UnstyledButton,
  Paper,
  Box,
  Divider,
  TextInput,
} from "@mantine/core";
import {
  Upload,
  Sparkles,
  Check,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  User,
} from "lucide-react";
import { useAuthStore } from "../../lib/authStore";

interface AvatarEditModalProps {
  opened: boolean;
  onClose: () => void;
}

const PRESET_AVATARS = [
  { name: "Cyber Bot", url: "https://api.dicebear.com/7.x/bottts/svg?seed=CyberBot" },
  { name: "Neon Runner", url: "https://api.dicebear.com/7.x/bottts/svg?seed=NeonRunner" },
  { name: "Pixel Hero", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=PixelHero" },
  { name: "Mecha Knight", url: "https://api.dicebear.com/7.x/bottts/svg?seed=MechaKnight" },
  { name: "Space Ranger", url: "https://api.dicebear.com/7.x/bottts/svg?seed=SpaceRanger" },
  { name: "Arcade Master", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=ArcadeMaster" },
  { name: "Shadow Ninja", url: "https://api.dicebear.com/7.x/bottts/svg?seed=ShadowNinja" },
  { name: "Glitch", url: "https://api.dicebear.com/7.x/bottts/svg?seed=Glitch" },
];

export function AvatarEditModal({ opened, onClose }: AvatarEditModalProps) {
  const { user, updateAvatar, updateProfile, getAvatarUrl, isLoading, error, clearError } =
    useAuthStore();

  const [displayName, setDisplayName] = useState(user?.name || "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedPresetUrl, setSelectedPresetUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    if (opened && user) {
      setDisplayName(user.name || "");
      setSelectedFile(null);
      setPreviewUrl(null);
      setSelectedPresetUrl(null);
      setSuccess(false);
      setCustomError(null);
    }
  }, [opened, user]);

  const handleClose = () => {
    setSelectedFile(null);
    if (previewUrl && !selectedPresetUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedPresetUrl(null);
    setSuccess(false);
    setCustomError(null);
    clearError();
    onClose();
  };

  const handleFileChange = (file: File | null) => {
    if (file) {
      setSelectedFile(file);
      setSelectedPresetUrl(null);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setCustomError(null);
    }
  };

  const handleSelectPreset = async (presetUrl: string) => {
    setSelectedPresetUrl(presetUrl);
    setPreviewUrl(presetUrl);
    setSelectedFile(null);
    setCustomError(null);
  };

  const handleSave = async () => {
    if (!user) return;
    setCustomError(null);

    let hasChanges = false;

    // Update display name if changed
    if (displayName.trim() !== (user.name || "").trim()) {
      const nameOk = await updateProfile({ name: displayName.trim() });
      if (nameOk) hasChanges = true;
    }

    // If a local file is chosen
    if (selectedFile) {
      const ok = await updateAvatar(selectedFile);
      if (ok) hasChanges = true;
    } else if (selectedPresetUrl) {
      // If a preset was selected
      try {
        const response = await fetch(selectedPresetUrl);
        const blob = await response.blob();
        const file = new File([blob], `avatar_${Date.now()}.svg`, { type: "image/svg+xml" });
        const ok = await updateAvatar(file);
        if (ok) hasChanges = true;
      } catch (err: any) {
        setCustomError(err.message || "Failed to apply avatar preset.");
        return;
      }
    }

    if (hasChanges) {
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 600);
    } else {
      handleClose();
    }
  };

  const currentDisplayUrl =
    previewUrl || (user ? getAvatarUrl(user) : "https://api.dicebear.com/7.x/bottts/svg?seed=gamer");

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="xs">
          <Sparkles size={18} color="var(--mantine-color-blue-4)" />
          <Text fw={700} size="md">
            Edit Profile
          </Text>
        </Group>
      }
      centered
      radius="lg"
      size="md"
      overlayProps={{
        backgroundOpacity: 0.6,
        blur: 5,
      }}
    >
      <Stack gap="md">
        {(error || customError) && (
          <Alert
            icon={<AlertCircle size={16} />}
            color="red"
            variant="light"
            radius="md"
          >
            {error || customError}
          </Alert>
        )}

        {success && (
          <Alert
            icon={<CheckCircle2 size={16} />}
            color="teal"
            variant="light"
            radius="md"
          >
            Profile updated successfully!
          </Alert>
        )}

        {/* Display Name Input */}
        <TextInput
          label="Display Name"
          placeholder="e.g. Abdullah"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
          leftSection={<User size={15} color="var(--mantine-color-dimmed)" />}
          radius="md"
        />

        {/* Current / Preview Hero */}
        <Paper
          p="md"
          radius="md"
          bg="var(--mantine-color-default)"
          style={{
            border: "1px solid var(--mantine-color-default-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Group gap="md">
            <Avatar
              src={currentDisplayUrl}
              size={56}
              radius="xl"
              style={{
                border: "2px solid var(--mantine-color-blue-5)",
                boxShadow: "0 0 12px rgba(34, 139, 230, 0.25)",
              }}
            />
            <Stack gap={2}>
              <Text fw={700} size="sm">
                {displayName.trim() || user?.username || "Gamer"}
              </Text>
              <Text size="xs" c="dimmed">
                {previewUrl ? "Previewing new avatar" : "Current Avatar"}
              </Text>
            </Stack>
          </Group>

          <FileButton
            onChange={handleFileChange}
            accept="image/png,image/jpeg,image/webp,image/gif"
          >
            {(props) => (
              <Button
                {...props}
                variant="light"
                color="blue"
                size="xs"
                radius="md"
                leftSection={<Upload size={14} />}
              >
                Upload Image
              </Button>
            )}
          </FileButton>
        </Paper>

        <Divider label="Or Choose a Preset Avatar" labelPosition="center" />

        {/* Preset Avatars Grid without names */}
        <SimpleGrid cols={4} spacing="xs">
          {PRESET_AVATARS.map((preset) => {
            const isSelected = selectedPresetUrl === preset.url;
            return (
              <UnstyledButton
                key={preset.url}
                onClick={() => handleSelectPreset(preset.url)}
                style={{
                  padding: "10px 6px",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: isSelected
                    ? "2px solid var(--mantine-color-blue-5)"
                    : "1px solid var(--mantine-color-default-border)",
                  backgroundColor: isSelected
                    ? "rgba(34, 139, 230, 0.12)"
                    : "var(--mantine-color-default)",
                  transition: "all 0.15s ease",
                  cursor: "pointer",
                }}
              >
                <Box style={{ position: "relative" }}>
                  <Avatar src={preset.url} size={46} radius="xl" />
                  {isSelected && (
                    <Box
                      style={{
                        position: "absolute",
                        bottom: -2,
                        right: -2,
                        backgroundColor: "var(--mantine-color-blue-6)",
                        color: "white",
                        borderRadius: "50%",
                        width: 16,
                        height: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Check size={10} strokeWidth={3} />
                    </Box>
                  )}
                </Box>
              </UnstyledButton>
            );
          })}
        </SimpleGrid>

        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="subtle" color="gray" size="xs" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            color="blue"
            size="xs"
            radius="md"
            loading={isLoading}
            onClick={handleSave}
            leftSection={<Check size={14} />}
          >
            Save Changes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
