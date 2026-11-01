"use client";

import React from "react";
import { Box } from "@mantine/core";
import { MapCategory } from "./types";

interface CategoryIconProps {
  category: MapCategory;
  spriteMap?: Record<string, any>;
  spriteImgUrl?: string;
  spriteWidth?: number;
  spriteHeight?: number;
  isVisible?: boolean;
  size?: number;
  className?: string;
}

export function CategoryIcon({
  category,
  isVisible = true,
  size = 18,
  className = "",
}: CategoryIconProps) {
  const rawIcon =
    category.icon ||
    (category.title
      ? category.title
          .toLowerCase()
          .trim()
          .replace(/['"]/g, "")
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
      : "miscellaneous");

  const iconDash = rawIcon.replace(/_/g, "-");
  const iconUnder = rawIcon.replace(/-/g, "_");
  const color = category.color || category.icon_color || "#38bdf8";

  return (
    <Box
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        opacity: isVisible ? 1 : 0.35,
        fontSize: Math.max(12, size - 2),
        lineHeight: 1,
        color: isVisible ? color : "#64748b",
        transition: "opacity 0.12s ease",
      }}
    >
      <span
        className={`icon icon-${iconDash} cat-icon`}
        style={{
          display: "inline-block",
          lineHeight: 1,
          verticalAlign: "middle",
          textAlign: "center",
        }}
      >
        <span className="path1" />
        <span className="path2" />
        <span className="path3" />
        <span className="path4" />
        <span className="path5" />
        <span className="path6" />
        <span className="path7" />
        <span className="path8" />
      </span>
    </Box>
  );
}
