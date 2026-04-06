import React, { useState, useEffect, useRef } from "react";
import {
  Check,
  RefreshCw,
  Upload,
  Link as LinkIcon,
  Smartphone,
  ChevronDown,
  Wifi,
  Monitor,
  Eye,
  EyeOff,
  QrCode,
} from "lucide-react";
import { CopyButton } from "../../components/CopyButton";
import { EditableDeviceName } from "./EditableDeviceName";
import type { Client } from "../../hooks/useDevices";
import { QRCode } from "react-qrcode-logo";
import logo from "../../assets/images/appicon.png";
import { Theme } from "../../themeConstants";
import { useTranslation } from "../../hooks/useTranslation";
import { ConfirmDialog } from "../../components/ConfirmDialog";

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
  showQR: boolean;
  setShowQR: (val: boolean) => void;
  showLink: boolean;
  setShowLink: (val: boolean) => void;
  onSelectIP: (ip: string) => void;
  activeAccent: any;
  transactionsCount: number;
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
  showQR,
  setShowQR,
  showLink,
  setShowLink,
  onSelectIP,
  activeAccent,
  transactionsCount,
}: QRPanelProps) => {
  const { t } = useTranslation();
  const [isRestartConfirmOpen, setIsRestartConfirmOpen] = useState(false);
  const [hotspotPasswordVisible, setHotspotPasswordVisible] = useState(false);
  const [showHotspotQR, setShowHotspotQR] = useState<any>(null);
  const [showEthernet, setShowEthernet] = useState(false);
  const hasActiveConnections = clients.length > 0 || transactionsCount > 0;
  const prevClientsLength = useRef(clients.length);

  // Automatically close any open connection method when a new device connects
  useEffect(() => {
    if (clients.length > prevClientsLength.current) {
      setShowQR(false);
      setShowLink(false);
    }
    prevClientsLength.current = clients.length;
  }, [clients.length]);

  const qrSize = securityEnabled ? 200 : 160;
  const logoSize = securityEnabled ? 30 : 24;
  const containerWidthClass = securityEnabled ? "w-[200px]" : "w-[160px]";

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

  const renderNetworkList = () => {
    if (!serverInfo.networks || serverInfo.networks.length === 0) {
      return (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border w-full ${isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-gray-50 border-gray-200"}`}
        >
          <Wifi size={12} className={theme.subText} />
          <code
            className={`text-xs font-mono flex-1 truncate text-start ${theme.text}`}
          >
            {serverInfo.ssid || t("unable_to_detect")}
          </code>
        </div>
      );
    }

    const networks = [...serverInfo.networks].sort((a: any, b: any) => {
      const typePriority: any = { hotspot: 0, wifi: 1, ethernet: 2 };
      const aP = typePriority[a.type] ?? 3;
      const bP = typePriority[b.type] ?? 3;
      return aP - bP;
    });

    const primaryNetworks = networks.filter(
      (net: any) =>
        net.type === "hotspot" ||
        net.type === "wifi" ||
        serverInfo.url?.includes(net.ip),
    );
    const secondaryNetworks = networks.filter(
      (net: any) =>
        net.type !== "hotspot" &&
        net.type !== "wifi" &&
        !serverInfo.url?.includes(net.ip),
    );

    const renderNetItem = (net: any, idx: number) => {
      const isActive = serverInfo.url?.includes(net.ip);
      return (
        <div
          key={`${net.ip}-${idx}`}
          className={`flex flex-col rounded-lg border overflow-hidden transition-all animate-in fade-in slide-in-from-top-1 duration-300 ${
            !isActive &&
            (isDarkMode
              ? "bg-slate-800/50 border-slate-700"
              : "bg-gray-50 border-gray-200")
          }`}
          style={
            isActive
              ? {
                  borderColor: activeAccent.color,
                  backgroundColor: activeAccent.v2,
                }
              : {}
          }
        >
          <div className="flex items-center gap-2 px-3 py-2 w-full">
            <div
              className={isActive ? "" : theme.subText}
              style={{ color: isActive ? activeAccent.color : undefined }}
            >
              {net.type === "hotspot" ? (
                <Smartphone size={12} />
              ) : net.type === "wifi" ? (
                <Wifi size={12} />
              ) : (
                <Monitor size={12} />
              )}
            </div>
            <div className="flex flex-col items-start flex-1 min-w-0 text-start">
              <div className="flex items-center justify-between mb-1 w-full">
                <span
                  className={`text-[9px] uppercase font-bold leading-none text-start`}
                  style={{
                    color: isActive ? activeAccent.color : undefined,
                    opacity: isActive ? 1 : 0.4,
                  }}
                >
                  {net.type === "hotspot"
                    ? t("hotspot_name")
                    : net.type === "wifi"
                      ? t("wifi_network")
                      : t("ethernet_network")}
                </span>
                {net.type === "hotspot" && (
                  <span
                    className="text-[9px] uppercase tracking-tight"
                    style={{ color: activeAccent.color }}
                  >
                    {t("faster_badge")}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 w-full">
                <code
                  className={`text-xs font-mono truncate text-start leading-none ${theme.text}`}
                >
                  {net.ssid || t("unable_to_detect")}
                </code>
                <span
                  className={`text-[9px] font-mono opacity-40 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 ${theme.subText} text-start`}
                >
                  {net.ip}
                </span>
              </div>
            </div>
          </div>

          {net.password && (
            <div
              className={`flex items-center gap-2 px-3 py-2 w-full border-t border-dashed ${isDarkMode ? "border-slate-700" : "border-gray-200"}`}
            >
              <div className="flex flex-col flex-1 min-w-0">
                <code
                  className={`text-xs font-mono truncate text-start leading-none ${theme.text}`}
                >
                  {hotspotPasswordVisible ? net.password : "●●●●●●●●"}
                </code>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowHotspotQR(net)}
                  className={`p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${theme.subText}`}
                  title={t("show_network_qr")}
                >
                  <QrCode size={14} />
                </button>
                <button
                  onClick={() =>
                    setHotspotPasswordVisible(!hotspotPasswordVisible)
                  }
                  className={`p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${theme.subText}`}
                  title={
                    hotspotPasswordVisible
                      ? t("hide_password")
                      : t("show_password")
                  }
                >
                  {hotspotPasswordVisible ? (
                    <EyeOff size={14} />
                  ) : (
                    <Eye size={14} />
                  )}
                </button>
              </div>
            </div>
          )}

          {!isActive && serverInfo.networks.length > 1 && (
            <div
              className={`px-3 py-2 w-full border-t border-black/5 dark:border-white/5`}
            >
              <button
                onClick={() => {
                  onSelectIP(net.ip);
                }}
                className={`w-full py-1.5 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all active:scale-[0.97] ${
                  isDarkMode
                    ? "bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-slate-600"
                    : "bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 shadow-sm"
                }`}
              >
                {t("i_connected_to_this")}
              </button>
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-2">
        {primaryNetworks.map((net, idx) => renderNetItem(net, idx))}
        {secondaryNetworks.length > 0 && (
          <div className="flex flex-col gap-2">
            {!showEthernet && (
              <button
                onClick={() => setShowEthernet(true)}
                className={`w-full flex items-center justify-center py-1.5 rounded-lg border border-dashed transition-all duration-300 active:scale-[0.98] ${theme.deviceItemBg} ${theme.border} text-[9px] font-bold uppercase tracking-[0.1em] ${theme.subText}`}
              >
                + {t("show_more")}
              </button>
            )}
            {showEthernet && (
              <React.Fragment>
                {secondaryNetworks.map((net, idx) =>
                  renderNetItem(net, idx + primaryNetworks.length),
                )}
                <button
                  onClick={() => setShowEthernet(false)}
                  className={`w-full flex items-center justify-center py-1.5 rounded-lg border border-dashed transition-all duration-300 active:scale-[0.98] ${theme.deviceItemBg} ${theme.border} text-[9px] font-bold uppercase tracking-[0.1em] ${theme.subText}`}
                >
                  - {t("show_less")}
                </button>
              </React.Fragment>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <React.Fragment>
      {clients.length > 0 && (
        <div className="mt-2 mb-2.5 w-full max-w-full mx-auto px-2 animate-in slide-in-from-top-4 fade-in duration-700">
          <div className="flex items-center gap-4 mb-3">
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

      <div className="w-full max-w-full mx-auto px-2 mb-4 space-y-2.5">
        <div>
          <button
            onClick={() => {
              setShowQR(!showQR);
              if (!showQR) setShowLink(false);
            }}
            className={`w-full group flex items-center justify-between p-3 rounded-xl border transition-all duration-300 active:scale-[0.98] ${
              theme.deviceItemBg +
              " " +
              theme.border +
              (showQR ? "" : " hover:border-blue-500/30")
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-inner transition-colors ${showQR ? (theme.isDark ? "bg-white/10" : "bg-white/50") : theme.iconBg} ${theme.iconText}`}
              >
                <Smartphone size={20} />
              </div>
              <div className="flex flex-col items-start translate-y-[-1px]">
                <h3
                  className={`text-sm font-bold text-start transition-colors ${showQR ? theme.iconText : theme.text}`}
                >
                  {t("connect_mobile")}
                </h3>
                <p
                  className={`text-[10px] font-medium text-start opacity-80 transition-colors ${showQR ? theme.iconText : theme.subText}`}
                >
                  {t("connect_mobile_hint")}
                </p>
              </div>
            </div>
            <div
              className={`transition-colors ${showQR ? theme.iconText : theme.text} opacity-30`}
            >
              <ChevronDown
                size={18}
                className={
                  showQR
                    ? "rotate-180 transition-transform"
                    : "transition-transform"
                }
              />
            </div>
          </button>

          <div
            className={`transition-all duration-500 overflow-hidden ${showQR ? "opacity-100 _max-h-[1200px] py-4 mt-2.5" : "opacity-0 max-h-0 pointer-events-none"}`}
          >
            <div className="flex flex-col items-center gap-6">
              <div className="w-full px-2">
                <p
                  className={`text-[10px] uppercase tracking-wider mb-2 text-start ${theme.subText}`}
                >
                  {t("step_1_network")}
                </p>
                <div className="space-y-2">{renderNetworkList()}</div>
              </div>

              <div className="w-full px-2 flex flex-col items-start gap-2">
                <p
                  className={`text-[10px] uppercase tracking-wider text-start ${theme.subText}`}
                >
                  {t("step_2_scan_qr")}
                </p>
                <div className="relative group self-center mt-2 pb-3">
                  <div
                    className={`p-1 rounded-2.5xl transition-all duration-700 ${serverInfo?.url ? "opacity-100 scale-100 rotate-0" : "opacity-30 scale-95 blur-md"}`}
                    title={
                      serverInfo?.url
                        ? securityEnabled && securityToken
                          ? `${serverInfo.url}?security=${securityToken}`
                          : serverInfo.url
                        : ""
                    }
                  >
                    <QRCode
                      {...{
                        value: serverInfo?.url
                          ? securityEnabled && securityToken
                            ? `${serverInfo.url}?security=${securityToken}`
                            : serverInfo.url
                          : "",
                        size: qrSize,
                        quietZone: 0,
                        qrStyle: "dots",
                        fgColor: isDarkMode ? "#fff" : "#1b2636",
                        bgColor: "transparent",
                        logoImage: logo,
                        logoPaddingRadius: 1,
                        logoPadding: 1,
                        logoWidth: logoSize,
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
              </div>
            </div>
          </div>
        </div>

        <div>
          <button
            onClick={() => {
              setShowLink(!showLink);
              if (!showLink) setShowQR(false);
            }}
            className={`w-full group flex items-center justify-between p-3 rounded-xl border transition-all duration-300 active:scale-[0.98] ${
              theme.deviceItemBg +
              " " +
              theme.border +
              (showLink ? "" : " hover:border-blue-500/30")
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-inner transition-colors ${showLink ? (theme.isDark ? "bg-white/10" : "bg-white/50") : theme.iconBg} ${theme.iconText}`}
              >
                <Monitor size={20} />
              </div>
              <div className="flex flex-col items-start translate-y-[-1px]">
                <h3
                  className={`text-sm font-bold text-start transition-colors ${showLink ? theme.iconText : theme.text}`}
                >
                  {t("connect_desktop")}
                </h3>
                <p
                  className={`text-[10px] font-medium text-start opacity-80 transition-colors ${showLink ? theme.iconText : theme.subText}`}
                >
                  {t("connect_desktop_hint")}
                </p>
              </div>
            </div>
            <div
              className={`transition-colors ${showLink ? theme.iconText : theme.text} opacity-30`}
            >
              <ChevronDown
                size={18}
                className={
                  showLink
                    ? "rotate-180 transition-transform"
                    : "transition-transform"
                }
              />
            </div>
          </button>

          <div
            className={`transition-all duration-500 overflow-hidden ${showLink ? "opacity-100 max-h-[1200px] py-4 mt-2.5" : "opacity-0 max-h-0 pointer-events-none"}`}
          >
            <div className="flex flex-col items-center gap-6">
              {serverInfo?.url ? (
                <>
                  <div className="w-full px-2">
                    <p
                      className={`text-[10px] uppercase tracking-wider mb-2 text-start ${theme.subText}`}
                    >
                      {t("step_1_network")}
                    </p>
                    <div className="space-y-2">{renderNetworkList()}</div>
                  </div>

                  <div className="w-full px-2">
                    <p
                      className={`text-[10px] uppercase tracking-wider mb-2 text-start ${theme.subText}`}
                    >
                      {t("step_2_open_browser")}
                    </p>
                    <div
                      className={`flex items-start min-w-0 p-1.5 rounded-lg border gap-2.5 w-full ${isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-gray-50 border-gray-200"}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <CopyButton
                          text={
                            securityEnabled && securityToken
                              ? `${serverInfo.url}?security=${securityToken}`
                              : serverInfo.url
                          }
                          className={`p-1 rounded-md transition-colors ${isDarkMode ? "hover:bg-white/5 text-slate-400" : "hover:bg-black/5 text-gray-500"}`}
                          iconSize={14}
                          isDarkMode={isDarkMode}
                        />
                      </div>
                      <code
                        className={`text-[11px] font-mono flex-1 break-all leading-normal pt-1 pr-2 text-start select-text cursor-text ${theme.text}`}
                      >
                        {securityEnabled && securityToken
                          ? `${serverInfo.url}?security=${securityToken}`
                          : serverInfo.url}
                      </code>
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className={`${containerWidthClass} flex items-center justify-center gap-2 py-4 animate-pulse`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-current opacity-30"></div>
                  <p className={`text-xs font-medium ${theme.subText}`}>
                    {t("waiting_network")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-8 mb-20">
        <button
          onClick={() => {
            if (hasActiveConnections) {
              setIsRestartConfirmOpen(true);
            } else {
              handleRestartServer();
            }
          }}
          disabled={isCheckingNetwork}
          className={`group flex items-center gap-3 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${theme.ghostHover} ${isCheckingNetwork ? "opacity-50 cursor-default" : ""}`}
        >
          <div
            className={`p-1 transition-transform duration-500 ${isCheckingNetwork ? "animate-spin" : "group-hover:rotate-180"}`}
          >
            <RefreshCw size={16} />
          </div>
          {isCheckingNetwork ? t("restarting") : t("restart_server")}
        </button>
      </div>

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
      {showHotspotQR && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowHotspotQR(null)}
          />
          <div
            className={`relative backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-[260px] p-5 text-center animate-in zoom-in-95 duration-200 ${
              isDarkMode ? "bg-[#1e293b]/95 text-slate-100" : "bg-white/95"
            }`}
          >
            <div className="mb-4">
              <h3 className="text-base font-bold mb-1 truncate px-2">
                {showHotspotQR.ssid}
              </h3>
              <p className={`text-[10px] opacity-60 ${theme.subText}`}>
                {t("scan_to_connect_wifi")}
              </p>
            </div>

            <div className="bg-white p-3.5 rounded-2xl inline-block mb-5 shadow-sm">
              <QRCode
                value={`WIFI:S:${showHotspotQR.ssid};T:WPA;P:${showHotspotQR.password};;`}
                size={160}
                qrStyle="dots"
                eyeRadius={50}
                fgColor="#1b2636"
                bgColor="#ffffff"
                logoImage={`data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxYjI2MzYiIHN0cm9rZS13aWR0aD0iMi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjIiLz48cGF0aCBkPSJNMTYuMiA3LjhhNiA2IDAgMCAxIDAgOC40bTMuNS0xMS45YTExIDExIDAgMCAxIDAgMTUuNG0tMTUuNCAwYTExIDExIDAgMCAxIDAtMTUuNG0zLjUgMTEuOWE2IDYgMCAwIDEgMC04LjQiLz48L3N2Zz4=`}
                logoWidth={32}
                logoPadding={1.5}
                logoPaddingStyle="circle"
                ecLevel="H"
              />
            </div>

            <button
              onClick={() => setShowHotspotQR(null)}
              className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97] ${
                isDarkMode
                  ? "bg-slate-700/80 hover:bg-slate-700 text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-900"
              }`}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </React.Fragment>
  );
};
