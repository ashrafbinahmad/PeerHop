import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import QRCode from "react-qr-code";
import {
  SelectFiles,
  StartTransfer,
  GetServerInfo,
  RestartServer,
  OpenSourceFile,
  ShowInFolder,
  ShowOpenWithDialog,
  SaveTempFile,
  GetClipboardFiles,
  GetSecureSettings,
} from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import {
  WindowMinimise,
  WindowToggleMaximise,
  Quit,
  OnFileDrop,
  OnFileDropOff,
  EventsOn,
  EventsOff,
  BrowserOpenURL,
} from "../../wailsjs/runtime/runtime";
import { useTransactions } from "../hooks/useTransactions";
import { useTransferSpeed, formatBytes } from "../hooks/useTransferSpeed";
import { useDevices, type Client } from "../hooks/useDevices";
import { useActivity } from "../hooks/useActivity";
import {
  X,
  MessageSquare,
  Upload,
  File,
  Check,
  ArrowUp,
  Minus,
  Maximize2,
  QrCode,
  RefreshCw,
  Monitor,
  ExternalLink,
  FolderOpen,
  Play,
  Pencil,
  Settings,
} from "lucide-react";
import logo from "../assets/images/appicon.png";
import { PlatformIcon } from "../components/PlatformIcon";

import { ACCENT_COLORS, THEME_PRESETS } from "../themeConstants";

