import React from "react";
import QRCode from "react-qr-code";
import { Check, RefreshCw, Upload } from "lucide-react";
import { CopyButton } from "../../components/CopyButton";
import { EditableDeviceName } from "./EditableDeviceName";
import type { Client } from "../../hooks/useDevices";

interface QRPanelProps {
  serverInfo: any;
  securityEnabled: boolean;
  securityToken: string;
  multiClientEnabled: boolean;
  clients: Client[];
  activeClientDownload: any;
  theme: any;
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
  if (!serverInfo) {
    return (
      <div className={`text-center ${theme.subText}`}>
        <div
          className={`w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center mx-auto mb-4 animate-spin-slow ${theme.border} ${theme.iconText}`}
        >
          <Upload size={24} />
        </div>
        <p>Starting server...</p>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex flex-col items-center pt-8">
        <h1 className={`flex flex-col items-center text-center ${theme.text}`}>
          <span className="text-sm font-semibold opacity-60 uppercase tracking-wider">
            Connect device to
          </span>
          <span className="text-xl font-bold tracking-tight mt-1 text-white uppercase">
            Start sharing files
          </span>
        </h1>
      </div>

      <div className="w-full max-w-[300px] mx-auto space-y-8">
        {/* Step 1: Network */}
        <div className="text-center space-y-2">
          <p
            className={`text-xs font-semibold uppercase tracking-wider ${theme.subText}`}
          >
            Step 1: Network
          </p>

          {serverInfo?.ssid ? (
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-sm font-medium border h-10 ${
                isDarkMode
                  ? "bg-slate-800/50 border-slate-700 text-green-400"
                  : "bg-white border-green-200 text-green-700"
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
                  ? "Checking Network..."
                  : "Having trouble to detect network name"}
              </p>
            </div>
          )}
        </div>

        {/* Step 2: QR Code or Connected Status */}
        <div className="text-center space-y-4">
          {!multiClientEnabled && clients.length > 0 ? (
            <>
              {/* Connected Status - shown when multi-client is disabled and device connected */}
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${theme.subText}`}
              >
                Status
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
                        Downloading...
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
                        Connected
                      </p>
                      <p
                        className={`text-sm ${theme.subText} animate-in fade-in duration-300`}
                      >
                        {clients[0].name || clients[0].platform} device
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
                Step 2: Scan QR
              </p>

              <div className="flex justify-center">
                <div
                  className={`p-3 rounded-2xl ${
                    isDarkMode
                      ? "bg-white shadow-lg"
                      : "bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-gray-100"
                  }`}
                  style={{
                    opacity: serverInfo?.url ? 1 : 0.7,
                    filter: serverInfo?.url ? "none" : "blur(8px)",
                    transition: "all 0.3s ease",
                  }}
                >
                  <div className="w-[180px] h-[180px]">
                    <QRCode
                      value={
                        serverInfo?.url
                          ? securityEnabled && securityToken
                            ? `${serverInfo.url}?security=${securityToken}`
                            : serverInfo.url
                          : ""
                      }
                      style={{ height: "100%", width: "100%" }}
                      viewBox={`0 0 256 256`}
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
                    Or enter URL manually
                  </p>
                </div>
              ) : (
                <p className={`text-xs ${theme.subText}`}>
                  Waiting for network connection...
                </p>
              )}
            </>
          )}
        </div>

        {/* Server Controls */}
        <div className="flex justify-center pt-4">
          <button
            onClick={handleRestartServer}
            disabled={isCheckingNetwork}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] ${
              isCheckingNetwork ? "opacity-50 cursor-not-allowed" : ""
            }`}
            style={{
              backgroundColor: theme.accentColor,
            }}
          >
            <RefreshCw
              size={18}
              className={isCheckingNetwork ? "animate-spin" : ""}
            />
            {isCheckingNetwork ? "Restarting..." : "Restart Server"}
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
            Connected Devices
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
