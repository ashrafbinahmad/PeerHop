import React, { useRef, useState } from "react";
import axios from "axios";
import {
  MessageSquare,
  Upload,
  File,
  ArrowUp,
  Monitor,
  Play,
  X,
} from "lucide-react";
import { PlatformIcon } from "../../components/PlatformIcon";
import { CopyButton } from "../../components/CopyButton";
import { TransactionActions } from "./TransactionActions";
import { formatBytes, calculateSpeed } from "../../utils/format";
import type { Client } from "../../hooks/useDevices";
import { OpenSourceFile } from "../../../wailsjs/go/main/App";
import { useTranslation } from "../../hooks/useTranslation";

interface ChatPanelProps {
  visibleTransactions: any[];
  showTextInput: boolean;
  textInput: string;
  setTextInput: (val: string) => void;
  handleSendText: () => void;
  handleSelectFiles: () => void;
  textTransferEnabled: boolean;
  setShowTextInput: (val: boolean) => void;
  theme: any;
  isDarkMode: boolean;
  activeTab: string;
  clients: Client[];
  serverInfo: any;
  adminToken: string;
  securityToken: string;
  handleFileOpened: (filename: string) => void;
  setTransactionToCancel: (txn: any) => void;
  adRef: React.RefObject<HTMLIFrameElement>;
  initialAdUrl: string;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  isUserAtBottomRef: React.MutableRefObject<boolean>;
  iframeHeight: number | string | undefined;
  iframeIsLoaded: boolean;
}

export const ChatPanel = ({
  visibleTransactions,
  showTextInput,
  textInput,
  setTextInput,
  handleSendText,
  handleSelectFiles,
  textTransferEnabled,
  setShowTextInput,
  theme,
  isDarkMode,
  activeTab,
  clients,
  serverInfo,
  adminToken,
  securityToken,
  handleFileOpened,
  setTransactionToCancel,
  adRef,
  initialAdUrl,
  scrollContainerRef,
  messagesEndRef,
  isUserAtBottomRef,
  iframeHeight,
  iframeIsLoaded,
}: ChatPanelProps) => {
  const { t } = useTranslation();
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // If we're within 100px of the bottom, consider us "at the bottom"
    isUserAtBottomRef.current = distanceFromBottom < 10;
  };

  return (
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

      <iframe
        ref={adRef}
        id="adFrame"
        src={initialAdUrl}
        width="100%"
        height={iframeHeight}
        // allowTransparency={true}
        className="absolute top-10 left-0 w-screen z-50"
        style={{
          maxWidth: "100dvw",
          backgroundColor: "transparent",
          border: "none",
          display: "block",
          opacity: iframeIsLoaded ? 1 : 0,
        }}
        onError={() => {
          console.log("Error loading ad");
        }}
        onLoad={() => {
          console.log("Ad loaded");
        }}
      />

      {/* MESSAGES AREA */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 pt-16 flex flex-col scroll-smooth custom-scrollbar w-full overflow-hidden hide-scrollbar"
      >
        <div className="mt-auto flex flex-col gap-1">
          {visibleTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 animate-in fade-in zoom-in-95 duration-500 my-auto pb-20">
              {/* Big Share File Button */}
              <button
                onClick={handleSelectFiles}
                className={`group relative flex flex-col items-center justify-center gap-4 w-60 h-48 rounded-[2rem] border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                  theme.border
                } ${isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-50"}`}
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
                    {t("share_file")}
                  </span>
                  <span className={`text-xs opacity-50`}>
                    {t("click_to_browse")}
                  </span>
                </div>
              </button>

              {/* Small Send Text Button */}
              {textTransferEnabled && (
                <button
                  onClick={() => {
                    if (!textTransferEnabled) setShowTextInput(true);
                    setShowTextInput(true);
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all duration-300 hover:scale-105 active:scale-95 ${
                    theme.border
                  } ${isDarkMode ? "hover:bg-slate-800/50" : "hover:bg-gray-50"}`}
                >
                  <MessageSquare
                    size={16}
                    strokeWidth={1.5}
                    style={{ color: theme.accentColor }}
                  />
                  <span className="text-sm font-medium opacity-90">
                    {t("send_text")}
                  </span>
                </button>
              )}
            </div>
          ) : (
            visibleTransactions.map((transaction) => {
              const isMe = transaction.senderId === "server";
              const isFile = transaction.type === "file";
              const alignClass = isMe ? "justify-end" : "justify-start";
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
                          backgroundColor: !isMe ? "#22c55e20" : undefined,
                        }}
                      />
                    )}

                    <div className="relative z-10">
                      {transaction.type === "text" && (
                        <div className="relative min-w-12  max-w-[calc(100vw-145px)] md:max-w-[calc(100vw-545px)] max-h-[300px] overflow-y-auto custom-scrollbar">
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
                          <div className="text-[13px] leading-relaxed whitespace-break-spaces">
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
                                      OpenSourceFile(transaction.filename || "")
                                    }
                                    title="Open Image"
                                  >
                                    <img
                                      src={`${mediaUrl}${
                                        mediaUrl.includes("?") ? "&" : "?"
                                      }preview=true${
                                        adminToken ? `&admin=${adminToken}` : ""
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
                                      OpenSourceFile(transaction.filename || "")
                                    }
                                    title="Open Video"
                                  >
                                    <video
                                      src={`${mediaUrl}${
                                        mediaUrl.includes("?") ? "&" : "?"
                                      }preview=true${
                                        adminToken ? `&admin=${adminToken}` : ""
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
                                className="font-normal text-sm truncate max-w-[200px]"
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
                                    <span>{calculateSpeed(transaction)}</span>
                                    <span>
                                      {formatBytes(
                                        (transaction.fileSize || 0) *
                                          (transaction.transactionPercent /
                                            100),
                                      )}{" "}
                                      /{" "}
                                      {formatBytes(transaction.fileSize, [
                                        "GB",
                                        "TB",
                                        "PB",
                                      ])}
                                    </span>
                                    <span
                                      className={`text-lg font-bold ${
                                        isMe ? "text-white" : ""
                                      }`}
                                      style={{
                                        color: !isMe ? "#22c55e" : undefined,
                                      }}
                                    >
                                      {transaction.transactionPercent.toFixed(
                                        2,
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
                              {transaction.clientProgress &&
                                Object.keys(transaction.clientProgress).length >
                                  0 && (
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
                                                backgroundColor: "#22c55e",
                                              }}
                                            />
                                          </div>
                                          <span
                                            className={`text-xs font-bold w-10 text-right text-slate-200`}
                                          >
                                            {(progress as number).toFixed(2)}%
                                          </span>
                                          {transaction.status !==
                                            "cancelled" && (
                                            <button
                                              onClick={async () => {
                                                try {
                                                  await axios.post(
                                                    `/api/cancel-download/${transaction.id}?security=${securityToken}`,
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
                            {!isMe &&
                              transaction.status === "in_progress" &&
                              (!transaction.clientProgress ||
                                Object.keys(transaction.clientProgress)
                                  .length === 0) && (
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
        </div>
        <div ref={messagesEndRef} />
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
                placeholder={t("type_message")}
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
              >
                <Upload
                  size={18}
                  className="group-hover:-translate-y-0.5 transition-transform"
                  style={{ color: theme.accentColor }}
                />
                <span className="group-hover:text-current">
                  {t("select_files")}
                </span>
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
                  title={
                    showTextInput ? t("close_text_input") : t("send_text_title")
                  }
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
  );
};
