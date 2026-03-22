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
        <h1 className={`flex flex-col items-center text-center ${theme.text}`}>
          <span className="text-sm font-semibold opacity-60 uppercase tracking-wider">
            {t("connect_device")}
          </span>
          <span
            className={`text-xl font-bold tracking-tight mt-1  uppercase ${theme.text}`}
          >
            {t("start_sharing")}
          </span>
        </h1>
      </div>

      <div className="w-full max-w-[300px] mx-auto space-y-4">
        {/* Step 1: Network */}
        <div className="text-center space-y-2">
          <p
            className={`text-xs font-semibold uppercase tracking-wider ${theme.subText}`}
          >
            {t("step_1_network")}
          </p>

          {serverInfo?.ssid ? (
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm font-medium _border h-10 ${
                isDarkMode
                  ? "bg-slate-800/50 _border-slate-700 text-green-400"
                  : "bg-white _border-green-200 text-green-700"
              }`}
            >
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              {serverInfo.ssid}
            </div>
          ) : (
            <div
              className={`px-4 py-3 rounded-lg border border-dashed h-10 ${theme.border}`}
            >
              <p className={`text-sm ${theme.text} mb-1`}>
                {isCheckingNetwork
                  ? t("checking_network")
                  : t("trouble_detecting_network")}
              </p>
            </div>
          )}
        </div>

        {/* Step 2: QR Code or Connected Status */}
        <div className="text-center space-y-2">
          {!multiClientEnabled && clients.length > 0 ? (
            <>
              {/* Connected Status - shown when multi-client is disabled and device connected */}
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${theme.subText}`}
              >
                {t("status")}
              </p>
              <div className="flex flex-col items-center gap-6 py-8">
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center relative transition-all duration-500"
                  style={{
                    backgroundColor: activeClientDownload
                      ? "#22c55e10"
                      : theme.accentColor + "20",
                  }}
                >
                  {activeClientDownload ? (
                    <div className="flex flex-col items-center animate-in zoom-in duration-300">
                      <span
                        className="text-4xl font-black tracking-tighter"
                        style={{ color: "#22c55e" }}
                      >
                        {(
                          activeClientDownload.clientProgress?.[
                            clients[0]?.ip
                          ] || 0
                        ).toFixed(0)}
                        <span className="text-sm ml-0.5">%</span>
                      </span>
                    </div>
                  ) : (
                    <Check
                      size={48}
                      style={{ color: theme.accentColor }}
                      strokeWidth={2.5}
                      className="animate-in zoom-in duration-300"
                    />
                  )}

                  {/* Circular progress background if downloading */}
                  {activeClientDownload && (
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle
                        cx="48"
                        cy="48"
                        r="46"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="text-gray-200/10"
                      />
                      <circle
                        cx="48"
                        cy="48"
                        r="46"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="4"
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
                        className="transition-all duration-300"
                      />
                    </svg>
                  )}
                </div>
                <div className="space-y-1">
                  {activeClientDownload ? (
                    <>
                      <p
                        className={`text-lg font-bold animate-in fade-in duration-300`}
                        style={{ color: "#22c55e" }}
                      >
                        {t("downloading")}
                      </p>
                      <p
                        className={`text-sm ${theme.subText} truncate max-w-[250px] animate-in fade-in duration-300`}
                      >
                        {activeClientDownload.filename}
                      </p>
                    </>
                  ) : (
                    <>
                      <p
                        className={`text-lg font-bold ${theme.text} animate-in fade-in duration-300`}
                      >
                        {t("connected")}
                      </p>
                      <p
                        className={`text-sm ${theme.subText} animate-in fade-in duration-300`}
                      >
                        {clients[0].name || clients[0].platform} {t("device")}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* QR Code - shown when multi-client is enabled OR no device connected */}
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${theme.subText}`}
              >
                {t("step_2_scan_qr")}
              </p>

              <div className="flex justify-center ">
                <div
                  className={`p-3 rounded-2xl `}
                  style={{
                    opacity: serverInfo?.url ? 1 : 0.7,
                    filter: serverInfo?.url ? "none" : "blur(8px)",
                    transition: "all 0.3s ease",
                  }}
                >
                  <div className="">
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
                        fgColor: isDarkMode ? "#fff" : "#000",
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
              </div>

              {/* URL Fallback */}
              {serverInfo?.url ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-dashed text-[11px] font-mono transition-colors ${
                      isDarkMode
                        ? "bg-slate-800/30 border-slate-700/50 text-slate-400"
                        : "bg-gray-50 border-gray-200 text-gray-500"
                    }`}
                  >
                    <span className="truncate max-w-[180px]">
                      {securityEnabled && securityToken
                        ? `${serverInfo.url}?security=${securityToken.slice(0, 4)}...${securityToken.slice(-4)}`
                        : serverInfo.url}
                    </span>
                    <CopyButton
                      text={
                        securityEnabled && securityToken
                          ? `${serverInfo.url}?security=${securityToken}`
                          : serverInfo.url
                      }
                      className={`p-1 hover:text-white transition-colors rounded-md ${
                        isDarkMode ? "hover:bg-slate-700" : "hover:bg-gray-200"
                      }`}
                      iconSize={12}
                      isDarkMode={isDarkMode}
                    />
                  </div>
                  <p
                    className={`text-[10px] uppercase tracking-widest font-bold opacity-30`}
                  >
                    {t("or_enter_url_manually")}
                  </p>
                </div>
              ) : (
                <p className={`text-xs ${theme.subText}`}>
                  {t("waiting_network")}
                </p>
              )}
            </>
          )}
        </div>

        {/* Server Controls */}
        <div className="flex justify-center pt-4 !mt-12">
          <button
            onClick={handleRestartServer}
            disabled={isCheckingNetwork}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all   hover:scale-[1.02] active:scale-[0.98] ${theme.ghostHover} ${
              isCheckingNetwork ? "opacity-50 cursor-not-allowed" : ""
            }`}
            style={
              {
                // backgroundColor: theme.,
              }
            }
          >
            <RefreshCw
              size={18}
              className={isCheckingNetwork ? "animate-spin" : ""}
            />
            {isCheckingNetwork ? t("restarting") : t("restart_server")}
          </button>
        </div>
      </div>

      {/* Connected Clients - Only show when multi-client is enabled */}
      {multiClientEnabled && clients.length > 0 && (
        <div
          className={`mt-10 w-full px-4 animate-in slide-in-from-bottom-2 fade-in duration-500`}
        >
          <h3
            className={`text-xs font-semibold uppercase tracking-wider mb-3 text-center ${theme.subText}`}
          >
            {t("connected_devices")}
          </h3>
          <div className="flex flex-col gap-2">
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
