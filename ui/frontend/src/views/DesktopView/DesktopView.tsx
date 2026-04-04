import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import axios from "axios";
import {
  SelectFiles,
  StartTransfer,
  GetServerInfo,
  RestartServer,
  SaveTempFile,
  GetClipboardFiles,
  GetSecureSettings,
  SelectDownloadPath,
} from "../../../wailsjs/go/main/App";
import { main } from "../../../wailsjs/go/models";
import {
  WindowMinimise,
  WindowToggleMaximise,
  Quit,
  OnFileDrop,
  OnFileDropOff,
  BrowserOpenURL,
  WindowIsMaximised,
} from "../../../wailsjs/runtime/runtime";
import { useTransactions } from "../../hooks/useTransactions";
import { formatBytes } from "../../utils/format";
import { useDevices, type Client } from "../../hooks/useDevices";
import {
  hasUserReviewed,
  markAsReviewed,
  useActivity,
} from "../../hooks/useActivity";
import { useShareTarget } from "../../hooks/useShareTarget";
import {
  X,
  MessageSquare,
  Upload,
  Minus,
  Maximize2,
  Minimize2,
  QrCode,
  Settings,
} from "lucide-react";
import logo from "../../assets/images/appicon.png";
import { ChatPanel } from "./ChatPanel";
import { SettingsPanel } from "./SettingsPanel";
import { QRPanel } from "./QRPanel";
import { ReferralFeedbackModal } from "../../components/ReferralFeedbackModal";
import { FeatureRequestForm } from "./FeatureRequestForm";
import { APP_VERSION } from "../../version";

