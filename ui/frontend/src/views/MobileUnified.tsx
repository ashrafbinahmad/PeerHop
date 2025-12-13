import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useTransactions } from "../hooks/useTransactions";
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);

  const { transactions, sendText } = useTransactions(2000);

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
    let clientId = sessionStorage.getItem("transend_client_id") || localStorage.getItem("transend_client_id");

    if (!clientId) {
      clientId = Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    localStorage.setItem("transend_client_id", clientId);
    sessionStorage.setItem("transend_client_id", clientId);

    setMyClientId(clientId);
    axios.defaults.headers.common["X-Client-ID"] = clientId;
  }, []);

  useEffect(() => {
    if (isUserAtBottomRef.current) scrollToBottom();
  }, [transactions, isUploading, showTextInput]);

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
    if (transaction.downloadLink) {
      const link = document.createElement("a");
      link.href = transaction.downloadLink;
      link.download = transaction.filename || "file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
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

  return (
    <div className="flex flex-col h-screen bg-[#F2F2F7] font-sans text-gray-900 overflow-hidden relative">
      {/* HEADER */}
      <div className="shrink-0 pt-safe-top bg-[#F2F2F7]/95 backdrop-blur-xl border-b border-gray-200/50 z-20">
        <div className="flex items-center justify-center py-3 px-4 h-[44px]">
          <h2 className="text-[17px] font-semibold text-gray-900">Transend</h2>
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
              ? "bg-[#007AFF] text-white"
              : "bg-white text-gray-900 border border-gray-200";
            const widthClass = isFile
              ? "w-[calc(95vw-90px)]"
              : "w-fit max-w-[75%]";

            // Progress logic
            const currentFilename = transaction.filename || "";
            const localProgress = currentFilename ? uploadProgress[currentFilename] : undefined;
            const rawPercent = (localProgress !== undefined && transaction.status === 'in_progress')
              ? localProgress
              : transaction.transactionPercent;
            const displayPercent = isNaN(Number(rawPercent)) ? 0 : Number(rawPercent);

            return (
              <div
                key={transaction.id}
                className={`flex gap-2 items-end ${isRightSide ? "justify-end" : "justify-start"}`}
              >
                {/* Avatar for LEFT side */}
                {!isRightSide && (
                  <div className="shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 overflow-hidden mb-1">
                    {transaction.senderId === "server" ? (
                      <Monitor size={16} />
                    ) : (
                      <User size={16} />
                    )}
                  </div>
                )}

                <div
                  className={`relative rounded-2xl overflow-hidden shadow-sm ${widthClass} ${bubbleClass}`}
                >
                  <div className="p-3">
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
                        <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                          <File size={20} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">
                            {transaction.filename}
                          </div>
                          <div className="text-xs opacity-70">
                            {formatSize(transaction.fileSize)}
                          </div>

                          {/* Progress Bar for UPLOADS (Me) */}
                          {isMe && transaction.status === 'in_progress' && (
                            <div className="mt-1 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#007AFF] transition-all duration-300"
                                style={{ width: `${displayPercent}%` }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Download button only if NOT me */}
                        {!isMe && transaction.downloadLink && (
                          <>
                            <button
                              onClick={(e) => handleDownload(e, transaction)}
                              className="p-2 bg-gray-100 text-[#007AFF] rounded-full shrink-0 relative z-10"
                            >
                              <Download size={18} />
                            </button>
                            {/* percent progress overlay for downloads */}
                            <div
                              className={`absolute top-0 left-0 h-full bg-[#007bff50] pointer-events-none transition-all duration-300`}
                              style={{
                                width: `${transaction.transactionPercent}%`,
                              }}
                            ></div>
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
      <div className="shrink-0 bg-white border-t border-gray-200 z-30 pb-safe-bottom">
        <div className="px-3 py-[6px]">
          {showTextInput && (
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendText()}
                placeholder="Message"
                className="flex-1 px-4 py-2 bg-gray-100 rounded-full text-[16px]"
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
                className="p-2 bg-gray-200 rounded-full"
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
              className="p-2.5 bg-gray-100 rounded-full"
            >
              <MessageSquare size={24} />
            </button>

            <button
              onClick={handleSelectFiles}
              className={`flex-1 h-12 rounded-full font-semibold flex items-center justify-center gap-2 bg-white border border-gray-300 text-[#007AFF] hover:bg-gray-50 transition-colors`}
            >
              <File size={18} /> Select Files
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
