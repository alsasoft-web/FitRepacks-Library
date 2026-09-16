"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button, Group, Text, Box } from "@mantine/core";
import { Trash2 } from "lucide-react";

interface HoldToUninstallButtonProps {
  onUninstallConfirmed: () => void;
  holdDurationMs?: number;
}

export const HoldToUninstallButton: React.FC<HoldToUninstallButtonProps> = ({
  onUninstallConfirmed,
  holdDurationMs = 2000,
}) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const startHold = () => {
    setIsHolding(true);
    startTimeRef.current = Date.now();

    const updateProgress = () => {
      if (!startTimeRef.current) {
        return;
      }
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / holdDurationMs) * 100);
      setProgress(pct);

      if (pct >= 100) {
        setIsHolding(false);
        setProgress(0);
        startTimeRef.current = null;
        onUninstallConfirmed();
      } else {
        animRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animRef.current = requestAnimationFrame(updateProgress);
  };

  const cancelHold = () => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    startTimeRef.current = null;
    setIsHolding(false);
    setProgress(0);
  };

  useEffect(() => {
    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  // SVG Circular progress math
  const radius = 13;
  const circumference = 2 * Math.PI * radius; // ~81.68
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Button
      color="red"
      variant={isHolding ? "filled" : "light"}
      size="sm"
      radius="md"
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      style={{
        userSelect: "none",
        transition: "transform 150ms ease, box-shadow 150ms ease",
        transform: isHolding ? "scale(1.04)" : "scale(1)",
        boxShadow: isHolding ? "0 0 18px rgba(250, 82, 82, 0.6)" : "none",
      }}
    >
      <Group gap="xs" align="center">
        {/* Animated Circular SVG Ring Progress */}
        <Box
          pos="relative"
          w={28}
          h={28}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 32 32">
            {/* Background Track Circle */}
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="rgba(0, 0, 0, 0.35)"
              strokeWidth="3.5"
            />
            {/* Animated Active Progress Circle */}
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 16 16)"
            />
          </svg>

          <Box
            pos="absolute"
            inset={0}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trash2 size={13} color="#ffffff" />
          </Box>
        </Box>

        <Text size="xs" fw={700} c="white">
          {isHolding
            ? `HOLDING (${Math.round(progress)}%)`
            : "HOLD TO UNINSTALL"}
        </Text>
      </Group>
    </Button>
  );
};
