"use client";

import React, { useEffect, useState, useRef, useMemo } from "react";
import type L from "leaflet";
import { Box, Flex, Text, Badge, UnstyledButton, ScrollArea } from "@mantine/core";
import { Filter, Layers, Check, ChevronRight, Folder, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { MapCategory, MapLocation, MapItem } from "./types";
import { CategoryIcon } from "./CategoryIcon";

export interface TargetedMarkerItem {
  id: string | number;
  cId: string;
  loc: MapLocation;
  marker: L.Marker;
  distance: number;
}

export type NavigableItem =
  | {
      type: "map";
      id: string;
      mapItem: MapItem;
      isSelected: boolean;
    }
  | {
      type: "action";
      id: string;
      actionType: "hide_found" | "show_all" | "hide_all";
      title: string;
    }
  | {
      type: "group";
      id: string;
      title: string;
      categories: MapCategory[];
    }
  | {
      type: "category";
      id: string;
      category: MapCategory;
      parentGroupTitle?: string;
      parentGroupCategories?: MapCategory[];
    };

interface MapGamepadControllerProps {
  map: L.Map | null;
  allMarkersRef: React.MutableRefObject<
    Array<{
      id: string | number;
      cId: string;
      loc: MapLocation;
      marker: L.Marker;
    }>
  >;
  foundIds: Set<string | number>;
  hideFound?: boolean;
  onToggleHideFound?: () => void;
  categoriesById?: Record<string, MapCategory>;
  groupsList?: Array<{ id: string | number; title: string; categories: MapCategory[] }>;
  categoryState?: Record<string, boolean>;
  spriteMap?: Record<string, any>;
  spriteImgUrl?: string;
  spriteWidth?: number;
  spriteHeight?: number;
  onToggleFound: (id: string | number) => void;
  onToggleCategory?: (categoryId: number | string) => void;
  onToggleGroupCategories?: (categories?: MapCategory[]) => void;
  onShowAllCategories?: () => void;
  onHideAllCategories?: () => void;
  onToggleSidebar?: () => void;
  minZoom?: number;
  maxZoom?: number;
  isOverlay?: boolean;
  availableMaps?: MapItem[];
  currentMapSlug?: string;
  onSelectMap?: (slug: string) => void;
  isLightboxOpen?: boolean;
  onCloseLightbox?: () => void;
}

const INTERACTION_RADIUS = 54; // Radius in pixels for center reticle marker snapping
const LEFT_STICK_DEADZONE = 0.18;
const RIGHT_STICK_DEADZONE = 0.18;
const SLOW_PAN_SPEED = 9; // Left Stick (Precision / Slow)
const FAST_PAN_SPEED = 30; // Right Stick (Fast Travel)

function processStickInput(
  x: number,
  y: number,
  deadzone: number
): { x: number; y: number; magnitude: number } {
  const rawMag = Math.hypot(x, y);
  if (rawMag <= deadzone) {
    return { x: 0, y: 0, magnitude: 0 };
  }
  const normalizedMag = Math.min(1, (rawMag - deadzone) / (1 - deadzone));
  return {
    x: (x / rawMag) * normalizedMag,
    y: (y / rawMag) * normalizedMag,
    magnitude: normalizedMag,
  };
}

export function MapGamepadController({
  map,
  allMarkersRef,
  foundIds,
  hideFound = false,
  onToggleHideFound,
  categoriesById = {},
  groupsList = [],
  categoryState = {},
  spriteMap = {},
  spriteImgUrl = "",
  spriteWidth = 132,
  spriteHeight = 220,
  onToggleFound,
  onToggleCategory,
  onToggleGroupCategories,
  onShowAllCategories,
  onHideAllCategories,
  onToggleSidebar,
  minZoom = 0,
  maxZoom = 20,
  isOverlay = false,
  availableMaps,
  currentMapSlug,
  onSelectMap,
  isLightboxOpen = false,
  onCloseLightbox,
}: MapGamepadControllerProps) {
  const [isGamepadConnected, setIsGamepadConnected] = useState(false);
  const [gamepadType, setGamepadType] = useState<"xbox" | "ps">("xbox");
  const [targetedMarker, setTargetedMarker] =
    useState<TargetedMarkerItem | null>(null);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const prevButtonsRef = useRef<boolean[]>([]);
  const targetedMarkerRef = useRef<TargetedMarkerItem | null>(null);
  targetedMarkerRef.current = targetedMarker;
  const isGamepadConnectedRef = useRef(false);
  isGamepadConnectedRef.current = isGamepadConnected;
  const showCategoryMenuRef = useRef(false);
  showCategoryMenuRef.current = showCategoryMenu;
  const selectedItemIndexRef = useRef(0);
  selectedItemIndexRef.current = selectedItemIndex;
  const selectedRefIndexRef = useRef<number>(-1);
  const isImageSelectedRef = useRef<boolean>(false);
  const isLightboxOpenRef = useRef<boolean>(false);
  isLightboxOpenRef.current = Boolean(isLightboxOpen);
  const onCloseLightboxRef = useRef(onCloseLightbox);
  onCloseLightboxRef.current = onCloseLightbox;
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastNavTimeRef = useRef<number>(0);

  const hideFoundRef = useRef(hideFound);
  hideFoundRef.current = hideFound;
  const onToggleHideFoundRef = useRef(onToggleHideFound);
  onToggleHideFoundRef.current = onToggleHideFound;

  const availableMapsRef = useRef(availableMaps);
  availableMapsRef.current = availableMaps;
  const currentMapSlugRef = useRef(currentMapSlug);
  currentMapSlugRef.current = currentMapSlug;
  const onSelectMapRef = useRef(onSelectMap);
  onSelectMapRef.current = onSelectMap;

  // Build unified navigable list containing Actions, Group Headers, and Categories (maps hidden from filters)
  const navigableItems: NavigableItem[] = useMemo(() => {
    const items: NavigableItem[] = [];
    const seenCatIds = new Set<string>();

    // 1. Quick Action: Hide Found Markers
    items.push({
      type: "action",
      id: "action_toggle_hide_found",
      actionType: "hide_found",
      title: "Hide Found Markers",
    });

    if (groupsList.length > 0) {
      groupsList.forEach((g) => {
        const cats = g.categories || [];
        if (cats.length > 0) {
          items.push({
            type: "group",
            id: `group_${g.id}_${g.title}`,
            title: g.title,
            categories: cats,
          });

          cats.forEach((c) => {
            const sid = String(c.id);
            if (!seenCatIds.has(sid)) {
              seenCatIds.add(sid);
              items.push({
                type: "category",
                id: `cat_${sid}`,
                category: c,
                parentGroupTitle: g.title,
                parentGroupCategories: cats,
              });
            }
          });
        }
      });
    }

    // Add any standalone categories not assigned to groups
    Object.values(categoriesById).forEach((c) => {
      const sid = String(c.id);
      if (!seenCatIds.has(sid)) {
        seenCatIds.add(sid);
        items.push({
          type: "category",
          id: `cat_${sid}`,
          category: c,
        });
      }
    });

    return items;
  }, [availableMaps, currentMapSlug, groupsList, categoriesById]);

  const navigableItemsRef = useRef(navigableItems);
  navigableItemsRef.current = navigableItems;

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 1800);
  };

  // Auto-scroll menu item into view when selection changes
  useEffect(() => {
    if (showCategoryMenu) {
      const el = document.getElementById(`gamepad-filter-item-${selectedItemIndex}`);
      if (el) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedItemIndex, showCategoryMenu]);

  // Listen for gamepad connect/disconnect events
  useEffect(() => {
    const handleConnected = (e: GamepadEvent) => {
      const gp = e.gamepad;
      const isPs =
        gp.id.toLowerCase().includes("playstation") ||
        gp.id.toLowerCase().includes("dualsense") ||
        gp.id.toLowerCase().includes("dualshock") ||
        gp.id.toLowerCase().includes("sony") ||
        gp.id.toLowerCase().includes("054c");
      setGamepadType(isPs ? "ps" : "xbox");
      setIsGamepadConnected(true);
    };

    const handleDisconnected = () => {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const hasAny = Array.from(gamepads).some((g) => g !== null);
      if (!hasAny) {
        setIsGamepadConnected(false);
        setTargetedMarker(null);
        setShowCategoryMenu(false);
      }
    };

    window.addEventListener("gamepadconnected", handleConnected);
    window.addEventListener("gamepaddisconnected", handleDisconnected);

    if (typeof navigator !== "undefined" && navigator.getGamepads) {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (gp) {
          const isPs =
            gp.id.toLowerCase().includes("playstation") ||
            gp.id.toLowerCase().includes("dualsense") ||
            gp.id.toLowerCase().includes("dualshock") ||
            gp.id.toLowerCase().includes("sony") ||
            gp.id.toLowerCase().includes("054c");
          setGamepadType(isPs ? "ps" : "xbox");
          setIsGamepadConnected(true);
          break;
        }
      }
    }

    return () => {
      window.removeEventListener("gamepadconnected", handleConnected);
      window.removeEventListener("gamepaddisconnected", handleDisconnected);
    };
  }, []);

  const targetZoomRef = useRef<number | null>(null);
  const lastZoomTimeRef = useRef<number>(0);
  const zoomHoldStartRef = useRef<number>(0);
  const prevZoomDirRef = useRef<number>(0);

  // Debounce / disambiguation refs for buttons 8 & 9 (Select & Start)
  const pendingBtn8TimeRef = useRef<number | null>(null);
  const pendingBtn9TimeRef = useRef<number | null>(null);
  const comboSuppressedRef = useRef<boolean>(false);

  // Keep targetZoom in sync with Leaflet map events
  useEffect(() => {
    if (!map) return;
    targetZoomRef.current = map.getZoom();

    const syncZoom = () => {
      targetZoomRef.current = map.getZoom();
    };

    map.on("zoom", syncZoom);
    map.on("zoomend", syncZoom);

    return () => {
      map.off("zoom", syncZoom);
      map.off("zoomend", syncZoom);
    };
  }, [map]);

  // Gamepad Polling and Frame Loop (Pan, Zoom, Target Snap, Button Clicks)
  useEffect(() => {
    if (!map) return;

    let animFrameId: number;

    const loop = (timestamp: number) => {
      if (typeof navigator === "undefined" || !navigator.getGamepads) {
        animFrameId = requestAnimationFrame(loop);
        return;
      }

      const gamepads = navigator.getGamepads();
      let activeGamepad: Gamepad | null = null;
      for (const gp of gamepads) {
        if (gp && gp.connected) {
          activeGamepad = gp;
          break;
        }
      }

      if (!activeGamepad) {
        if (isGamepadConnectedRef.current) {
          setIsGamepadConnected(false);
          setTargetedMarker(null);
        }
        animFrameId = requestAnimationFrame(loop);
        return;
      }

      if (!isGamepadConnectedRef.current) {
        const isPs =
          activeGamepad.id.toLowerCase().includes("playstation") ||
          activeGamepad.id.toLowerCase().includes("dualsense") ||
          activeGamepad.id.toLowerCase().includes("dualshock") ||
          activeGamepad.id.toLowerCase().includes("sony") ||
          activeGamepad.id.toLowerCase().includes("054c");
        setGamepadType(isPs ? "ps" : "xbox");
        setIsGamepadConnected(true);
      }

      const axes = activeGamepad.axes || [];
      const buttons = activeGamepad.buttons || [];

      const prevButtons = prevButtonsRef.current;
      const currentButtons = buttons.map((b) => Boolean(b && b.pressed));
      const isPressed = (index: number) =>
        Boolean(currentButtons[index] && !prevButtons[index]);

      // If enlarged lightbox modal is open, any face button (A, B, X, Y) or Start/Back closes it
      if (isLightboxOpenRef.current) {
        if (
          isPressed(0) ||
          isPressed(1) ||
          isPressed(2) ||
          isPressed(3) ||
          isPressed(8) ||
          isPressed(9)
        ) {
          if (onCloseLightboxRef.current) {
            onCloseLightboxRef.current();
          }
        }
        prevButtonsRef.current = currentButtons;
        animFrameId = requestAnimationFrame(loop);
        return;
      }

      const btn8Down = Boolean(currentButtons[8]);
      const btn9Down = Boolean(currentButtons[9]);

      // If both Select (8) and Start (9) are pressed, suppress both actions (overlay toggle shortcut)
      if (btn8Down && btn9Down) {
        comboSuppressedRef.current = true;
        pendingBtn8TimeRef.current = null;
        pendingBtn9TimeRef.current = null;
      }

      // Reset suppression once both buttons are fully released
      if (!btn8Down && !btn9Down) {
        comboSuppressedRef.current = false;
      }

      // Track edge-press with short debounce to avoid firing when user presses Select+Start combo
      if (isPressed(8) && !comboSuppressedRef.current && !btn9Down) {
        pendingBtn8TimeRef.current = timestamp;
      }
      if (isPressed(9) && !comboSuppressedRef.current && !btn8Down) {
        pendingBtn9TimeRef.current = timestamp;
      }

      const isMenuOpen = showCategoryMenuRef.current;

      // Fire Button 8 (Select/View) action on release or after 180ms if Start was not pressed
      if (pendingBtn8TimeRef.current !== null) {
        const elapsed = timestamp - pendingBtn8TimeRef.current;
        const justReleased = !btn8Down && Boolean(prevButtons[8]);
        if (!comboSuppressedRef.current && !btn9Down && (justReleased || elapsed > 180)) {
          pendingBtn8TimeRef.current = null;
          setShowCategoryMenu((v) => !v);
        } else if (comboSuppressedRef.current || btn9Down) {
          pendingBtn8TimeRef.current = null;
        }
      }

      // Fire Button 9 (Start/Menu) action on release or after 180ms if Select was not pressed
      if (pendingBtn9TimeRef.current !== null) {
        const elapsed = timestamp - pendingBtn9TimeRef.current;
        const justReleased = !btn9Down && Boolean(prevButtons[9]);
        if (!comboSuppressedRef.current && !btn8Down && (justReleased || elapsed > 180)) {
          pendingBtn9TimeRef.current = null;
          if (isMenuOpen) {
            setShowCategoryMenu(false);
          } else if (onToggleSidebar) {
            onToggleSidebar();
          }
        } else if (comboSuppressedRef.current || btn8Down) {
          pendingBtn9TimeRef.current = null;
        }
      }

      // MENU NAVIGATION MODE (When Quick Category Filter Menu is Open)
      if (isMenuOpen) {
        const items = navigableItemsRef.current;
        const count = items.length;

        const navDelayPassed = timestamp - lastNavTimeRef.current > 140;

        // D-Pad Up or Left Stick Up
        const upPressed = isPressed(12) || (axes[1] < -0.6 && navDelayPassed);
        // D-Pad Down or Left Stick Down
        const downPressed = isPressed(13) || (axes[1] > 0.6 && navDelayPassed);

        if (upPressed && count > 0) {
          lastNavTimeRef.current = timestamp;
          setSelectedItemIndex((idx) => (idx <= 0 ? count - 1 : idx - 1));
        } else if (downPressed && count > 0) {
          lastNavTimeRef.current = timestamp;
          setSelectedItemIndex((idx) => (idx >= count - 1 ? 0 : idx + 1));
        }

        const currentItem = items[selectedItemIndexRef.current];

        // Button 0 (A / X) -> Toggle currently highlighted item (Map, Action, Group or Category)
        if (isPressed(0) && currentItem) {
          if (currentItem.type === "map" && onSelectMapRef.current) {
            onSelectMapRef.current(currentItem.mapItem.slug);
            showToast(`MAP: ${currentItem.mapItem.title.toUpperCase()}`);
            setShowCategoryMenu(false);
          } else if (currentItem.type === "action" && currentItem.actionType === "hide_found") {
            onToggleHideFoundRef.current?.();
            const nextHide = !hideFoundRef.current;
            showToast(nextHide ? "FOUND MARKERS: HIDDEN" : "FOUND MARKERS: VISIBLE");
          } else if (currentItem.type === "group" && onToggleGroupCategories) {
            onToggleGroupCategories(currentItem.categories);
            const isAnyVis = currentItem.categories.some(
              (c) => categoryState[String(c.id)] !== false
            );
            showToast(`${currentItem.title}: ${!isAnyVis ? "SHOWN" : "HIDDEN"}`);
          } else if (currentItem.type === "category" && onToggleCategory) {
            onToggleCategory(currentItem.category.id);
            const isVis = categoryState[String(currentItem.category.id)] !== false;
            showToast(`${currentItem.category.title}: ${!isVis ? "SHOWN" : "HIDDEN"}`);
          }
        }

        // Button 2 (X / Square) -> Close/Hide Filter Menu
        if (isPressed(2)) {
          setShowCategoryMenu(false);
        }

        // Button 3 (Y / Triangle) -> Toggle All Categories (Show All / Hide All)
        if (isPressed(3)) {
          const hasHidden = items.some((item) =>
            item.type === "category"
              ? categoryState[String(item.category.id)] === false
              : false
          );
          if (hasHidden && onShowAllCategories) {
            onShowAllCategories();
            showToast("SHOWING ALL MARKERS");
          } else if (onHideAllCategories) {
            onHideAllCategories();
            showToast("HIDDEN ALL MARKERS");
          }
        }

        // Button 1 (B / Circle) -> Close Menu
        if (isPressed(1)) {
          setShowCategoryMenu(false);
        }

        prevButtonsRef.current = currentButtons;
        animFrameId = requestAnimationFrame(loop);
        return;
      }

      // MAP EXPLORATION MODE
      const isMapReady =
        map &&
        (map as any)._loaded &&
        (map as any)._mapPane &&
        !(map as any)._animatingZoom &&
        typeof map.getContainer === "function" &&
        map.getContainer();

      if (!isMapReady) {
        prevButtonsRef.current = currentButtons;
        animFrameId = requestAnimationFrame(loop);
        return;
      }

      try {
        // 1. Stick Input Reading with Dedicated Left & Right Stick Deadzones
        const lx = axes[0] || 0;
        const ly = axes[1] || 0;
        const rx = axes[2] || 0;
        const ry = axes[3] || 0;

        const leftStick = processStickInput(lx, ly, LEFT_STICK_DEADZONE);
        const rightStick = processStickInput(rx, ry, RIGHT_STICK_DEADZONE);

        let activePanSpeed = SLOW_PAN_SPEED;
        let moveX = 0;
        let moveY = 0;
        let moveMagnitude = 0;

        // Right Stick moves fast (fast travel); Left Stick gives precision slow movement
        if (rightStick.magnitude > 0) {
          activePanSpeed = FAST_PAN_SPEED;
          moveX = rightStick.x;
          moveY = rightStick.y;
          moveMagnitude = rightStick.magnitude;
        } else if (leftStick.magnitude > 0) {
          activePanSpeed = SLOW_PAN_SPEED;
          moveX = leftStick.x;
          moveY = leftStick.y;
          moveMagnitude = leftStick.magnitude;
        }

        // D-Pad is dedicated to popup image highlighting, scrolling & reference navigation
        const popupEl = document.querySelector(".leaflet-popup");
        if (popupEl) {
          const mediaEl = popupEl.querySelector<HTMLElement>(".popup-media-container");
          const scrollContainer =
            popupEl.querySelector<HTMLElement>(".popup-desc-container") ||
            popupEl.querySelector<HTMLElement>("[style*='overflow-y']") ||
            popupEl.querySelector<HTMLElement>(".leaflet-popup-content");
          const refBtns = Array.from(
            popupEl.querySelectorAll<HTMLButtonElement>(".loc-ref-btn"),
          );

          // A. D-Pad Up (12) -> Highlight media image if present, or scroll description up
          if (isPressed(12)) {
            if (mediaEl && !isImageSelectedRef.current) {
              isImageSelectedRef.current = true;
              mediaEl.classList.add("is-gamepad-selected");
              mediaEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
              selectedRefIndexRef.current = -1;
              refBtns.forEach((btn) => btn.classList.remove("is-gamepad-selected"));
            } else if (scrollContainer && !isImageSelectedRef.current) {
              scrollContainer.scrollTop -= 24;
            }
          } else if (buttons[12]?.pressed) {
            if (scrollContainer && !isImageSelectedRef.current) {
              if (scrollContainer.scrollTop <= 0 && mediaEl) {
                isImageSelectedRef.current = true;
                mediaEl.classList.add("is-gamepad-selected");
                mediaEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
              } else {
                scrollContainer.scrollTop -= 8;
              }
            }
          }

          // B. D-Pad Down (13) -> Unselect image or scroll description down
          if (isPressed(13)) {
            if (isImageSelectedRef.current) {
              isImageSelectedRef.current = false;
              if (mediaEl) mediaEl.classList.remove("is-gamepad-selected");
            } else if (scrollContainer) {
              scrollContainer.scrollTop += 24;
            }
          } else if (buttons[13]?.pressed) {
            if (isImageSelectedRef.current) {
              isImageSelectedRef.current = false;
              if (mediaEl) mediaEl.classList.remove("is-gamepad-selected");
            }
            if (scrollContainer) {
              scrollContainer.scrollTop += 8;
            }
          }

          // C. D-Pad Left (14) / Right (15) -> Cycle references or toggle image highlight
          if (refBtns.length > 0) {
            if (isPressed(15)) {
              if (isImageSelectedRef.current && mediaEl) {
                isImageSelectedRef.current = false;
                mediaEl.classList.remove("is-gamepad-selected");
              }
              const nextIdx =
                selectedRefIndexRef.current < 0
                  ? 0
                  : (selectedRefIndexRef.current + 1) % refBtns.length;
              selectedRefIndexRef.current = nextIdx;
              refBtns.forEach((btn, idx) => {
                if (idx === nextIdx) {
                  btn.classList.add("is-gamepad-selected");
                  btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
                } else {
                  btn.classList.remove("is-gamepad-selected");
                }
              });
            } else if (isPressed(14)) {
              if (isImageSelectedRef.current && mediaEl) {
                isImageSelectedRef.current = false;
                mediaEl.classList.remove("is-gamepad-selected");
              }
              const prevIdx =
                selectedRefIndexRef.current <= 0
                  ? refBtns.length - 1
                  : selectedRefIndexRef.current - 1;
              selectedRefIndexRef.current = prevIdx;
              refBtns.forEach((btn, idx) => {
                if (idx === prevIdx) {
                  btn.classList.add("is-gamepad-selected");
                  btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
                } else {
                  btn.classList.remove("is-gamepad-selected");
                }
              });
            }
          } else if (mediaEl) {
            if (isPressed(14) || isPressed(15)) {
              isImageSelectedRef.current = !isImageSelectedRef.current;
              if (isImageSelectedRef.current) {
                mediaEl.classList.add("is-gamepad-selected");
                mediaEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
              } else {
                mediaEl.classList.remove("is-gamepad-selected");
              }
            }
          }
        } else {
          if (isImageSelectedRef.current) {
            isImageSelectedRef.current = false;
          }
          if (selectedRefIndexRef.current !== -1) {
            selectedRefIndexRef.current = -1;
          }
        }

        // 2. Proximity Marker Search & Visual Center Snapping
        let mapSize = { x: 800, y: 600 };
        try {
          const size = map.getSize();
          if (size && typeof size.x === "number" && typeof size.y === "number") {
            mapSize = size;
          }
        } catch (_) {}
        const centerPt = { x: mapSize.x / 2, y: mapSize.y / 2 };

        let closestItem: TargetedMarkerItem | null = null;
        let minDistance = INTERACTION_RADIUS;
        let snapOffset: { x: number; y: number } | null = null;

        const allItems = allMarkersRef.current || [];
        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i];
          if (!item.marker || !map.hasLayer(item.marker)) continue;

          try {
            if (!(map as any)._mapPane || (map as any)._animatingZoom) break;
            const pt = map.latLngToContainerPoint(item.marker.getLatLng());

            // Calculate visual center of marker pin (above the bottom tip anchor point)
            const icon = item.marker.getIcon ? item.marker.getIcon() : null;
            let anchorOffsetY = 18;
            if (icon && (icon as any).options) {
              const iconAnchor = (icon as any).options.iconAnchor;
              const iconSize = (icon as any).options.iconSize;
              if (Array.isArray(iconAnchor) && typeof iconAnchor[1] === "number") {
                anchorOffsetY = iconAnchor[1] * 0.55;
              } else if (Array.isArray(iconSize) && typeof iconSize[1] === "number") {
                anchorOffsetY = iconSize[1] * 0.55;
              }
            }

            const visualPtX = pt.x;
            const visualPtY = pt.y - anchorOffsetY;
            const dist = Math.hypot(visualPtX - centerPt.x, visualPtY - centerPt.y);

            if (dist <= minDistance) {
              minDistance = dist;
              closestItem = { ...item, distance: dist };
              snapOffset = { x: visualPtX - centerPt.x, y: visualPtY - centerPt.y };
            }
          } catch (_) {}
        }

        const currentTargeted = targetedMarkerRef.current;
        if (
          (closestItem && !currentTargeted) ||
          (!closestItem && currentTargeted) ||
          (closestItem &&
            currentTargeted &&
            closestItem.id !== currentTargeted.id)
        ) {
          setTargetedMarker(closestItem);
        }

        // 3. Apply Map Movement with Magnetic Snap and Sticky Friction
        let panDx = 0;
        let panDy = 0;

        if (moveMagnitude > 0.05) {
          const applyCurve = (v: number) =>
            Math.sign(v) * Math.pow(Math.abs(v), 1.4);

          // When near a marker and moving gently, apply sticky friction to make locking easy
          const friction = closestItem && moveMagnitude < 0.65 ? 0.45 : 1.0;
          panDx = applyCurve(moveX) * activePanSpeed * friction;
          panDy = applyCurve(moveY) * activePanSpeed * friction;
        }

        // If close to a marker and not breaking away with high stick push, apply magnetic snap pull
        if (closestItem && snapOffset && moveMagnitude < 0.65) {
          const snapFactor = moveMagnitude > 0.05 ? 0.18 : 0.32;
          panDx += snapOffset.x * snapFactor;
          panDy += snapOffset.y * snapFactor;
        }

        if (Math.abs(panDx) > 0.05 || Math.abs(panDy) > 0.05) {
          try {
            if (
              (map as any)._mapPane &&
              (map as any)._loaded &&
              !(map as any)._animatingZoom
            ) {
              const allowedBounds =
                ((map as any)?._allowedCenterBounds ||
                  (map.options as any)?.maxBounds) as
                  | L.LatLngBounds
                  | undefined;

              if (allowedBounds && typeof allowedBounds.contains === "function") {
                const currentCenter = map.getCenter();
                const currentPt = map.project(currentCenter);
                const nextPt = currentPt.add([panDx, panDy]);
                const nextCenter = map.unproject(nextPt);

                if (allowedBounds.contains(nextCenter)) {
                  map.panBy([panDx, panDy], { animate: false });
                } else {
                  // Allow sliding along bounding edges by checking each axis independently
                  let allowedDx = panDx;
                  let allowedDy = panDy;
                  const testX = map.unproject(currentPt.add([panDx, 0]));
                  if (!allowedBounds.contains(testX)) allowedDx = 0;
                  const testY = map.unproject(currentPt.add([0, panDy]));
                  if (!allowedBounds.contains(testY)) allowedDy = 0;

                  if (allowedDx !== 0 || allowedDy !== 0) {
                    map.panBy([allowedDx, allowedDy], { animate: false });
                  }
                }
              } else {
                map.panBy([panDx, panDy], { animate: false });
              }
            }
          } catch (_) {}
        }

        // 4. Triggers (L2/LT and R2/RT) Zooming
        let ltValue = 0;
        if (buttons[6]) {
          ltValue =
            typeof buttons[6].value === "number"
              ? buttons[6].value
              : buttons[6].pressed
                ? 1
                : 0;
        }
        let rtValue = 0;
        if (buttons[7]) {
          rtValue =
            typeof buttons[7].value === "number"
              ? buttons[7].value
              : buttons[7].pressed
                ? 1
                : 0;
        }

        // Fallback for controllers that output analog triggers on axes
        if (ltValue < 0.05 && axes.length > 4 && typeof axes[4] === "number" && axes[4] > 0.1) {
          ltValue = axes[4];
        }
        if (rtValue < 0.05 && axes.length > 5 && typeof axes[5] === "number" && axes[5] > 0.1) {
          rtValue = axes[5];
        }

        const lbPressed = buttons[4]?.pressed;
        const rbPressed = buttons[5]?.pressed;
        const hasMultipleMaps = Boolean(
          availableMapsRef.current && availableMapsRef.current.length > 1
        );

        let zoomDir = 0;
        if (rtValue > 0.25 || (rbPressed && !hasMultipleMaps)) {
          zoomDir = 1;
        } else if (ltValue > 0.25 || (lbPressed && !hasMultipleMaps)) {
          zoomDir = -1;
        }

        if (zoomDir !== 0) {
          const now = timestamp;
          let shouldZoom = false;

          if (prevZoomDirRef.current !== zoomDir) {
            shouldZoom = true;
            zoomHoldStartRef.current = now;
            lastZoomTimeRef.current = now;
          } else {
            const holdDuration = now - zoomHoldStartRef.current;
            const timeSinceLastZoom = now - lastZoomTimeRef.current;
            if (holdDuration > 220 && timeSinceLastZoom > 150) {
              shouldZoom = true;
              lastZoomTimeRef.current = now;
            }
          }

          if (shouldZoom) {
            try {
              if (
                (map as any)._loaded &&
                (map as any)._mapPane &&
                !(map as any)._animatingZoom
              ) {
                const currentZ = map.getZoom();
                const step = 0.5;
                const effectiveMin = minZoom;
                const effectiveMax = maxZoom + 4;
                const nextZ = Math.max(
                  effectiveMin,
                  Math.min(effectiveMax, Math.round((currentZ + zoomDir * step) * 2) / 2)
                );
                if (Math.abs(nextZ - currentZ) > 0.01) {
                  map.setZoom(nextZ, { animate: true });
                }
              }
            } catch (_) {}
          }
        }

        prevZoomDirRef.current = zoomDir;

        // 5. Gamepad Button Press Edge-Triggering in Map View

        // Map Cycling with Bumpers (LB / RB)
        if (hasMultipleMaps && onSelectMapRef.current) {
          const maps = availableMapsRef.current!;
          const currentSlug = currentMapSlugRef.current;
          const currentIndex = maps.findIndex((m) => m.slug === currentSlug);
          const validIndex = currentIndex >= 0 ? currentIndex : 0;

          // LB (Button 4) -> Previous Map
          if (isPressed(4)) {
            const prevIndex = (validIndex - 1 + maps.length) % maps.length;
            const targetMap = maps[prevIndex];
            onSelectMapRef.current(targetMap.slug);
            showToast(`MAP: ${targetMap.title.toUpperCase()}`);
          }

          // RB (Button 5) -> Next Map
          if (isPressed(5)) {
            const nextIndex = (validIndex + 1) % maps.length;
            const targetMap = maps[nextIndex];
            onSelectMapRef.current(targetMap.slug);
            showToast(`MAP: ${targetMap.title.toUpperCase()}`);
          }
        }

        // Button 0 = A (Xbox) / Cross (PlayStation X)
        // If image is highlighted, enlarge it.
        // If a reference button is currently selected in the open popup, click it.
        // Otherwise, open popup for targeted marker.
        if (isPressed(0)) {
          const popupEl = document.querySelector(".leaflet-popup");
          const mediaEl = popupEl?.querySelector<HTMLElement>(".popup-media-container");
          const refBtns = popupEl
            ? Array.from(popupEl.querySelectorAll<HTMLButtonElement>(".loc-ref-btn"))
            : [];
          if (popupEl && isImageSelectedRef.current && mediaEl) {
            mediaEl.click();
            showToast("ENLARGED IMAGE");
          } else if (
            popupEl &&
            selectedRefIndexRef.current >= 0 &&
            refBtns[selectedRefIndexRef.current]
          ) {
            refBtns[selectedRefIndexRef.current].click();
            selectedRefIndexRef.current = -1;
          } else {
            const activeTarget = targetedMarkerRef.current;
            if (activeTarget && activeTarget.marker) {
              try {
                activeTarget.marker.openPopup();
              } catch (_) {}
            }
          }
        }

        // Button 1 = B (Xbox) / Circle (PlayStation) -> Close Popup / Unselect Image
        if (isPressed(1)) {
          const popupEl = document.querySelector(".leaflet-popup");
          if (isImageSelectedRef.current) {
            isImageSelectedRef.current = false;
            const mediaEl = popupEl?.querySelector<HTMLElement>(".popup-media-container");
            if (mediaEl) mediaEl.classList.remove("is-gamepad-selected");
          } else {
            selectedRefIndexRef.current = -1;
            const refBtns = document.querySelectorAll(".leaflet-popup .loc-ref-btn");
            refBtns.forEach((b) => b.classList.remove("is-gamepad-selected"));
            try {
              map.closePopup();
            } catch (_) {}
          }
        }

        // Button 2 = X (Xbox) / Square (PlayStation)
        // If an image in the open popup is highlighted (or popup has media), ENLARGE IT!
        // If a reference is selected in popup, jump to it. Otherwise toggle filter modal.
        if (isPressed(2)) {
          const popupEl = document.querySelector(".leaflet-popup");
          const mediaEl = popupEl?.querySelector<HTMLElement>(".popup-media-container");
          const refBtns = popupEl
            ? Array.from(popupEl.querySelectorAll<HTMLButtonElement>(".loc-ref-btn"))
            : [];

          if (popupEl && (isImageSelectedRef.current || mediaEl)) {
            if (mediaEl) {
              mediaEl.click();
              showToast("ENLARGED IMAGE");
            }
          } else if (
            popupEl &&
            selectedRefIndexRef.current >= 0 &&
            refBtns[selectedRefIndexRef.current]
          ) {
            refBtns[selectedRefIndexRef.current].click();
            selectedRefIndexRef.current = -1;
          } else {
            setShowCategoryMenu((v) => !v);
          }
        }

        // Button 3 = Y (Xbox) / Triangle (PS) -> Toggle Found Status
        if (isPressed(3)) {
          const activeTarget = targetedMarkerRef.current;
          if (activeTarget) {
            onToggleFound(activeTarget.id);
            const wasFound =
              foundIds.has(activeTarget.id) ||
              foundIds.has(String(activeTarget.id));
            showToast(wasFound ? "UNMARKED LOCATION" : "MARKED AS FOUND");
          }
        }

        // Button 10 (L3 Stick Click) -> Quick Toggle Hide Found Markers
        if (isPressed(10) && onToggleHideFoundRef.current) {
          onToggleHideFoundRef.current();
          const nextHide = !hideFoundRef.current;
          showToast(nextHide ? "FOUND MARKERS: HIDDEN" : "FOUND MARKERS: VISIBLE");
        }
      } catch (_) {}

      prevButtonsRef.current = currentButtons;
      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameId);
    };
  }, [
    map,
    allMarkersRef,
    minZoom,
    maxZoom,
    foundIds,
    categoryState,
    categoriesById,
    onToggleFound,
    onToggleCategory,
    onToggleGroupCategories,
    onShowAllCategories,
    onHideAllCategories,
    onToggleSidebar,
  ]);

  if (!isGamepadConnected) {
    return null;
  }

  const isPs = gamepadType === "ps";
  const primaryBtnName = isPs ? "✕" : "A";
  const secondaryBtnName = isPs ? "△" : "Y";
  const squareBtnName = isPs ? "□" : "X";
  const backBtnName = isPs ? "◯" : "B";
  const viewBtnName = isPs ? "Share" : "View";
  const zoomInTriggerName = isPs ? "R2" : "RT";
  const zoomOutTriggerName = isPs ? "L2" : "LT";

  const isFound = targetedMarker
    ? foundIds.has(targetedMarker.id) || foundIds.has(String(targetedMarker.id))
    : false;
  const targetedCat = targetedMarker ? categoriesById[targetedMarker.cId] : null;

  return (
    <>
      {/* Center Screen Gamepad Reticle Circle */}
      <Box
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
          zIndex: 1050,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Floating Marker Information Badge when locked on a location */}
        {targetedMarker && (
          <Box
            style={{
              position: "absolute",
              top: 38,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              animation: "fadeInUp 0.15s ease-out",
              whiteSpace: "nowrap",
              width: "max-content",
              minWidth: "max-content",
              zIndex: 1060,
              pointerEvents: "none",
            }}
          >
            <Flex
              align="center"
              gap={8}
              style={{
                position: "relative",
                backgroundColor: "rgba(6, 10, 18, 0.96)",
                border: "1px solid rgba(34, 197, 94, 0.7)",
                borderRadius: 20,
                padding: "4px 12px 4px 8px",
                boxShadow:
                  "0 4px 20px rgba(0, 0, 0, 0.85), 0 0 14px rgba(34, 197, 94, 0.25)",
                backdropFilter: "blur(8px)",
                width: "max-content",
                minWidth: "max-content",
                whiteSpace: "nowrap",
              }}
            >
              {/* Primary Inspect Button */}
              <Box
                style={{
                  width: 19,
                  height: 19,
                  borderRadius: "50%",
                  backgroundColor: isPs ? "#2563eb" : "#16a34a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 900,
                  color: "#ffffff",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  flexShrink: 0,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
                }}
              >
                {primaryBtnName}
              </Box>

              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#ffffff",
                  fontFamily: "'Oswald', sans-serif",
                  letterSpacing: 0.4,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  maxWidth: 320,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {targetedMarker.loc.title || "Targeted Location"}
              </Text>

              {targetedCat && (
                <Text
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: targetedCat.color || "#38bdf8",
                    fontFamily: "'Oswald', sans-serif",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ({targetedCat.title})
                </Text>
              )}

              {isFound && (
                <Badge
                  size="xs"
                  color="green"
                  variant="filled"
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    height: 18,
                    padding: "0 7px",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    letterSpacing: 0.5,
                  }}
                >
                  FOUND
                </Badge>
              )}

              {/* Top pointer indicator toward reticle */}
              <Box
                style={{
                  position: "absolute",
                  top: -5,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderBottom: "5px solid rgba(34, 197, 94, 0.7)",
                }}
              />
            </Flex>
          </Box>
        )}

        {/* Reticle Circle Visual */}
        <Box
          style={{
            width: 52,
            height: 52,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Outer Pulsing Glow Ring */}
          <Box
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: targetedMarker
                ? "2px solid #22c55e"
                : "1.5px solid rgba(56, 189, 248, 0.75)",
              boxShadow: targetedMarker
                ? "0 0 16px rgba(34, 197, 94, 0.7), inset 0 0 8px rgba(34, 197, 94, 0.4)"
                : "0 0 12px rgba(56, 189, 248, 0.45)",
              transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: targetedMarker ? "scale(1.15)" : "scale(1)",
            }}
          />

          {/* Top Crosshair Tick */}
          <Box
            style={{
              position: "absolute",
              top: -6,
              left: "50%",
              transform: "translateX(-50%)",
              width: 2,
              height: 6,
              backgroundColor: targetedMarker ? "#4ade80" : "#38bdf8",
              borderRadius: 1,
            }}
          />

          {/* Bottom Crosshair Tick */}
          <Box
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              transform: "translateX(-50%)",
              width: 2,
              height: 6,
              backgroundColor: targetedMarker ? "#4ade80" : "#38bdf8",
              borderRadius: 1,
            }}
          />

          {/* Left Crosshair Tick */}
          <Box
            style={{
              position: "absolute",
              left: -6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 6,
              height: 2,
              backgroundColor: targetedMarker ? "#4ade80" : "#38bdf8",
              borderRadius: 1,
            }}
          />

          {/* Right Crosshair Tick */}
          <Box
            style={{
              position: "absolute",
              right: -6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 6,
              height: 2,
              backgroundColor: targetedMarker ? "#4ade80" : "#38bdf8",
              borderRadius: 1,
            }}
          />

          {/* Inner Center Dot / Target Lock Indicator */}
          <Box
            style={{
              width: targetedMarker ? 8 : 4,
              height: targetedMarker ? 8 : 4,
              borderRadius: "50%",
              backgroundColor: targetedMarker ? "#22c55e" : "#ffffff",
              boxShadow: targetedMarker
                ? "0 0 8px #22c55e"
                : "0 0 4px rgba(255,255,255,0.8)",
              transition: "all 0.15s ease",
            }}
          />
        </Box>
      </Box>

      {/* Action Toast Feedback Overlay */}
      {toastMessage && (
        <Box
          style={{
            position: "absolute",
            top: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1200,
            backgroundColor: "rgba(10, 15, 26, 0.95)",
            border: "1px solid #38bdf8",
            borderRadius: 20,
            padding: "6px 16px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.85), 0 0 16px rgba(56, 189, 248, 0.3)",
            backdropFilter: "blur(12px)",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#ffffff",
              fontFamily: "'Oswald', sans-serif",
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            {toastMessage}
          </Text>
        </Box>
      )}

      {/* Gamepad Quick Category Filters HUD Overlay */}
      {showCategoryMenu && (
        <Box
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 420,
            maxHeight: "82vh",
            backgroundColor: "rgba(8, 12, 22, 0.97)",
            border: "1px solid #23344e",
            borderRadius: 12,
            boxShadow: "0 24px 64px rgba(0, 0, 0, 0.95), 0 0 32px rgba(14, 165, 233, 0.2)",
            backdropFilter: "blur(16px)",
            zIndex: 1300,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "'Oswald', sans-serif",
          }}
        >
          {/* Header */}
          <Flex
            justify="space-between"
            align="center"
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #1e293b",
              backgroundColor: "#05070d",
            }}
          >
            <Flex align="center" gap={8}>
              <Filter size={16} color="#38bdf8" />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: 0.8,
                  color: "#ffffff",
                  textTransform: "uppercase",
                }}
              >
                CONTROLLER CATEGORY & GROUP FILTERS
              </Text>
            </Flex>

            <Flex align="center" gap={6}>
              <Box
                style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  backgroundColor: "#1e293b",
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#cbd5e1",
                }}
              >
                {backBtnName} CLOSE
              </Box>
            </Flex>
          </Flex>

          {/* Quick Actions Legend Bar */}
          <Flex
            justify="space-between"
            align="center"
            wrap="wrap"
            gap={6}
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid #1e293b",
              backgroundColor: "rgba(15, 23, 42, 0.65)",
            }}
          >
            {/* Toggle Single */}
            <Flex align="center" gap={4}>
              <Box
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  backgroundColor: isPs ? "#2563eb" : "#16a34a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 900,
                  color: "#fff",
                }}
              >
                {primaryBtnName}
              </Box>
              <Text style={{ fontSize: 10.5, fontWeight: 700, color: "#cbd5e1" }}>
                TOGGLE ITEM
              </Text>
            </Flex>

            {/* Close / Hide Filter Menu with Square / X */}
            <Flex align="center" gap={4}>
              <Box
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  backgroundColor: isPs ? "#9333ea" : "#2563eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 900,
                  color: "#fff",
                }}
              >
                {squareBtnName}
              </Box>
              <Text style={{ fontSize: 10.5, fontWeight: 700, color: "#cbd5e1" }}>
                CLOSE / HIDE
              </Text>
            </Flex>

            {/* Toggle All */}
            <Flex align="center" gap={4}>
              <Box
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  backgroundColor: isPs ? "#e11d48" : "#eab308",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 900,
                  color: isPs ? "#fff" : "#000",
                }}
              >
                {secondaryBtnName}
              </Box>
              <Text style={{ fontSize: 10.5, fontWeight: 700, color: "#cbd5e1" }}>
                ALL ON/OFF
              </Text>
            </Flex>
          </Flex>

          {/* Categories & Groups List */}
          <ScrollArea style={{ maxHeight: "54vh", padding: "8px 10px" }}>
            <Flex direction="column" gap={3}>
              {navigableItems.map((item, idx) => {
                const isSelected = idx === selectedItemIndex;

                if (item.type === "map") {
                  const isCurrentActive = item.mapItem.slug === currentMapSlug;
                  return (
                    <UnstyledButton
                      key={item.id}
                      id={`gamepad-filter-item-${idx}`}
                      onClick={() => {
                        setSelectedItemIndex(idx);
                        onSelectMap?.(item.mapItem.slug);
                        setShowCategoryMenu(false);
                      }}
                      style={{
                        padding: "7px 12px",
                        borderRadius: 6,
                        marginBottom: 4,
                        backgroundColor: isSelected
                          ? "rgba(59, 130, 246, 0.25)"
                          : isCurrentActive
                            ? "rgba(30, 41, 59, 0.7)"
                            : "transparent",
                        border: `1px solid ${
                          isSelected
                            ? "#60a5fa"
                            : isCurrentActive
                              ? "#3b82f6"
                              : "rgba(255,255,255,0.05)"
                        }`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all 0.12s ease",
                      }}
                    >
                      <Flex align="center" gap={8}>
                        <Layers size={14} color={isCurrentActive ? "#60a5fa" : "#94a3b8"} />
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: isCurrentActive ? "#60a5fa" : "#e2e8f0",
                            textTransform: "uppercase",
                          }}
                        >
                          {item.mapItem.title}
                        </Text>
                      </Flex>

                      <Flex align="center" gap={6}>
                        <Badge
                          size="xs"
                          variant="filled"
                          color={isCurrentActive ? "blue" : "dark"}
                          style={{ fontSize: 9, height: 18, padding: "0 6px" }}
                        >
                          {isCurrentActive ? "ACTIVE MAP" : "SELECT MAP"}
                        </Badge>

                        {isSelected && (
                          <Box
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              backgroundColor: isPs ? "#2563eb" : "#16a34a",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              fontWeight: 900,
                              color: "#ffffff",
                            }}
                          >
                            {primaryBtnName}
                          </Box>
                        )}
                      </Flex>
                    </UnstyledButton>
                  );
                }

                if (item.type === "action") {
                  const isHideFound = item.actionType === "hide_found";
                  return (
                    <UnstyledButton
                      key={item.id}
                      id={`gamepad-filter-item-${idx}`}
                      onClick={() => {
                        setSelectedItemIndex(idx);
                        if (isHideFound) {
                          onToggleHideFound?.();
                          showToast(!hideFound ? "FOUND MARKERS: HIDDEN" : "FOUND MARKERS: VISIBLE");
                        }
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        marginBottom: 4,
                        backgroundColor: isSelected
                          ? "rgba(229, 185, 95, 0.25)"
                          : "rgba(30, 41, 59, 0.7)",
                        border: `1px solid ${
                          isSelected ? "#e5b95f" : hideFound ? "#ca8a04" : "#1e293b"
                        }`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all 0.12s ease",
                      }}
                    >
                      <Flex align="center" gap={8}>
                        {hideFound ? (
                          <EyeOff size={15} color="#e5b95f" />
                        ) : (
                          <Eye size={15} color="#22c55e" />
                        )}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            letterSpacing: 0.6,
                            color: hideFound ? "#e5b95f" : "#ffffff",
                            textTransform: "uppercase",
                          }}
                        >
                          {item.title}
                        </Text>
                      </Flex>

                      <Flex align="center" gap={6}>
                        <Badge
                          size="xs"
                          variant="filled"
                          color={hideFound ? "yellow" : "green"}
                          style={{ fontSize: 9, height: 18, padding: "0 6px" }}
                        >
                          {hideFound ? "FOUND HIDDEN" : "FOUND VISIBLE"}
                        </Badge>

                        {isSelected && (
                          <Box
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              backgroundColor: isPs ? "#2563eb" : "#16a34a",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              fontWeight: 900,
                              color: "#ffffff",
                            }}
                          >
                            {primaryBtnName}
                          </Box>
                        )}
                      </Flex>
                    </UnstyledButton>
                  );
                }

                if (item.type === "group") {
                  const isAnyVisible = item.categories.some(
                    (c) => categoryState[String(c.id)] !== false
                  );
                  const isAllVisible = item.categories.every(
                    (c) => categoryState[String(c.id)] !== false
                  );

                  return (
                    <UnstyledButton
                      key={item.id}
                      id={`gamepad-filter-item-${idx}`}
                      onClick={() => {
                        setSelectedItemIndex(idx);
                        onToggleGroupCategories?.(item.categories);
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 6,
                        marginTop: idx > 0 ? 8 : 2,
                        marginBottom: 2,
                        backgroundColor: isSelected
                          ? "rgba(14, 165, 233, 0.22)"
                          : "rgba(15, 23, 42, 0.8)",
                        border: `1px solid ${
                          isSelected ? "#38bdf8" : "#1e293b"
                        }`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all 0.12s ease",
                      }}
                    >
                      <Flex align="center" gap={8}>
                        <Folder size={14} color="#38bdf8" />
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: 800,
                            letterSpacing: 0.6,
                            color: "#38bdf8",
                            textTransform: "uppercase",
                          }}
                        >
                          {item.title} GROUP ({item.categories.length})
                        </Text>
                      </Flex>

                      <Flex align="center" gap={6}>
                        <Badge
                          size="xs"
                          variant="filled"
                          color={isAllVisible ? "green" : isAnyVisible ? "yellow" : "dark"}
                          style={{ fontSize: 9, height: 18, padding: "0 6px" }}
                        >
                          {isAllVisible ? "ALL VISIBLE" : isAnyVisible ? "PARTIAL" : "GROUP HIDDEN"}
                        </Badge>

                        {isSelected && (
                          <Box
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              backgroundColor: isPs ? "#2563eb" : "#16a34a",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              fontWeight: 900,
                              color: "#ffffff",
                            }}
                          >
                            {primaryBtnName}
                          </Box>
                        )}
                      </Flex>
                    </UnstyledButton>
                  );
                }

                const cat = item.category;
                const isVisible = categoryState[String(cat.id)] !== false;
                const color = cat.color || cat.icon_color || "#38bdf8";

                return (
                  <UnstyledButton
                    key={item.id}
                    id={`gamepad-filter-item-${idx}`}
                    onClick={() => {
                      setSelectedItemIndex(idx);
                      onToggleCategory?.(cat.id);
                    }}
                    style={{
                      padding: "6px 12px 6px 20px",
                      borderRadius: 6,
                      backgroundColor: isSelected
                        ? "rgba(56, 189, 248, 0.18)"
                        : "transparent",
                      border: `1px solid ${
                        isSelected ? "#38bdf8" : "rgba(255,255,255,0.03)"
                      }`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "all 0.12s ease",
                    }}
                  >
                    <Flex align="center" gap={10}>
                      <CategoryIcon
                        category={cat}
                        spriteMap={spriteMap}
                        spriteImgUrl={spriteImgUrl}
                        spriteWidth={spriteWidth}
                        spriteHeight={spriteHeight}
                        isVisible={isVisible}
                        size={20}
                      />
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          color: isVisible ? "#ffffff" : "#64748b",
                        }}
                      >
                        {cat.title}
                      </Text>
                    </Flex>

                    <Flex align="center" gap={6}>
                      <Badge
                        size="xs"
                        variant="filled"
                        color={isVisible ? "green" : "dark"}
                        style={{ fontSize: 9, height: 17, padding: "0 6px" }}
                      >
                        {isVisible ? "VISIBLE" : "HIDDEN"}
                      </Badge>

                      {isSelected && (
                        <Box
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            backgroundColor: isPs ? "#2563eb" : "#16a34a",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 9,
                            fontWeight: 900,
                            color: "#ffffff",
                          }}
                        >
                          {primaryBtnName}
                        </Box>
                      )}
                    </Flex>
                  </UnstyledButton>
                );
              })}
            </Flex>
          </ScrollArea>
        </Box>
      )}

      {/* Bottom Gamepad HUD Controls Bar */}
      <Flex
        justify="center"
        align="center"
        style={{
          position: "absolute",
          bottom: isOverlay ? 14 : 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          pointerEvents: "none",
          maxWidth: "96vw",
          whiteSpace: "nowrap",
        }}
      >
        <Flex
          align="center"
          gap={isOverlay ? 8 : "md"}
          style={{
            backgroundColor: "rgba(6, 9, 15, 0.94)",
            border: "1px solid #1e293b",
            borderRadius: 24,
            padding: isOverlay ? "5px 12px" : "6px 14px",
            boxShadow: "0 6px 24px rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(12px)",
            flexWrap: "nowrap",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {/* Move Slow (LS) */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                padding: "1px 5px",
                borderRadius: 4,
                backgroundColor: "#1e293b",
                fontSize: 10,
                fontWeight: 800,
                color: "#cbd5e1",
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              LS
            </Box>
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", whiteSpace: "nowrap" }}>
              Slow
            </Text>
          </Flex>

          {/* Move Fast (RS) */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                padding: "1px 5px",
                borderRadius: 4,
                backgroundColor: "#1e293b",
                fontSize: 10,
                fontWeight: 800,
                color: "#38bdf8",
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              RS
            </Box>
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", whiteSpace: "nowrap" }}>
              Fast
            </Text>
          </Flex>

          {/* Zoom */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                padding: "1px 5px",
                borderRadius: 4,
                backgroundColor: "#1e293b",
                fontSize: 10,
                fontWeight: 800,
                color: "#cbd5e1",
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              {zoomOutTriggerName}/{zoomInTriggerName}
            </Box>
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", whiteSpace: "nowrap" }}>
              Zoom
            </Text>
          </Flex>

          {/* D-Pad Scroll / Ref Navigation */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                padding: "1px 5px",
                borderRadius: 4,
                backgroundColor: "#1e293b",
                fontSize: 10,
                fontWeight: 800,
                color: "#93c5fd",
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              D-Pad
            </Box>
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#93c5fd", whiteSpace: "nowrap" }}>
              Scroll/Ref
            </Text>
          </Flex>

          {/* Inspect Marker */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                width: 17,
                height: 17,
                borderRadius: "50%",
                backgroundColor: isPs ? "#2563eb" : "#16a34a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 900,
                color: "#ffffff",
                flexShrink: 0,
              }}
            >
              {primaryBtnName}
            </Box>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: targetedMarker ? "#4ade80" : "#94a3b8",
                whiteSpace: "nowrap",
              }}
            >
              Details
            </Text>
          </Flex>

          {/* Mark Found */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                width: 17,
                height: 17,
                borderRadius: "50%",
                backgroundColor: isPs ? "#e11d48" : "#eab308",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 900,
                color: isPs ? "#ffffff" : "#000000",
                flexShrink: 0,
              }}
            >
              {secondaryBtnName}
            </Box>
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", whiteSpace: "nowrap" }}>
              Found
            </Text>
          </Flex>

          {/* Filter Modal Toggle via Square / X */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                width: 17,
                height: 17,
                borderRadius: "50%",
                backgroundColor: isPs ? "#9333ea" : "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 900,
                color: "#ffffff",
                flexShrink: 0,
              }}
            >
              {squareBtnName}
            </Box>
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", whiteSpace: "nowrap" }}>
              Filters
            </Text>
          </Flex>

          {/* Hide Found Quick Hint */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                padding: "1px 5px",
                borderRadius: 4,
                backgroundColor: hideFound ? "#ca8a04" : "#1e293b",
                fontSize: 10,
                fontWeight: 800,
                color: hideFound ? "#ffffff" : "#cbd5e1",
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              L3
            </Box>
            <Text
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: hideFound ? "#facc15" : "#94a3b8",
                whiteSpace: "nowrap",
              }}
            >
              {hideFound ? "Found Hidden" : "Hide Found"}
            </Text>
          </Flex>

          {/* Quick Filter Menu Button */}
          <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
            <Box
              style={{
                padding: "1px 5px",
                borderRadius: 4,
                backgroundColor: "#1e293b",
                fontSize: 10,
                fontWeight: 800,
                color: "#cbd5e1",
                fontFamily: "monospace",
                flexShrink: 0,
              }}
            >
              {viewBtnName}
            </Box>
            <Text style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", whiteSpace: "nowrap" }}>
              Filters
            </Text>
          </Flex>

          {/* Switch Map (LB / RB) when multi-map available */}
          {availableMaps && availableMaps.length > 1 && (
            <Flex align="center" gap={4} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
              <Box
                style={{
                  padding: "1px 5px",
                  borderRadius: 4,
                  backgroundColor: "#1e293b",
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#60a5fa",
                  fontFamily: "monospace",
                  flexShrink: 0,
                }}
              >
                {isPs ? "L1/R1" : "LB/RB"}
              </Box>
              <Text style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", whiteSpace: "nowrap" }}>
                Map
              </Text>
            </Flex>
          )}
        </Flex>
      </Flex>
    </>
  );
}
