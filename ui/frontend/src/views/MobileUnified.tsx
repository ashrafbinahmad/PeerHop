import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useTransactions } from "../hooks/useTransactions";
import {
  formatBytes,
  calculateSpeed,
  calculateSpeedForClient,
  formatLiveSpeed,
} from "../utils/format";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CopyButton } from "../components/CopyButton";
import {
  X,
  MessageSquare,
  Upload,
  File,
  Download,
  Check,
  Copy,
  ArrowUp,
  Plus,
  Monitor,
  User,
  Smartphone,
  RefreshCw,
  ShieldAlert,
  Lock,
  Coffee,
  Globe,
} from "lucide-react";
import logo from "../assets/images/appicon.png";
import { ACCENT_COLORS, THEME_PRESETS } from "../themeConstants";
import { useTranslation } from "../hooks/useTranslation";

interface Props {
  downloadFilename?: string;
  downloadSize?: number;
}

// Logic for WiFi signal layers based on mbps
const signalLogic = {
  getLayers: (mbps: number) => {
    if (mbps >= 10) return 4;
    if (mbps >= 5) return 3;
    if (mbps >= 2) return 2;
    return 1;
  },
};

const getNumericSpeed = (bytes: number, timestamp: string) => {
  if (!bytes || !timestamp) return 0;
  const startTime = new Date(timestamp).getTime();
  const timeDiff = (Date.now() - startTime) / 1000;
  if (timeDiff <= 0) return 0;
  return bytes / (1024 * 1024) / timeDiff;
};

const WifiSignalIcon = ({
  layers,
  color,
}: {
  layers: number;
  color: string;
}) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="inline-block ml-1"
    style={{ marginBottom: "2px" }}
  >
    <path d="M12 20h.01" opacity={layers >= 1 ? 1 : 0.2} />
    <path d="M8.5 16.5a5 5 0 0 1 7 0" opacity={layers >= 2 ? 1 : 0.2} />
    <path d="M5 13a10 10 0 0 1 14 0" opacity={layers >= 3 ? 1 : 0.2} />
    <path d="M2 9.5a15 15 0 0 1 20 0" opacity={layers >= 4 ? 1 : 0.2} />
  </svg>
);

// Configuration to enable/disable auto-downloading of files
const SHOUL_AUTO_DOWNLOAD = false;

