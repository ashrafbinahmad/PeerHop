import React, { useRef, useState } from "react";
import axios from "axios";
import {
  MessageSquare,
  Upload,
  File,
  ArrowUp,
  Monitor,
  Play,
  Plus,
  X,
} from "lucide-react";
import { PlatformIcon } from "../../components/PlatformIcon";
import { CopyButton } from "../../components/CopyButton";
import { TransactionActions } from "./TransactionActions";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import {
  formatBytes,
  calculateSpeed,
  formatLiveSpeed,
} from "../../utils/format";
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
  deleteTransaction: (id: number, deleteFile: boolean) => Promise<void>;
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
  deleteTransaction,
}: ChatPanelProps) => {
  const { t } = useTranslation();
  const [clientToCancelLocal, setClientToCancelLocal] = useState<{
    txn: any;
    ip: string;
  } | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<any | null>(
    null,
  );
  const [removeFromHistoryOnly, setRemoveFromHistoryOnly] = useState(true);
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
                className={`group relative flex flex-col items-center justify-center gap-4 w-64 h-52 rounded-[2.5rem] border shadow-sm transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${
                  theme.border
                } ${theme.iconBg}`}
              >
                <Plus
                  size={54}
                  strokeWidth={2.5}
                  className={`mb-2 transition-all duration-300 group-hover:scale-110 opacity-70 ${theme.text}`}
                />
                <div className="flex flex-col items-center gap-1">
                  <span className={`text-xl font-bold tracking-tight opacity-70 ${theme.text}`}>
                    {t("share_file")}
                  </span>
                  <span className={`text-xs opacity-60 font-medium ${theme.text}`}>
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
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full border shadow-sm transition-all duration-300 hover:scale-105 active:scale-95 ${
                    theme.border
                  } ${theme.iconBg}`}
                >
                  <MessageSquare
                    size={16}
                    strokeWidth={2}
                    className={`opacity-70 ${theme.text}`}
                  />
                  <span className={`text-sm font-bold opacity-70 ${theme.text}`}>
                    {t("send_text")}
                  </span>
                </button>
              )}
            </div>
          ) : (
            visibleTransactions.map((transaction, index) => {
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

              const prevIsMe = index > 0 && visibleTransactions[index - 1].senderId === "server";
              const isLast = index === visibleTransactions.length - 1;
              const needsTopMargin = !isMe && prevIsMe;
              const needsBottomMargin = !isMe && isLast;

              return (
                <div
                  key={transaction.id}
                  className={`flex ${alignClass} animate-in fade-in slide-in-from-bottom-2 duration-300 gap-2 items-end ${
                    needsTopMargin ? "mt-4" : ""
                  } ${needsBottomMargin ? "mb-10" : ""}`}
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
                    {/* Progress indicator removed for cleaner look, now using explicit bars */}

                    <div className="relative z-10">
                      {transaction.type === "text" && (
                        <div className="relative min-w-12  max-w-[calc(100vw-145px)] md:max-w-[calc(100vw-420px)] lg:max-w-[calc(100vw-545px)] max-h-[300px] overflow-y-auto custom-scrollbar">
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
                                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                                    isMe
                                      ? "bg-white/20 text-white"
                                      : theme.iconBg + " " + theme.iconText
                                  }`}
                                >
                                  <File size={24} />
                                </div>
                              );
                            })()}
                              <div className="min-w-[140px] flex-1 text-left">
                               <div
                                 className={`font-semibold text-[15px] truncate max-w-[280px] ${
                                   isMe
                                     ? "text-white"
                                     : isDarkMode
                                       ? "text-slate-100"
                                       : "text-slate-800"
                                 }`}
                                 title={transaction.filename}
                               >
                                 {transaction.filename}
                               </div>
                               <div
                                 className={`text-[12px] font-medium mt-0.5 opacity-80 ${
                                   isMe
                                     ? "text-white"
                                     : isDarkMode
                                       ? "text-slate-300"
                                       : "text-slate-500"
                                 }`}
                               >
                                 {transaction.status === "in_progress" ? (
                                   <div className="flex flex-col gap-2 mt-2 font-mono">
                                     <div className="flex items-center justify-between text-[10px] sm:text-[11px] opacity-75">
                                       <span>{calculateSpeed(transaction)}</span>
                                       <span>
                                           {formatBytes(
                                             (transaction.fileSize || 0) *
                                               (transaction.transactionPercent / 100)
                                           )} / {formatBytes(transaction.fileSize, ["GB", "TB"])}
                                       </span>
                                     </div>
                                     <div className="h-1.5 w-full bg-white/10 dark:bg-white/5 rounded-full overflow-hidden shadow-inner flex relative">
                                       <div 
                                         className={`h-full transition-all duration-300 rounded-full relative overflow-hidden ${
                                           isMe ? "bg-white" : isDarkMode ? "bg-green-400" : "bg-green-500"
                                         }`}
                                         style={{ width: `${transaction.transactionPercent}%` }}
                                       >
                                           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                                       </div>
                                     </div>
                                     <span className={`text-xl font-black text-right ${
                                       isMe ? "text-white" : isDarkMode ? "text-green-400" : "text-green-600"
                                     }`}>
                                       {transaction.transactionPercent.toFixed(2)}%
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
                                   <div className="mt-4 space-y-3 px-1">
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
                                           className="flex items-center gap-3 group/progress"
                                         >
                                           <div
                                             className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                                                 isMe ? "bg-white/20 text-white" : isDarkMode ? "bg-slate-700 text-slate-200" : "bg-green-500/10 text-green-600"
                                             }`}
                                           >
                                             <PlatformIcon
                                               platform={client?.platform || "unknown"}
                                               size={14}
                                             />
                                           </div>
                                           
                                           <div className="flex-1 flex flex-col gap-1.5">
                                             <div className="h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                                                 <div
                                                   className="h-full transition-all duration-500 ease-out rounded-full relative overflow-hidden"
                                                   style={{
                                                     width: `${progress}%`,
                                                     backgroundColor: isMe ? '#fff' : '#22c55e',
                                                     boxShadow: isMe ? '0 0 8px rgba(255,255,255,0.4)' : '0 0 8px rgba(34,197,94,0.4)'
                                                   }}
                                                 >
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                                                 </div>
                                             </div>
                                             <div className="flex justify-between items-center px-0.5">
                                               <span className={`text-[10px] font-bold opacity-60 ${
                                                 isMe ? "text-white" : isDarkMode ? "text-slate-300" : "text-slate-500"
                                               }`}>
                                                 {formatLiveSpeed(transaction.clientSpeed?.[clientIp] || 0)}
                                               </span>
                                               <span className={`text-[11px] font-black ${
                                                 isMe ? "text-white" : isDarkMode ? "text-slate-200" : "text-slate-700"
                                               }`}>
                                                 {(progress as number).toFixed(2)}%
                                               </span>
                                             </div>
                                           </div>
 
                                           {transaction.status !== "cancelled" && (
                                             <button
                                               onClick={ (e) => {
                                                 e.stopPropagation();
                                                  setClientToCancelLocal({ txn: transaction, ip: clientIp });
                                               }}
                                               className={`p-1.5 rounded-full transition-all active:scale-90 ${
                                                 isMe 
                                                   ? "text-white/40 hover:bg-white/20 hover:text-white" 
                                                   : "text-slate-400 hover:bg-red-50 hover:text-red-500"
                                               }`}
                                               title={`Cancel download`}
                                             >
                                               <X size={14} />
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
                              <div className={`mt-3 pt-2 border-t flex items-center w-full gap-2 ${isDarkMode ? 'border-white/10' : 'border-black/5'}`}>
                                <div className="text-[11px] opacity-60">
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
                                    onDelete={() => setTransactionToDelete(transaction)}
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
                                    onDelete={() => setTransactionToDelete(transaction)}
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

      <ConfirmDialog
        isOpen={!!clientToCancelLocal}
        title={t("cancel_transfer")}
        message={
          "Stop sending files to " +
          (clients.find((c) => c.ip === clientToCancelLocal?.ip)?.name ||
            clients.find((c) => c.ip === clientToCancelLocal?.ip)?.platform ||
            "this device") +
          "?"
        }
        confirmText={t("stop")}
        onConfirm={async () => {
          if (clientToCancelLocal) {
            try {
              await axios.post(
                `/api/cancel-download/${clientToCancelLocal.txn.id}?security=${securityToken}`,
                { clientIp: clientToCancelLocal.ip },
              );
            } catch (err) {
              console.error("Failed to cancel:", err);
            }
            setClientToCancelLocal(null);
          }
        }}
        onCancel={() => setClientToCancelLocal(null)}
        destructive={true}
        isDarkMode={isDarkMode}
      />

      <ConfirmDialog
        isOpen={!!transactionToDelete}
        title={t("delete_transaction")}
        message={
          <div className="flex flex-col gap-4 text-left">
            <p>
              {t("delete_history_confirm")}
            </p>
            {transactionToDelete?.type === "file" && (
              <label className="flex items-center gap-3 cursor-pointer group p-1 ring-1 ring-transparent hover:ring-slate-400/20 rounded-lg transition-all">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={removeFromHistoryOnly}
                    onChange={(e) => setRemoveFromHistoryOnly(e.target.checked)}
                    className="w-4 h-4 rounded-md border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
                <span className={`text-[13px] ${isDarkMode ? "text-slate-300" : "text-gray-600"} font-medium`}>
                  {t("remove_from_history_only")}
                </span>
              </label>
            )}
          </div>
        }
        confirmText={t("delete")}
        onConfirm={async () => {
          if (transactionToDelete) {
            try {
              await deleteTransaction(
                transactionToDelete.id,
                !removeFromHistoryOnly,
              );
            } catch (err) {
              console.error("Failed to delete transaction:", err);
            }
            setTransactionToDelete(null);
            setRemoveFromHistoryOnly(true);
          }
        }}
        onCancel={() => {
          setTransactionToDelete(null);
          setRemoveFromHistoryOnly(true);
        }}
        destructive={true}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
