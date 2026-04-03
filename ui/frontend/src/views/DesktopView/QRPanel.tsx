import React, { useState } from "react";
import { Check, RefreshCw, Upload, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { CopyButton } from "../../components/CopyButton";
import { EditableDeviceName } from "./EditableDeviceName";
import type { Client } from "../../hooks/useDevices";
import { QRCode } from "react-qrcode-logo";
import logo from "../../assets/images/appicon.png";
import { Theme } from "../../themeConstants";
import { useTranslation } from "../../hooks/useTranslation";

interface QRPanelProps {
  serverInfo: any;
  securityEnabled: boolean;
  securityToken: string;
  clients: Client[];
  activeClientDownload: any;
  theme: Theme;
  isDarkMode: boolean;
  isCheckingNetwork: boolean;
  handleRestartServer: () => void;
  handleBlockClient: (client: Client) => void;
  handleBlockSending: (client: Client) => void;
  adminToken: string;
}

export const QRPanel = ({
  serverInfo,
  securityEnabled,
  securityToken,
  clients,
  activeClientDownload,
  theme,
  isDarkMode,
  isCheckingNetwork,
  handleRestartServer,
  handleBlockClient,
  handleBlockSending,
  adminToken,
}: QRPanelProps) => {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);

  // If no clients, always show details. If clients exist, only show if toggled.
  const isVisible = clients.length === 0 || showDetails;
  if (!serverInfo) {
    return (
      <div className={`text-center ${theme.subText}`}>
        <div
          className={`w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center mx-auto mb-4 animate-spin-slow ${theme.border} ${theme.iconText}`}
        >
          <Upload size={24} />
        </div>
        <p>{t("starting_server")}</p>
      </div>
    );
  }

  return (
    <>
      {/* Connected Clients - Now at the absolute top */}
      {clients.length > 0 && (
        <div
          className={`mt-4 mb-4 w-full max-w-full mx-auto px-2 animate-in slide-in-from-top-4 fade-in duration-700`}
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="h-[1px] flex-1 bg-current opacity-5"></div>
            <h3
              className={`text-[9px] font-bold uppercase tracking-[0.2em] whitespace-nowrap opacity-40 ${theme.subText}`}
            >
              {t("connected_devices")}
            </h3>
            <div className="h-[1px] flex-1 bg-current opacity-5"></div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
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

      {/* Header - Only show if no clients connected */}
      {clients.length === 0 && (
        <div className="mb-8 flex flex-col items-center pt-8">
          <div
            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] mb-2 opacity-50 ${theme.text}`}
          >
            {t("connect_device")}
          </div>
          <h1
            className={`text-xl font-bold tracking-tight text-center ${theme.text}`}
          >
            {t("start_sharing")}
          </h1>
        </div>
      )}

      {/* Connect More Toggle - Styled as a Client Item */}
      {clients.length > 0 && (
        <div className="flex justify-center mb-4 w-full max-w-full mx-auto px-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-300 active:scale-[0.98] ${
              showDetails
                ? theme.iconBg + " " + theme.border
                : theme.deviceItemBg + " " + theme.border + " hover:border-blue-500/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-inner transition-colors ${
                  showDetails ? (theme.isDark ? "bg-white/10" : "bg-white/50") : theme.iconBg
                } ${showDetails ? theme.iconText : theme.iconText}`}
              >
                <Plus size={20} className={showDetails ? "rotate-45 transition-transform duration-300" : "transition-transform duration-300"} />
              </div>
              <div className="flex flex-col items-start translate-y-[-1px]">
                <h3 className={`text-sm font-bold text-start transition-colors ${showDetails ? theme.iconText : theme.text}`}>
                  {t("connect_more_devices")}
                </h3>
                <p className={`text-[10px] font-medium text-start opacity-50 transition-colors ${showDetails ? theme.iconText : theme.subText}`}>
                  {showDetails ? t("tap_to_hide_qr") : t("tap_to_reveal_qr")}
                </p>
              </div>
            </div>
            <div className={`transition-colors ${showDetails ? theme.iconText : theme.text}`}>
              {showDetails ? <ChevronUp size={18} className="opacity-40" /> : <ChevronDown size={18} className="opacity-40" />}
            </div>
          </button>
        </div>
      )}


      <div className="w-full max-w-full mx-auto px-2">
        {/* Connection Area - No background/border as requested */}
        <div className={`relative space-y-4 transition-all duration-500 overflow-hidden ${
          isVisible ? "opacity-100 max-h-[1000px]" : "opacity-0 max-h-0 pointer-events-none"
        }`}>
          {/* Network Section */}
          <div className="flex flex-col items-center gap-2">
            {clients.length === 0 && (
              <span
                className={`text-[10px] font-bold uppercase tracking-widest opacity-30 ${theme.text}`}
              >
                {t("step_1_network")}
              </span>
            )}

            {serverInfo?.ssid ? (
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-mono text-sm font-semibold transition-all hover:scale-[1.02] ${
                  isDarkMode
                    ? "bg-slate-800/40 text-emerald-400 border border-slate-700/50"
                    : "bg-white/50 text-emerald-700 border border-emerald-100"
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="truncate max-w-[180px]">
                  {serverInfo.ssid}
                </span>
              </div>
            ) : (
              <div
                className={`px-4 py-2.5 rounded-xl border border-dashed text-center min-w-[200px] opacity-60 ${theme.border}`}
              >
                <p className={`text-xs font-medium ${theme.subText}`}>
                  {isCheckingNetwork
                    ? t("checking_network")
                    : t("trouble_detecting_network")}
                </p>
              </div>
            )}
          </div>

          {/* QR Section - Always show to allow multi-client connections */}
          <div>
            <div className="flex flex-col items-center gap-8">
              <div className="relative group">
                <div
                  className={`p-1 rounded-2.5xl transition-all duration-700 ${
                    serverInfo?.url
                      ? "opacity-100 scale-100 rotate-0"
                      : "opacity-30 scale-95 blur-md"
                  }`}
                >
                  <QRCode
                    {...{
                      value: serverInfo?.url
                        ? securityEnabled && securityToken
                          ? `${serverInfo.url}?security=${securityToken}`
                          : serverInfo.url
                        : "",
                      size: 200,
                      quietZone: 0,
                      qrStyle: "dots",
                      fgColor: isDarkMode ? "#fff" : "#1b2636",
                      bgColor: "transparent",
                      logoImage: logo,
                      logoPaddingRadius: 1,
                      logoPadding: 1,
                      logoWidth: 30,
                      logoPaddingStyle: "circle",
                      logoOpacity: 1,
                      ecLevel: "H",
                      eyeRadius: 50,
                      eyeColor: isDarkMode ? "#d6e3ef" : "#1b415e",
                      removeQrCodeBehindLogo: true,
                    }}
                  />
                </div>
              </div>

              {/* URL and Copy part */}
              {serverInfo?.url ? (
                <div className="w-[200px] space-y-4 pt-1">
                  <div
                    className={`flex items-center justify-between gap-3 pl-3 pr-1 py-1 rounded-xl transition-all duration-300 ${
                      isDarkMode
                        ? "bg-slate-900/30 text-slate-400"
                        : "bg-gray-100/50 text-gray-500"
                    }`}
                  >
                    <span
                      className={`truncate text-[10px] font-mono font-medium opacity-80`}
                    >
                      {securityEnabled && securityToken
                        ? `${serverInfo.url.split("://")[1].split("/")[0]}?security=...`
                        : serverInfo.url.split("://")[1] || serverInfo.url}
                    </span>
                    <CopyButton
                      text={
                        securityEnabled && securityToken
                          ? `${serverInfo.url}?security=${securityToken}`
                          : serverInfo.url
                      }
                      title={
                        securityEnabled && securityToken
                          ? `${serverInfo.url}?security=${securityToken}`
                          : serverInfo.url
                      }
                      className={`p-1.5 rounded-xl transition-all ${
                        isDarkMode
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-300"
                          : "bg-white hover:bg-gray-100 text-gray-600 shadow-sm border border-gray-100"
                      }`}
                      iconSize={12}
                      isDarkMode={isDarkMode}
                    />
                  </div>
                    {clients.length === 0 && (
                      <p
                        className={`text-[9px] text-center font-bold uppercase tracking-[0.25em] opacity-20 ${theme.text}`}
                      >
                        {t("or_enter_url_manually")}
                      </p>
                    )}
                </div>
              ) : (
                <div className="w-[200px] flex items-center justify-center gap-2 py-4 animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-current opacity-30"></div>
                  <p className={`text-xs font-medium ${theme.subText}`}>
                    {t("waiting_network")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Server Controls */}
        <div className="flex justify-center pt-8">
          <button
            onClick={handleRestartServer}
            disabled={isCheckingNetwork}
            className={`group flex items-center gap-3 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${
              theme.ghostHover
            } ${isCheckingNetwork ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div
              className={`p-1 transition-transform duration-500 ${isCheckingNetwork ? "animate-spin" : "group-hover:rotate-180"}`}
            >
              <RefreshCw size={16} />
            </div>
            {isCheckingNetwork ? t("restarting") : t("restart_server")}
          </button>
        </div>
      </div>

    </>
  );
};