import { ACCENT_COLORS, THEME_PRESETS } from "../../themeConstants";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useTranslation } from "../../hooks/useTranslation";

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      } else {
        reject(new Error("Failed to read blob"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const DesktopView = () => {
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [serverInfo, setServerInfo] = useState<main.ServerInfo | null>(null);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
  }>({ show: false, message: "" });
  const [isCheckingNetwork, setIsCheckingNetwork] = useState(false);
  const [transactionToCancel, setTransactionToCancel] = useState<any>(null); // Use any or specific type if available

  const [reviewActionCount, setReviewActionCount] = useState<number>(() => {
    const value = localStorage.getItem("peerhop_review_action_count");
    const parsed = Number(value ?? "0");
    return Number.isNaN(parsed) ? 0 : parsed;
  });

  const [reviewRequested, setReviewRequested] = useState<boolean>(
    localStorage.getItem("peerhop_review_requested") === "true",
  );

  const [iframeHeight, setIframeHeight] = useState<string | number | undefined>(
    "55px",
  );
  const [iframIsLoaded, setIframeIsLoaded] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [userEmail, setUserEmail] = useState<string>(
    localStorage.getItem("userEmail") || "",
  );
  const [isFeatureDrawerOpen, setFeatureDrawerOpen] = useState(false);
  const { t, lang } = useTranslation();

  const adRef = useRef<HTMLIFrameElement>(null);

  const { logActivity } = useActivity(adRef);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "open-external") {
        BrowserOpenURL(event.data.url);
      } else if (event.data?.type === "set-iframe-height") {
        setIframeHeight(event.data.height);
      } else if (event.data?.type === "iframe-is-loaded") {
        setIframeIsLoaded(true);
      }
    };

    window.addEventListener("message", handler);

    return () => window.removeEventListener("message", handler);
  }, []);

  // Wails Native File Drop Handler
  useEffect(() => {
    OnFileDrop(async (x, y, paths) => {
      setIsDragging(false);
      try {
        if (paths && paths.length > 0) {
          setFilePaths(paths);
          isUserAtBottomRef.current = true;
          const info = await StartTransfer(paths);
          setServerInfo(info);
          logActivity(
            "sent",
            `[FILE DROP] Sharing file(s) (Count: ${paths?.length}, Size: ${formatBytes(info.size)}), Files:: ${info.filename}`,
          );
        }
      } catch (err) {
        console.error("OnFileDrop error:", err);
      }
    }, false); // false = Global drop listener (ignore CSS drop target)

    return () => {
      OnFileDropOff();
    };
  }, [logActivity]);

  // Sync maximization state
  useEffect(() => {
    const handleResize = () => {
      WindowIsMaximised().then(setIsMaximized).catch(console.error);
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial check

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  // Drag and Drop Handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // We only want to hide the overlay if we're actually leaving the container,
    // not just moving over a child element.
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (
      x <= rect.left ||
      x >= rect.right ||
      y <= rect.top ||
      y >= rect.bottom
    ) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    // Removed e.stopPropagation() to allow event to bubble to Wails handler if needed
    setIsDragging(false);

    // Handle Text Drop
    const droppedText = e.dataTransfer.getData("text");
    if (droppedText && droppedText.trim()) {
      try {
        await sendText(droppedText, "server");
      } catch (err) {
        console.error("Failed to send dropped text:", err);
      }
      return;
    }

    // Files are handled by Wails OnFileDrop (native)
  };

  // Prevent default browser behavior for drag/drop on the whole window
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      if (e.dataTransfer) {
        // e.dataTransfer.dropEffect = "copy";
      }
      e.preventDefault();
    };

    window.addEventListener("dragover", preventDefault);
    window.addEventListener("drop", preventDefault);

    return () => {
      window.removeEventListener("dragover", preventDefault);
      window.removeEventListener("drop", preventDefault);
    };
  }, []);

  // UI States - Load theme from localStorage
  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    return localStorage.getItem("themeId") || "classic";
  });

  // Set axios base URL when server info is available
  useEffect(() => {
    if (serverInfo?.url) {
      axios.defaults.baseURL = serverInfo.url;
    }
  }, [serverInfo?.url]);
  const [activeAccentId, setActiveAccentId] = useState<string>(() => {
    return localStorage.getItem("accentId") || "sky";
  });

  const activeTheme =
    THEME_PRESETS.find((t) => t.id === activeThemeId) || THEME_PRESETS[3];
  const activeAccent =
    ACCENT_COLORS.find((a) => a.id === activeAccentId) || ACCENT_COLORS[0];
  const isDarkMode = activeTheme.isDark; // Derived state
  // Tab system: 'chat' | 'qr' | 'settings'
  const [activeTab, setActiveTab] = useState<"chat" | "qr" | "settings">("qr");

  // Connection method tab state (persists across activeTab changes)
  const [showQR, setShowQR] = useState(true);
  const [showLink, setShowLink] = useState(false);

  // Settings - Load from localStorage
  const [textTransferEnabled, setTextTransferEnabled] = useState(() => {
    const saved = localStorage.getItem("textTransferEnabled");
    return saved !== null ? saved === "true" : false; // Default to false
  });

  const [securityEnabled, setSecurityEnabled] = useState(() => {
    const saved = localStorage.getItem("securityEnabled");
    // Default to true if not set
    return saved !== null ? saved === "true" : true;
  });

  const [staticPortEnabled, setStaticPortEnabled] = useState(() => {
    const saved = localStorage.getItem("staticPortEnabled");
    return saved !== null ? saved === "true" : false;
  });

  const [staticPort, setStaticPort] = useState<number>(() => {
    const saved = localStorage.getItem("staticPort");
    const parsed = Number(saved);
    return saved && !Number.isNaN(parsed) && parsed > 0 ? parsed : 9090;
  });

  const [downloadPath, setDownloadPath] = useState<string>(
    localStorage.getItem("downloadPath") || "",
  );

  const [securityToken, setSecurityToken] = useState<string>("");
  const [adminToken, setAdminToken] = useState<string>("");

  // Scroll and Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  // Hook: WebSocket for transactions
  const { transactions, sendText, deleteTransaction, deviceName } =
    useTransactions(
      2000,
      serverInfo?.url,
      false,
      true,
      adminToken, // Desktop uses admin token
      securityEnabled,
      logActivity,
    );

  // Hook: WebSocket for devices/clients
  // Get clients list - Pass admin token for desktop client tracking/UI
  const { clients } = useDevices(serverInfo?.url, true, adminToken);
  // Speed is calculated inline using calculateSpeed helper

  // Hook: Windows Share Target
  useShareTarget(async (data) => {
    if (data.files && data.files.length > 0) {
      setFilePaths(data.files);
      const info = await StartTransfer(data.files);
      setServerInfo(info);
      logActivity(
        "sent",
        `[SHARE TARGET] Sharing file(s) (Count: ${data.files?.length}, Size: ${formatBytes(info.size)}), Files:: ${info.filename}`,
      );
    } else if (data.text || data.url) {
      const content = data.text || data.url;
      await sendText(content, "server");
      logActivity(
        "sent",
        `[SHARE TARGET] Shared via Windows: ${content.substring(0, 30)}...`,
      );
    }
  });

  // Track previously-seen transaction statuses so we only log once per completion
  const prevTransactionStatuses = useRef<Record<number, string>>({});

  // Log sent / received when a transaction first reaches "completed"
  useEffect(() => {
    transactions.forEach((txn) => {
      const prev = prevTransactionStatuses.current[txn.id];
      if (txn.status === "completed" && prev !== "completed") {
        const isMe = txn.senderId === "server";
        if (txn.type === "file") {
          const sizeLabel = txn.fileSize
            ? ` (${formatBytes(txn.fileSize)})`
            : "";
          if (isMe) {
            logActivity(
              "sending_completed",
              `Sent ${txn.filename || "file"}${sizeLabel}`,
            );
          } else {
            logActivity(
              "receiving_completed",
              `Received ${txn.filename || "file"}${sizeLabel}`,
            );
          }
        } else if (txn.type === "text") {
          const charCount = txn.textContent?.length || 0;
          if (isMe) {
            logActivity(
              "sending_completed",
              `Sent ${charCount} characters text`,
            );
          } else {
            logActivity(
              "receiving_completed",
              `Received ${charCount} characters text`,
            );
          }
        }

        if (!reviewRequested) {
          const nextCount = Math.min(9999, reviewActionCount + 1);
          localStorage.setItem(
            "peerhop_review_action_count",
            String(nextCount),
          );
          setReviewActionCount(nextCount);
        }
      }
      prevTransactionStatuses.current[txn.id] = txn.status;
    });
  }, [transactions, logActivity, reviewActionCount, reviewRequested]);

  // Log app session start / end
  useEffect(() => {
    logActivity(
      "started",
      `PeerHop v${APP_VERSION}, device name: ${deviceName}`,
    );
    return () => {
      logActivity("closed", "App session ended");
    };
  }, [logActivity]);

  const handleFileOpened = useCallback(
    (filename: string) => {
      logActivity("opened", `Opened ${filename}`);
    },
    [logActivity],
  );

  const handleBlockClient = async (client: Client) => {
    if (!serverInfo?.url) return;
    try {
      const url = adminToken
        ? `${serverInfo.url}/api/${
            client.blocked ? "unblock" : "block"
          }-client?admin=${adminToken}`
        : `${serverInfo.url}/api/${
            client.blocked ? "unblock" : "block"
          }-client`;
      await axios.post(url, { ip: client.ip });
      logActivity(
        "blocked",
        `${client.blocked ? "Unblocked" : "Blocked"} device: ${client.name || client.platform} (${client.ip})`,
      );
    } catch (err) {
      console.error("Failed to block/unblock client:", err);
    }
  };

  const handleBlockSending = async (client: Client) => {
    if (!serverInfo?.url) return;
    try {
      const url = adminToken
        ? `${serverInfo.url}/api/${
            client.sendingBlocked ? "unblock" : "block"
          }-sending?admin=${adminToken}`
        : `${serverInfo.url}/api/${
            client.sendingBlocked ? "unblock" : "block"
          }-sending`;
      await axios.post(url, { ip: client.ip });
      logActivity(
        "blocked",
        `${client.sendingBlocked ? "Unblocked sending from" : "Blocked sending from"} from: ${client.name || client.platform} (${client.ip})`,
      );
    } catch (err) {
      console.error("Failed to block/unblock sending for client:", err);
    }
  };
  const handleUpdateDesktopName = async (name: string) => {
    if (!serverInfo?.url) return;
    try {
      const url = adminToken
        ? `${serverInfo.url}/api/desktop-name?admin=${adminToken}`
        : `${serverInfo.url}/api/desktop-name`;
      await axios.post(url, { name: name.trim() });
      logActivity("settings_changed", `Desktop name changed to: ${name}`);
    } catch (err) {
      console.error("Failed to update desktop name:", err);
    }
  };

  const storeProductId =
    (import.meta.env.VITE_STORE_PRODUCT_ID as string | undefined) ||
    "9N5VVVHD710V";
  const canPromptReview = !reviewRequested && reviewActionCount >= 5;

  const triggerReviewFlow = async () => {
    try {
      await (window as any).go.main.App.RequestReview();
    } catch (err) {
      console.warn(
        "RequestReview call failed, opening Store URL fallback:",
        err,
      );
      BrowserOpenURL(
        `ms-windows-store://review/?ProductId=${encodeURIComponent(storeProductId)}`,
      );
    } finally {
      localStorage.setItem("peerhop_review_requested", "true");
      setReviewRequested(true);
      markAsReviewed();
    }
  };

  // Auto-switch to chat tab (desktop/mobile) when a client connects
  useEffect(() => {
    if (clients.length > 0 && activeTab === "qr") {
      setActiveTab("chat");
    }
  }, [clients.length]);

  // Track device connect / disconnect
  const prevClientsRef = useRef<Client[]>([]);
  useEffect(() => {
    const prev = prevClientsRef.current;
    // Newly connected
    clients.forEach((c) => {
      if (!prev.find((p) => p.ip === c.ip)) {
        logActivity(
          "connected",
          `Device connected: ${c.name || c.platform} (${c.ip})`,
        );
      }
    });
    // Disconnected
    prev.forEach((c) => {
      if (!clients.find((curr) => curr.ip === c.ip)) {
        logActivity(
          "disconnected",
          `Device disconnected: ${c.name || c.platform} (${c.ip})`,
        );
      }
    });
    prevClientsRef.current = clients;
  }, [clients, logActivity]);

  const handleRestartServer = async () => {
    // 1. First cancel all in-progress transactions
    const inProgress = transactions.filter((t) => t.status === "in_progress");
    if (inProgress.length > 0) {
      await Promise.all(
        inProgress.map(async (txn) => {
          try {
            const url = adminToken
              ? `/api/cancel-transaction/${txn.id}?admin=${adminToken}`
              : `/api/cancel-transaction/${txn.id}`;
            await axios.post(url);
            logActivity(
              "cancelled",
              `${t("cancelled")} ${txn.filename || "file"} due to server restart`,
            );
          } catch (err) {
            console.error(
              `Failed to auto-cancel transaction ${txn.id} during restart:`,
              err,
            );
          }
        }),
      );
    }

    setIsCheckingNetwork(true);
    try {
      const info = await RestartServer();
      setServerInfo(info);

      // Fetch new secure settings immediately after restart
      // (Tokens are regenerated even if the URL/port is static)
      GetSecureSettings()
        .then((secure) => {
          if (secure) {
            if (secure.adminToken) setAdminToken(secure.adminToken);
            if (secure.securityToken) setSecurityToken(secure.securityToken);
          }
        })
        .catch((e) =>
          console.error("Failed to refetch tokens after restart:", e),
        );

      logActivity(
        "restarted",
        `${t("restarted")} — new URL: ${info.url || "unknown"}`,
      );

      // If SSID is missing, poll for it
      if (!info.ssid) {
        let attempts = 0;
        const checkSSID = async () => {
          if (attempts >= 4) {
            setIsCheckingNetwork(false);
            return;
          }
          setTimeout(async () => {
            try {
              const updated = await GetServerInfo();
              setServerInfo(updated);
              if (updated.ssid) {
                setIsCheckingNetwork(false);
              } else {
                attempts++;
                checkSSID();
              }
            } catch (ignore) {
              setIsCheckingNetwork(false);
            }
          }, 500);
        };
        checkSSID();
      } else {
        setIsCheckingNetwork(false);
      }
    } catch (err) {
      console.error("Failed to restart server:", err);
      setIsCheckingNetwork(false);
    }
  };

  // --- Effects ---

  useEffect(() => {
    // Initial fetch of server info on mount
    GetServerInfo().then(setServerInfo).catch(console.error);

    // Periodically refresh server info to detect network/SSID changes
    const interval = setInterval(async () => {
      try {
        const info = await GetServerInfo();
        setServerInfo(info);
      } catch (err) {
        console.error("Failed to refresh server info:", err);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Sync theme with server and save to localStorage
  useEffect(() => {
    // Save to localStorage
    localStorage.setItem("themeId", activeThemeId);
    localStorage.setItem("accentId", activeAccentId);

    if (!serverInfo?.url) return;

    // We still sync isDarkMode for basic compatibility with clients if needed
    // We still sync isDarkMode for basic compatibility with clients if needed
    const url = `${serverInfo.url}/api/theme?admin=${adminToken}`;
    axios
      .post(url, {
        isDarkMode: activeTheme.isDark,
        themeId: activeThemeId,
        accentId: activeAccentId,
      })
      .catch((e) => console.error("Failed to sync theme:", e));
  }, [activeThemeId, activeAccentId, serverInfo?.url, adminToken]);

  // Discover user email and sync to localStorage
  useEffect(() => {
    if (serverInfo?.url && adminToken) {
      axios
        .get(`${serverInfo.url}/api/user-hint?admin=${adminToken}`)
        .then((res) => {
          if (res.data?.email) {
            setUserEmail(res.data.email);
            localStorage.setItem("userEmail", res.data.email);
          }
        })
        .catch((err) => {
          console.warn("Failed to discover user email:", err);
        });
    }
  }, [serverInfo?.url, adminToken]);

  // Sync device name to localStorage for useActivity to access synchronously
  useEffect(() => {
    if (deviceName) {
      localStorage.setItem("deviceName", deviceName);
    }
  }, [deviceName]);

  // Fetch security settings from server on mount
  // Fetch security settings from server on mount
  useEffect(() => {
    // Fetch tokens securely from Wails backend (internal IPC)
    GetSecureSettings()
      .then((settings) => {
        if (settings) {
          if (settings.adminToken) setAdminToken(settings.adminToken);
          if (settings.securityToken) setSecurityToken(settings.securityToken);
          setSecurityEnabled(settings.securityEnabled);
          localStorage.setItem(
            "securityEnabled",
            String(settings.securityEnabled),
          );
        }
      })
      .catch((e) => console.error("Failed to fetch secure settings:", e));

    if (!serverInfo?.url) return;

    // Fetch other settings from API (fallback for textTransferEnabled, etc)
    axios
      .get(`${serverInfo.url}/api/settings?admin=${adminToken}`)
      .then((res) => {
        if (res.data?.downloadPath) {
          setDownloadPath(res.data.downloadPath);
          localStorage.setItem("downloadPath", res.data.downloadPath);
        }
      })
      .catch((e) => console.error("Failed to fetch settings:", e));
  }, [serverInfo?.url]);

  // Save text transfer and multi-client settings to localStorage and sync with server
  useEffect(() => {
    localStorage.setItem("textTransferEnabled", String(textTransferEnabled));

    if (!serverInfo?.url) return;

    // Send setting to server so mobile clients can receive it
    // This is an admin endpoint, so we include admin token (desktop is auto-exempted but good practice)
    const url = adminToken
      ? `${serverInfo.url}/api/settings?admin=${adminToken}`
      : `${serverInfo.url}/api/settings`;

    axios
      .post(url, {
        textTransferEnabled,
        securityEnabled,
        staticPortEnabled,
        staticPort,
        downloadPath,
      })
      .catch((e) => console.error("Failed to sync settings:", e));
  }, [
    textTransferEnabled,
    securityEnabled,
    staticPortEnabled,
    staticPort,
    downloadPath,
    serverInfo?.url,
    adminToken,
  ]);

  // Save security enabled setting to localStorage
  useEffect(() => {
    localStorage.setItem("securityEnabled", String(securityEnabled));
  }, [securityEnabled]);

  useEffect(() => {
    localStorage.setItem("downloadPath", downloadPath);
  }, [downloadPath]);

  useEffect(() => {
    if (isUserAtBottomRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [transactions, showTextInput]);

  // Handle Paste (Files/Images)
  // Handle Paste (Files/Images)
  useEffect(() => {
    const handlePaste = async (event: Event) => {
      const e = event as ClipboardEvent;
      // If user is typing in input, ignore paste
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
      )
        return;

      console.log("Paste event detected");

      // 1. EXTRACT FRONTEND FILES IMMEDIATELY (Before any async/await)
      // This is critical because DataTransferItems are only valid synchronously.
      const frontendFiles: File[] = [];
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === "file") {
            const f = items[i].getAsFile();
            if (f) frontendFiles.push(f);
          }
        }
      }

      // 2. CHECK BACKEND CLIPBOARD (For real file paths - faster/efficient)
      try {
        const clipboardFiles = await GetClipboardFiles();
        if (clipboardFiles && clipboardFiles.length > 0) {
          console.log("Pasted files detected from backend:", clipboardFiles);
          setFilePaths(clipboardFiles);
          const info = await StartTransfer(clipboardFiles);
          setServerInfo(info);
          return;
        }
      } catch (err) {
        console.warn("Failed to check backend clipboard:", err);
      }

      // 3. FALLBACK: PROCESS FRONTEND FILES (Screenshots, Browser Images, etc.)
      if (frontendFiles.length > 0) {
        const paths: string[] = [];
        const promises: Promise<void>[] = [];

        for (const file of frontendFiles) {
          promises.push(
            (async () => {
              // Check if file has a path (Electron/WebView sometimes exposes this)
              // @ts-ignore
              if (file.path) {
                // @ts-ignore
                paths.push(file.path);
              } else {
                // No path (e.g. screenshot), save to temp
                try {
                  const base64 = await blobToBase64(file);
                  let name = file.name;
                  if (!name || name === "image.png") {
                    name = `pasted_image_${Date.now()}.png`;
                  }
                  const savedPath = await SaveTempFile(name, base64);
                  paths.push(savedPath);
                } catch (err) {
                  console.error("Failed to save pasted file:", err);
                }
              }
            })(),
          );
        }

        if (promises.length > 0) {
          await Promise.all(promises);
          if (paths.length > 0) {
            try {
              setFilePaths(paths);
              const info = await StartTransfer(paths);
              setServerInfo(info);
            } catch (err) {
              console.error("Failed to send pasted files:", err);
            }
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // --- Handlers ---

  const handleMinimize = () => WindowMinimise();
  const handleMaximizeToggle = () => WindowToggleMaximise();
  const handleClose = () => Quit();

  const handleSelectFiles = async () => {
    try {
      const files = await SelectFiles();
      if (files && files.length > 0) {
        setFilePaths(files);
        isUserAtBottomRef.current = true;
        const info = await StartTransfer(files);
        setServerInfo(info);
        logActivity(
          "sent",
          `[FILE SELECT] Sharing file(s) (Count: ${files?.length}, Size: ${formatBytes(info.size)}), Files:: ${info.filename}`,
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendText = async () => {
    if (!textInput.trim()) return;
    try {
      isUserAtBottomRef.current = true;
      await sendText(textInput, "server");
      setTextInput("");
    } catch (err) {
      console.error(err);
    }
  };

  const visibleTransactions = transactions;

  // Track active download for single-client mode
  const activeClientDownload = useMemo(() => {
    if (clients.length === 0) return null;
    const client = clients[0];
    return transactions.find(
      (t) =>
        t.type === "file" &&
        t.senderId === "server" &&
        t.clientStatus?.[client.ip] === "in_progress",
    );
  }, [transactions, clients]);

  // --- Theme Variables ---

  const theme = {
    ...activeTheme, // Spread the active theme preset properties
    accentColor: activeAccent.color,

    // Dynamic Bubble Me (uses accent)
    bubbleMe: "text-white", // Bg color handled via style
    bubbleMeStyle: { backgroundColor: activeAccent.color },
  };

  // Stable URL for the ad iframe to prevent reload on theme changes.
  // We'll use postMessage to update the theme inside the iframe instead.
  const initialAdUrl = useMemo(() => {
    const baseUrl = import.meta.env.DEV
      ? "http://localhost:5174"
      : "https://www.peerhop.in";
    const bgParam = activeTheme.bg.replace("bg-[", "").replace("]", "");
    return `${baseUrl}/desktop-ad?bg=${encodeURIComponent(
      bgParam,
    )}&theme=${encodeURIComponent(activeThemeId)}&isDark=${String(isDarkMode)}&version=${APP_VERSION}&lang=${lang}&deviceName=${encodeURIComponent(deviceName)}&email=${encodeURIComponent(userEmail)}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceName, userEmail]);

  // Communicate theme changes to the ad iframe without reloading it
  useEffect(() => {
    if (adRef.current?.contentWindow) {
      adRef.current.contentWindow.postMessage(
        {
          type: "theme-update",
          bg: activeTheme.bg.replace("bg-[", "").replace("]", ""),
          themeId: activeThemeId,
          isDark: isDarkMode,
          version: APP_VERSION,
          lang: lang,
          deviceName: deviceName,
          email: userEmail,
        },
        "*",
      );
    }
  }, [activeThemeId, isDarkMode, activeTheme.bg, lang, deviceName, userEmail]);
  useEffect(() => {
    if (isDarkMode && window.document.body.classList.contains("dark")) return;
    window.document.body.classList.toggle("dark");
  }, [isDarkMode]);

  return (
    <div
      className={`flex h-screen w-[calc(100vw)] font-sans overflow-hidden transition-colors duration-300 ${theme.bg} ${theme.text} relative hide-scrollbar`}
      style={
        {
          "--wails-drop-target": "drop",
          "--wails-draggable": "drag",
        } as React.CSSProperties
      }
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ReferralFeedbackModal onTriggerReview={triggerReviewFlow} />
      {/* Drag Overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 z-[100] backdrop-blur-sm border-4 border-dashed rounded-lg flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-200"
          style={{
            borderColor: theme.accentColor,
            backgroundColor: theme.accentColor + "1A",
          }}
        >
          <Upload
            size={64}
            className="mb-4"
            style={{ color: theme.accentColor }}
          />
          <h3
            className="text-2xl font-bold"
            style={{ color: theme.accentColor }}
          >
            {t("drop_files")}
          </h3>
        </div>
      )}
      {/* Network Notification */}
      {notification.show && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 duration-300">
          <div
            className={`px-4 py-2 rounded-full shadow-lg border flex items-center gap-2 ${
              isDarkMode
                ? "bg-slate-800 border-slate-700 text-slate-200"
                : "bg-white border-gray-100 text-gray-900"
            }`}
          >
            <span className="text-sm font-medium">{notification.message}</span>
            <button
              onClick={() => setNotification({ show: false, message: "" })}
              className="ml-2 hover:opacity-70"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {/* PERSISTENT HEADER - Always visible */}
      <div
        className={`absolute top-0 left-0 right-0 z-40 h-[48px] flex items-center px-4 gap-2 ${theme.panelBg}`}
        style={{ "--wails-draggable": "drag" } as React.CSSProperties}
        onDoubleClick={handleMaximizeToggle}
      >
        <img
          src={logo}
          alt="Logo"
          className="w-6 h-6 object-contain pointer-events-none "
          draggable={false}
        />
        <h2 className={`text-[17px] font-semibold ${theme.text}`}>PeerHop</h2>
      </div>
      {/* WINDOW CONTROLS - FIXED TOP RIGHT */}
      <div
        className={`absolute top-0 right-0 z-50 p-2 flex items-center gap-1  `}
        style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      >
        {/* Tab controls - Different for mobile vs desktop */}
        {/* Mobile: Show all 3 tabs */}
        <div className={`md:hidden flex items-center gap-1   `}>
          <button
            onClick={() => setActiveTab("chat")}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === "chat"
                ? theme.iconBg + " " + theme.text
                : theme.ghostHover
            }`}
            title="File Transfer"
          >
            <MessageSquare size={18} />
          </button>
          <button
            onClick={() => setActiveTab("qr")}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === "qr"
                ? theme.iconBg + " " + theme.text
                : theme.ghostHover
            }`}
            title="QR Code"
          >
            <QrCode size={18} />
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === "settings"
                ? theme.iconBg + " " + theme.text
                : theme.ghostHover
            }`}
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>

        {/* Desktop: Show QR and Settings tabs only */}
        <div className={`hidden md:flex items-center gap-1 `}>
          <button
            onClick={() => setActiveTab("qr")}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === "qr" || activeTab === "chat"
                ? theme.iconBg + " " + theme.text
                : theme.ghostHover
            }`}
            title="QR Code"
          >
            <QrCode size={18} />
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === "settings"
                ? theme.iconBg + " " + theme.text
                : theme.ghostHover
            }`}
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>

        <div className={`w-px h-4 mx-1 ${theme.border}`}></div>

        <button
          onClick={handleMinimize}
          className={`p-2 rounded-lg transition-colors ${theme.ghostHover}`}
        >
          <Minus size={18} />
        </button>
        <button
          onClick={handleMaximizeToggle}
          className={`p-2 rounded-lg transition-colors ${theme.ghostHover}`}
        >
          {isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          onClick={handleClose}
          className={`p-2 rounded-lg transition-colors hover:bg-red-500 hover:text-white ${theme.subText}`}
        >
          <X size={18} />
        </button>
      </div>
      {/* --- LEFT SIDE: CHAT INTERFACE --- */}
      <ChatPanel
        visibleTransactions={visibleTransactions}
        showTextInput={showTextInput}
        textInput={textInput}
        setTextInput={setTextInput}
        handleSendText={handleSendText}
        handleSelectFiles={handleSelectFiles}
        textTransferEnabled={textTransferEnabled}
        setShowTextInput={setShowTextInput}
        theme={theme}
        isDarkMode={isDarkMode}
        activeTab={activeTab}
        clients={clients}
        serverInfo={serverInfo}
        adminToken={adminToken}
        securityToken={securityToken}
        handleFileOpened={handleFileOpened}
        setTransactionToCancel={setTransactionToCancel}
        adRef={adRef}
        initialAdUrl={initialAdUrl}
        scrollContainerRef={scrollContainerRef}
        messagesEndRef={messagesEndRef}
        isUserAtBottomRef={isUserAtBottomRef}
        iframeHeight={iframeHeight}
        iframeIsLoaded={iframIsLoaded}
        deleteTransaction={deleteTransaction}
      />
      {/* --- RIGHT SIDE: SERVER INFO & QR --- */}
      {/* On Mobile: Absolute positioning covers the entire chat area (respects header).
         On Desktop: Static positioning sits side-by-side.
      */}
      <div
        className={`overflow-x-hidden 
            absolute top-[48px] bottom-0 right-0 w-full z-40 
            md:relative md:w-[280px] lg:w-[350px] md:border-l md:z-30  md:shrink-0
            flex-col shadow-xl transition-all duration-300 
            ${theme.panelBg}
            ${
              activeTab === "qr" || activeTab === "settings"
                ? "flex"
                : "hidden md:flex"
            }
        `}
        style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      >
        {/* Toggle between Settings and QR Panel */}
        <div
          className={`relative flex-1 animate-in slide-in-from-right duration-300 overflow-x-hidden  ${isFeatureDrawerOpen ? "overflow-y-hidden" : "overflow-y-auto hide-scrollbar"}`}
        >
          <div className="min-h-full flex flex-col items-center justify-start px-2 py-8 ">
            {activeTab === "settings" ? (
              /* Settings Panel */
              <SettingsPanel
                theme={theme}
                activeThemeId={activeThemeId}
                setActiveThemeId={setActiveThemeId}
                activeAccentId={activeAccentId}
                setActiveAccentId={setActiveAccentId}
                activeAccent={activeAccent}
                textTransferEnabled={textTransferEnabled}
                setTextTransferEnabled={setTextTransferEnabled}
                securityEnabled={securityEnabled}
                setSecurityEnabled={setSecurityEnabled}
                staticPortEnabled={staticPortEnabled}
                setStaticPortEnabled={(val) => {
                  setStaticPortEnabled(val);
                  localStorage.setItem("staticPortEnabled", String(val));
                  logActivity(
                    "settings_changed",
                    `Static Port: ${val ? "enabled" : "disabled"}`,
                  );
                }}
                staticPort={staticPort}
                setStaticPort={(val) => {
                  setStaticPort(val);
                  localStorage.setItem("staticPort", String(val));
                  logActivity(
                    "settings_changed",
                    `Static Port changed to: ${val}`,
                  );
                }}
                logActivity={logActivity}
                serverInfo={serverInfo}
                securityToken={securityToken}
                isDarkMode={isDarkMode}
                handleRestartServer={handleRestartServer}
                isCheckingNetwork={isCheckingNetwork}
                clients={clients}
                transactionsCount={transactions.length}
                adminToken={adminToken}
                handleBlockClient={handleBlockClient}
                handleBlockSending={handleBlockSending}
                canPromptReview={canPromptReview}
                onRequestReview={triggerReviewFlow}
                setNotification={setNotification}
                deviceName={deviceName}
                onUpdateDeviceName={handleUpdateDesktopName}
                downloadPath={downloadPath}
                setDownloadPath={setDownloadPath}
                userEmail={userEmail}
                onOpenFeatureRequest={() => setFeatureDrawerOpen(true)}
              />
            ) : (
              <QRPanel
                serverInfo={serverInfo}
                securityEnabled={securityEnabled}
                securityToken={securityToken}
                clients={clients}
                activeClientDownload={activeClientDownload}
                theme={theme}
                isDarkMode={isDarkMode}
                isCheckingNetwork={isCheckingNetwork}
                handleRestartServer={handleRestartServer}
                handleBlockClient={handleBlockClient}
                handleBlockSending={handleBlockSending}
                adminToken={adminToken}
                showQR={showQR}
                setShowQR={setShowQR}
                showLink={showLink}
                setShowLink={setShowLink}
                transactionsCount={transactions.length}
              />
            )}
          </div>
        </div>

        <FeatureRequestForm
          isOpen={isFeatureDrawerOpen}
          onClose={() => setFeatureDrawerOpen(false)}
          logActivity={logActivity}
          setNotification={setNotification}
          theme={theme}
          initialEmail={""}
          initialName={deviceName}
        />
      </div>
      <ConfirmDialog
        isOpen={!!transactionToCancel}
        title={t("cancel_transfer")}
        message={
          <>
            {t("stop_receiving", {
              filename: transactionToCancel?.filename || "",
            })}
            <br />
            {t("this_will_end_transfer")}
          </>
        }
        confirmText={t("stop")}
        confirmingText="Stopping..."
        cancelText={t("continue")}
        onConfirm={async () => {
          if (transactionToCancel) {
            try {
              const url = adminToken
                ? `/api/cancel-transaction/${transactionToCancel.id}?admin=${adminToken}`
                : `/api/cancel-transaction/${transactionToCancel.id}`;
              await axios.post(url);
              logActivity(
                "cancelled",
                `Cancelled transfer: ${transactionToCancel.filename || "file"}`,
              );
            } catch (err) {
              console.error("Failed to cancel transaction:", err);
            }
            setTransactionToCancel(null);
          }
        }}
        onCancel={() => setTransactionToCancel(null)}
        destructive={true}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