export const MobileUnified: React.FC<Props> = ({
  downloadFilename,
  downloadSize,
}) => {
  const [uploadProgress, setUploadProgress] = useState<{
    [key: string]: number;
  }>({});
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [myIp, setMyIp] = useState<string>("");

  // Grace period for initial connection (don't show "Connection failed" immediately)
  const [isInitializing, setIsInitializing] = useState(true);

  // Drag State
  const [isDragging, setIsDragging] = useState(false);

  // Drag Handlers
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
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  // Confirmation dialog state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [transactionToCancel, setTransactionToCancel] = useState<any>(null);

  const [showUploadCancelConfirm, setShowUploadCancelConfirm] = useState(false);
  const [uploadToCancel, setUploadToCancel] = useState<any>(null);

  // Notification State
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
  }>({ show: false, message: "" });

  const { t } = useTranslation();

  // Track which transaction is being downloaded (for instant feedback)
  const [downloadingTransactionId, setDownloadingTransactionId] = useState<
    number | null
  >(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea when textInput changes (handles both typing and clearing)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120,
      )}px`;
    }
  }, [textInput]);

  // Track highest progress seen for each transaction to prevent backwards jumps
  const highestProgressRef = useRef<Record<number, number>>({});

  const [securityToken, setSecurityToken] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("security") || "";
  });

  const [isUnauthorized, setIsUnauthorized] = useState(false);

  // ALL hooks MUST be called before any conditional returns (React Rules of Hooks)
  const {
    transactions,
    clients,
    sendText,
    isDarkMode,
    activeThemeId,
    activeAccentId,
    isConnected,
    deviceName,
    textTransferEnabled,
  } = useTransactions(2000, undefined, false, false, securityToken, true); // Pass security token and enable security

  // Track downloaded transaction IDs to prevent re-downloading
  const downloadedIdsRef = useRef<Set<number>>(new Set());
  const notifiedCompletionsRef = useRef<Set<number>>(new Set());

  // Effect to show one-time notification for first download completion
  useEffect(() => {
    // Only proceed if we have transactions and myIp
    if (!transactions || transactions.length === 0 || !myIp) return;

    // Check for the very first download completion across the entire session
    const hasShowedNotice = localStorage.getItem("hasShowedDownloadNotice");
    if (hasShowedNotice) return;

    // Find any newly completed download (not sent by me)
    const completedDownload = transactions.find(t => {
      // It must be a file, not sent by me, and completed
      const isMe = t.senderId === myIp;
      const isFile = t.type === "file";
      const isCompleted = t.status === "completed";
      
      // Also check client-specific status for non-me if available
      let isActuallyCompleted = isCompleted;
      if (!isMe && t.clientStatus?.[myIp] === "completed") {
        isActuallyCompleted = true;
      }

      return isFile && !isMe && isActuallyCompleted && !notifiedCompletionsRef.current.has(t.id);
    });

    if (completedDownload) {
      // Show notification
      setNotification({
        show: true,
        message: t("check_browser_downloads") || "Check your browser downloads to get the file"
      });
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        setNotification({ show: false, message: "" });
      }, 5000);

      // Store in local storage so it never shows again
      localStorage.setItem("hasShowedDownloadNotice", "true");
      
      // Also mark as notified locally
      notifiedCompletionsRef.current.add(completedDownload.id);
    }
  }, [transactions, myIp, t]);
  useEffect(() => {
    // Check security status on mount
    const checkSecurity = async () => {
      try {
        const res = await axios.get("/api/settings");
        // If security is enabled on server BUT we don't have a token -> Unauthorized
        if (res.data?.securityEnabled && !securityToken) {
          setIsUnauthorized(true);
        }
      } catch (err) {
        console.error("Failed to check security settings:", err);
      }
    };
    checkSecurity();

    // Axios interceptor for global 401 handling
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          setIsUnauthorized(true);
        }
        return Promise.reject(error);
      },
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, [securityToken]);

  const myClient = clients.find((c) => c.ip === myIp);
  const isBlocked = myClient?.blocked || false;
  // If fully blocked, sending is also implicitly blocked (in UI terms)
  // but strictly speaking SendingBlocked is a separate flag.
  // For UI disable state:
  const isSendingDisabled = isBlocked || myClient?.sendingBlocked || false;
  const isSendingBlockedOnly =
    !isBlocked && (myClient?.sendingBlocked || false);

  const activeTheme =
    THEME_PRESETS.find((t) => t.id === "day") || THEME_PRESETS[8];
  const activeAccent =
    ACCENT_COLORS.find((a) => a.id === "blue") || ACCENT_COLORS[0];

  const theme = {
    ...activeTheme,
    accentColor: activeAccent.color,
    // Add mobile specific aliases or overrides if needed
    headerText: activeTheme.text,
    bubbleMe: "text-white", // Background color handled via inline style
    avatarBg: activeTheme.iconBg + " " + activeTheme.iconText,
    inputArea: activeTheme.inputAreaBg,
    iconBtn: activeTheme.iconBg + " " + activeTheme.iconText,
    selectBtn:
      activeTheme.panelCard + " " + activeTheme.border + " " + activeTheme.text,
  };


  // Update document title when device name changes
  useEffect(() => {
    document.title = `${deviceName} - PeerHop client`;
  }, [deviceName]);

  // SCROLL — column-reverse: scrollTop=0 is bottom, negative values = scrolled up
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    // In column-reverse, scrollTop is 0 at the bottom (newest msgs visible)
    // and becomes negative as user scrolls up to see older messages
    const isAtBottom = Math.abs(el.scrollTop) < 10;
    isUserAtBottomRef.current = isAtBottom;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  useEffect(() => {
    // Fetch client's own IP from server (server uses RemoteAddr for identification)
    const fetchMyIP = async () => {
      try {
        const url = securityToken
          ? `/api/my-ip?security=${securityToken}`
          : "/api/my-ip";
        const response = await axios.get(url);
        if (response.data?.ip) {
          setMyIp(response.data.ip);
        }
      } catch (err) {
        console.error("[MobileUnified] Failed to fetch my IP:", err);
      }
    };
    fetchMyIP();

    // Grace period before showing connection issues
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isUserAtBottomRef.current) scrollToBottom();
  }, [transactions, isUploading, showTextInput]);

  // Clear downloading state when transaction status updates to in_progress or completed
  useEffect(() => {
    if (downloadingTransactionId !== null) {
      const transaction = transactions.find(
        (t) => t.id === downloadingTransactionId,
      );
      if (transaction) {
        const isMe = transaction.senderId === myIp;

        // Check client-specific status for downloads
        const clientStatus =
          myIp && transaction.clientStatus
            ? transaction.clientStatus[myIp]
            : undefined;

        // Use effective completion/cancellation logic
        const isActuallyDone =
          (!isMe && clientStatus === "completed") ||
          (isMe && transaction.status === "completed");

        const isActuallyInProgress =
          (!isMe && clientStatus === "in_progress") ||
          (isMe && transaction.status === "in_progress");

        // Clear download indicator if completed or in progress (server now tracking)
        if (isActuallyDone || isActuallyInProgress) {
          console.log(
            `[Download State] Clearing downloadingTransactionId for txn ${downloadingTransactionId} - status: ${transaction.status}, clientStatus: ${clientStatus}`,
          );
          setDownloadingTransactionId(null);
        }
      } else {
        // Transaction no longer exists - clear the state
        console.log(
          `[Download State] Clearing downloadingTransactionId for txn ${downloadingTransactionId} - transaction not found`,
        );
        setDownloadingTransactionId(null);
      }
    }
  }, [transactions, downloadingTransactionId, myIp]);

  // Clear highestProgressRef when downloads are cancelled or reset
  useEffect(() => {
    transactions.forEach((txn) => {
      // Clear progress tracking for cancelled transactions
      if (txn.status === "cancelled") {
        delete highestProgressRef.current[txn.id];
      }

      // Clear progress tracking if client-specific status is pending or cancelled
      if (myIp && txn.clientStatus) {
        const clientStatus = txn.clientStatus[myIp];
        if (clientStatus === "pending" || clientStatus === "cancelled") {
          delete highestProgressRef.current[txn.id];
        }
      }

      // Also clear if client progress or bytes are reset to 0
      if (myIp && txn.clientProgress && txn.clientProgress[myIp] === 0) {
        delete highestProgressRef.current[txn.id];
      }
    });
  }, [transactions, myIp]);

  // Hook for download speeds (WebSocket)
  // Speed is calculated inline using calculateSpeed helper

  // State for upload speeds (Local Axios)
  const [uploadSpeeds, setUploadSpeeds] = useState<Record<string, string>>({});

  const handleUpload = async (fileList: FileList) => {
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    isUserAtBottomRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const formData = new FormData();
    // Safely convert FileList to array and filter out any undefined entries
    const filesArray = Array.from(fileList).filter((f) => f != null);
    const fileNames = filesArray.map((f) => f.name);

    const totalSize = filesArray.reduce((acc, file) => acc + file.size, 0);
    if (totalSize > 10 * 1024 * 1024) {
      if (!localStorage.getItem("hasShowedLargeUploadNotice")) {
        setNotification({
          show: true,
          message: t("do_not_reload_upload") || "Please do not close or reload the page while sending",
        });
        setTimeout(() => setNotification({ show: false, message: "" }), 5000);
        localStorage.setItem("hasShowedLargeUploadNotice", "true");
      }
    }

    // Add files to formData and initialize progress
    filesArray.forEach((file) => {
      formData.append("file_size", file.size.toString());
      formData.append("file", file);
      setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));
    });

    try {
      // Build upload URL with security token
      const uploadUrl = securityToken
        ? `/api/upload?security=${securityToken}`
        : "/api/upload";

      await axios.post(uploadUrl, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const globalPercent =
            (progressEvent.loaded / progressEvent.total) * 100;

          setUploadProgress((prev) => {
            const next = { ...prev };
            fileNames.forEach((name) => {
              next[name] = globalPercent;
            });
            return next;
          });
        },
      });

      setIsUploading(false);
      setUploadProgress({});
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(scrollToBottom, 100);
    } catch (err: any) {
      if (!axios.isCancel(err)) {
        setNotification({ show: true, message: t("upload_failed") });
        setTimeout(() => setNotification({ show: false, message: "" }), 3000);
      }
      setIsUploading(false);
      setUploadProgress({});
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
    }
    e.target.value = "";
  };

  const handleCancelUpload = () => {
    setShowUploadCancelConfirm(true);
  };

  const confirmCancelUpload = async () => {
    // Identify active upload transactions to cancel on server
    const activeUploads = transactions.filter(
      (t) =>
        (t.senderId === myIp || t.senderId === "server") &&
        t.senderId === myIp &&
        t.status === "in_progress" &&
        uploadProgress[t.filename || ""] !== undefined,
    );

    // Call API to cancel on server (don't await strictly to ensure abort happens)
    activeUploads.forEach((t) => {
      axios
        .post(`/api/cancel-transaction/${t.id}${securityToken ? `?security=${securityToken}` : ""}`)
        .catch((err) => console.error("Failed to cancel txn on server", err));
    });

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsUploading(false);
      setUploadProgress({});
      setUploadSpeeds({});
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    setShowUploadCancelConfirm(false);
  };

  const cancelCancelUpload = () => {
    setShowUploadCancelConfirm(false);
  };

  const handleDownload = (e: React.MouseEvent, transaction: any) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if blocked
    if (isBlocked) {
      setNotification({
        show: true,
        message: (t as any)("you_are_blocked") || "You are Blocked",
      });
      setTimeout(() => setNotification({ show: false, message: "" }), 3000);
      return;
    }

    // Set downloading state immediately for instant feedback
    setDownloadingTransactionId(transaction.id);

    // Safety timeout: Clear "Starting..." state if server doesn't respond or transition status in 5s
    setTimeout(() => {
      setDownloadingTransactionId((prev) =>
        prev === transaction.id ? null : prev,
      );
    }, 5000);

    if (transaction.downloadLink) {
      // Server identifies client by IP from request
      const link = document.createElement("a");
      const downloadUrl = securityToken
        ? `${transaction.downloadLink}${
            transaction.downloadLink.includes("?") ? "&" : "?"
          }security=${securityToken}`
        : transaction.downloadLink;
      link.href = downloadUrl;
      link.download = transaction.filename || "file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleCancelDownload = (e: React.MouseEvent, transaction: any) => {
    e.preventDefault();
    e.stopPropagation();
    setTransactionToCancel(transaction);
    setShowCancelConfirm(true);
  };

  const confirmCancelDownload = async () => {
    if (!transactionToCancel) return;

    try {
      const url = securityToken
        ? `/api/cancel-download/${transactionToCancel.id}?security=${securityToken}`
        : `/api/cancel-download/${transactionToCancel.id}`;
      await axios.post(url);
      console.log(
        `Cancelled download for transaction ${transactionToCancel.id}`,
      );
      setShowCancelConfirm(false);
      setTransactionToCancel(null);
      setDownloadingTransactionId(null);
    } catch (err) {
      console.error("Failed to cancel download:", err);
      setNotification({ show: true, message: t("failed_to_cancel_download") });
      setTimeout(() => setNotification({ show: false, message: "" }), 3000);
      setShowCancelConfirm(false);
      setTransactionToCancel(null);
      setDownloadingTransactionId(null);
    }
  };

  const cancelCancelDownload = () => {
    setShowCancelConfirm(false);
    setTransactionToCancel(null);
  };

  const handleSelectFiles = () => {
    if (isSendingDisabled) return;
    fileInputRef.current?.click();
  };

  const handleSendText = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isSendingDisabled) return;
    if (!textInput.trim()) return;
    try {
      isUserAtBottomRef.current = true;
      await sendText(textInput, myIp);
      setTextInput("");
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error(err);
      setNotification({ show: true, message: t("failed_to_send_text") });
      setTimeout(() => setNotification({ show: false, message: "" }), 3000);
    }
  };

  // Show all transactions (including uploads)
  const visibleTransactions = transactions;

  // Blocked or Unauthorized overlay
  if (isBlocked || isUnauthorized) {
    const isAuth = isUnauthorized && !isBlocked;
    return (
      <div
        className={`min-h-screen flex flex-col justify-between px-10 py-12 ${theme.bg}`}
      >
        {/* Main Content */}
        <div className="flex flex-col items-start justify-center flex-1 max-w-md">
          {/* Icon */}
          <div className="mb-10">
            <div
              className={`w-20 h-20 rounded-3xl flex items-center justify-center border ${theme.panelCard} ${theme.border}`}
            >
              {isAuth ? (
                <Lock size={40} className="text-red-500/80" strokeWidth={2} />
              ) : (
                <ShieldAlert
                  size={40}
                  className="text-red-500/80"
                  strokeWidth={2}
                />
              )}
            </div>
          </div>

          {/* Text */}
          <div className="space-y-5 text-start">
            <div className="space-y-2">
              <h2
                className={`text-4xl font-black italic uppercase tracking-tight leading-tight ${theme.text}`}
              >
                {isAuth
                  ? (t as any)("auth_failed") || "Authentication Failed"
                  : (t as any)("you_are_blocked") || "You are Blocked"}
              </h2>

              <div className="h-1 w-12 rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  className="h-full w-1/2 rounded-full"
                  style={{ backgroundColor: theme.accentColor }}
                />
              </div>
            </div>

            <p className="text-gray-500 dark:text-gray-400 text-lg font-medium max-w-sm">
              {isAuth
                ? (t as any)("auth_description") ||
                  "The security token for this device is invalid or has expired. Please re-scan the QR code from the desktop app to continue."
                : (t as any)("blocked_description") ||
                  "The host has restricted your access."}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-6 pt-10">
          <div className="flex items-center gap-3">
            <img src={logo} alt="PeerHop Logo" className="w-10 h-10" />
            <span className={`text-2xl font-black ${theme.text}`}>PeerHop</span>
          </div>

          <div className="flex flex-col gap-3 text-xs font-bold tracking-widest uppercase opacity-60">
            <a
              href="https://peerhop.in"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 hover:opacity-100 ${theme.text}`}
            >
              <Globe size={14} strokeWidth={3} />
              peerhop.in
            </a>

            <a
              href="https://buymeacoffee.com/peerhop"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 hover:opacity-100 ${theme.text}`}
            >
              <Coffee size={14} strokeWidth={3} />
              {(t as any)("buy_developer_a_coffee") || "BUY ME A COFFEE"}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-rows-[max-content_auto_1fr_max-content] fixed inset-0 h-[100dvh] w-full font-sans overflow-hidden _bg-background transition-colors duration-300 ${theme.bg} ${theme.text}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 z-[100] backdrop-blur-sm border-4 border-dashed rounded-lg flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-200 m-2"
          style={{
            backgroundColor: `${theme.accentColor}1A`,
            borderColor: theme.accentColor,
          }} // 1A = 10% opacity
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
      {/* HEADER */}
      <div
        className={`shrink-0 pt-safe-top backdrop-blur-xl border-b z-20 transition-colors duration-300 ${theme.headerBg}`}
      >
        <div className="flex items-center justify-center py-3 px-4 h-[44px]">
          <h2 className={`text-[17px] font-semibold ${theme.headerText}`}>
            {deviceName}
          </h2>
        </div>
      </div>

      {/* DISCONNECTED BANNER */}
      {!isConnected && !isInitializing ? (
        <div className="shrink-0 bg-red-500 text-white px-4 py-2.5 flex items-center justify-between text-sm shadow-lg z-30 animate-in slide-in-from-top duration-300">
          <div className="flex gap-3">
            <span className="font-bold leading-none">
              {t("connection_lost")}
            </span>
          </div>
          <button type="button"
            onClick={() => window.location.reload()}
            className="bg-white text-red-600 active:scale-95 p-1.5 rounded-full font-bold transition-all flex items-center gap-2 text-xs shadow-sm"
          >
            <RefreshCw size={14} strokeWidth={3} />
          </button>
        </div>
      ) : (
        <div />
      )}

      {/* MESSAGES — column-reverse anchors scroll to bottom natively */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2 flex flex-col-reverse scroll-smooth relative custom-scrollbar min-h-0"
      >
        <div className="flex flex-col gap-1">
          {visibleTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 animate-in fade-in zoom-in-95 duration-500 pb-20 mt-auto mb-auto">
              {!isSendingDisabled ? (
                <>
                  {/* Big Share File Button */}
                  <button type="button"
                    onClick={handleSelectFiles}
                    disabled={isSendingDisabled}
                    className={`group relative flex flex-col items-center justify-center gap-4 w-64 h-52 rounded-2xl border shadow-sm transition-all duration-300 active:scale-[0.98] ${
                      theme.border
                    } ${theme.iconBg} ${isSendingDisabled ? "opacity-50 cursor-default" : ""}`}
                  >
                    <Plus
                      size={54}
                      strokeWidth={2.5}
                      className={`mb-2 transition-all duration-300 opacity-70 ${theme.text}`}
                    />
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`text-xl font-bold tracking-tight opacity-70 ${theme.text}`}
                      >
                        {t("share_file")}
                      </span>
                      <span
                        className={`text-xs opacity-60 font-medium ${theme.text}`}
                      >
                        {t("tap_browse")}
                      </span>
                    </div>
                  </button>

                  {/* Small Send Text Button - Only if enabled */}
                  {textTransferEnabled && (
                    <button type="button"
                      onClick={() => {
                        setShowTextInput(true);
                      }}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-full border shadow-sm transition-all duration-300 active:scale-95 ${
                        theme.border
                      } ${theme.iconBg}`}
                    >
                      <MessageSquare
                        size={16}
                        strokeWidth={2}
                        className={`opacity-70 ${theme.text}`}
                      />
                      <span
                        className={`text-sm font-bold opacity-70 ${theme.text}`}
                      >
                        {t("send_text")}
                      </span>
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 text-center px-8">
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center opacity-20 ${theme.iconBg}`}
                  >
                    <Plus size={32} className={theme.text} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span
                      className={`text-lg font-bold opacity-40 ${theme.text}`}
                    >
                      {t("sending_disabled")}
                    </span>
                    <span
                      className={`text-xs opacity-30 font-medium ${theme.text}`}
                    >
                      {(t as any)("host_restricted_sending") ||
                        "The host has restricted sending from this device"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            visibleTransactions.map((transaction, index) => {
              const isMe = transaction.senderId === myIp;
              const isRightSide = isMe;
              const isFile = transaction.type === "file";
              const bubbleClass = isRightSide
                ? theme.bubbleMe
                : theme.bubbleOther;
              const widthClass = isFile
                ? "w-[calc(95vw-80px)] max-w-[500px]"
                : "w-fit min-w-[85px] max-w-[calc(100vw-100px)] text-left";

              const senderChanged = index > 0 && visibleTransactions[index - 1].senderId !== transaction.senderId;
              const isLast = index === visibleTransactions.length - 1;
              const needsTopMargin = senderChanged;
              const needsBottomMargin = isLast;

              // Progress logic - use client-specific for downloads
              const currentFilename = transaction.filename || "";
              const localProgress = currentFilename
                ? uploadProgress[currentFilename]
                : undefined;

              // For downloads (!isMe), check client-specific progress
              let clientProgress = 0;
              let clientStatus = transaction.status;
              if (!isMe && myIp) {
                // For downloads, we MUST use client-specific status if it exists
                // If it doesn't exist, it means this client hasn't started downloading yet
                if (
                  transaction.clientStatus &&
                  transaction.clientStatus[myIp]
                ) {
                  clientStatus = transaction.clientStatus[myIp];
                  clientProgress =
                    (transaction.clientProgress &&
                      transaction.clientProgress[myIp]) ||
                    0;
                } else if (
                  transaction.status === "completed" ||
                  transaction.status === "in_progress"
                ) {
                  // File is available on server, but I haven't started downloading
                  clientStatus = "pending";
                  clientProgress = 0;
                }
                // If transaction.status is "cancelled" or "failed", we keep it as clientStatus
              }

              // Use client-specific status for downloads (declare early)
              const effectiveStatus = clientStatus;

              // Determine the raw progress value
              const rawPercent =
                localProgress !== undefined &&
                transaction.status === "in_progress"
                  ? localProgress // Upload progress
                  : !isMe && clientProgress > 0
                    ? clientProgress // Download progress (client-specific)
                    : transaction.transactionPercent; // Fallback to global

              // Convert to number and validate
              let currentProgress = isNaN(Number(rawPercent))
                ? 0
                : Number(rawPercent);

              // Ensure progress is in valid range
              currentProgress = Math.max(0, Math.min(100, currentProgress));

              // Debug logging for progress
              if (!isMe && transaction.id) {
                console.log(
                  `[Progress Debug] Txn ${transaction.id}: rawPercent=${rawPercent}, currentProgress=${currentProgress}, effectiveStatus=${effectiveStatus}, clientProgress=${clientProgress}, isMe=${isMe}`,
                );
              }

              // Prevent progress from going backwards (common issue on mobile)
              // Only enforce this for in-progress downloads
              if (
                effectiveStatus === "in_progress" ||
                transaction.status === "in_progress"
              ) {
                const previousHighest =
                  highestProgressRef.current[transaction.id] || 0;

                // Detect download restart: if current progress is very low but we had high progress before,
                // this is likely a restart after cancellation - reset tracking
                if (currentProgress < 5 && previousHighest > 10) {
                  console.log(
                    `[Progress] Detected download restart for txn ${transaction.id}: resetting from ${previousHighest}% to ${currentProgress}%`,
                  );
                  delete highestProgressRef.current[transaction.id];
                  // Update with the new (low) progress value
                  if (currentProgress > 0) {
                    highestProgressRef.current[transaction.id] =
                      currentProgress;
                  }
                  // Allow the new progress to be shown
                } else if (
                  currentProgress < previousHighest &&
                  currentProgress > 0
                ) {
                  // Don't let it go backwards (unless it's a restart)
                  console.log(
                    `[Progress] Preventing backwards: txn ${transaction.id} from ${currentProgress}% to ${previousHighest}%`,
                  );
                  currentProgress = previousHighest;
                } else if (currentProgress > previousHighest) {
                  // Update the highest seen
                  highestProgressRef.current[transaction.id] = currentProgress;
                }
              } else if (effectiveStatus === "completed") {
                // For completed transactions, always show 100%
                currentProgress = 100;
                highestProgressRef.current[transaction.id] = 100;
              } else if (
                effectiveStatus === "cancelled" ||
                transaction.status === "cancelled"
              ) {
                // For cancelled, clean up tracking
                delete highestProgressRef.current[transaction.id];
              } else if (effectiveStatus === "pending") {
                // Also clear tracking when returning to pending state (preparing for restart)
                if (highestProgressRef.current[transaction.id] !== undefined) {
                  console.log(
                    `[Progress] Clearing tracking for txn ${transaction.id} - status is pending`,
                  );
                  delete highestProgressRef.current[transaction.id];
                }
              }

              const displayPercent = currentProgress;

              // Final debug log
              if (!isMe && transaction.id) {
                console.log(
                  `[Progress Final] Txn ${
                    transaction.id
                  }: displayPercent=${displayPercent}, will show progress UI: ${
                    effectiveStatus === "in_progress" ||
                    downloadingTransactionId === transaction.id
                  }`,
                );
              }

              return (
                <div
                  key={transaction.id}
                  className={`flex gap-2 items-end ${
                    isRightSide ? "justify-end" : "justify-start"
                  } ${needsTopMargin ? "mt-4" : ""}`}
                >
                  {/* Avatar for LEFT side: Client (if !isMe) OR CopyButton (if isMe) */}
                  {!isRightSide && (
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mb-1 ${theme.avatarBg}`}
                    >
                      {transaction.senderId === "server" ? (
                        <Monitor size={16} />
                      ) : (
                        <User size={16} />
                      )}
                    </div>
                  )}

                  {isRightSide && transaction.type === "text" && (
                     <div className="mb-2 shrink-0">
                        <CopyButton
                          text={transaction.textContent || ""}
                          className={`p-1 rounded-full text-white/50 active:scale-95`}
                          iconSize={14}
                        />
                     </div>
                  )}

                  <div
                    className={`relative rounded-xl overflow-hidden shadow-sm ${widthClass} ${bubbleClass} transition-all duration-300 ${
                      transaction.status === "cancelled"
                        ? "opacity-60"
                        : ""
                    }`}
                    style={
                      isRightSide ? { backgroundColor: theme.accentColor } : {}
                    }
                  >
                    {/* Background Progress Fill (Increased Opacity) */}
                    {(effectiveStatus === "in_progress" ||
                      (isMe && transaction.status === "in_progress")) && (
                      <>
                        <div
                          className={`absolute top-0 left-0 h-full pointer-events-none transition-all duration-300 ${
                            isMe ? "bg-white/20" : ""
                          }`}
                          style={{
                            width: `${displayPercent}%`,
                            backgroundColor: !isMe
                              ? `${theme.accentColor}33`
                              : undefined, // 20% opacity instead of 10%
                          }}
                        />
                        {/* More visible progress bar at the bottom */}
                        <div
                          className={`absolute bottom-0 left-0 h-1.5 pointer-events-none transition-all duration-300 ${
                            isMe ? "bg-white/60" : ""
                          }`}
                          style={{
                            width: `${displayPercent}%`,
                            backgroundColor: !isMe
                              ? theme.accentColor
                              : undefined, // Solid accent for bar if not me
                          }}
                        />
                      </>
                    )}

                    <div className="pt-3 px-3 pb-5 relative z-10">
                      {/* TEXT */}
                      {transaction.type === "text" && (
                        <div className="text-[13px] whitespace-break-spaces overflow-x-auto overflow-y-auto max-h-[300px] custom-scrollbar text-selectable leading-relaxed">
                          <span className="text-selectable">{transaction.textContent}</span>
                        </div>
                      )}

                      {/* FILE */}
                      {isFile && (
                        <div className="flex items-center gap-3 text-left">
                          {(() => {
                            // Extract extension and determine media type
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
                              "heic",
                            ].includes(ext || "");
                            const isVideo = [
                              "mp4",
                              "webm",
                              "ogg",
                              "mov",
                            ].includes(ext || "");

                            // Construct media URL (absolute for mobile client)
                            const protocol = window.location.protocol;
                            const host = window.location.host;
                            const mediaUrl = transaction.downloadLink
                              ? `${protocol}//${host}${transaction.downloadLink}`
                              : "";

                            if (isImage && mediaUrl) {
                              return (
                                <div className="w-10 h-10 rounded-lg bg-black/5 overflow-hidden shrink-0 border border-black/5">
                                  <img
                                    src={`${mediaUrl}${
                                      mediaUrl.includes("?") ? "&" : "?"
                                    }preview=true${
                                      securityToken
                                        ? `&security=${securityToken}`
                                        : ""
                                    }`}
                                    alt="preview"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      // Fallback on error (e.g., auth issue or 404)
                                      const img = e.target as HTMLImageElement;
                                      img.style.display = "none";
                                      if (img.nextElementSibling) {
                                        img.nextElementSibling.classList.remove(
                                          "hidden",
                                        );
                                        img.nextElementSibling.classList.add(
                                          "flex",
                                        );
                                      }
                                    }}
                                  />
                                  <div className="hidden w-full h-full items-center justify-center bg-gray-100 dark:bg-slate-700">
                                    <File size={20} />
                                  </div>
                                </div>
                              );
                            }

                            if (isVideo && mediaUrl) {
                              return (
                                <div className="w-10 h-10 rounded-lg bg-black/10 overflow-hidden shrink-0 relative flex items-center justify-center border border-black/5">
                                  <video
                                    src={`${mediaUrl}${
                                      mediaUrl.includes("?") ? "&" : "?"
                                    }preview=true${
                                      securityToken
                                        ? `&security=${securityToken}`
                                        : ""
                                    }#t=0.1`}
                                    className="w-full h-full object-cover absolute inset-0 pointer-events-none"
                                    preload="metadata"
                                    playsInline
                                    muted
                                  />
                                  <div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center z-10 backdrop-blur-sm">
                                    {/* Play icon small */}
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="white"
                                      className="ml-0.5"
                                    >
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </div>
                                </div>
                              );
                            }

                            // Default Icon
                            return (
                              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                                <File size={20} />
                              </div>
                            );
                          })()}

                          <div className="flex-1 min-w-0 text-[15px]">
                            <div className="font-medium truncate">
                              {transaction.filename}
                            </div>
                            <div className="text-xs">
                              {(!isMe &&
                                (effectiveStatus === "in_progress" ||
                                  downloadingTransactionId ===
                                    transaction.id)) ||
                              (isMe && transaction.status === "in_progress") ? (
                                <div className="flex flex-col gap-0.5 mt-1 font-mono">
                                  <span className="flex items-center opacity-70">
                                    {(() => {
                                      // Try to use live delta-based speed
                                      // Try to use live delta-based speed
                                      let speedBps = 0;
                                      if (isMe) {
                                        speedBps =
                                          transaction.overallSpeed || 0;
                                      } else if (
                                        myIp &&
                                        transaction.clientSpeed &&
                                        transaction.clientSpeed[myIp] !==
                                          undefined
                                      ) {
                                        speedBps =
                                          transaction.clientSpeed[myIp];
                                      } else if (
                                        transaction.clientSpeed &&
                                        Object.keys(transaction.clientSpeed)
                                          .length > 0
                                      ) {
                                        speedBps = Object.values(
                                          transaction.clientSpeed,
                                        )[0];
                                      }

                                      const mbpsStr = formatLiveSpeed(speedBps);
                                      const mbps = speedBps / (1024 * 1024);
                                      const layers =
                                        signalLogic.getLayers(mbps);
                                      return (
                                        <>
                                          {mbpsStr}
                                          <WifiSignalIcon
                                            layers={layers}
                                            color={
                                              isMe ? "#fff" : theme.accentColor
                                            }
                                          />
                                        </>
                                      );
                                    })()}
                                  </span>
                                  <span className="opacity-70">
                                    {(() => {
                                      // Use actual client bytes if available for downloads
                                      let downloadedBytes = 0;
                                      if (
                                        !isMe &&
                                        myIp &&
                                        transaction.clientBytes &&
                                        transaction.clientBytes[myIp] !==
                                          undefined
                                      ) {
                                        downloadedBytes =
                                          transaction.clientBytes[myIp];
                                      } else if (
                                        !isMe &&
                                        transaction.bytesTransferred
                                      ) {
                                        downloadedBytes =
                                          transaction.bytesTransferred;
                                      } else {
                                        // Calculate from percentage as fallback
                                        downloadedBytes =
                                          (transaction.fileSize || 0) *
                                          (displayPercent / 100);
                                      }
                                      return formatBytes(downloadedBytes);
                                    })()}{" "}
                                    /{" "}
                                    {formatBytes(transaction.fileSize, [
                                      "GB",
                                      "TB",
                                      "PB",
                                    ])}
                                  </span>
                                  <span className="font-bold flex justify-between w-full mt-1">
                                    <span className="text-3xl font-black tracking-tighter drop-shadow-sm">
                                      {displayPercent.toFixed(1)}%
                                    </span>
                                    {/* Time absolutely positioned at bottom-right corner */}
                                    <span className="absolute right-1.5 bottom-1 opacity-70 font-normal text-[10px] tabular-nums">
                                      {new Date(
                                        transaction.timestamp,
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5 mt-0.5 opacity-70">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span>
                                        {formatBytes(transaction.fileSize)}
                                      </span>
                                    {(effectiveStatus === "cancelled" ||
                                      (isMe &&
                                        transaction.status === "in_progress" &&
                                        uploadProgress[
                                          transaction.filename || ""
                                        ] === undefined)) && (
                                      <span className={`font-bold ${isMe ? "text-red-600 bg-white/95 px-1.5 py-0.5 rounded-md shadow-sm" : "text-red-500"}`}>
                                        {t("cancelled")}
                                      </span>
                                    )}
                                    {!isMe &&
                                      downloadingTransactionId ===
                                        transaction.id && (
                                        <span
                                          className="font-medium"
                                          style={{ color: theme.accentColor }}
                                        >
                                          {t("downloading")}
                                        </span>
                                      )}
                                    {!isMe && effectiveStatus === "completed" && (
                                        <span className="text-green-500 font-medium text-[13px]">{t("received")}</span>
                                    )}
                                    {isMe && effectiveStatus === "completed" && (
                                        <span className="text-white/90 font-medium text-[13px]">{t("sent")}</span>
                                    )}
                                    </div>
                                  </div>
                              )}
                            </div>
                          </div>

                          {/* Upload Cancel Button - Same size/space as download */}
                          {isMe && transaction.status === "in_progress" && (
                            <button type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelUpload();
                              }}
                              className={`p-2.5 rounded-2xl shrink-0 relative z-10 transition-colors ${
                                isDarkMode
                                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                  : "bg-red-100 text-red-600 hover:bg-red-200"
                              }`}
                              title={t("cancel_upload")}
                            >
                              <X size={20} />
                            </button>
                          )}

                          {/* Download/Cancel button only if NOT me */}
                          {!isMe && transaction.downloadLink && (
                            <>
                              {effectiveStatus === "in_progress" ? (
                                // Cancel button during download
                                <button type="button"
                                  onClick={(e) =>
                                    handleCancelDownload(e, transaction)
                                  }
                                  className={`p-2.5 rounded-2xl shrink-0 relative z-10 transition-all active:scale-95 shadow-md ${
                                    isDarkMode
                                      ? "bg-red-500/30 text-red-400 hover:bg-red-500/40"
                                      : "bg-red-500 text-white hover:bg-red-600 shadow-red-200/50"
                                  }`}
                                  title={t("cancel_download")}
                                >
                                  <X size={20} strokeWidth={2.5} />
                                </button>
                              ) : (
                                // Download button when not downloading
                                <button type="button"
                                  onClick={(e) =>
                                    handleDownload(e, transaction)
                                  }
                                  disabled={
                                    downloadingTransactionId === transaction.id
                                  }
                                  className={`p-2.5 rounded-2xl shrink-0 relative z-10 transition-all active:scale-95 shadow-lg ${
                                    downloadingTransactionId === transaction.id
                                      ? isDarkMode
                                        ? "bg-slate-800 text-slate-600 cursor-default"
                                        : "bg-gray-200 text-gray-400 cursor-default"
                                      : isDarkMode
                                        ? "bg-slate-300 text-slate-800 hover:bg-white shadow-black/20"
                                        : "text-white shadow-sky-200/50 hover:opacity-90"
                                  }`}
                                  style={
                                    downloadingTransactionId !==
                                      transaction.id && !isDarkMode
                                      ? { backgroundColor: theme.accentColor }
                                      : downloadingTransactionId !==
                                            transaction.id && isDarkMode
                                        ? {
                                            backgroundColor: "#fff",
                                            color: "#000",
                                          }
                                        : {}
                                  }
                                  title={
                                    downloadingTransactionId === transaction.id
                                      ? t("starting")
                                      : t("download")
                                  }
                                >
                                  <Download size={20} strokeWidth={2.5} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* STATUS */}
                      {/* STATUS - Only for TEXT or when NOT in progress file */}
                      {(!isFile ||
                        (effectiveStatus !== "in_progress" &&
                          !(isMe && transaction.status === "in_progress"))) && (
                        <div className="absolute right-1.5 bottom-1 flex items-center text-[10px] opacity-70 pointer-events-none">
                          <span>
                            {new Date(transaction.timestamp).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </span>
                          {effectiveStatus === "completed" && (
                            <Check size={12} className="ml-1" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Avatar for RIGHT side: CopyButton (if !isMe) OR Smartphone (if isMe) */}
                  {!isRightSide && transaction.type === "text" && (
                     <div className="mb-2 shrink-0">
                        <CopyButton
                          text={transaction.textContent || ""}
                          className={`p-1 rounded-full text-gray-400 dark:text-slate-500 active:scale-95`}
                          iconSize={14}
                        />
                     </div>
                  )}

                  {isRightSide && (
                    <div className="shrink-0 w-8 h-8 rounded-full bg-[#007AFF]/20 flex items-center justify-center text-[#007AFF] overflow-hidden mb-1">
                      <Smartphone size={16} />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </div>

      {/* INPUT AREA */}
      {(visibleTransactions.length > 0 ||
        showTextInput ||
        isBlocked ||
        isSendingBlockedOnly ||
        !isConnected) && (
        <div
          className={`shrink-0 border-t z-30 pb-safe-bottom transition-colors duration-300 ${theme.inputArea}`}
        >
          {showTextInput && !isSendingDisabled && (
            <div className={`p-4 border-t ${activeTheme.border}`}>
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendText();
                    }
                  }}
                  placeholder={t("type_a_message")}
                  className={`flex-1 px-4 py-2.5 rounded-xl outline-none resize-none min-h-[42px] max-h-[120px] custom-scrollbar overflow-y-auto ${
                    theme.inputField
                  }`}
                  rows={1}
                  autoFocus
                />
                <button type="button"
                  onClick={handleSendText}
                  className={`p-2 rounded-xl text-white transition-colors`}
                  style={{ backgroundColor: theme.accentColor }}
                >
                  <ArrowUp size={20} />
                </button>
              </div>
            </div>
          )}

          {visibleTransactions.length > 0 && !isSendingDisabled && (
            <div className="p-4 pt-2">
              <div className="flex gap-3">
                <button type="button"
                  onClick={handleSelectFiles}
                  className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 border transition-colors ${
                    theme.selectBtn
                  }`}
                >
                  <Upload size={18} style={{ color: theme.accentColor }} />
                  <span>{t("select_files")}</span>
                </button>

                {/* Hidden Input */}

                {/* Toggle Text Input */}
                {textTransferEnabled && (
                  <button type="button"
                    onClick={() => {
                      setShowTextInput(!showTextInput);
                      if (!showTextInput) {
                        setTimeout(scrollToBottom, 100);
                      }
                    }}
                    className={`px-4 rounded-xl flex items-center justify-center transition-colors border ${theme.panelCard} ${theme.border}`}
                  >
                    {showTextInput ? (
                      <X size={20} className={theme.text} />
                    ) : (
                      <MessageSquare size={20} className={theme.text} />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Connection Status */}
          {/* Status Message - only show if blocked */}
          {(isBlocked || isSendingBlockedOnly) && (
            <div className="flex items-center justify-center gap-2 mt-2 py-1.5 pb-safe-bottom">
              {!isBlocked && isSendingBlockedOnly ? (
                // Orange dot for sending blocked
                <div className="w-2 h-2 rounded-full bg-orange-400"></div>
              ) : (
                // Orange dot for full block
                <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              )}
              <span
                className={`text-xs font-medium ${
                  isDarkMode ? "text-orange-300" : "text-orange-600"
                }`}
              >
                {isBlocked ? t("you_are_blocked") : t("sending_is_blocked")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Hidden File Input - Always Rendered */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title={t("cancel_download_title")}
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
        onConfirm={confirmCancelDownload}
        onCancel={cancelCancelDownload}
        destructive={true}
        isDarkMode={isDarkMode}
      />

      <ConfirmDialog
        isOpen={showUploadCancelConfirm}
        title={t("cancel_upload_title")}
        message={
          <>
            {t("stop_sending_files")}
            <br />
            {t("this_will_end_transfer")}
          </>
        }
        confirmText={t("stop_sending")}
        confirmingText="Stopping..."
        cancelText={t("continue")}
        onConfirm={confirmCancelUpload}
        onCancel={cancelCancelUpload}
        destructive={true}
        isDarkMode={isDarkMode}
      />

      {/* Toast Notification */}
      {notification.show && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div
            className={`px-4 py-3 rounded-full shadow-lg flex items-center gap-3 ${
              isDarkMode ? "bg-slate-800 text-white" : "bg-gray-900 text-white"
            }`}
          >
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};
