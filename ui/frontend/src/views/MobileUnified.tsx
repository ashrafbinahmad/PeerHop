import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useTransactions } from "../hooks/useTransactions";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
  const [myClientId, setMyClientId] = useState<string>("");

  // Confirmation dialog state
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [transactionToCancel, setTransactionToCancel] = useState<any>(null);

  // Track which transaction is being downloaded (for instant feedback)
  const [downloadingTransactionId, setDownloadingTransactionId] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  const { transactions, sendText, isDarkMode } = useTransactions(2000);

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
    // Client ID identification
    let clientId = localStorage.getItem("transend_client_id");

    if (!clientId) {
      clientId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    localStorage.setItem("transend_client_id", clientId);

    setMyClientId(clientId);
    axios.defaults.headers.common["X-Client-ID"] = clientId;
  }, []);

  useEffect(() => {
    if (isUserAtBottomRef.current) scrollToBottom();
  }, [transactions, isUploading, showTextInput]);

  // Clear downloading state when transaction status updates to in_progress or completed
  useEffect(() => {
    if (downloadingTransactionId !== null) {
      const transaction = transactions.find(t => t.id === downloadingTransactionId);
      if (transaction) {
        // Check both global status and client-specific status
        const isCompleted = transaction.status === 'completed';
        const clientStatus = (myClientId && transaction.clientStatus) ? transaction.clientStatus[myClientId] : undefined;
        const isClientDone = clientStatus === 'completed' || clientStatus === 'in_progress';

        if (isCompleted || isClientDone) {
          setDownloadingTransactionId(null);
        }
      }
    }
  }, [transactions, downloadingTransactionId, myClientId]);

  const formatSize = (bytes?: number) => {
    if (bytes === undefined || bytes === null) return "Unknown size";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  };

  const handleUpload = async (fileList: FileList) => {
    if (!fileList || fileList.length === 0) return;

    setIsUploading(true);
    isUserAtBottomRef.current = true;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const formData = new FormData();
    // Safely convert FileList to array and filter out any undefined entries
    const filesArray = Array.from(fileList).filter(f => f != null);
    const fileNames = filesArray.map(f => f.name);

    // Add files to formData and initialize progress
    filesArray.forEach((file) => {
      formData.append("file_size", file.size.toString());
      formData.append("file", file);
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
    });

    try {
      await axios.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        signal: controller.signal,
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;
          const globalPercent = (progressEvent.loaded / progressEvent.total) * 100;
          setUploadProgress((prev) => {
            const next = { ...prev };
            fileNames.forEach(name => { next[name] = globalPercent; });
            return next;
          });
        },
      });

      setIsUploading(false);
      setUploadProgress({});
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(scrollToBottom, 100);
    } catch (err: any) {
      if (!axios.isCancel(err)) alert("Upload failed.");
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
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsUploading(false);
      setUploadProgress({});
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = (e: React.MouseEvent, transaction: any) => {
    e.stopPropagation();

    // Set downloading state immediately for instant feedback
    setDownloadingTransactionId(transaction.id);

    if (transaction.downloadLink) {
      // Append client ID as query parameter to the download link
      const downloadUrl = `${transaction.downloadLink}${transaction.downloadLink.includes('?') ? '&' : '?'}clientId=${myClientId}`;

      const link = document.createElement("a");
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
      await axios.post(`/api/cancel-download/${transactionToCancel.id}`);
      console.log(`Cancelled download for transaction ${transactionToCancel.id}`);
      setShowCancelConfirm(false);
      setTransactionToCancel(null);
    } catch (err) {
      console.error("Failed to cancel download:", err);
      alert("Failed to cancel download");
      setShowCancelConfirm(false);
      setTransactionToCancel(null);
    }
  };

  const cancelCancelDownload = () => {
    setShowCancelConfirm(false);
    setTransactionToCancel(null);
  };


  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(console.error);
  };

  const handleSelectFiles = () => {
    fileInputRef.current?.click();
  };

  const handleSendText = async () => {
    if (!textInput.trim()) return;
    try {
      isUserAtBottomRef.current = true;
      await sendText(textInput, myClientId);
      setTextInput("");
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error(err);
      alert("Failed to send text");
    }
  };

  // Show all transactions (including uploads)
  const visibleTransactions = transactions;

  const theme = {
    bg: isDarkMode ? "bg-[#0f172a]" : "bg-[#F2F2F7]",
    text: isDarkMode ? "text-slate-100" : "text-gray-900",
    headerBg: isDarkMode ? "bg-[#0f172a]/95 border-slate-800" : "bg-[#F2F2F7]/95 border-gray-200/50",
    headerText: isDarkMode ? "text-slate-100" : "text-gray-900",
    bubbleMe: "bg-[#007AFF] text-white",
    bubbleOther: isDarkMode ? "bg-[#1e293b] border-slate-700 text-slate-100" : "bg-white text-gray-900 border border-gray-200",
    avatarBg: isDarkMode ? "bg-slate-800 text-slate-400" : "bg-gray-200 text-gray-500",
    inputArea: isDarkMode ? "bg-[#0f172a] border-slate-800" : "bg-white border-gray-200",
    inputField: isDarkMode ? "bg-slate-800 text-white placeholder-slate-400 border-none" : "bg-gray-100 text-black border-transparent",
    iconBtn: isDarkMode ? "bg-slate-800 text-slate-300" : "bg-gray-100",
    selectBtn: isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700" : "bg-white border-gray-300 text-[#007AFF] hover:bg-gray-50",
  };

  return (
    <div className={`flex flex-col h-screen font-sans overflow-hidden relative transition-colors duration-300 ${theme.bg} ${theme.text}`}>
      {/* HEADER */}
      <div className={`shrink-0 pt-safe-top backdrop-blur-xl border-b z-20 transition-colors duration-300 ${theme.headerBg}`}>
        <div className="flex items-center justify-center py-3 px-4 h-[44px]">
          <h2 className={`text-[17px] font-semibold ${theme.headerText}`}>Transend</h2>
        </div>
      </div>

      {/* MESSAGES */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 flex flex-col scroll-smooth relative"
      >
        <div className="mt-auto flex flex-col gap-4 pb-2">
          {(() => {
            console.log('[MobileUnified] Rendering transactions:', visibleTransactions.length, 'isUploading:', isUploading);
            console.log('[MobileUnified] My Client ID:', myClientId);
            console.log('[MobileUnified] Upload Progress:', uploadProgress);
            return null;
          })()}
          {visibleTransactions.map((transaction) => {
            const isMe = transaction.senderId === myClientId;
            const isRightSide = isMe;
            const isFile = transaction.type === "file";
            const bubbleClass = isRightSide
              ? theme.bubbleMe
              : theme.bubbleOther;
            const widthClass = isFile
              ? "w-[calc(95vw-90px)]"
              : "w-fit max-w-[75%]";

            // Progress logic - use client-specific for downloads
            const currentFilename = transaction.filename || "";
            const localProgress = currentFilename ? uploadProgress[currentFilename] : undefined;

            // For downloads (!isMe), check client-specific progress
            let clientProgress = 0;
            let clientStatus = transaction.status;
            if (!isMe && myClientId && transaction.clientProgress && transaction.clientStatus) {
              clientProgress = transaction.clientProgress[myClientId] || 0;
              clientStatus = transaction.clientStatus[myClientId] || 'pending';
            }

            const rawPercent = (localProgress !== undefined && transaction.status === 'in_progress')
              ? localProgress // Upload progress
              : !isMe && clientProgress > 0
                ? clientProgress // Download progress (client-specific)
                : transaction.transactionPercent; // Fallback to global
            const displayPercent = isNaN(Number(rawPercent)) ? 0 : Number(rawPercent);

            // Use client-specific status for downloads
            const effectiveStatus = !isMe && clientStatus ? clientStatus : transaction.status;

            return (
              <div
                key={transaction.id}
                className={`flex gap-2 items-end ${isRightSide ? "justify-end" : "justify-start"}`}
              >
                {/* Avatar for LEFT side */}
                {!isRightSide && (
                  <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mb-1 ${theme.avatarBg}`}>
                    {transaction.senderId === "server" ? (
                      <Monitor size={16} />
                    ) : (
                      <User size={16} />
                    )}
                  </div>
                )}

                <div
                  className={`relative rounded-2xl overflow-hidden shadow-sm ${widthClass} ${bubbleClass} transition-all duration-300 ${transaction.status === 'cancelled' ? 'opacity-60 grayscale-[0.5]' : ''
                    }`}
                >
                  {/* Background Progress Fill */}
                  {(effectiveStatus === 'in_progress' || (isMe && transaction.status === 'in_progress')) && (
                    <div
                      className={`absolute top-0 left-0 h-full pointer-events-none transition-all duration-300 ${isMe ? 'bg-white/20' : 'bg-[#007AFF]/10'
                        }`}
                      style={{ width: `${displayPercent}%` }}
                    />
                  )}

                  <div className="p-3 relative z-10">
                    {/* TEXT */}
                    {transaction.type === "text" && (
                      <div className="flex items-start gap-2">
                        <div className="text-[16px] break-words">
                          {transaction.textContent}
                        </div>
                        <button
                          onClick={() => handleCopyText(transaction.textContent || "")}
                          className={"p-1 rounded-full text-gray-400 opacity-50 hover:opacity-100"}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    )}

                    {/* FILE */}
                    {isFile && (
                      <div className="flex items-center gap-3 text-left">
                        {(() => {
                          // Extract extension and determine media type
                          const ext = transaction.filename?.split('.').pop()?.toLowerCase();
                          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic'].includes(ext || '');
                          const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');

                          // Construct media URL (absolute for mobile client)
                          const protocol = window.location.protocol;
                          const host = window.location.host;
                          const mediaUrl = transaction.downloadLink
                            ? `${protocol}//${host}${transaction.downloadLink}`
                            : '';

                          if (isImage && mediaUrl) {
                            return (
                              <div className="w-12 h-12 rounded-lg bg-black/5 overflow-hidden shrink-0 border border-black/5">
                                <img
                                  src={mediaUrl}
                                  alt="preview"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    // Fallback on error (e.g., auth issue or 404)
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                  }}
                                />
                                <div className="hidden w-full h-full flex items-center justify-center bg-gray-100 dark:bg-slate-700">
                                  <File size={20} />
                                </div>
                              </div>
                            );
                          }

                          if (isVideo && mediaUrl) {
                            return (
                              <div className="w-12 h-12 rounded-lg bg-black/10 overflow-hidden shrink-0 relative flex items-center justify-center border border-black/5">
                                <video src={mediaUrl} className="w-full h-full object-cover absolute inset-0 pointer-events-none" />
                                <div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center z-10 backdrop-blur-sm">
                                  {/* Play icon small */}
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="white" className="ml-0.5">
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
                          <div className="text-xs opacity-70 flex items-center gap-2">
                            <span>{formatSize(transaction.fileSize)}</span>

                            {/* Progress % Text */}
                            {(effectiveStatus === 'in_progress' || (isMe && transaction.status === 'in_progress')) && (
                              <span className="font-mono font-medium">
                                {Math.round(displayPercent)}%
                              </span>
                            )}

                            {/* Cancelled Status */}
                            {transaction.status === 'cancelled' && (
                              <span className="font-medium text-red-500/70">Cancelled</span>
                            )}

                            {!isMe && (effectiveStatus === 'in_progress' || downloadingTransactionId === transaction.id) && (
                              <span className="text-[#007AFF] font-medium">• Downloading...</span>
                            )}
                          </div>

                          {/* Upload Cancel Button - Compact */}
                          {isMe && transaction.status === 'in_progress' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelUpload();
                              }}
                              className={`p-1 -mr-1 rounded-full shrink-0 transition-colors ${isDarkMode
                                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                : 'bg-red-100 text-red-600 hover:bg-red-200'
                                }`}
                              title="Cancel upload"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        {/* Download/Cancel button only if NOT me */}
                        {!isMe && transaction.downloadLink && (
                          <>
                            {effectiveStatus === "in_progress" ? (
                              // Cancel button during download
                              <button
                                onClick={(e) => handleCancelDownload(e, transaction)}
                                className={`p-2 rounded-full shrink-0 relative z-10 transition-colors ${isDarkMode
                                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                  : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                                title="Cancel download"
                              >
                                <X size={18} />
                              </button>
                            ) : (
                              // Download button when not downloading
                              <button
                                onClick={(e) => handleDownload(e, transaction)}
                                disabled={downloadingTransactionId === transaction.id}
                                className={`p-2 rounded-full shrink-0 relative z-10 transition-colors ${downloadingTransactionId === transaction.id
                                  ? (isDarkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed')
                                  : (isDarkMode ? 'bg-slate-700 text-[#0A84FF] hover:bg-slate-600' : 'bg-gray-100 text-[#007AFF] hover:bg-gray-200')
                                  }`}
                                title={downloadingTransactionId === transaction.id ? 'Starting...' : 'Download'}
                              >
                                <Download size={18} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* STATUS */}
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
          })}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </div>

      {/* INPUT AREA */}
      <div className={`shrink-0 border-t z-30 pb-safe-bottom transition-colors duration-300 ${theme.inputArea}`}>
        <div className="px-3 py-[6px]">
          {showTextInput && (
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendText()}
                placeholder="Message"
                className={`flex-1 px-4 py-2 rounded-full text-[16px] outline-none ${theme.inputField}`}
                autoFocus
              />
              <button
                onClick={handleSendText}
                className="p-2 bg-[#007AFF] text-white rounded-full"
              >
                <ArrowUp size={20} />
              </button>
              <button
                onClick={() => {
                  setShowTextInput(false);
                  setTextInput("");
                }}
                className={`p-2 rounded-full ${theme.iconBtn}`}
              >
                <X size={20} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => setShowTextInput(!showTextInput)}
              disabled={isUploading}
              className={`p-2.5 rounded-full ${theme.iconBtn}`}
            >
              <MessageSquare size={24} />
            </button>

            <button
              onClick={handleSelectFiles}
              className={`flex-1 h-12 rounded-full font-semibold flex items-center justify-center gap-2 transition-colors border ${theme.selectBtn}`}
            >
              <File size={18} /> Select Files
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Cancel Download"
        message={`Stop downloading "${transactionToCancel?.filename}"?\n\nThis will end the file transfer.`}
        confirmText="Stop"
        cancelText="Continue"
        onConfirm={confirmCancelDownload}
        onCancel={cancelCancelDownload}
        destructive={true}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
