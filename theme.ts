"use client";

import { createTheme, MantineColorsTuple } from "@mantine/core";

export const brandCyan: MantineColorsTuple = [
  "#e0fbfc",
  "#c0f3f6",
  "#8fe6ec",
  "#57d6de",
  "#28c4ce",
  "#0eb8c2",
  "#00adb5", // Primary Light #00ADB5
  "#008c93", // Deeper cyan
  "#006d73", // Dark Mode Primary
  "#005257",
];

export const brandDark: MantineColorsTuple = [
  "#f3f4f6", // shade 0: primary text
  "#e5e7eb", // shade 1: secondary text
  "#9ca3af", // shade 2: dimmed text
  "#4b5058", // shade 3: subtle text / icons
  "#33363f", // shade 4: subtle borders (never white)
  "#23262d", // shade 5: container borders
  "#1a1c22", // shade 6: elevated surfaces / popovers
  "#14161b", // shade 7: card containers
  "#0f1014", // shade 8: header / navbar
  "#0b0c0f", // shade 9: main background (deep luxury gaming dark)
];

export const theme = createTheme({
  colors: {
    cyan: brandCyan,
    brandCyan,
    blue: brandCyan,
    dark: brandDark,
    brandDark,
  },
  black: "#0b0c0f",
  primaryColor: "brandCyan",
  primaryShade: { light: 6, dark: 8 },
});
