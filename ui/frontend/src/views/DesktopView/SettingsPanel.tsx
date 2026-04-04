import React from "react";
import axios from "axios";
import {
  Settings,
  Check,
  RefreshCw,
  Star,
  Lightbulb,
  StarIcon,
  Type,
  UserStar,
  Coffee,
  Pencil,
  FolderOpen,
  Wifi,
  ExternalLink,
} from "lucide-react";
import {
  THEME_PRESETS,
  ACCENT_COLORS,
  Theme,
  opacityAddedColor,
  AccentColor,
} from "../../themeConstants";
import { CopyButton } from "../../components/CopyButton";
import { Switch } from "../../components/Switch";
import { EditableDeviceName } from "./EditableDeviceName";
import { SelectDownloadPath, ShowInFolder } from "../../../wailsjs/go/main/App";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import type { Client } from "../../hooks/useDevices";
import type { ActivityType } from "../../hooks/useActivity";
import { APP_VERSION } from "../../version";
import { useTranslation } from "../../hooks/useTranslation";
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime";

interface SettingsPanelProps {
  theme: Theme;
  activeThemeId: string;
  setActiveThemeId: (id: string) => void;
  activeAccentId: string;
  setActiveAccentId: (id: string) => void;
  activeAccent: AccentColor;
  textTransferEnabled: boolean;
  setTextTransferEnabled: (val: boolean) => void;
  securityEnabled: boolean;
  setSecurityEnabled: (val: boolean) => void;
  staticPortEnabled: boolean;
  setStaticPortEnabled: (val: boolean) => void;
  staticPort: number;
  setStaticPort: (val: number) => void;
  logActivity: (type: ActivityType, message: string) => void;
  serverInfo: any;
  securityToken: string;
  isDarkMode: boolean;
  handleRestartServer: () => void;
  isCheckingNetwork: boolean;
  clients: Client[];
  transactionsCount: number;
  adminToken: string;
  handleBlockClient: (client: Client) => void;
  handleBlockSending: (client: Client) => void;
  canPromptReview: boolean;
  onRequestReview: () => void;
  setNotification: (notification: { show: boolean; message: string }) => void;
  deviceName: string;
  onUpdateDeviceName: (name: string) => void;
  downloadPath: string;
  setDownloadPath: (val: string) => void;
  userEmail: string;
  onOpenFeatureRequest: () => void;
}

