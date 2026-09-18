"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Modal,
  Box,
  Group,
  TextInput,
  ActionIcon,
  Tooltip,
  Text,
  Badge,
  Loader,
  Paper,
  Stack,
  Collapse,
  Textarea,
  Button,
  Menu,
  Divider,
} from "@mantine/core";
import {
  RefreshCw,
  ExternalLink,
  Code2,
  Play,
  Check,
  AlertCircle,
  Globe,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Webview } from "@tauri-apps/api/webview";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface WebviewModalProps {
  opened: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  size?: string | number;
  height?: number;
  fullScreen?: boolean;
  readOnlyUrl?: boolean;
  initializationScript?: string;
  injectedScript?: string;
  webviewLabel?: string;
  showControls?: boolean;
  closeOnClickOutside?: boolean;
}

export const WebviewModal: React.FC<WebviewModalProps> = ({
  opened,
  onClose,
  url,
  title = "Web View",
  size = "90%",
  height = 680,
  fullScreen = false,
  readOnlyUrl = false,
  initializationScript,
  injectedScript,
  webviewLabel = "modal-webview-child",
  showControls = true,
  closeOnClickOutside = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Webview | null>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [urlInput, setUrlInput] = useState(url);
  const currentUrlRef = useRef(url);
  const isInputFocusedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showJsConsole, setShowJsConsole] = useState(false);
  const [customJsCode, setCustomJsCode] = useState(
    injectedScript ||
      `// Example: Inject custom CSS and banner\nconst banner = document.createElement('div');\nbanner.id = 'tauri-injected-banner';\nbanner.style.position = 'fixed';\nbanner.style.top = '10px';\nbanner.style.right = '10px';\nbanner.style.padding = '10px 16px';\nbanner.style.background = '#228be6';\nbanner.style.color = '#fff';\nbanner.style.borderRadius = '8px';\nbanner.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';\nbanner.style.zIndex = '999999';\nbanner.style.fontWeight = 'bold';\nbanner.textContent = 'Injected from Tauri Webview Modal!';\ndocument.body.appendChild(banner);\nconsole.log('Script successfully executed!');`
  );
  const [evalStatus, setEvalStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
  }>({ type: "idle", message: "" });
  const isDev = process.env.NODE_ENV === "development";

  // Sync state if url prop changes
  useEffect(() => {
    currentUrlRef.current = url;
    setCurrentUrl(url);
    setUrlInput(url);
  }, [url]);

  // Continuously track live URL changes from the child webview
  useEffect(() => {
    if (!opened) return;

    const interval = setInterval(async () => {
      try {
        const liveUrl = await invoke<string>("get_webview_url", {
          label: webviewLabel,
        });
        if (liveUrl && liveUrl.trim() !== "" && liveUrl !== "about:blank") {
          if (liveUrl !== currentUrlRef.current) {
            currentUrlRef.current = liveUrl;
            setCurrentUrl(liveUrl);
            if (!isInputFocusedRef.current) {
              setUrlInput(liveUrl);
            }
          }
        }
      } catch {
        // Ignored when webview is initializing or tearing down
      }
    }, 300);

    return () => {
      clearInterval(interval);
    };
  }, [opened, webviewLabel]);

  useEffect(() => {
    if (injectedScript) {
      setCustomJsCode(injectedScript);
    }
  }, [injectedScript]);

  // Execute JavaScript in the child webview
  const executeScript = useCallback(
    async (scriptToRun: string) => {
      if (!webviewRef.current && !opened) return;
      try {
        setEvalStatus({ type: "idle", message: "" });
        await invoke("eval_in_webview", {
          label: webviewLabel,
          script: scriptToRun,
        });
        setEvalStatus({
          type: "success",
          message: "Script executed successfully!",
        });
        setTimeout(() => setEvalStatus({ type: "idle", message: "" }), 4000);
      } catch (err: any) {
        console.error("Failed to eval script in webview:", err);
        setEvalStatus({
          type: "error",
          message: String(err?.message || err || "Script execution failed"),
        });
      }
    },
    [webviewLabel, opened]
  );

  // Sync position & size of child webview with DOM element
  const updateWebviewBounds = useCallback(() => {
    if (!containerRef.current) return;
    try {
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.round(rect.left));
      const y = Math.max(0, Math.round(rect.top));
      const width = Math.max(10, Math.round(rect.width));
      const webviewHeight = Math.max(10, Math.round(rect.height));

      invoke("set_webview_bounds", {
        label: webviewLabel,
        x,
        y,
        width,
        height: webviewHeight,
      }).catch(() => {});
    } catch (e) {
      console.warn("Could not update webview bounds:", e);
    }
  }, [webviewLabel]);

  const handleClose = useCallback(() => {
    if (webviewRef.current) {
      webviewRef.current.hide().catch(() => {});
      webviewRef.current.close().catch(() => {});
      webviewRef.current = null;
    }
    invoke("close_webview", { label: webviewLabel }).catch(() => {});
    onClose();
  }, [webviewLabel, onClose]);

  // Initialize and attach child webview
  useEffect(() => {
    let isCancelled = false;

    if (!opened) {
      if (webviewRef.current) {
        webviewRef.current.hide().catch(() => {});
        webviewRef.current.close().catch(() => {});
        webviewRef.current = null;
      }
      invoke("close_webview", { label: webviewLabel }).catch(() => {});
      setIsLoading(true);
      return;
    }

    const initWebview = async () => {
      if (!containerRef.current || isCancelled) return;

      // Close any existing webview with same label first
      try {
        await invoke("close_webview", { label: webviewLabel });
      } catch {}

      if (isCancelled || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.round(rect.left));
      const y = Math.max(0, Math.round(rect.top));
      const width = Math.max(10, Math.round(rect.width));
      const webviewHeight = Math.max(10, Math.round(rect.height));

      const currentWin = getCurrentWindow();

      try {
        const wv = new Webview(currentWin, webviewLabel, {
          url: currentUrl,
          x,
          y,
          width,
          height: webviewHeight,
          focus: true,
        });

        webviewRef.current = wv;

        wv.once("tauri://created", async () => {
          if (isCancelled) return;
          setIsLoading(false);

          // If injectedScript or initializationScript is provided, run it once ready
          const scriptToInject = injectedScript || initializationScript;
          if (scriptToInject) {
            setTimeout(() => {
              executeScript(scriptToInject);
            }, 800);
          }
        });

        wv.once("tauri://error", (e) => {
          console.error("Error creating child webview:", e);
          setIsLoading(false);
        });
      } catch (err) {
        console.error("Failed to construct child webview:", err);
        setIsLoading(false);
      }
    };

    // Delay slightly to let Mantine modal transition finish positioning in DOM
    const timer = setTimeout(() => {
      initWebview();
    }, 200);

    // Watch for window resize and DOM container resize
    const handleResize = () => {
      requestAnimationFrame(updateWebviewBounds);
    };

    window.addEventListener("resize", handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(updateWebviewBounds);
      });
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      isCancelled = true;
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (webviewRef.current) {
        webviewRef.current.hide().catch(() => {});
        webviewRef.current.close().catch(() => {});
        webviewRef.current = null;
      }
      invoke("close_webview", { label: webviewLabel }).catch(() => {});
    };
  }, [
    opened,
    currentUrl,
    webviewLabel,
    injectedScript,
    initializationScript,
    updateWebviewBounds,
    executeScript,
  ]);

  // Synchronize webview position when JS console is toggled
  useEffect(() => {
    if (!opened || !webviewRef.current) return;
    const update = () => {
      updateWebviewBounds();
    };
    update();
    const frame = requestAnimationFrame(update);
    const t1 = setTimeout(update, 50);
    const t2 = setTimeout(update, 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [showJsConsole, opened, updateWebviewBounds]);

  const handleNavigate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (readOnlyUrl) return;
    let target = urlInput.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = "https://" + target;
    }
    currentUrlRef.current = target;
    setCurrentUrl(target);
    setUrlInput(target);
    if (webviewRef.current) {
      invoke("eval_in_webview", {
        label: webviewLabel,
        script: `window.location.href = ${JSON.stringify(target)};`,
      }).catch(() => {});
    }
  };

  const handleReload = () => {
    if (webviewRef.current) {
      invoke("eval_in_webview", {
        label: webviewLabel,
        script: `window.location.reload();`,
      }).catch(() => {});
    }
  };

  const handleOpenExternal = async () => {
    try {
      await openUrl(currentUrlRef.current || currentUrl);
    } catch (e) {
      console.error("Failed to open external url:", e);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size={size}
      fullScreen={fullScreen}
      title={
        <Group gap="xs">
          <Globe size={18} color="var(--mantine-color-blue-5)" />
          <Text fw={600} size="md">
            {title}
          </Text>
          <Badge size="xs" variant="light" color="blue">
            Native Webview
          </Badge>
        </Group>
      }
      styles={{
        content: {
          height: fullScreen ? "100vh" : "85vh",
          maxHeight: fullScreen ? "100vh" : "900px",
          display: "flex",
          flexDirection: "column",
        },
        body: {
          flex: 1,
          padding: fullScreen ? "10px 14px 14px 14px" : "12px 16px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          overflow: "hidden",
        },
      }}
      centered
      trapFocus={false}
      closeOnClickOutside={closeOnClickOutside}
      overlayProps={{
        onClick: (e) => {
          e.stopPropagation();
          if (closeOnClickOutside) {
            handleClose();
          }
        },
        onMouseDown: (e) => e.stopPropagation(),
        onMouseUp: (e) => e.stopPropagation(),
      }}
    >
      <Stack
        gap="xs"
        style={{ flex: 1, height: "100%", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {showControls && (
          <Paper
            p="xs"
            withBorder
            radius="md"
            bg="var(--mantine-color-default-hover)"
            style={{ flexShrink: 0 }}
          >
            <Stack gap="xs">
              <Group gap="xs" wrap="nowrap">
                <form
                  onSubmit={handleNavigate}
                  style={{ flex: 1, display: "flex" }}
                >
                  <TextInput
                    size="xs"
                    value={urlInput}
                    readOnly={readOnlyUrl}
                    onFocus={() => {
                      isInputFocusedRef.current = true;
                    }}
                    onBlur={() => {
                      isInputFocusedRef.current = false;
                    }}
                    onChange={(e) => {
                      if (!readOnlyUrl) {
                        setUrlInput(e.currentTarget.value);
                      }
                    }}
                    placeholder={
                      readOnlyUrl
                        ? "Live URL"
                        : "Enter URL (e.g. https://example.com)..."
                    }
                    style={{ flex: 1 }}
                    styles={{
                      input: {
                        cursor: readOnlyUrl ? "default" : "text",
                        userSelect: "all",
                        opacity: readOnlyUrl ? 0.9 : 1,
                      },
                    }}
                    rightSection={
                      <Tooltip label="Reload">
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={handleReload}
                        >
                          <RefreshCw size={13} />
                        </ActionIcon>
                      </Tooltip>
                    }
                  />
                </form>

                <Tooltip label="Open in External Browser">
                  <ActionIcon
                    variant="default"
                    size="sm"
                    radius="md"
                    onClick={handleOpenExternal}
                  >
                    <ExternalLink size={15} />
                  </ActionIcon>
                </Tooltip>

                {isDev && (
                  <Tooltip label="Toggle JS Injection Console">
                    <ActionIcon
                      variant={showJsConsole ? "filled" : "light"}
                      color="violet"
                      size="sm"
                      radius="md"
                      onClick={() => {
                        setShowJsConsole(!showJsConsole);
                      }}
                    >
                      <Code2 size={15} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Group>

              {/* JS Injection Console */}
              {isDev && showJsConsole && (
                <Paper
                  p="xs"
                  radius="md"
                  withBorder
                  bg="var(--mantine-color-body)"
                  mt={4}
                >
                  <Stack gap="xs">
                    <Group justify="space-between" align="center">
                      <Group gap="xs">
                        <Code2 size={14} color="var(--mantine-color-violet-5)" />
                        <Text size="xs" fw={600}>
                          Live JavaScript Injection
                        </Text>
                      </Group>
                      <Button
                        size="compact-xs"
                        color="violet"
                        leftSection={<Play size={12} />}
                        onClick={() => executeScript(customJsCode)}
                      >
                        Run Script
                      </Button>
                    </Group>

                    <Textarea
                      size="xs"
                      rows={3}
                      value={customJsCode}
                      onChange={(e) => setCustomJsCode(e.currentTarget.value)}
                      placeholder="Enter JavaScript to execute inside the website..."
                      styles={{
                        input: {
                          fontFamily: "monospace",
                          fontSize: "12px",
                        },
                      }}
                    />

                    {evalStatus.message && (
                      <Group gap="xs">
                        {evalStatus.type === "success" ? (
                          <Check size={14} color="var(--mantine-color-green-5)" />
                        ) : (
                          <AlertCircle
                            size={14}
                            color="var(--mantine-color-red-5)"
                          />
                        )}
                        <Text
                          size="xs"
                          c={evalStatus.type === "success" ? "green" : "red"}
                        >
                          {evalStatus.message}
                        </Text>
                      </Group>
                    )}
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Paper>
        )}

        {/* Webview Container Overlay Target */}
        <Box
          ref={containerRef}
          style={{
            flex: 1,
            width: "100%",
            minHeight: "250px",
            borderRadius: "8px",
            overflow: "hidden",
            position: "relative",
            backgroundColor: "var(--mantine-color-body)",
            border: "1px solid var(--mantine-color-default-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isLoading && (
            <Stack align="center" gap="xs">
              <Loader size="sm" color="blue" />
              <Text size="xs" c="dimmed">
                Loading Webview...
              </Text>
            </Stack>
          )}
        </Box>
      </Stack>
    </Modal>
  );
};