const TransactionActions = ({
  transaction,
  isDarkMode,
  compact = false,
  filePath,
  isOnBlueBubble = false,
  onOpen,
}: {
  transaction: any;
  isDarkMode: boolean;
  compact?: boolean;
  filePath?: string;
  isOnBlueBubble?: boolean;
  onOpen?: (filename: string) => void;
}) => {
  // Use provided filePath or fall back to transaction.filename
  const resolvedPath = filePath || transaction.filename || "";

  const handleShowInFolder = async () => {
    try {
      await ShowInFolder(resolvedPath);
    } catch (err) {
      console.error(err);
      alert("Failed to show in folder");
    }
  };

  const handleChooseApp = async () => {
    try {
      await ShowOpenWithDialog(resolvedPath);
    } catch (err) {
      console.error(err);
      alert("Failed to open 'Open With' dialog");
    }
  };

  const handleOpen = async () => {
    try {
      await OpenSourceFile(resolvedPath);
      onOpen?.(transaction.filename || resolvedPath);
    } catch (err) {
      console.error(err);
      alert("Failed to open file");
    }
  };

  const buttonClass = isOnBlueBubble
    ? "bg-white/20 hover:bg-white/30 text-white"
    : isDarkMode
      ? "bg-slate-700/50 hover:bg-slate-700 text-slate-300"
      : "bg-gray-100 hover:bg-gray-200 text-gray-600";

  return (
    <div className="flex  gap-2 items-stretch">
      {!compact && (
        <div
          className={`text-[10px] ${
            isDarkMode ? "text-slate-500" : "text-gray-400"
          }`}
        >
          {new Date(transaction.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          <Check size={12} className="ml-1 inline" />
        </div>
      )}

      <button
        onClick={handleChooseApp}
        className={`px-2 text-xs rounded-md transition-colors ${buttonClass}`}
        title="Open with…"
      >
        Open with
        {/* <ExternalLink size={12} /> */}
      </button>

      <button
        onClick={handleShowInFolder}
        className={`p-1.5 rounded-md transition-colors ${buttonClass}`}
        title="Show in Folder"
      >
        <FolderOpen size={12} />
      </button>

      <button
        onClick={handleOpen}
        className={`px-2 text-xs rounded-md transition-colors ${buttonClass}`}
        title="Open"
      >
        <ExternalLink size={12} />
      </button>
    </div>
  );
};

import { CopyButton } from "../components/CopyButton";
import { ConfirmDialog } from "../components/ConfirmDialog";

// ... existing imports ...

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

const EditableDeviceName = ({
  client,
  isDarkMode,
  theme,
  serverUrl,
  adminToken,
  onBlock,
  onBlockSending,
}: {
  client: Client;
  isDarkMode: boolean;
  theme: any;
  serverUrl: string;
  adminToken: string;
  onBlock: (client: Client) => void;
  onBlockSending: (client: Client) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(client.name || client.platform);

  // Update name if client data changes from backend
  useEffect(() => {
    if (client.name && !isEditing) {
      setName(client.name);
    }
  }, [client.name, isEditing]);

  const handleUpdateName = async () => {
    if (!name.trim()) {
      setName(client.name || client.platform);
      setIsEditing(false);
      return;
    }

    try {
      const url = adminToken
        ? `${serverUrl}/api/update-client-name?admin=${adminToken}`
        : `${serverUrl}/api/update-client-name`;
      await axios.post(url, {
        ip: client.ip,
        name: name.trim(),
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update name:", err);
      // Revert name on error
      setName(client.name || client.platform);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${theme.deviceItemBg}`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${theme.iconBg} ${theme.iconText}`}
      >
        <PlatformIcon platform={client.platform} size={16} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleUpdateName}
              onKeyDown={(e) => e.key === "Enter" && handleUpdateName()}
              className={`text-sm font-medium w-full px-1 py-0.5 rounded border ${
                isDarkMode
                  ? "bg-slate-900 border-slate-700 text-white"
                  : "bg-white border-gray-200 text-gray-900"
              }`}
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group">
            <div className={`text-sm font-medium truncate ${theme.text}`}>
              {client.name || client.platform}
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/5 transition-opacity"
              title="Edit name"
            >
              <Pencil
                size={10}
                className={isDarkMode ? "text-slate-400" : "text-gray-400"}
              />
            </button>
          </div>
        )}
        <div className={`text-[10px] truncate font-mono ${theme.subText}`}>
          {client.ip}
        </div>

        <div className="flex gap-2 mt-1">
          {/* Block Sending Button */}
          <button
            onClick={() => onBlockSending(client)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              client.sendingBlocked
                ? "bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30 dark:text-yellow-400"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            }`}
          >
            {client.sendingBlocked ? "Allow Sending" : "Block Sending"}
          </button>

          {/* Block/Unblock Button */}
          <button
            onClick={() => onBlock(client)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              client.blocked
                ? "bg-green-500/20 text-green-600 hover:bg-green-500/30"
                : "bg-red-500/20 text-red-600 hover:bg-red-500/30"
            }`}
          >
            {client.blocked ? "🔓 Unblock" : "🚫 Block"}
          </button>
        </div>
      </div>
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          client.blocked
            ? "bg-red-500"
            : client.sendingBlocked
              ? "bg-yellow-500"
              : "bg-green-500"
        }`}
      ></div>
    </div>
  );
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

  const { logActivity } = useActivity();

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "open-external") {
        BrowserOpenURL(event.data.url);
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
          const info = await StartTransfer(paths);
          setServerInfo(info);
          logActivity(
            "shared",
            `Sharing ${paths.length} file(s) via drag & drop: ${paths.map((p) => p.split(/[\\/]/).pop()).join(", ")}`,
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
    return localStorage.getItem("themeId") || "night";
  });

  // Set axios base URL when server info is available
  useEffect(() => {
    if (serverInfo?.url) {
      axios.defaults.baseURL = serverInfo.url;
    }
  }, [serverInfo?.url]);
  const [activeAccentId, setActiveAccentId] = useState<string>(() => {
    return localStorage.getItem("accentId") || "blue";
  });

  const activeTheme =
    THEME_PRESETS.find((t) => t.id === activeThemeId) || THEME_PRESETS[3];
  const activeAccent =
    ACCENT_COLORS.find((a) => a.id === activeAccentId) || ACCENT_COLORS[0];
  const isDarkMode = activeTheme.isDark; // Derived state
  // Tab system: 'chat' | 'qr' | 'settings'
  const [activeTab, setActiveTab] = useState<"chat" | "qr" | "settings">("qr");

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

  const [multiClientEnabled, setMultiClientEnabled] = useState(() => {
    const saved = localStorage.getItem("multiClientEnabled");
    // Default to false (disabled)
    return saved !== null ? saved === "true" : false;
  });

  const [securityToken, setSecurityToken] = useState<string>("");
  const [adminToken, setAdminToken] = useState<string>("");

  // Scroll and Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Hook: WebSocket for transactions
  const { transactions, sendText } = useTransactions(
    2000,
    serverInfo?.url,
    false,
    true,
    adminToken, // Desktop uses admin token
    securityEnabled,
  );

  // Hook: WebSocket for devices/clients
  // Get clients list - Pass admin token for desktop client tracking/UI
  const { clients } = useDevices(serverInfo?.url, true, adminToken);
  const speeds = useTransferSpeed(transactions);

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
            logActivity("sent", `Sent ${txn.filename || "file"}${sizeLabel}`);
          } else {
            logActivity(
              "received",
              `Received ${txn.filename || "file"}${sizeLabel}`,
            );
          }
        } else if (txn.type === "text") {
          const preview = txn.textContent
            ? txn.textContent.slice(0, 40) +
              (txn.textContent.length > 40 ? "…" : "")
            : "";
          if (isMe) {
            logActivity("sent", `Sent text: "${preview}"`);
          } else {
            logActivity("received", `Received text: "${preview}"`);
          }
        }
      }
      prevTransactionStatuses.current[txn.id] = txn.status;
    });
  }, [transactions, logActivity]);

  // Log app closed on unmount
  useEffect(() => {
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
      alert("Failed to update client status");
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
        `${client.sendingBlocked ? "Unblocked sending from" : "Blocked sending from"}: ${client.name || client.platform} (${client.ip})`,
      );
    } catch (err) {
      console.error("Failed to block/unblock sending for client:", err);
      alert("Failed to update client status");
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
    setIsCheckingNetwork(true);
    try {
      const info = await RestartServer();
      setServerInfo(info);
      logActivity(
        "restarted",
        `Server restarted — new URL: ${info.url || "unknown"}`,
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
          }, 1000);
        };
        checkSSID();
      } else {
        setIsCheckingNetwork(false);
      }
    } catch (err) {
      console.error("Failed to restart server:", err);
      setIsCheckingNetwork(false);
      alert("Failed to restart server");
    }
  };

  // --- Effects ---

  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const info = await GetServerInfo();
        setServerInfo(info);
        logActivity(
          "started",
          `App started — server at ${info.url || "unknown"}`,
        );

        // If SSID is empty, retry after a short delay to get updated SSID
        if (!info.ssid) {
          setTimeout(async () => {
            try {
              const updatedInfo = await GetServerInfo();
              setServerInfo(updatedInfo);
            } catch (err) {
              console.error("Failed to get updated server info:", err);
            }
          }, 1000); // Retry after 1 second
        }
      } catch (err) {
        console.error("Failed to get server info:", err);
      }
    };
    fetchServerInfo();

    // Listen for network changes
    const unsubscribe = EventsOn("network-changed", (info: main.ServerInfo) => {
      console.log("[DesktopView] Network changed:", info);
      setServerInfo(info);
      setNotification({
        show: true,
        message: "Network changed! Server restarted",
      });
      setTimeout(() => setNotification({ show: false, message: "" }), 3000);
      logActivity(
        "network_changed",
        `Network changed — new URL: ${info.url || "unknown"}${info.ssid ? ` (${info.ssid})` : ""}`,
      );

      // If SSID is empty, poll for it (as backend fetches it asynchronously)
      if (!info.ssid) {
        setTimeout(async () => {
          try {
            const updated = await GetServerInfo();
            setServerInfo(updated);
          } catch (err) {
            console.error(err);
          }
        }, 1000);
      }
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      } else {
        EventsOff("network-changed");
      }
    };
  }, [logActivity]);

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
        // We rely on Wails binding for tokens now
      })
      .catch((e) => console.error("Failed to fetch settings:", e));
  }, [serverInfo?.url]);

  // Save text transfer and multi-client settings to localStorage and sync with server
  useEffect(() => {
    localStorage.setItem("textTransferEnabled", String(textTransferEnabled));
    localStorage.setItem("multiClientEnabled", String(multiClientEnabled));

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
        multiClientEnabled,
      })
      .catch((e) => console.error("Failed to sync settings:", e));
  }, [
    textTransferEnabled,
    securityEnabled,
    multiClientEnabled,
    serverInfo?.url,
    adminToken,
  ]);

  // Save security enabled setting to localStorage
  useEffect(() => {
    localStorage.setItem("securityEnabled", String(securityEnabled));
  }, [securityEnabled]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
        const info = await StartTransfer(files);
        setServerInfo(info);
        logActivity(
          "shared",
          `Sharing ${files.length} file(s): ${files.map((f) => f.split(/[\\/]/).pop()).join(", ")}`,
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendText = async () => {
    if (!textInput.trim()) return;
    try {
      await sendText(textInput, "server");
      setTextInput("");
    } catch (err) {
      console.error(err);
      alert("Failed to send text");
    }
  };

  const visibleTransactions = transactions;

  // --- Theme Variables ---

  const theme = {
    ...activeTheme, // Spread the active theme preset properties
    accentColor: activeAccent.color,

    // Dynamic Bubble Me (uses accent)
    bubbleMe: "text-white", // Bg color handled via style
    bubbleMeStyle: { backgroundColor: activeAccent.color },
  };

  return (
    <div
      className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-300 ${theme.bg} ${theme.text} relative`}
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
            Drop files to send
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
      >
        <img src={logo} alt="Logo" className="w-6 h-6 object-contain" />
        <h2 className={`text-[17px] font-semibold ${theme.text}`}>PeerHop</h2>
      </div>
      {/* WINDOW CONTROLS - FIXED TOP RIGHT */}
      <div
        className="absolute top-0 right-0 z-50 p-2 flex items-center gap-1"
        style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      >
        {/* Tab controls - Different for mobile vs desktop */}
        {/* Mobile: Show all 3 tabs */}
        <div className="md:hidden flex items-center gap-1  ">
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
        <div className="hidden md:flex items-center gap-1">
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
          <Maximize2 size={16} />
        </button>
        <button
          onClick={handleClose}
          className={`p-2 rounded-lg transition-colors hover:bg-red-500 hover:text-white ${theme.subText}`}
        >
          <X size={18} />
        </button>
      </div>
      {/* --- LEFT SIDE: CHAT INTERFACE --- */}
      <div
        className={`flex flex-col flex-1 h-full relative transition-all duration-300 ${
          isDarkMode ? "border-slate-800" : "border-gray-200/60"
        } md:border-r ${activeTab === "chat" ? "flex" : "hidden md:flex"}`}
        style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      >
        {/* HEADER - Empty for spacing, title is in persistent header */}
        <div
          className={`shrink-0 h-[48px] backdrop-blur-xl flex items-center px-4 justify-between z-20 transition-colors duration-300 relative ${theme.headerBg}`}
          style={{ "--wails-draggable": "drag" } as React.CSSProperties}
        ></div>
        {/* TODO: add ad */}

        <iframe
          id="adFrame"
          src={`${
            import.meta.env.DEV
              ? "http://localhost:5174"
              : "https://www.peerhop.in"
          }/desktop-ad?bg=${encodeURIComponent(
            theme.bg.replace("bg-[", "").replace("]", ""),
          )}&theme=${encodeURIComponent(activeThemeId)}&isDark=${String(
            isDarkMode,
          )}`}
          width="100%"
          height="55"
          frameBorder="0"
          allowTransparency={true}
          className="absolute top-10 left-0 w-screen h-14 z-50"
          style={{
            maxWidth: "100dvw",
            backgroundColor: "transparent",
            border: "none",
            display: "block",
          }}
        ></iframe>

        {/* MESSAGES AREA */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4 pt-16 flex flex-col scroll-smooth custom-scrollbar w-full overflow-hidden"
        >
          <div className="mt-auto flex flex-col gap-3">
            {visibleTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-6 animate-in fade-in zoom-in-95 duration-500 my-auto pb-20">
                {/* Big Share File Button */}
                <button
                  onClick={handleSelectFiles}
                  className={`group relative flex flex-col items-center justify-center gap-4 w-60 h-48 rounded-[2rem] border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                    theme.border
                  } ${
                    isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-50"
                  }`}
                >
                  <div
                    className="p-4 rounded-full transition-all duration-300 group-hover:scale-110"
                    style={{
                      backgroundColor: theme.accentColor + "10",
                      color: theme.accentColor,
                    }}
                  >
                    <Upload size={32} strokeWidth={1.5} />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-lg font-medium tracking-tight opacity-90">
                      Share a file
                    </span>
                    <span className={`text-xs opacity-50`}>
                      Click to browse or drop here
                    </span>
                  </div>
                </button>

                {/* Small Send Text Button */}
                <button
                  onClick={() => {
                    if (!textTransferEnabled) setTextTransferEnabled(true);
                    setShowTextInput(true);
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-300 hover:scale-105 active:scale-95 ${
                    theme.border
                  } ${
                    isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-50"
                  }`}
                >
                  <MessageSquare
                    size={16}
                    strokeWidth={1.5}
                    style={{ color: theme.accentColor }}
                  />
                  <span className="text-sm font-medium opacity-90">
                    Send text
                  </span>
                </button>
              </div>
            ) : (
              visibleTransactions.map((transaction) => {
                const isMe = transaction.senderId === "server";
                const isFile = transaction.type === "file";
                const alignClass = isMe ? "justify-end" : "justify-start";
                const bubbleClass = isMe ? theme.bubbleMe : theme.bubbleOther;

                const widthClass = isFile
                  ? "w-[calc(99%-100px)] max-w-[500px]"
                  : "w-fit max-w-[min(calc(99%-100px),500px)] text-left overflow-hidden";

                // Lookup client platform if message is from client
                let clientPlatform: Client["platform"] | undefined;
                if (!isMe && transaction.clientIp) {
                  const client = clients.find(
                    (c) => c.ip === transaction.clientIp,
                  );
                  if (client) clientPlatform = client.platform;
                }

                return (
                  <div
                    key={transaction.id}
                    className={`flex ${alignClass} animate-in fade-in slide-in-from-bottom-2 duration-300 gap-2 items-end`}
                  >
                    {/* Avatar for Client (Left Side) */}
                    {!isMe && (
                      <div
                        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mb-1 ${theme.iconBg} ${theme.iconText}`}
                      >
                        <PlatformIcon
                          platform={clientPlatform || "unknown"}
                          size={16}
                        />
                      </div>
                    )}

                    <div
                      className={`relative rounded-2xl p-3 shadow-sm ${widthClass} ${
                        isMe ? theme.bubbleMe : theme.bubbleOther
                      } transition-all duration-300 overflow-hidden ${
                        transaction.status === "cancelled"
                          ? "opacity-60 grayscale-[0.5]"
                          : ""
                      }`}
                      style={isMe ? theme.bubbleMeStyle : undefined}
                    >
                      {/* Background Progress Fill (Both Incoming and Outgoing) */}
                      {transaction.status === "in_progress" && (
                        <div
                          className={`absolute top-0 left-0 h-full ${
                            isMe ? "bg-white/20" : ""
                          } pointer-events-none transition-all duration-300`}
                          style={{
                            width: `${transaction.transactionPercent}%`,
                            backgroundColor: !isMe
                              ? theme.accentColor + "20"
                              : undefined, // 20 = 10% approx opacity in hex?? No 1A is 10%.
                          }}
                        />
                      )}

                      <div className="relative z-10">
                        {transaction.type === "text" && (
                          <div className="relative min-w-[120px] max-h-[300px] overflow-y-auto">
                            <div className="sticky top-0 right-0 float-right z-10 ml-2">
                              <CopyButton
                                text={transaction.textContent || ""}
                                className={`p-1 rounded-full ${
                                  isMe
                                    ? "text-white/70 hover:bg-white/20"
                                    : isDarkMode
                                      ? "text-slate-400 hover:bg-slate-700 hover:text-slate-300"
                                      : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                }`}
                                iconSize={12}
                              />
                            </div>
                            <div className="text-[15px] leading-relaxed break-words">
                              {transaction.textContent}
                            </div>
                          </div>
                        )}

                        {isFile && (
                          <div className="flex flex-col w-full">
                            {/* File info row */}
                            <div className="flex items-center gap-3 pr-2">
                              {(() => {
                                const ext = transaction.filename
                                  ?.split(".")
                                  .pop()
                                  ?.toLowerCase();
                                const isImage = [
                                  "jpg",
                                  "jpeg",
                                  "png",
                                  "gif",
                                  "webp",
                                  "bmp",
                                ].includes(ext || "");
                                const isVideo = [
                                  "mp4",
                                  "webm",
                                  "ogg",
                                  "mov",
                                ].includes(ext || "");
                                const mediaUrl =
                                  serverInfo?.url && transaction.downloadLink
                                    ? `${serverInfo.url}${transaction.downloadLink}`
                                    : "";

                                if (isImage && mediaUrl) {
                                  return (
                                    <div
                                      className="w-12 h-12 rounded-lg bg-black/5 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative group"
                                      onClick={() =>
                                        OpenSourceFile(
                                          transaction.filename || "",
                                        )
                                      }
                                      title="Open Image"
                                    >
                                      <img
                                        src={`${mediaUrl}${
                                          mediaUrl.includes("?") ? "&" : "?"
                                        }preview=true${
                                          adminToken
                                            ? `&admin=${adminToken}`
                                            : ""
                                        }`}
                                        alt="preview"
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  );
                                }

                                if (isVideo && mediaUrl) {
                                  return (
                                    <div
                                      className="w-12 h-12 rounded-lg bg-black/10 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative group flex items-center justify-center border border-black/5"
                                      onClick={() =>
                                        OpenSourceFile(
                                          transaction.filename || "",
                                        )
                                      }
                                      title="Open Video"
                                    >
                                      <video
                                        src={`${mediaUrl}${
                                          mediaUrl.includes("?") ? "&" : "?"
                                        }preview=true${
                                          adminToken
                                            ? `&admin=${adminToken}`
                                            : ""
                                        }`}
                                        className="w-full h-full object-cover absolute inset-0 pointer-events-none"
                                        preload="metadata"
                                      />
                                      <div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center z-10 backdrop-blur-sm">
                                        <Play
                                          size={10}
                                          className="text-white ml-0.5"
                                        />
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                      isMe
                                        ? "bg-white/20 text-white"
                                        : theme.iconBg + " " + theme.iconText
                                    }`}
                                  >
                                    <File size={20} />
                                  </div>
                                );
                              })()}
                              <div className="min-w-[140px] flex-1 text-left">
                                <div
                                  className="font-semibold text-sm truncate max-w-[200px]"
                                  title={transaction.filename}
                                >
                                  {transaction.filename}
                                </div>
                                <div
                                  className={`text-xs mt-0.5 ${
                                    isMe
                                      ? "text-white/80"
                                      : isDarkMode
                                        ? "text-slate-400"
                                        : "text-gray-500"
                                  }`}
                                >
                                  {transaction.status === "in_progress" ? (
                                    <div className="flex flex-col gap-0.5 mt-1 font-mono">
                                      <span>
                                        {speeds[transaction.id] || "0.0 MB/s"}
                                      </span>
                                      <span>
                                        {formatBytes(
                                          (transaction.fileSize || 0) *
                                            (transaction.transactionPercent /
                                              100),
                                        )}{" "}
                                        / {formatBytes(transaction.fileSize)}
                                      </span>
                                      <span
                                        className={`font-medium ${
                                          isMe ? "text-white/90" : ""
                                        }`}
                                        style={{
                                          color: !isMe
                                            ? theme.accentColor
                                            : undefined,
                                        }}
                                      >
                                        {Math.round(
                                          transaction.transactionPercent,
                                        )}
                                        %
                                      </span>
                                    </div>
                                  ) : transaction.status !== "cancelled" ? (
                                    formatBytes(transaction.fileSize)
                                  ) : null}
                                  {transaction.status === "cancelled" && (
                                    <span className="font-medium text-red-500/70">
                                      Cancelled
                                    </span>
                                  )}
                                </div>

                                {/* Multiple progress bars for client downloads */}
                                {!isMe &&
                                  transaction.clientProgress &&
                                  Object.keys(transaction.clientProgress)
                                    .length > 0 && (
                                    <div className="mt-2 space-y-1.5">
                                      {Object.entries(
                                        transaction.clientProgress,
                                      ).map(([clientIp, progress]) => {
                                        const clientSt =
                                          transaction.clientStatus?.[clientIp];
                                        const client = clients.find(
                                          (c) => c.ip === clientIp,
                                        );

                                        // Only show if in progress
                                        if (clientSt !== "in_progress")
                                          return null;

                                        return (
                                          <div
                                            key={clientIp}
                                            className="flex items-center gap-2"
                                          >
                                            <div
                                              className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${theme.iconBg} ${theme.iconText}`}
                                            >
                                              <PlatformIcon
                                                platform={
                                                  client?.platform || "unknown"
                                                }
                                                size={10}
                                              />
                                            </div>
                                            <div className="flex-1 h-1 bg-gray-200/30 rounded-full overflow-hidden">
                                              <div
                                                className="h-full transition-all duration-300"
                                                style={{
                                                  width: `${progress}%`,
                                                  backgroundColor:
                                                    theme.accentColor,
                                                }}
                                              />
                                            </div>
                                            <span
                                              className={`text-[10px] w-8 text-right ${
                                                isDarkMode
                                                  ? "text-slate-400"
                                                  : "text-gray-500"
                                              }`}
                                            >
                                              {Math.round(progress as number)}%
                                            </span>
                                            {transaction.status !==
                                              "cancelled" && (
                                              <button
                                                onClick={async () => {
                                                  try {
                                                    await axios.post(
                                                      `/api/cancel-download/${transaction.id}`,
                                                      { clientIp: clientIp },
                                                    );
                                                  } catch (err) {
                                                    console.error(
                                                      "Failed to cancel:",
                                                      err,
                                                    );
                                                  }
                                                }}
                                                className={`p-0.5 rounded hover:bg-red-100 text-red-500 transition-colors ${
                                                  isDarkMode
                                                    ? "hover:bg-red-900/20"
                                                    : ""
                                                }`}
                                                title={`Cancel download for ${
                                                  client?.platform || "client"
                                                }`}
                                              >
                                                <X size={12} />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                              </div>{" "}
                              {/* Close text content div */}
                              {/* Incoming Upload Cancel Button - Outside text flow, rightsided */}
                              {!isMe &&
                                transaction.status === "in_progress" &&
                                (!transaction.clientProgress ||
                                  Object.keys(transaction.clientProgress)
                                    .length === 0) && (
                                  <div className="flex flex-col justify-center ml-3 self-center">
                                    <div className="flex flex-col justify-center ml-3 self-center">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTransactionToCancel(transaction);
                                        }}
                                        className={`p-2 rounded-full cursor-pointer relative z-20 transition-colors ${
                                          isDarkMode
                                            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                            : "bg-red-100 text-red-600 hover:bg-red-200"
                                        }`}
                                        title="Cancel upload"
                                      >
                                        <X size={18} />
                                      </button>
                                    </div>
                                  </div>
                                )}
                            </div>

                            {/* Actions row - full width, aligned to right */}
                            {/* Divider and Actions for Completed Received Files */}
                            {isFile &&
                              !isMe &&
                              transaction.status === "completed" && (
                                <div className="mt-3 pt-2 border-t border-gray-100/10 flex items-center w-full gap-2">
                                  <div
                                    className={`text-[11px] ${
                                      isDarkMode ? theme.subText : theme.subText
                                    }`}
                                  >
                                    {new Date(transaction.timestamp)
                                      .toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                      .toLowerCase()}
                                    <span className="ml-1 inline-block">✓</span>
                                  </div>
                                  <div className="ml-auto">
                                    <TransactionActions
                                      transaction={transaction}
                                      isDarkMode={isDarkMode}
                                      compact={true}
                                      onOpen={handleFileOpened}
                                    />
                                  </div>
                                </div>
                              )}

                            {/* Divider and Actions for Completed Sent Files (Server-sent) */}
                            {isFile &&
                              isMe &&
                              transaction.status !== "cancelled" &&
                              transaction.status !== "failed" && (
                                <div className="mt-3 pt-2 border-t border-white/10 flex items-center w-full gap-2">
                                  <div className="text-[11px] text-white/50">
                                    {new Date(transaction.timestamp)
                                      .toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                      .toLowerCase()}
                                    <span className="ml-1 inline-block">✓</span>
                                  </div>
                                  <div className="ml-auto">
                                    <TransactionActions
                                      transaction={transaction}
                                      isDarkMode={true}
                                      compact={true}
                                      filePath={transaction.serverFilePath}
                                      isOnBlueBubble={true}
                                      onOpen={handleFileOpened}
                                    />
                                  </div>
                                </div>
                              )}
                          </div>
                        )}
                        {/* Actions inside bubble */}
                        {/* Completed File Actions: Open With */}
                        {/* Actions Removed from here, moved inside the card content above */}
                        {/* REMOVED */}
                      </div>
                    </div>

                    {/* Avatar for Server (Right Side) */}
                    {isMe && (
                      <div
                        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mb-1 ${theme.iconBg} ${theme.iconText}`}
                      >
                        <Monitor size={16} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        </div>
        {/* INPUT AREA */}
        {(visibleTransactions.length > 0 || showTextInput) && (
          <div
            className={`shrink-0 border-t z-30 pb-4 pt-3 px-4 transition-colors duration-300 ${theme.inputAreaBg}`}
          >
            {showTextInput && (
              <div className="flex gap-2 mb-3 animate-in slide-in-from-bottom-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleSendText()}
                  placeholder="Type a message..."
                  className={`flex-1 px-4 py-2 border-transparent border transition-all rounded-2xl text-[15px] outline-none ${theme.inputField}`}
                  autoFocus
                />
                <button
                  onClick={handleSendText}
                  className="w-10 h-10 text-white rounded-full flex items-center justify-center transition-colors shadow-sm hover:opacity-90"
                  style={{ backgroundColor: theme.accentColor }}
                >
                  <ArrowUp size={20} />
                </button>
              </div>
            )}

            {visibleTransactions.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSelectFiles}
                  className={`flex-1 h-12 rounded-2xl font-semibold flex items-center justify-center gap-2 border shadow-sm transition-all group ${theme.panelCard} ${theme.border} ${theme.text}`}
                  style={
                    {
                      // Dynamic hover border color is hard in inline style without onMouseOver.
                      // For now we trust the hover:opacity or we skip the hover accent color for border
                      // Or we use a tiny trick:
                    }
                  }
                >
                  <Upload
                    size={18}
                    className="group-hover:-translate-y-0.5 transition-transform"
                    style={{ color: theme.accentColor }} // Always accent color? or on hover? Original was hover.
                  />
                  <span className="group-hover:text-current">Select Files</span>
                </button>

                {textTransferEnabled && (
                  <button
                    onClick={() => {
                      if (showTextInput) {
                        setShowTextInput(false);

                        setTextInput("");
                      } else {
                        setShowTextInput(true);
                      }
                    }}
                    className={`p-3 rounded-full transition-colors ${
                      showTextInput
                        ? "bg-red-500/10 hover:bg-red-500/20 text-red-500"
                        : theme.iconBg + " " + theme.ghostHover
                    }`}
                    title={showTextInput ? "Close Text Input" : "Send Text"}
                  >
                    {showTextInput ? (
                      <X size={22} />
                    ) : (
                      <MessageSquare size={22} />
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* --- RIGHT SIDE: SERVER INFO & QR --- */}
      {/* On Mobile: Absolute positioning covers the entire chat area (respects header).
         On Desktop: Static positioning sits side-by-side.
      */}
      <div
        className={`
            absolute top-[48px] bottom-0 right-0 w-full z-40 
            md:static md:w-[350px] md:border-l md:z-30 md:pr-1 md:shrink-0
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
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 animate-in slide-in-from-right duration-300">
          <div className="min-h-full flex flex-col items-center justify-start">
            {activeTab === "settings" ? (
              /* Settings Panel */
              <div className="w-full self-start text-left pt-8">
                {/* Left-aligned header */}
                <div className="mb-8 flex items-center gap-3">
                  <Settings size={24} className={theme.text} />
                  <h1 className={`text-2xl font-bold ${theme.text}`}>
                    Settings
                  </h1>
                </div>

                {/* Settings Content - No borders, left-aligned */}
                <div className="space-y-6 text-left">
                  {/* Theme Setting */}
                  <div>
                    <h3 className={`text-sm font-semibold mb-3 ${theme.text}`}>
                      Themes
                    </h3>

                    {/* Theme Cards - Horizontal Scroll */}
                    {/* Theme Cards - Horizontal Scroll */}
                    <div className="flex overflow-x-auto gap-3 mb-2 pb-2 -mx-2 px-2 select-none scrollbar-hide">
                      {THEME_PRESETS.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setActiveThemeId(t.id)}
                          className={`shrink-0 w-20 p-1 rounded-xl border-2 transition-all duration-200 group ${
                            activeThemeId === t.id
                              ? "border-[#007AFF]"
                              : "border-transparent hover:border-gray-200 dark:hover:border-slate-700"
                          }`}
                          style={{
                            borderColor:
                              activeThemeId === t.id
                                ? activeAccent.color
                                : undefined,
                          }}
                        >
                          <div
                            className={`h-12 rounded-lg mb-1.5 relative overflow-hidden`}
                            style={{ backgroundColor: t.previewColor }}
                          >
                            {/* Scaled Mock UI in Card */}
                            <div className="absolute top-1.5 left-1.5 right-6 h-1.5 rounded-full bg-slate-400/20"></div>
                            <div className="absolute top-4 left-1.5 right-3 h-3 rounded bg-white/20"></div>
                            <div
                              className="absolute top-8 right-1.5 left-6 h-3 rounded"
                              style={{ backgroundColor: activeAccent.color }}
                            ></div>
                          </div>
                          <div
                            className={`text-[10px] font-medium text-center truncate ${
                              theme.subText
                            } ${activeThemeId === t.id ? "font-bold" : ""}`}
                            style={{
                              color:
                                activeThemeId === t.id
                                  ? activeAccent.color
                                  : undefined,
                            }}
                          >
                            {t.name}
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Accent Colors */}
                    <div className="flex flex-wrap gap-2 items-center justify-start">
                      {ACCENT_COLORS.map((color) => (
                        <button
                          key={color.id}
                          onClick={() => setActiveAccentId(color.id)}
                          className={`w-4 h-4 rounded-full transition-all duration-200 flex items-center justify-center ${
                            activeAccentId === color.id
                              ? "scale-105 ring ring-offset-2 ring-offset-transparent"
                              : "hover:scale-105"
                          }`}
                          style={{
                            backgroundColor: color.color,
                            boxShadow:
                              activeAccentId === color.id
                                ? `0 0 0 2px ${
                                    theme.bg === "bg-[#0f172a]"
                                      ? "#0f172a"
                                      : "white"
                                  }, 0 0 0 3px ${color.color}`
                                : "none",
                          }}
                        >
                          {activeAccentId === color.id && (
                            <Check size={10} className="text-white" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Features */}
                  <div>
                    <h3 className={`text-sm font-semibold mb-4 ${theme.text}`}>
                      Features
                    </h3>
                    <div className="space-y-3">
                      {/* Text Transfer Toggle */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${theme.text}`}>
                            Text Transfer
                          </p>
                          <p className={`text-xs mt-0.5 ${theme.subText}`}>
                            Enable sending and receiving text messages
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const next = !textTransferEnabled;
                            setTextTransferEnabled(next);
                            logActivity(
                              "settings_changed",
                              `Text Transfer: ${next ? "enabled" : "disabled"}`,
                            );
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                            textTransferEnabled ? "" : theme.iconBg
                          }`}
                          style={{
                            backgroundColor: textTransferEnabled
                              ? theme.accentColor
                              : undefined,
                          }}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              textTransferEnabled
                                ? "translate-x-6"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Security Toggle */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${theme.text}`}>
                            Enable Security
                          </p>
                          <p className={`text-xs mt-0.5 ${theme.subText}`}>
                            Require security token for API access
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const next = !securityEnabled;
                            setSecurityEnabled(next);
                            logActivity(
                              "settings_changed",
                              `Security: ${next ? "enabled" : "disabled"}`,
                            );
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                            securityEnabled ? "" : theme.iconBg
                          }`}
                          style={{
                            backgroundColor: securityEnabled
                              ? theme.accentColor
                              : undefined,
                          }}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              securityEnabled
                                ? "translate-x-6"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>

                      {/* Multi-Client Toggle */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${theme.text}`}>
                            Enable Multi-Client
                          </p>
                          <p className={`text-xs mt-0.5 ${theme.subText}`}>
                            Allow multiple devices to connect simultaneously
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            const next = !multiClientEnabled;
                            setMultiClientEnabled(next);
                            logActivity(
                              "settings_changed",
                              `Multi-Client: ${next ? "enabled" : "disabled"}`,
                            );
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                            multiClientEnabled ? "" : theme.iconBg
                          }`}
                          style={{
                            backgroundColor: multiClientEnabled
                              ? theme.accentColor
                              : undefined,
                          }}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              multiClientEnabled
                                ? "translate-x-6"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Server Info */}
                  {serverInfo && (
                    <div>
                      <h3
                        className={`text-sm font-semibold mb-4 ${theme.text}`}
                      >
                        Server Information
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <p
                            className={`text-[10px] uppercase tracking-wider mb-1.5 ${theme.subText}`}
                          >
                            URL
                          </p>
                          <div className="flex items-center gap-2">
                            <code
                              className={`text-xs font-mono flex-1 ${theme.text}`}
                            >
                              {serverInfo.url
                                ? securityEnabled && securityToken
                                  ? `${serverInfo.url}?security=${securityToken}`
                                  : serverInfo.url
                                : ""}
                            </code>
                            <CopyButton
                              text={
                                serverInfo.url
                                  ? securityEnabled && securityToken
                                    ? `${serverInfo.url}?security=${securityToken}`
                                    : serverInfo.url
                                  : ""
                              }
                              className={`p-1.5 rounded-md ${
                                isDarkMode
                                  ? "hover:bg-slate-700 text-slate-400 hover:text-slate-300"
                                  : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                              }`}
                              isDarkMode={isDarkMode}
                            />
                          </div>
                        </div>
                        {serverInfo.ssid && (
                          <div>
                            <p
                              className={`text-[10px] uppercase tracking-wider mb-1.5 ${theme.subText}`}
                            >
                              Wi-Fi Network
                            </p>
                            <code className={`text-xs font-mono ${theme.text}`}>
                              {serverInfo.ssid}
                            </code>
                          </div>
                        )}
                        <div className="pt-2">
                          <button
                            onClick={handleRestartServer}
                            disabled={isCheckingNetwork}
                            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                              theme.iconBg
                            } ${theme.ghostHover} ${theme.text} ${
                              isCheckingNetwork
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                          >
                            <RefreshCw
                              size={14}
                              className={
                                isCheckingNetwork ? "animate-spin" : ""
                              }
                            />
                            {isCheckingNetwork
                              ? "Restarting..."
                              : "Restart Server"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Connected Devices - Only show when multi-client is enabled */}
                  {multiClientEnabled && clients.length > 0 && (
                    <div>
                      <h3
                        className={`text-sm font-semibold mb-4 ${theme.text}`}
                      >
                        Connected Devices ({clients.length})
                      </h3>
                      <div className="space-y-2">
                        {clients.map((client) => (
                          <EditableDeviceName
                            key={client.ip}
                            client={client}
                            isDarkMode={isDarkMode}
                            theme={theme}
                            serverUrl={serverInfo?.url || ""}
                            adminToken={adminToken}
                            onBlock={handleBlockClient}
                            onBlockSending={handleBlockSending}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : serverInfo ? (
              <>
                {/* Header */}
                <div className="mb-8 flex flex-col items-center pt-8">
                  <h1 className={`text-xl font-bold ${theme.text}`}>
                    Connect Device
                  </h1>
                </div>

                <div className="w-full max-w-[300px] mx-auto space-y-8">
                  {/* Step 1: Network */}
                  <div className="text-center space-y-2">
                    <p
                      className={`text-xs font-semibold uppercase tracking-wider ${theme.subText}`}
                    >
                      Step 1: Network
                    </p>

                    {serverInfo?.ssid ? (
                      <div
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm font-medium border ${
                          isDarkMode
                            ? "bg-slate-800/50 border-slate-700 text-green-400"
                            : "bg-white border-green-200 text-green-700"
                        }`}
                      >
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        {serverInfo.ssid}
                      </div>
                    ) : (
                      <div
                        className={`px-4 py-3 rounded-lg border border-dashed ${theme.border}`}
                      >
                        <p className={`text-sm ${theme.text} mb-1`}>
                          {isCheckingNetwork
                            ? "Checking Network..."
                            : "No Wi-Fi Detected"}
                        </p>
                        <p className={`text-xs ${theme.subText}`}>
                          {isCheckingNetwork
                            ? "Please wait while we scan connections"
                            : "Connect devices to the same network or use hotspot"}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Step 2: QR Code or Connected Status */}
                  <div className="text-center space-y-4">
                    {!multiClientEnabled && clients.length > 0 ? (
                      <>
                        {/* Connected Status - shown when multi-client is disabled and device connected */}
                        <p
                          className={`text-xs font-semibold uppercase tracking-wider ${theme.subText}`}
                        >
                          Status
                        </p>
                        <div className="flex flex-col items-center gap-6 py-8">
                          <div
                            className="w-24 h-24 rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: theme.accentColor + "20",
                            }}
                          >
                            <Check
                              size={48}
                              style={{ color: theme.accentColor }}
                              strokeWidth={2.5}
                            />
                          </div>
                          <div className="space-y-1">
                            <p className={`text-lg font-bold ${theme.text}`}>
                              Connected
                            </p>
                            <p className={`text-sm ${theme.subText}`}>
                              {clients[0].name || clients[0].platform} device
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* QR Code - shown when multi-client is enabled OR no device connected */}
                        <p
                          className={`text-xs font-semibold uppercase tracking-wider ${theme.subText}`}
                        >
                          Step 2: Scan QR
                        </p>

                        <div className="flex justify-center">
                          <div
                            className={`p-3 rounded-2xl ${
                              isDarkMode
                                ? "bg-white shadow-lg"
                                : "bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100"
                            }`}
                            style={{
                              opacity: serverInfo?.ssid ? 1 : 0.7,
                              filter: serverInfo?.ssid ? "none" : "blur(8px)",
                              transition: "all 0.3s ease",
                            }}
                          >
                            <div className="w-[180px] h-[180px]">
                              <QRCode
                                value={
                                  serverInfo?.url
                                    ? securityEnabled && securityToken
                                      ? `${serverInfo.url}?security=${securityToken}`
                                      : serverInfo.url
                                    : ""
                                }
                                style={{ height: "100%", width: "100%" }}
                                viewBox={`0 0 256 256`}
                              />
                            </div>
                          </div>
                        </div>

                        {/* URL Fallback */}
                        {serverInfo?.ssid ? (
                          <div className="flex items-center justify-center gap-2">
                            <code
                              className={`text-xs font-mono ${theme.subText}`}
                            >
                              {securityEnabled && securityToken
                                ? `${serverInfo.url}?security=${securityToken}`
                                : serverInfo.url}
                            </code>
                            <CopyButton
                              text={
                                securityEnabled && securityToken
                                  ? `${serverInfo.url}?security=${securityToken}`
                                  : serverInfo.url
                              }
                              className={`p-1.5 rounded-md transition-colors ${theme.ghostHover} ${theme.subText}`}
                              iconSize={12}
                              isDarkMode={isDarkMode}
                            />
                          </div>
                        ) : (
                          <p className={`text-xs ${theme.subText}`}>
                            Waiting for network connection...
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Server Controls */}
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={handleRestartServer}
                      disabled={isCheckingNetwork}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] ${
                        isCheckingNetwork ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      style={{
                        backgroundColor: activeAccent.color,
                      }}
                    >
                      <RefreshCw
                        size={18}
                        className={isCheckingNetwork ? "animate-spin" : ""}
                      />
                      {isCheckingNetwork ? "Restarting..." : "Restart Server"}
                    </button>
                  </div>
                </div>

                {/* Connected Clients - Only show when multi-client is enabled */}
                {multiClientEnabled && clients.length > 0 && (
                  <div
                    className={`mt-10 w-full px-4 animate-in slide-in-from-bottom-2 fade-in duration-500`}
                  >
                    <h3
                      className={`text-xs font-semibold uppercase tracking-wider mb-3 text-center ${theme.subText}`}
                    >
                      Connected Devices
                    </h3>
                    <div className="flex flex-col gap-2">
                      {clients.map((client) => (
                        <EditableDeviceName
                          key={client.ip}
                          client={client}
                          isDarkMode={isDarkMode}
                          theme={theme}
                          serverUrl={serverInfo?.url || ""}
                          adminToken={adminToken}
                          onBlock={handleBlockClient}
                          onBlockSending={handleBlockSending}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={`text-center ${theme.subText}`}>
                <div
                  className={`w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center mx-auto mb-4 animate-spin-slow ${theme.border} ${theme.iconText}`}
                >
                  <Upload size={24} />
                </div>
                <p>Starting server...</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={!!transactionToCancel}
        title="Cancel Transfer"
        message={
          <>
            Stop receiving "{transactionToCancel?.filename}"?
            <br />
            This will end the file transfer.
          </>
        }
        confirmText="Stop"
        cancelText="Continue"
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
