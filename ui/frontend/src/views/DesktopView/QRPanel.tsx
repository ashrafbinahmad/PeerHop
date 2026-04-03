import { Check, RefreshCw, Upload } from "lucide-react";
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
  multiClientEnabled: boolean;
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
  multiClientEnabled,
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
      {/* Header */}
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

      <div className="w-full max-w-[340px] mx-auto">
        {/* Connection Area - No background/border as requested */}
        <div className="relative space-y-10">
          {/* Network Section */}
          <div className="flex flex-col items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-widest opacity-30 ${theme.text}`}
            >
              {t("step_1_network")}
            </span>

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

          {/* App Icon / Connectivity Status logic */}
          {!multiClientEnabled && clients.length > 0 ? (
            <div className="flex flex-col items-center gap-6 py-4">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center relative transition-all duration-500 shadow-inner"
                style={{
                  backgroundColor: activeClientDownload
                    ? "#22c55e10"
                    : theme.accentColor + "10",
                }}
              >
                {activeClientDownload ? (
                  <div className="flex flex-col items-center animate-in zoom-in duration-300">
                    <span
                      className="text-3xl font-black tracking-tighter"
                      style={{ color: "#22c55e" }}
                    >
                      {(
                        activeClientDownload.clientProgress?.[clients[0]?.ip] ||
                        0
                      ).toFixed(0)}
                      <span className="text-xs ml-0.5">%</span>
                    </span>
                  </div>
                ) : (
                  <div className="relative">
                    <Check
                      size={44}
                      style={{ color: theme.accentColor }}
                      strokeWidth={2.5}
                      className="animate-in zoom-in duration-500"
                    />
                    <div
                      className="absolute -inset-1 rounded-full border-2 border-dashed animate-spin-slow opacity-20"
                      style={{ borderColor: theme.accentColor }}
                    ></div>
                  </div>
                )}

                {/* Circular progress background if downloading */}
                {activeClientDownload && (
                  <svg className="absolute inset-0 w-full h-full -rotate-90 scale-110">
                    <circle
                      cx="48"
                      cy="48"
                      r="46"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-gray-200/5"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="46"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="3"
                      strokeDasharray={2 * Math.PI * 46}
                      strokeDashoffset={
                        2 *
                        Math.PI *
                        46 *
                        (1 -
                          (activeClientDownload.clientProgress?.[
                            clients[0]?.ip
                          ] || 0) /
                            100)
                      }
                      strokeLinecap="round"
                      className="transition-all duration-500 ease-out"
                    />
                  </svg>
                )}
              </div>

              <div className="text-center space-y-1 pt-2">
                {activeClientDownload ? (
                  <>
                    <p className="text-lg font-bold tracking-tight text-emerald-500 animate-in fade-in duration-300">
                      {t("downloading")}
                    </p>
                    <p
                      className={`text-xs ${theme.subText} font-medium px-4 truncate max-w-[240px] opacity-70`}
                    >
                      {activeClientDownload.filename}
                    </p>
                  </>
                ) : (
                  <>
                    <p
                      className={`text-lg font-bold tracking-tight ${theme.text} animate-in fade-in duration-300`}
                    >
                      {t("connected")}
                    </p>
                    <p
                      className={`text-xs ${theme.subText} font-medium opacity-50`}
                    >
                      {clients[0].name || clients[0].platform} {t("device")}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* QR Section */
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
                  <p
                    className={`text-[9px] text-center font-bold uppercase tracking-[0.25em] opacity-20 ${theme.text}`}
                  >
                    {t("or_enter_url_manually")}
                  </p>
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
          )}
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

      {/* Connected Clients - Only show when multi-client is enabled */}
      {multiClientEnabled && clients.length > 0 && (
        <div
          className={`mt-10 w-full max-w-[400px] mx-auto px-4 animate-in slide-in-from-bottom-4 fade-in duration-700`}
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
    </>
  );
};
