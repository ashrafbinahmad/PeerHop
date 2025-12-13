import React, { useState, useEffect, useRef } from "react";
import QRCode from "react-qr-code";
import {
  SelectFiles,
  StartTransfer,
  GetServerInfo,
  RestartServer,
  GetOpenableApps,
  OpenFileWith,
  OpenSourceFile,
} from "../../wailsjs/go/main/App";
import { main, utils } from "../../wailsjs/go/models";
import {
  WindowMinimise,
  WindowToggleMaximise,
  Quit,
} from "../../wailsjs/runtime/runtime";
import logo from "../assets/images/logo-universal.png";
import { useTransactions } from "../hooks/useTransactions";
import {
  X,
  MessageSquare,
  Upload,
  File,
  Check,
  Copy,
  ArrowUp,
  Minus,
  Maximize2,
  Sun,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  QrCode,
  RefreshCw,
  Smartphone,
  Monitor,
  User,
  MoreVertical,
  ExternalLink,
  FolderOpen,
  Play
} from "lucide-react";
import { PlatformIcon } from "../components/PlatformIcon";

interface Client {
  id: string;
  userAgent: string;
  ip: string;
  lastSeen: string;
  platform: "android" | "ios" | "windows" | "linux" | "unknown";
}

const TransactionActions = ({ transaction, isDarkMode }: { transaction: any, isDarkMode: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [apps, setApps] = useState<utils.AppInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOpen = async () => {
    if (apps.length > 0) {
      setIsOpen(!isOpen);
      return;
    }

    setLoading(true);
    setIsOpen(!isOpen);
    try {
      // transaction.filename might be just name, assuming it's in Downloads
      const result = await GetOpenableApps(transaction.filename || "");
      setApps(result || []);
    } catch (err) {
      console.error(err);
      // Fallback
      setApps([{ name: "Open System Default", command: "explorer" }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAppClick = async (appCmd: string) => {
    try {
      await OpenFileWith(transaction.filename || "", appCmd);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      alert("Failed to open file");
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <div className={`text-[10px] ${isDarkMode ? "text-slate-500" : "text-gray-400"}`}>
          {new Date(transaction.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <Check size={12} className="ml-1 inline" />
        </div>

        <button
          onClick={handleOpen}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${isDarkMode ? "bg-slate-700/50 hover:bg-slate-700 text-slate-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
            }`}
        >
          Open with <MoreVertical size={10} />
        </button>
      </div>

      {isOpen && (
        <div className={`absolute bottom-full right-0 mb-2 w-48 rounded-lg shadow-xl border overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 ${isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-gray-200 text-gray-700"
          }`}>
          <div className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? "text-slate-500" : "text-gray-400 bg-gray-50/50"}`}>
            Open with...
          </div>

          {loading ? (
            <div className="px-4 py-3 text-xs text-center opacity-60">Loading apps...</div>
          ) : apps.length === 0 ? (
            <div className="px-4 py-3 text-xs text-center opacity-60">No apps found</div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto">
              {apps.map((app, i) => (
                <button
                  key={i}
                  onClick={() => handleAppClick(app.command)}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${isDarkMode ? "hover:bg-slate-700" : "hover:bg-gray-50"
                    }`}
                >
                  {app.command === 'explorer' ? <FolderOpen size={12} /> : <ExternalLink size={12} />}
                  <span className="truncate">{app.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const DesktopView = () => {
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [serverInfo, setServerInfo] = useState<main.ServerInfo | null>(null);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);

  // UI States
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showQRPanel, setShowQRPanel] = useState(true);

  // Scroll and Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Hook: Polling for transactions
  const { transactions, sendText } = useTransactions(2000, serverInfo?.url);

  const [clients, setClients] = useState<Client[]>([]);

  // Poll for clients
  useEffect(() => {
    if (!serverInfo?.url) return;

    const fetchClients = async () => {
      try {
        const res = await fetch(`${serverInfo.url}/api/clients`);
        if (res.ok) {
          const data = await res.json();
          setClients(data.clients || []);
        }
      } catch (err) {
        console.error("Failed to fetch clients", err);
      }
    };

    fetchClients();
    const interval = setInterval(fetchClients, 3000);
    return () => clearInterval(interval);
  }, [serverInfo?.url]);

  const handleRestartServer = async () => {
    try {
      const info = await RestartServer();
      setServerInfo(info);
      // alert("Server restarted successfully");
    } catch (err) {
      console.error("Failed to restart server:", err);
      alert("Failed to restart server");
    }
  };

  // --- Effects ---

  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const info = await GetServerInfo();
        setServerInfo(info);
      } catch (err) {
        console.error("Failed to get server info:", err);
      }
    };
    fetchServerInfo();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transactions, showTextInput]);

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

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(console.error);
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let value = bytes;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  };

  const visibleTransactions = transactions;

  // --- Theme Variables ---
  const theme = {
    bg: isDarkMode ? "bg-[#0f172a]" : "bg-[#F2F2F7]",
    headerBg: isDarkMode
      ? "bg-[#0f172a]/95 border-slate-800"
      : "bg-[#F2F2F7]/95 border-gray-200/50",
    text: isDarkMode ? "text-slate-100" : "text-gray-900",
    subText: isDarkMode ? "text-slate-400" : "text-gray-500",

    // Chat Bubbles
    bubbleMe: "bg-[#007AFF] text-white",
    bubbleOther: isDarkMode
      ? "bg-[#1e293b] border-slate-700 text-slate-100"
      : "bg-white border-gray-200 text-gray-900",

    // Input Area
    inputAreaBg: isDarkMode
      ? "bg-[#1e293b] border-slate-700"
      : "bg-white border-gray-200",
    inputField: isDarkMode
      ? "bg-[#334155] text-white focus:bg-[#475569]"
      : "bg-gray-100 hover:bg-gray-50 focus:bg-white",

    // Right Panel
    panelBg: isDarkMode
      ? "bg-[#1e293b] border-slate-700"
      : "bg-white border-gray-200",
    panelCard: isDarkMode
      ? "bg-[#0f172a] border-slate-700"
      : "bg-white border-gray-100",
  };

  return (
    <div
      className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-300 ${theme.bg} ${theme.text}`}
    >
      {/* --- LEFT SIDE: CHAT INTERFACE --- */}
      <div
        className={`flex flex-col flex-1 h-full relative transition-all duration-300 ${isDarkMode ? "border-slate-800" : "border-gray-200/60"
          } ${showQRPanel ? "md:border-r" : ""}`}
      >
        {/* HEADER */}
        <div
          className={`shrink-0 h-[60px] backdrop-blur-xl border-b flex items-center px-4 justify-between z-20 transition-colors duration-300 ${theme.headerBg}`}
          style={{ "--wails-draggable": "drag" } as React.CSSProperties}
        >
          {/* Title Area */}
          <div className="flex items-center gap-3">
            <h2 className={`text-[17px] font-semibold ${theme.text}`}>
              Transend
            </h2>
          </div>

          {/* Header Controls */}
          <div
            className="flex items-center gap-2"
            style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
          >
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-lg transition-colors ${isDarkMode
                ? "hover:bg-slate-800 text-yellow-400"
                : "hover:bg-gray-200 text-gray-600"
                }`}
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* QR Toggle - Controls visibility on all screens now */}
            <button
              onClick={() => setShowQRPanel(!showQRPanel)}
              className={`p-2 rounded-lg transition-colors ${isDarkMode
                ? "hover:bg-slate-800 text-slate-400"
                : "hover:bg-gray-200 text-gray-600"
                } ${showQRPanel ? (isDarkMode ? "bg-slate-800" : "bg-gray-200") : ""
                }`}
              title={showQRPanel ? "Hide Info" : "Show Info"}
            >
              {showQRPanel ? (
                <PanelRightClose size={18} />
              ) : (
                <QrCode size={18} />
              )}
            </button>

            <div
              className={`w-px h-4 mx-1 ${isDarkMode ? "bg-slate-700" : "bg-gray-300"
                }`}
            ></div>

            <button
              onClick={handleMinimize}
              className={`p-2 rounded-lg transition-colors ${isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                : "hover:bg-gray-200 text-gray-500 hover:text-gray-900"
                }`}
            >
              <Minus size={18} />
            </button>
            <button
              onClick={handleMaximizeToggle}
              className={`p-2 rounded-lg transition-colors ${isDarkMode
                ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                : "hover:bg-gray-200 text-gray-500 hover:text-gray-900"
                }`}
            >
              <Maximize2 size={16} />
            </button>
            <button
              onClick={handleClose}
              className={`p-2 rounded-lg transition-colors ${isDarkMode
                ? "hover:bg-red-900/50 text-slate-400 hover:text-red-400"
                : "hover:bg-red-50 text-gray-500 hover:text-red-600"
                }`}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* MESSAGES AREA */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 py-4 flex flex-col scroll-smooth custom-scrollbar"
        >
          <div className="mt-auto flex flex-col gap-3">
            {visibleTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-40">
                <MessageSquare
                  size={48}
                  className={`${isDarkMode ? "text-slate-600" : "text-gray-400"
                    } mb-2`}
                />
                <p className="text-sm font-medium">No transfers yet</p>
              </div>
            ) : (
              visibleTransactions.map((transaction) => {
                const isMe = transaction.senderId === "server";
                const isFile = transaction.type === "file";
                const alignClass = isMe ? "justify-end" : "justify-start";
                const bubbleClass = isMe ? theme.bubbleMe : theme.bubbleOther;

                // Lookup client platform if message is from client
                let clientPlatform: Client["platform"] | undefined;
                if (!isMe && transaction.clientId) {
                  const client = clients.find(c => c.id === transaction.clientId);
                  if (client) clientPlatform = client.platform;
                }

                return (
                  <div
                    key={transaction.id}
                    className={`flex ${alignClass} animate-in fade-in slide-in-from-bottom-2 duration-300 gap-2 items-end`}
                  >
                    {/* Avatar for Client (Left Side) */}
                    {!isMe && (
                      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mb-1 ${isDarkMode ? "bg-slate-800 text-slate-400" : "bg-gray-100 text-gray-500"
                        }`}>
                        <PlatformIcon platform={clientPlatform || "unknown"} size={16} />
                      </div>
                    )}

                    <div
                      className={`relative rounded-2xl p-3 max-w-[85%] md:max-w-[70%] shadow-sm ${bubbleClass} transition-colors duration-300`}
                    >
                      {transaction.type === "text" && (
                        <div className="flex items-start gap-2 min-w-[120px]">
                          <div className="text-[15px] leading-relaxed break-words flex-1">
                            {transaction.textContent}
                          </div>
                          <button
                            onClick={() =>
                              handleCopyText(transaction.textContent || "")
                            }
                            className={`p-1 rounded-full transition-colors ${isMe
                              ? "hover:bg-white/20 text-white/70"
                              : isDarkMode
                                ? "hover:bg-slate-700 text-slate-400"
                                : "hover:bg-gray-100 text-gray-400"
                              }`}
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      )}

                      {isFile && (
                        <div className="flex items-center gap-3 pr-2">
                          {(() => {
                            const ext = transaction.filename?.split('.').pop()?.toLowerCase();
                            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '');
                            const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');
                            const mediaUrl = serverInfo?.url && transaction.downloadLink ? `${serverInfo.url}${transaction.downloadLink}` : '';

                            if (isImage && mediaUrl) {
                              return (
                                <div
                                  className="w-12 h-12 rounded-lg bg-black/5 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative group"
                                  onClick={() => OpenSourceFile(transaction.filename || "")}
                                  title="Open Image"
                                >
                                  <img src={mediaUrl} alt="preview" className="w-full h-full object-cover" />
                                </div>
                              );
                            }

                            if (isVideo && mediaUrl) {
                              return (
                                <div
                                  className="w-12 h-12 rounded-lg bg-black/10 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative group flex items-center justify-center"
                                  onClick={() => OpenSourceFile(transaction.filename || "")}
                                  title="Open Video"
                                >
                                  <video src={mediaUrl} className="w-full h-full object-cover absolute inset-0 pointer-events-none" />
                                  <div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center z-10 backdrop-blur-sm">
                                    <Play size={10} className="text-white ml-0.5" />
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isMe
                                  ? "bg-white/20"
                                  : isDarkMode
                                    ? "bg-slate-700"
                                    : "bg-gray-100"
                                  }`}
                              >
                                <File size={20} />
                              </div>
                            );
                          })()}

                          <div className="min-w-[140px] text-left">
                            <div
                              className="font-semibold text-sm truncate max-w-[200px]"
                              title={transaction.filename}
                            >
                              {transaction.filename}
                            </div>
                            <div
                              className={`text-xs mt-0.5 ${isMe
                                ? "text-white/80"
                                : isDarkMode
                                  ? "text-slate-400"
                                  : "text-gray-500"
                                }`}
                            >
                              {formatSize(transaction.fileSize)}
                            </div>

                            {transaction.status === "in_progress" && (
                              <div className="w-full h-1 bg-gray-200/30 rounded-full mt-2 overflow-hidden">
                                <div
                                  className={`h-full ${isMe ? "bg-white" : "bg-[#007AFF]"
                                    }`}
                                  style={{
                                    width: `${transaction.transactionPercent}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {/* Actions inside bubble */}
                      {/* Completed File Actions: Open With */}
                      {isFile && transaction.status === "completed" && !isMe && (
                        <div className="mt-2 flex justify-end relative pt-2 border-t border-gray-100/10">
                          <TransactionActions
                            transaction={transaction}
                            isDarkMode={isDarkMode}
                          />
                        </div>
                      )}
                    </div>

                    {/* Avatar for Server (Right Side) */}
                    {
                      isMe && (
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mb-1 ${isDarkMode ? "bg-slate-800 text-slate-400" : "bg-gray-100 text-gray-500"
                          }`}>
                          <Monitor size={16} />
                        </div>
                      )
                    }
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        </div>

        {/* INPUT AREA */}
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
                className="w-10 h-10 bg-[#007AFF] hover:bg-[#0066CC] text-white rounded-full flex items-center justify-center transition-colors shadow-sm"
              >
                <ArrowUp size={20} />
              </button>
              <button
                onClick={() => {
                  setShowTextInput(false);
                  setTextInput("");
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDarkMode
                  ? "bg-slate-700 hover:bg-slate-600 text-slate-300"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-500"
                  }`}
              >
                <X size={20} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTextInput(!showTextInput)}
              className={`p-3 rounded-full transition-colors ${isDarkMode
                ? "bg-slate-700 hover:bg-slate-600 text-slate-300"
                : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                }`}
              title="Send Text"
            >
              <MessageSquare size={22} />
            </button>

            <button
              onClick={handleSelectFiles}
              className={`flex-1 h-12 rounded-2xl font-semibold flex items-center justify-center gap-2 border shadow-sm transition-all group ${isDarkMode
                ? "bg-slate-800 border-slate-700 hover:border-[#007AFF] text-slate-200"
                : "bg-white border-gray-200 hover:border-[#007AFF] text-gray-700"
                } hover:text-[#007AFF]`}
            >
              <Upload
                size={18}
                className="group-hover:-translate-y-0.5 transition-transform"
              />
              <span>Select Files</span>
            </button>
          </div>

          <p className={`text-[11px] text-center mt-2 ${theme.subText}`}>
            Pressing select will open system dialog
          </p>
        </div>
      </div>

      {/* --- RIGHT SIDE: SERVER INFO & QR --- */}
      {/* On Mobile: Absolute positioning covers the entire chat area (top-[60px] respects header).
         On Desktop: Static positioning sits side-by-side.
      */}
      {
        showQRPanel && (
          <div
            className={`
            absolute top-[60px] bottom-0 right-0 w-full z-40 
            md:static md:w-[350px] md:border-l md:z-30
            flex flex-col shadow-xl transition-all duration-300 
            ${theme.panelBg}
        `}
          >
            <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in slide-in-from-right duration-300">
              {serverInfo ? (
                <>
                  <div className="mb-6 flex flex-col items-center">
                    <img
                      src={logo}
                      alt="Logo"
                      className="w-16 h-16 rounded-2xl shadow-lg mb-4"
                    />
                    <h1 className={`text-xl font-bold ${theme.text}`}>
                      Scan to Connect
                    </h1>
                    <p className={`text-sm mt-1 font-mono ${theme.subText}`}>
                      {serverInfo.url}
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border ${theme.panelCard}`}
                  >
                    <div className="w-[180px] h-[180px] bg-white rounded-xl p-2">
                      <QRCode
                        value={serverInfo.url}
                        style={{ height: "100%", width: "100%" }}
                        viewBox={`0 0 256 256`}
                      />
                    </div>
                  </div>

                  <div className="mt-8 text-center">
                    <div
                      className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-full border ${isDarkMode
                        ? "bg-green-900/30 text-green-400 border-green-900/50"
                        : "bg-green-50 text-green-700 border-green-100"
                        }`}
                    >
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      Server Active
                    </div>

                    <button
                      onClick={handleRestartServer}
                      className={`ml-2 p-1.5 rounded-full hover:bg-gray-100 transition-colors inline-flex items-center justify-center ${isDarkMode ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-200 text-gray-500"
                        }`}
                      title="Restart Server"
                    >
                      <RefreshCw size={14} />
                    </button>

                    <p
                      className={`text-xs mt-3 max-w-[200px] mx-auto leading-relaxed ${theme.subText}`}
                    >
                      Ensure both devices are connected to the same Wi-Fi network.
                    </p>
                  </div>

                  {/* Connected Clients Section */}
                  {clients.length > 0 && (
                    <div className={`mt-6 w-full px-4 animate-in slide-in-from-bottom-2 fade-in duration-500`}>
                      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 px-2 ${theme.subText}`}>
                        Connected Devices
                      </h3>
                      <div className="flex flex-col gap-2">
                        {clients.map(client => (
                          <div
                            key={client.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isDarkMode
                              ? "bg-slate-800/50 border-slate-700"
                              : "bg-gray-50 border-gray-100"
                              }`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDarkMode ? "bg-slate-700 text-slate-300" : "bg-white text-gray-500 shadow-sm"
                              }`}>
                              <PlatformIcon platform={client.platform} size={16} />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <div className={`text-sm font-medium truncate capitalize ${theme.text}`}>
                                {client.platform}
                              </div>
                              <div className={`text-[10px] truncate font-mono ${theme.subText}`}>
                                {client.ip}
                              </div>
                            </div>
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className={`text-center ${theme.subText}`}>
                  <div
                    className={`w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center mx-auto mb-4 animate-spin-slow ${isDarkMode ? "border-slate-700" : "border-gray-300"
                      }`}
                  >
                    <Upload size={24} />
                  </div>
                  <p>Starting server...</p>
                </div>
              )}
            </div>
          </div>
        )
      }
    </div >
  );
};
