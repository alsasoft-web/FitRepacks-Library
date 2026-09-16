"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button, Group, Text, Box } from "@mantine/core";
import { Trash2 } from "lucide-react";

interface HoldToConfirmButtonProps {
  onConfirmed: () => void;
  holdDurationMs?: number;
  label?: string;
  holdingLabel?: string;
  color?: string;
  icon?: React.ReactNode;
  size?: "xs" | "sm" | "md" | "lg";
  fullWidth?: boolean;
}

export const HoldToConfirmButton: React.FC<HoldToConfirmButtonProps> = ({
  onConfirmed,
  holdDurationMs = 1500,
  label = "HOLD TO DELETE",
  holdingLabel,
  color = "red",
  icon = <Trash2 size={13} color="#ffffff" />,
  size = "sm",
  fullWidth = false,
}) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const startHold = () => {
    setIsHolding(true);
    startTimeRef.current = Date.now();

    const updateProgress = () => {
      if (!startTimeRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min(100, (elapsed / holdDurationMs) * 100);
      setProgress(pct);

      if (pct >= 100) {
        setIsHolding(false);
        setProgress(0);
        startTimeRef.current = null;
        onConfirmed();
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

  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <Button
      color={color}
      variant={isHolding ? "filled" : "light"}
      size={size}
      radius="md"
      fullWidth={fullWidth}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      style={{
        userSelect: "none",
        transition: "transform 150ms ease, box-shadow 150ms ease",
        transform: isHolding ? "scale(1.03)" : "scale(1)",
        boxShadow: isHolding ? "0 0 16px rgba(250, 82, 82, 0.6)" : "none",
      }}
    >
      <Group gap="xs" align="center" justify="center">
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
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="rgba(0, 0, 0, 0.35)"
              strokeWidth="3.5"
            />
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
            {icon}
          </Box>
        </Box>

        <Text size="xs" fw={700} c="white">
          {isHolding
            ? holdingLabel || `HOLDING (${Math.round(progress)}%)`
            : label}
        </Text>
      </Group>
    </Button>
  );
};