export const SettingsPanel = ({
  theme,
  activeThemeId,
  setActiveThemeId,
  activeAccentId,
  setActiveAccentId,
  activeAccent,
  textTransferEnabled,
  setTextTransferEnabled,
  securityEnabled,
  setSecurityEnabled,
  staticPortEnabled,
  setStaticPortEnabled,
  staticPort,
  setStaticPort,
  logActivity,
  serverInfo,
  securityToken,
  isDarkMode,
  handleRestartServer,
  isCheckingNetwork,
  clients,
  transactionsCount,
  adminToken,
  handleBlockClient,
  handleBlockSending,
  canPromptReview,
  onRequestReview,
  setNotification,
  deviceName,
  onUpdateDeviceName,
  downloadPath,
  setDownloadPath,
  userEmail,
  onOpenFeatureRequest,
}: SettingsPanelProps) => {
  const { t } = useTranslation();
  const [isEditingPort, setIsEditingPort] = React.useState(false);
  const [portInputValue, setPortInputValue] = React.useState<string>(
    String(staticPort),
  );
  const [pendingAction, setPendingAction] = React.useState<{
    type: "toggle" | "change";
    value: boolean | number;
  } | null>(null);

  const hasActiveConnections = clients.length > 0 || transactionsCount > 0;

  const handlePortChangeAction = (action: {
    type: "toggle" | "change";
    value: boolean | number;
  }) => {
    if (hasActiveConnections) {
      setPendingAction(action);
    } else {
      executePortChange(action);
    }
  };

  const executePortChange = (action: {
    type: "toggle" | "change";
    value: boolean | number;
  }) => {
    if (action.type === "toggle") {
      setStaticPortEnabled(action.value as boolean);
    } else {
      const parsed = action.value as number;
      setStaticPort(parsed);
      setPortInputValue(String(parsed));
    }
    // Automatically restart server after change
    setTimeout(() => {
      handleRestartServer();
    }, 300);
  };

  const handlePortConfirm = () => {
    const parsed = parseInt(portInputValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 65535) {
      if (parsed !== staticPort) {
        handlePortChangeAction({ type: "change", value: parsed });
      }
    } else {
      setPortInputValue(String(staticPort)); // reset to last valid
    }
    setIsEditingPort(false);
  };

  const [isEditingName, setIsEditingName] = React.useState(false);
  const [nameInputValue, setNameInputValue] = React.useState(deviceName);
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isEditingName) {
      setNameInputValue(deviceName);
    }
  }, [deviceName, isEditingName]);

  const handleNameConfirm = () => {
    const trimmed = nameInputValue.trim();
    if (trimmed && trimmed.length <= 20 && trimmed !== deviceName) {
      onUpdateDeviceName(trimmed);
    } else {
      setNameInputValue(deviceName);
    }
    setIsEditingName(false);
  };

  const handleSelectDownloadPath = async (current: string) => {
    try {
      const path = await SelectDownloadPath(current);
      if (path) {
        setDownloadPath(path);
        logActivity(
          "settings_changed",
          `Download location changed to: ${path}`,
        );
      }
    } catch (err) {
      console.error("Failed to select download path:", err);
    }
  };

  const ADDITIONAL_ACTIONS = [
    {
      label: t("rate_app"),
      icon: <UserStar />,
      onClick: onRequestReview,
    },
    {
      label: t("request_feature"),
      icon: <Lightbulb />,
      onClick: onOpenFeatureRequest,
    },
    {
      label: t("buy_developer_a_coffee"),
      icon: <Coffee />,
      onClick: () => BrowserOpenURL("https://buymeacoffee.com/peerhop"),
    },
  ];

  return (
    <div
      className="w-full self-start text-left pt-8 px-2"
      style={{ "--accent-color": activeAccent.color } as React.CSSProperties}
    >
      {/* Left-aligned header */}
      <div className="mb-8 flex items-center gap-3">
        <h1 className={`text-2xl font-bold ${theme.text}`}>{t("settings")}</h1>
      </div>

      {/* Settings Content - No borders, left-aligned */}
      <div className="space-y-6 text-left">
        <div className="flex flex-wrap gap-2 mt-4 text-left w-full transition-all ">
          {ADDITIONAL_ACTIONS.map((action) => (
            <div className="grow lg:w-[45%] md:w-full ">
              <button
                onClick={action.onClick}
                className={`px-4 py-2 rounded-lg w-full   text-sm font-medium  transition-colors  gap-3  ${isDarkMode ? "hover:!text-white" : "hover:!text-black"}   `}
                style={{
                  backgroundColor: `${activeAccent.v2}`,
                  color: `${isDarkMode ? "#ffffffd3" : "#00000096"}`,
                }}
              >
                <div>{action.icon}</div>
                <div className="text-nowrap text-left">{action.label}</div>
              </button>
            </div>
          ))}
          {/* <div className="grow w-[45%] ">
            <button
              onClick={onRequestReview}
              className={`px-4 py-2 rounded-lg w-full    text-sm font-medium  transition-colors  gap-3  ${isDarkMode ? "hover:!text-white" : "hover:!text-black"}  `}
              style={{
                backgroundColor: `${activeAccent.v2}`,
                color: `${isDarkMode ? "#ffffffd3" : "#00000096"}`,
              }}
            >
              <div>
                <UserStar />
              </div>
              <div className="text-nowrap text-left w-full">
                {" "}
                {t("rate_app")}
              </div>
            </button>
          </div> */}
        </div>

        {/* General / Profile */}
        <div>
          <h3
            className={`text-[11px] font-bold uppercase tracking-[0.12em] opacity-40 mb-4 ${theme.text}`}
          >
            {t("general") || "General"}
          </h3>
          <div className="space-y-5">
            {/* Host Name Setting */}
            <div className="flex items-center justify-between gap-4 group">
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium whitespace-nowrap ${theme.text}`}
                >
                  {t("host_name") || "Device Name"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 transition-all animate-in fade-in slide-in-from-right-2 duration-300">
                  {isEditingName ? (
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={nameInputValue}
                        onChange={(e) => setNameInputValue(e.target.value)}
                        onBlur={() => {
                          setNameInputValue(deviceName);
                          setIsEditingName(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleNameConfirm();
                          if (e.key === "Escape") {
                            setNameInputValue(deviceName);
                            setIsEditingName(false);
                          }
                        }}
                        autoFocus
                        maxLength={20}
                        className={`w-[150px] text-right text-xs font-semibold px-0 py-0 bg-transparent border-b border-dashed outline-none ${
                          isDarkMode
                            ? "border-slate-500 text-slate-100"
                            : "border-gray-400 text-gray-800"
                        }`}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 max-w-full">
                        <span
                          onClick={() => {
                            setNameInputValue(deviceName);
                            setIsEditingName(true);
                          }}
                          className={`inline-block max-w-full text-xs font-semibold truncate cursor-pointer transition-colors border-b border-dashed border-current hover:border-[var(--accent-color)] hover:!text-[var(--accent-color)] ${
                            isDarkMode ? "text-slate-300" : "text-gray-600"
                          }`}
                        >
                          {deviceName}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Download Location Setting */}
            <div className="w-full relative pt-2">
              <div className="flex items-start justify-between gap-4 group">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium whitespace-nowrap ${theme.text}`}
                  >
                    {t("download_location") || "File Saving Location"}
                  </p>
                  <p
                    onClick={() => handleSelectDownloadPath(downloadPath)}
                    className={`text-[11px] mt-0.5 transition-all truncate cursor-pointer hover:opacity-100 hover:!text-[var(--accent-color)] ${theme.subText} ${isDarkMode ? "text-slate-400" : "text-gray-600"}`}
                    title={downloadPath}
                  >
                    <span className="border-b border-dashed border-current hover:border-[var(--accent-color)]">
                      {downloadPath}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => ShowInFolder(downloadPath)}
                    className={`p-1.5 rounded-lg transition-all flex items-center justify-center shrink-0 ${
                      isDarkMode
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                        : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                    }`}
                    title="Open Folder"
                  >
                    <FolderOpen size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div>
          <h3
            className={`text-[11px] font-bold uppercase tracking-[0.12em] opacity-40 mb-4 ${theme.text}`}
          >
            {t("features")}
          </h3>
          <div className="space-y-5">
            {/* Text Transfer Toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p
                  className={`text-sm font-medium whitespace-nowrap ${theme.text}`}
                >
                  {t("text_transfer")}
                </p>
                {/* <p className={`text-xs mt-0.5 ${theme.subText}`}>
                  {t("enable_sending_receiving")}
                </p> */}
              </div>
              <Switch
                checked={textTransferEnabled}
                onChange={(next) => {
                  setTextTransferEnabled(next);
                  logActivity(
                    "settings_changed",
                    `Text Transfer: ${next ? "enabled" : "disabled"}`,
                  );
                }}
                disabled={isCheckingNetwork}
                theme={theme}
                ariaLabel={t("text_transfer")}
                accentColor={activeAccent}
              />
            </div>

            {/* Security Toggle */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p
                  className={`text-sm font-medium whitespace-nowrap ${theme.text}`}
                >
                  {t("enable_security")}
                </p>
                {/* <p className={`text-xs mt-0.5 ${theme.subText}`}>
                  {t("require_token")}
                </p> */}
              </div>
              <Switch
                checked={securityEnabled}
                onChange={(next) => {
                  setSecurityEnabled(next);
                  logActivity(
                    "settings_changed",
                    `Security: ${next ? "enabled" : "disabled"}`,
                  );
                }}
                disabled={isCheckingNetwork}
                theme={theme}
                ariaLabel={t("enable_security")}
                accentColor={activeAccent}
              />
            </div>

            {/* Static Port Toggle */}
            <div className="flex items-center justify-between gap-4 group">
              <div className="flex-1">
                <p
                  className={`text-sm font-medium whitespace-nowrap ${theme.text}`}
                >
                  Static Port
                </p>
              </div>

              <div className="flex items-center gap-3">
                {staticPortEnabled && (
                  <div className="flex items-center gap-1.5 transition-all animate-in fade-in slide-in-from-right-2 duration-300">
                    {isEditingPort ? (
                      <div className="flex items-center">
                        <input
                          type="number"
                          min={1}
                          max={65535}
                          value={portInputValue}
                          disabled={isCheckingNetwork}
                          onChange={(e) => setPortInputValue(e.target.value)}
                          onBlur={() => {
                            setPortInputValue(String(staticPort));
                            setIsEditingPort(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handlePortConfirm();
                            if (e.key === "Escape") {
                              setPortInputValue(String(staticPort));
                              setIsEditingPort(false);
                            }
                          }}
                          autoFocus
                          className={`w-16 text-right text-xs font-mono font-semibold px-0 py-0 bg-transparent border-b border-dashed outline-none ${
                            isDarkMode
                              ? "border-slate-500 text-slate-100"
                              : "border-gray-400 text-gray-800"
                          } ${isCheckingNetwork ? "opacity-50 cursor-default" : ""}`}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span
                          onClick={() => {
                            if (!isCheckingNetwork) {
                              setPortInputValue(String(staticPort));
                              setIsEditingPort(true);
                            }
                          }}
                          className={`inline-block text-xs font-mono font-semibold cursor-pointer transition-colors border-b border-dashed border-current hover:border-[var(--accent-color)] hover:!text-[var(--accent-color)] ${
                            isDarkMode ? "text-slate-300" : "text-gray-600"
                          } ${isCheckingNetwork ? "cursor-default opacity-20" : ""}`}
                        >
                          {staticPort}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <Switch
                  checked={staticPortEnabled}
                  onChange={(next) => {
                    handlePortChangeAction({ type: "toggle", value: next });
                    if (!next) setIsEditingPort(false);
                  }}
                  disabled={isCheckingNetwork}
                  theme={theme}
                  ariaLabel="Static Port"
                  accentColor={activeAccent}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Server Info */}
        {serverInfo && (
          <div>
            <h3
              className={`text-[11px] font-bold uppercase tracking-[0.12em] opacity-40 mb-4 ${theme.text}`}
            >
              {t("server_info") || "Connection Information"}
            </h3>
            <div className="space-y-3">
              <div>
                <p
                  className={`text-[10px] uppercase tracking-wider mb-2 ${theme.subText}`}
                >
                  {t("url")}
                </p>
                <div
                  className={`flex items-center min-w-0 h-9 px-1 rounded-lg border gap-1 ${
                    isDarkMode
                      ? "bg-slate-800/50 border-slate-700"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <CopyButton
                    text={
                      serverInfo.url
                        ? securityEnabled && securityToken
                          ? `${serverInfo.url}?security=${securityToken}`
                          : serverInfo.url
                        : ""
                    }
                    className={`p-1.5 rounded-md transition-colors ${
                      isDarkMode
                        ? "hover:bg-white/5 text-slate-400"
                        : "hover:bg-black/5 text-gray-500"
                    }`}
                    iconSize={12}
                    isDarkMode={isDarkMode}
                  />
                  <code
                    className={`truncate text-xs font-mono flex-1 pr-3 ${theme.text}`}
                  >
                    {serverInfo.url
                      ? securityEnabled && securityToken
                        ? `${serverInfo.url}?security=${securityToken}`
                        : serverInfo.url
                      : ""}
                  </code>
                </div>
              </div>
              <div>
                <p
                  className={`text-[10px] uppercase tracking-wider mb-2 ${theme.subText}`}
                >
                  {t("wifi_network")}
                </p>
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    isDarkMode
                      ? "bg-slate-800/50 border-slate-700"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <Wifi size={12} className={theme.subText} />
                  <code className={`text-xs font-mono ${theme.text}`}>
                    {serverInfo.ssid || "Unable to detect"}
                  </code>
                </div>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => {
                    if (hasActiveConnections) {
                      setIsRestartConfirmOpen(true);
                    } else {
                      handleRestartServer();
                    }
                  }}
                  disabled={isCheckingNetwork}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    theme.iconBg
                  } ${theme.ghostHover} ${theme.text} ${
                    isCheckingNetwork ? "opacity-50 cursor-default" : ""
                  }`}
                >
                  <RefreshCw
                    size={14}
                    className={isCheckingNetwork ? "animate-spin" : ""}
                  />
                  {isCheckingNetwork ? t("restarting") : t("restart_server")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connected Devices - Always show in multi-client mode */}
        {clients.length > 0 && (
          <div>
            <h3
              className={`text-[11px] font-bold uppercase tracking-[0.12em] opacity-40 mb-4 ${theme.text}`}
            >
              {t("connected_devices")} ({clients.length})
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

        {/* Theme Setting */}
        <div>
          <h3
            className={`text-[11px] font-bold uppercase tracking-[0.12em] opacity-40 mb-3 ${theme.text}`}
          >
            {t("themes")}
          </h3>

          {/* Theme Cards - Horizontal Scroll */}
          <div className="flex overflow-x-auto gap-3 mb-2 pb-2 -mx-8 px-7 select-none   hide-scrollbar">
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
                    activeThemeId === t.id ? activeAccent.v1 : undefined,
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
                      activeThemeId === t.id ? activeAccent.color : undefined,
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
                          theme.bg === "bg-[#0f172a]" ? "#0f172a" : "white"
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
        {/* App Version */}
        <div className="pt-8 mt-8 border-gray-100 dark:border-slate-800 opacity-40">
          <p className={`text-[13px] text-center ${theme.text}`}>
            {t("app_name")} {t("v")}
            {APP_VERSION}
          </p>
        </div>
      </div>

      {/* Static Port Change Confirmation */}
      <ConfirmDialog
        isOpen={!!pendingAction}
        title="Server Restart Required"
        message="Changing the static port settings will clear all current transactions and disconnect all devices. Are you sure you want to proceed?"
        confirmText="Proceed & Restart"
        cancelText="Cancel"
        onConfirm={() => {
          if (pendingAction) {
            executePortChange(pendingAction);
            setPendingAction(null);
          }
        }}
        onCancel={() => setPendingAction(null)}
        destructive={true}
        isDarkMode={isDarkMode}
      />
      {/* Server Restart Confirmation */}
      <ConfirmDialog
        isOpen={isRestartConfirmOpen}
        title={t("restart_confirmation_title")}
        message={t("restart_confirmation_message")}
        confirmText={t("proceed_and_restart")}
        cancelText={t("cancel")}
        onConfirm={() => {
          handleRestartServer();
          setIsRestartConfirmOpen(false);
        }}
        onCancel={() => setIsRestartConfirmOpen(false)}
        destructive={true}
        isDarkMode={isDarkMode}
      />
    </div>
  );
};
