import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useTransactions } from "../hooks/useTransactions";
import { useTransferSpeed, formatBytes } from "../hooks/useTransferSpeed";
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
  Monitor,
  User,
  Smartphone,
} from "lucide-react";
import { ACCENT_COLORS, THEME_PRESETS } from "../themeConstants";

interface Props {
  downloadFilename?: string;
  downloadSize?: number;
}

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

  // Track which transaction is being downloaded (for instant feedback)
  const [downloadingTransactionId, setDownloadingTransactionId] = useState<
    number | null
  >(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  const [securityToken, setSecurityToken] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("security") || "";
  });

  const [isUnauthorized, setIsUnauthorized] = useState(false);

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
  }, [securityToken]);

  if (isUnauthorized) {
    return (
      <div className="fixed inset-0 bg-gray-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6 text-center z-50">
        <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-500 dark:text-red-400"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Access Denied
        </h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-sm">
          This PeerHop server is protected. Please scan the QR code from the
          desktop application to access files.
        </p>
      </div>
    );
  }

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

  const myClient = clients.find((c) => c.ip === myIp);
  const isBlocked = myClient?.blocked || false;
  // If fully blocked, sending is also implicitly blocked (in UI terms)
  // but strictly speaking SendingBlocked is a separate flag.
  // For UI disable state:
  const isSendingDisabled = isBlocked || myClient?.sendingBlocked || false;
  const isSendingBlockedOnly =
    !isBlocked && (myClient?.sendingBlocked || false);

  const activeTheme =
    THEME_PRESETS.find((t) => t.id === activeThemeId) ||
    THEME_PRESETS.find((t) => t.id === "night") ||
    THEME_PRESETS[3];
  const activeAccent =
    ACCENT_COLORS.find((a) => a.id === activeAccentId) || ACCENT_COLORS[0];

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

  // SCROLL
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 150;

    isUserAtBottomRef.current = isAtBottom;
    setShowScrollButton(!isAtBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
        (t) => t.id === downloadingTransactionId
      );
      if (transaction) {
        // Check both global status and client-specific status
        const isCompleted = transaction.status === "completed";
        const clientStatus =
          myIp && transaction.clientStatus
            ? transaction.clientStatus[myIp]
            : undefined;
        const isClientDone =
          clientStatus === "completed" || clientStatus === "in_progress";

        if (isCompleted || isClientDone) {
          setDownloadingTransactionId(null);
        }
      }
    }
  }, [transactions, downloadingTransactionId, myIp]);

  // Hook for download speeds (WebSocket)
  const downloadSpeeds = useTransferSpeed(transactions, myIp);

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
        setNotification({ show: true, message: "Upload failed" });
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
        uploadProgress[t.filename || ""] !== undefined
    );

    // Call API to cancel on server (don't await strictly to ensure abort happens)
    activeUploads.forEach((t) => {
      axios
        .post(`/api/cancel-transaction/${t.id}`)
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
    e.stopPropagation();

    // Set downloading state immediately for instant feedback
    setDownloadingTransactionId(transaction.id);

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
        `Cancelled download for transaction ${transactionToCancel.id}`
      );
      setShowCancelConfirm(false);
      setTransactionToCancel(null);
    } catch (err) {
      console.error("Failed to cancel download:", err);
      setNotification({ show: true, message: "Failed to cancel download" });
      setTimeout(() => setNotification({ show: false, message: "" }), 3000);
      setShowCancelConfirm(false);
      setTransactionToCancel(null);
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

  const handleSendText = async () => {
    if (isSendingDisabled) return;
    if (!textInput.trim()) return;
    try {
      isUserAtBottomRef.current = true;
      await sendText(textInput, myIp);
      setTextInput("");
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error(err);
      setNotification({ show: true, message: "Failed to send text" });
      setTimeout(() => setNotification({ show: false, message: "" }), 3000);
    }
  };

  // Show all transactions (including uploads)
  const visibleTransactions = transactions;

  return (
    <div
      className={`grid grid-rows-[max-content_1fr_max-content] fixed inset-0 h-[100dvh] w-full font-sans overflow-hidden bg-background transition-colors duration-300 ${theme.bg} ${theme.text}`}
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
            Drop files to send
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

      {/* MESSAGES */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-2 py-2 pt-16 flex flex-col scroll-smooth relative custom-scrollbar min-h-0"
      >
        <div className="mt-auto flex flex-col gap-4 pb-2">
          {(() => {
            console.log(
              "[MobileUnified] Rendering transactions:",
              visibleTransactions.length,
              "isUploading:",
              isUploading
            );
            console.log("[MobileUnified] My IP:", myIp);
            console.log("[MobileUnified] Upload Progress:", uploadProgress);
            return null;
          })()}
          {visibleTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 animate-in fade-in zoom-in-95 duration-500 pb-20 mt-auto mb-auto">
              {/* Big Share File Button */}
              <button
                onClick={handleSelectFiles}
                disabled={isSendingDisabled}
                className={`group relative flex flex-col items-center justify-center gap-4 w-60 h-48 rounded-[2rem] border transition-all duration-300 active:scale-[0.98] ${
                  theme.border
                } ${
                  isDarkMode ? "active:bg-slate-800/50" : "active:bg-gray-50"
                } ${isSendingDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div
                  className="p-4 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: theme.accentColor + "10",
                    color: theme.accentColor,
                  }}
                >
                  <Upload size={32} strokeWidth={1.5} />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-lg font-medium tracking-tight opacity-90">
                    {isSendingDisabled ? "Sending Disabled" : "Share a file..."}
                  </span>
                  <span className={`text-xs opacity-50`}>
                    Tap to browse files
                  </span>
                </div>
              </button>

              {/* Small Send Text Button - Only if enabled */}
              {textTransferEnabled && (
                <button
                  onClick={() => {
                    if (isSendingDisabled) return;
                    setShowTextInput(true);
                  }}
                  disabled={isSendingDisabled}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-300 active:scale-95 ${
                    theme.border
                  } ${
                    isDarkMode ? "active:bg-slate-800/50" : "active:bg-gray-50"
                  } ${
                    isSendingDisabled ? "opacity-50 cursor-not-allowed" : ""
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
              )}
            </div>
          ) : (
            visibleTransactions.map((transaction) => {
              const isMe = transaction.senderId === myIp;
              const isRightSide = isMe;
              const isFile = transaction.type === "file";
              const bubbleClass = isRightSide
                ? theme.bubbleMe
                : theme.bubbleOther;
              const widthClass = isFile
                ? "w-[calc(95vw-80px)] max-w-[500px]"
                : "w-fit max-w-[500px] text-left";

              // Progress logic - use client-specific for downloads
              const currentFilename = transaction.filename || "";
              const localProgress = currentFilename
                ? uploadProgress[currentFilename]
                : undefined;

              // For downloads (!isMe), check client-specific progress
              let clientProgress = 0;
              let clientStatus = transaction.status;
              if (
                !isMe &&
                myIp &&
                transaction.clientProgress &&
                transaction.clientStatus
              ) {
                clientProgress = transaction.clientProgress[myIp] || 0;
                clientStatus = transaction.clientStatus[myIp] || "pending";
              }

              const rawPercent =
                localProgress !== undefined &&
                transaction.status === "in_progress"
                  ? localProgress // Upload progress
                  : !isMe && clientProgress > 0
                  ? clientProgress // Download progress (client-specific)
                  : transaction.transactionPercent; // Fallback to global
              const displayPercent = isNaN(Number(rawPercent))
                ? 0
                : Number(rawPercent);

              // Use client-specific status for downloads
              const effectiveStatus =
                !isMe && clientStatus ? clientStatus : transaction.status;

              return (
                <div
                  key={transaction.id}
                  className={`flex gap-2 items-end ${
                    isRightSide ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* Avatar for LEFT side */}
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

                  <div
                    className={`relative rounded-2xl overflow-hidden shadow-sm ${widthClass} ${bubbleClass} transition-all duration-300 ${
                      transaction.status === "cancelled"
                        ? "opacity-60 grayscale-[0.5]"
                        : ""
                    }`}
                    style={
                      isRightSide ? { backgroundColor: theme.accentColor } : {}
                    }
                  >
                    {/* Background Progress Fill */}
                    {(effectiveStatus === "in_progress" ||
                      (isMe && transaction.status === "in_progress")) && (
                      <div
                        className={`absolute top-0 left-0 h-full pointer-events-none transition-all duration-300 ${
                          isMe ? "bg-white/20" : ""
                        }`}
                        style={{
                          width: `${displayPercent}%`,
                          backgroundColor: !isMe
                            ? `${theme.accentColor}1A`
                            : undefined, // 10% opacity
                        }}
                      />
                    )}

                    <div className="p-3 relative z-10">
                      {/* TEXT */}
                      {transaction.type === "text" && (
                        <div className="flex items-start gap-2">
                          <div className="text-[16px] break-words">
                            {transaction.textContent}
                          </div>
                          <CopyButton
                            text={transaction.textContent || ""}
                            className={`p-1 rounded-full ${
                              isMe
                                ? "text-white/70 hover:bg-white/20"
                                : "text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                            iconSize={14}
                          />
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
                                <div className="w-12 h-12 rounded-lg bg-black/5 overflow-hidden shrink-0 border border-black/5">
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
                                          "hidden"
                                        );
                                        img.nextElementSibling.classList.add(
                                          "flex"
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
                                <div className="w-12 h-12 rounded-lg bg-black/10 overflow-hidden shrink-0 relative flex items-center justify-center border border-black/5">
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

                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate">
                              {transaction.filename}
                            </div>
                            <div className="text-xs opacity-70">
                              {(!isMe &&
                                (effectiveStatus === "in_progress" ||
                                  downloadingTransactionId ===
                                    transaction.id)) ||
                              (isMe && transaction.status === "in_progress") ? (
                                <div className="flex flex-col gap-0.5 mt-1 font-mono">
                                  <span>
                                    {downloadSpeeds[transaction.id] ||
                                      "0.0 MB/s"}
                                  </span>
                                  <span>
                                    {formatBytes(
                                      (transaction.fileSize || 0) *
                                        (displayPercent / 100)
                                    )}{" "}
                                    / {formatBytes(transaction.fileSize)}
                                  </span>
                                  <span className="font-medium flex justify-between w-full">
                                    <span>{Math.round(displayPercent)}%</span>
                                    {/* Time on same line */}
                                    <span className="opacity-70 font-normal">
                                      {new Date(
                                        transaction.timestamp
                                      ).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </span>
                                  {/* {!isMe && (
                                    <span className="text-[#007AFF] font-medium">
                                      Downloading...
                                    </span>
                                  )} */}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5 mt-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {effectiveStatus !== "cancelled" && (
                                      <span>
                                        {formatBytes(transaction.fileSize)}
                                      </span>
                                    )}
                                    {(effectiveStatus === "cancelled" ||
                                      (isMe &&
                                        transaction.status === "in_progress" &&
                                        uploadProgress[
                                          transaction.filename || ""
                                        ] === undefined)) && (
                                      <span className="font-medium text-red-500/70">
                                        Cancelled
                                      </span>
                                    )}
                                    {!isMe &&
                                      downloadingTransactionId ===
                                        transaction.id && (
                                        <span
                                          className="font-medium"
                                          style={{ color: theme.accentColor }}
                                        >
                                          Downloading...
                                        </span>
                                      )}
                                    {!isMe &&
                                      effectiveStatus === "completed" && (
                                        <span className="text-green-500 font-medium">
                                          Download completed.
                                        </span>
                                      )}
                                  </div>
                                  {!isMe && effectiveStatus === "completed" && (
                                    <div className="text-[10px] opacity-60">
                                      Please check your browser downloads to get
                                      the file
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Upload Cancel Button - Same size/space as download */}
                          {isMe && transaction.status === "in_progress" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelUpload();
                              }}
                              className={`p-2 rounded-full shrink-0 relative z-10 transition-colors ${
                                isDarkMode
                                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                  : "bg-red-100 text-red-600 hover:bg-red-200"
                              }`}
                              title="Cancel upload"
                            >
                              <X size={18} />
                            </button>
                          )}

                          {/* Download/Cancel button only if NOT me */}
                          {!isMe && transaction.downloadLink && (
                            <>
                              {effectiveStatus === "in_progress" ? (
                                // Cancel button during download
                                <button
                                  onClick={(e) =>
                                    handleCancelDownload(e, transaction)
                                  }
                                  className={`p-2 rounded-full shrink-0 relative z-10 transition-colors ${
                                    isDarkMode
                                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                      : "bg-red-100 text-red-600 hover:bg-red-200"
                                  }`}
                                  title="Cancel download"
                                >
                                  <X size={18} />
                                </button>
                              ) : (
                                // Download button when not downloading
                                <button
                                  onClick={(e) =>
                                    handleDownload(e, transaction)
                                  }
                                  disabled={
                                    downloadingTransactionId === transaction.id
                                  }
                                  className={`p-2 rounded-full shrink-0 relative z-10 transition-colors ${
                                    downloadingTransactionId === transaction.id
                                      ? isDarkMode
                                        ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                      : isDarkMode
                                      ? "bg-slate-700 text-[#0A84FF] hover:bg-slate-600"
                                      : `bg-gray-100 hover:bg-gray-200`
                                  }`}
                                  style={
                                    downloadingTransactionId !==
                                      transaction.id && !isDarkMode
                                      ? { color: theme.accentColor }
                                      : downloadingTransactionId !==
                                          transaction.id && isDarkMode
                                      ? {
                                          color: theme.accentColor,
                                          backgroundColor: theme.iconBg,
                                        }
                                      : {}
                                  }
                                  title={
                                    downloadingTransactionId === transaction.id
                                      ? "Starting..."
                                      : "Download"
                                  }
                                >
                                  <Download size={18} />
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
                        <div className="flex justify-end items-center text-[10px] opacity-70 mt-1">
                          <span>
                            {new Date(transaction.timestamp).toLocaleTimeString(
                              [],
                              { hour: "2-digit", minute: "2-digit" }
                            )}
                          </span>
                          {transaction.status === "completed" && (
                            <Check size={12} className="ml-1" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Avatar for RIGHT side */}
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
          {showTextInput && (
            <div className={`p-4 border-t ${activeTheme.border}`}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={
                    isSendingDisabled ? "Sending disabled" : "Type a message..."
                  }
                  disabled={isSendingDisabled}
                  className={`flex-1 px-4 py-2 rounded-xl outline-none ${
                    theme.inputField
                  } ${isSendingDisabled ? "opacity-50" : ""}`}
                  autoFocus={!isSendingDisabled}
                />
                <button
                  onClick={handleSendText}
                  disabled={isSendingDisabled}
                  className={`p-2 rounded-xl text-white transition-colors ${
                    isSendingDisabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  style={{ backgroundColor: theme.accentColor }}
                >
                  <ArrowUp size={20} />
                </button>
              </div>
            </div>
          )}

          {visibleTransactions.length > 0 && (
            <div className="p-4 pt-2">
              <div className="flex gap-3">
                <button
                  onClick={handleSelectFiles}
                  disabled={isSendingDisabled}
                  className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 border transition-colors ${
                    theme.selectBtn
                  } ${
                    isSendingDisabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <Upload size={18} style={{ color: theme.accentColor }} />
                  <span>
                    {isSendingDisabled ? "Sending Disabled" : "Select Files"}
                  </span>
                </button>

                {/* Hidden Input */}

                {/* Toggle Text Input */}
                {textTransferEnabled && (
                  <button
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
                {isBlocked ? "You are blocked" : "Sending is blocked"}
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
        title="Cancel Download"
        message={
          <>
            Stop downloading "{transactionToCancel?.filename}"?
            <br />
            This will end the file transfer.
          </>
        }
        confirmText="Stop"
        cancelText="Continue"
        onConfirm={confirmCancelDownload}
        onCancel={cancelCancelDownload}
        destructive={true}
        isDarkMode={isDarkMode}
      />

      <ConfirmDialog
        isOpen={showUploadCancelConfirm}
        title="Cancel Upload"
        message={
          <>
            Stop sending files?
            <br />
            This will cancel the current transfer.
          </>
        }
        confirmText="Stop Sending"
        cancelText="Continue"
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
