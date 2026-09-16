"use client";

import React from "react";
import { Game } from "../lib/types";
import {
  Modal,
  Title,
  Text,
  Button,
  Group,
  Stack,
  Paper,
  Alert,
  Box,
} from "@mantine/core";
import { AlertTriangle, Trash2, Folder, X } from "lucide-react";

interface NoUninstallerModalProps {
  game: Game;
  onClose: () => void;
  onConfirmDeleteFolder: (game: Game) => void;
  onConfirmRemoveLibraryOnly: (game: Game) => void;
}

export const NoUninstallerModal: React.FC<NoUninstallerModalProps> = ({
  game,
  onClose,
  onConfirmDeleteFolder,
  onConfirmRemoveLibraryOnly,
}) => {
  const gameFolder =
    game.workingDir ||
    (game.exePath.includes("\\")
      ? game.exePath.substring(0, game.exePath.lastIndexOf("\\"))
      : game.exePath);

  return (
    <Modal
      opened
      onClose={onClose}
      size="md"
      radius="xl"
      padding="md"
      title={null}
    >
      <Stack gap="md">
        <Group gap="sm">
          <Paper radius="md" p="xs" bg="amber.9">
            <AlertTriangle size={24} color="#ffd43b" />
          </Paper>
          <Box>
            <Title order={4}>
              No Uninstaller Found
            </Title>
            <Text size="xs" c="dimmed">
              Could not find an uninstaller executable in the game folder
            </Text>
          </Box>
        </Group>

        <Alert color="amber" variant="light" icon={<AlertTriangle size={18} />}>
          No uninstaller executable was found for{" "}
          <Text span fw={700}>
            {game.title}
          </Text>
          .
        </Alert>

        <Stack gap="xs">
          <Text size="xs" fw={700} c="dimmed">
            Game Folder
          </Text>
          <Paper p="xs" bg="var(--mantine-color-default)" style={{ border: "1px solid var(--mantine-color-default-border)" }}>
            <Group gap="xs">
              <Folder size={16} color="#4dabf7" />
              <Text
                size="xs"
                c="dimmed"
                style={{ wordBreak: "break-all" }}
              >
                {gameFolder}
              </Text>
            </Group>
          </Paper>
        </Stack>

        <Text size="xs" c="dimmed" style={{ lineHeight: 1.5 }}>
          Would you like to delete the game folder from your drive, or just remove it from your library?
        </Text>

        <Group
          justify="flex-end"
          pt="xs"
          style={{ borderTop: "1px solid var(--mantine-color-default-border)" }}
        >
          <Button
            variant="subtle"
            color="gray"
            onClick={onClose}
            size="xs"
            leftSection={<X size={14} />}
          >
            Cancel
          </Button>
          <Button
            variant="light"
            color="gray"
            onClick={() => onConfirmRemoveLibraryOnly(game)}
            size="xs"
          >
            Remove from Library
          </Button>
          <Button
            color="red"
            onClick={() => onConfirmDeleteFolder(game)}
            size="xs"
            leftSection={<Trash2 size={14} />}
          >
            Delete Game Folder
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
