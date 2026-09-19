"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Modal,
  Box,
  Image,
  Group,
  ActionIcon,
  Text,
  Badge,
  Paper,
  Tooltip,
} from "@mantine/core";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Maximize2,
} from "lucide-react";
import { getRiotpixelsFullResUrl } from "../../lib/gameLinker";

interface ImageLightboxModalProps {
  opened: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
  title?: string;
}

export function ImageLightboxModal({
  opened,
  onClose,
  images = [],
  initialIndex = 0,
  title,
}: ImageLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);

  useEffect(() => {
    if (opened) {
      setCurrentIndex(
        Math.max(0, Math.min(initialIndex, Math.max(0, images.length - 1))),
      );
    }
  }, [opened, initialIndex, images.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!opened) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [opened, handlePrev, handleNext, onClose]);

  if (!images.length) return null;

  const currentRawUrl = images[currentIndex] || "";
  const currentFullUrl = getRiotpixelsFullResUrl(currentRawUrl);
  const isGif = /\.gif(?:\?.*)?$/i.test(currentRawUrl);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      padding={0}
      withCloseButton={false}
      styles={{
        content: {
          backgroundColor: "rgba(10, 12, 16, 0.94)",
          backdropFilter: "blur(16px)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "16px 20px",
          userSelect: "none",
        },
        body: {
          padding: 0,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        },
      }}
    >
      {/* Header Bar */}
      <Group justify="space-between" align="center" style={{ zIndex: 10 }}>
        <Group gap="xs">
          {title && (
            <Text size="sm" fw={700} c="white" truncate style={{ maxWidth: 400 }}>
              {title}
            </Text>
          )}
          <Badge color="dark" variant="filled" size="sm" ff="monospace">
            {currentIndex + 1} / {images.length}
          </Badge>
          {isGif && (
            <Badge color="grape" variant="filled" size="sm">
              GIF
            </Badge>
          )}
        </Group>

        <Group gap="xs">
          <Tooltip label="Close (Esc)" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              radius="xl"
              onClick={onClose}
            >
              <X size={20} color="#e2e8f0" />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Main Image Stage */}
      <Box
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          padding: "8px 0",
        }}
      >
        {/* Previous Button */}
        {images.length > 1 && (
          <ActionIcon
            variant="filled"
            color="dark"
            size="xl"
            radius="xl"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            style={{
              position: "absolute",
              left: 16,
              zIndex: 5,
              backgroundColor: "rgba(20, 24, 33, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(8px)",
            }}
          >
            <ChevronLeft size={24} color="#f8fafc" />
          </ActionIcon>
        )}

        {/* Main Displayed Image */}
        <Box
          style={{
            maxWidth: "92vw",
            maxHeight: "76vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Image
            key={currentFullUrl}
            src={currentFullUrl}
            alt={title ? `${title} Screenshot` : "Screenshot Preview"}
            fit="contain"
            style={{
              maxHeight: "76vh",
              maxWidth: "92vw",
              borderRadius: 8,
              boxShadow: "0 12px 40px rgba(0,0,0,0.8)",
            }}
          />
        </Box>

        {/* Next Button */}
        {images.length > 1 && (
          <ActionIcon
            variant="filled"
            color="dark"
            size="xl"
            radius="xl"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            style={{
              position: "absolute",
              right: 16,
              zIndex: 5,
              backgroundColor: "rgba(20, 24, 33, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              backdropFilter: "blur(8px)",
            }}
          >
            <ChevronRight size={24} color="#f8fafc" />
          </ActionIcon>
        )}
      </Box>

      {/* Bottom Thumbnail Strip (if multiple images) */}
      {images.length > 1 && (
        <Group
          justify="center"
          gap={8}
          wrap="nowrap"
          style={{
            overflowX: "auto",
            padding: "8px 4px",
            zIndex: 10,
            maxWidth: "100%",
          }}
        >
          {images.map((thumbUrl, idx) => {
            const isSelected = idx === currentIndex;
            const isThumbGif = /\.gif(?:\?.*)?$/i.test(thumbUrl);
            return (
              <Paper
                key={idx}
                radius="sm"
                onClick={() => setCurrentIndex(idx)}
                style={{
                  width: 64,
                  height: 42,
                  flexShrink: 0,
                  overflow: "hidden",
                  cursor: "pointer",
                  border: isSelected
                    ? "2px solid var(--mantine-color-blue-5)"
                    : isThumbGif
                      ? "1px solid var(--mantine-color-grape-7)"
                      : "1px solid rgba(255, 255, 255, 0.15)",
                  opacity: isSelected ? 1 : 0.6,
                  transform: isSelected ? "scale(1.08)" : "scale(1)",
                  transition: "all 0.15s ease",
                }}
              >
                <Image
                  src={thumbUrl}
                  h={42}
                  w={64}
                  fit="cover"
                  loading="lazy"
                />
              </Paper>
            );
          })}
        </Group>
      )}
    </Modal>
  );
}
