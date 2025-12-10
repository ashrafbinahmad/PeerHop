import { useState, useEffect } from 'react';
import QRCode from "react-qr-code";
import { SelectFiles, StartTransfer, GetServerInfo } from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import { WindowMinimise, WindowToggleMaximise } from "../../wailsjs/runtime/runtime";
import logo from "../assets/images/logo-universal.png";

export const DesktopView = () => {
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [serverInfo, setServerInfo] = useState<main.ServerInfo | null>(null);

  // Get server info on mount to always show QR code
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

  const handleMinimize = () => {
    WindowMinimise();
  };

  const handleMaximizeToggle = () => {
    WindowToggleMaximise();
  };

  const handleSelectFiles = async () => {
    try {
      const files = await SelectFiles();
      if (files && files.length > 0) {
        setFilePaths(files);
        // Update server with selected files
        const info = await StartTransfer(files);
        setServerInfo(info);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-900 text-slate-50 flex items-center justify-center font-sans selection:bg-indigo-500/30">

      {/* Main Glassmorphism Card */}
      <div className="relative z-10 w-screen h-screen bg-white/5 border border-white/10 backdrop-blur-2xl  shadow-2xl grid grid-cols-1 md:grid-cols-2 overflow-hidden animate-slideUp">

        {/* Draggable Top Bar */}
        <div className="absolute top-0 left-0 right-0 h-20 z-20 flex items-center justify-between px-8" style={{ '--wails-draggable': 'drag' } as React.CSSProperties}>
          {/* Logo / Header */}
          <div className="flex items-center gap-3">
            <img src={logo} alt="Transend Logo" className="w-8 h-8 rounded-lg shadow-lg" />
            <h1 className="text-2xl font-bold tracking-tight text-white">Transend</h1>
          </div>

          {/* Compact Window Controls */}
          <div className="flex items-center gap-1" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
            {/* Maximize/Restore Button */}
            <button
              onClick={handleMaximizeToggle}
              className="w-7 h-7 rounded bg-white/5 hover:bg-green-500/20 border border-white/10 hover:border-green-500/30 flex items-center justify-center transition-all group"
              title="Maximize/Restore"
            >
              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-green-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>

            {/* Minimize Button */}
            <button
              onClick={handleMinimize}
              className="w-7 h-7 rounded bg-white/5 hover:bg-yellow-500/20 border border-white/10 hover:border-yellow-500/30 flex items-center justify-center transition-all group"
              title="Minimize"
            >
              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-yellow-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
          </div>
        </div>

        {/* LEFT SIDE: File Upload / Selection */}
        <div className="p-10 flex flex-col justify-center items-center border-b md:border-b-0 md:border-r border-white/10 relative">

          <div className="w-full max-w-md flex flex-col items-center">
            {/* If files selected, show list, otherwise show 'Drop Zone' style button */}
            {filePaths.length > 0 ? (
              <div className="w-full animate-popIn">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">Ready to Send</h2>
                    <span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-full">{filePaths.length} Files</span>
                  </div>
                  <ul className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-2">
                    {filePaths.map((f, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm text-slate-300 bg-slate-900/30 p-3 rounded-lg border border-white/5">
                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <span className="truncate">{f.split(/[\\/]/).pop()}</span> {/* Show filename only */}
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={handleSelectFiles}
                  className="w-full py-3 px-6 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-sm font-medium transition-all text-slate-300 hover:text-white"
                >
                  Change Selection
                </button>
              </div>
            ) : (
              // Empty State / Selection Trigger
              <div
                onClick={handleSelectFiles}
                className="group w-full aspect-square max-h-[400px] border-2 border-dashed border-slate-600 hover:border-indigo-400 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-indigo-500/5 hover:scale-[1.02]"
              >
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-indigo-500 transition-all duration-300 shadow-xl shadow-black/20 group-hover:shadow-indigo-500/30">
                  <svg className="w-8 h-8 text-slate-300 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-slate-200 mb-2">Select Files</h3>
                <p className="text-slate-400 text-center max-w-[200px]">Click to browse your computer for files to share</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: QR Code / Receiver Info */}
        <div className="relative bg-black/20 flex flex-col items-center justify-center p-10">

          {serverInfo ? (
            <div className="flex flex-col items-center w-full animate-popIn">
              <div className="relative group">
                {/* QR Container with animated border */}
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-3xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                <div className="relative bg-white p-6 rounded-2xl">
                  <div className="relative w-[200px] h-[200px] overflow-hidden">
                    <QRCode
                      value={serverInfo.url}
                      style={{ height: "100%", width: "100%", maxWidth: "100%" }}
                      viewBox={`0 0 256 256`}
                    />
                    {/* Laser Scanner Effect */}
                    <div className="scanner-line"></div>
                  </div>
                </div>
              </div>

              <div className="mt-8 text-center space-y-2">
                <div className="inline-block px-4 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-mono mb-2">
                  {serverInfo.url}
                </div>
                {filePaths.length > 0 && serverInfo.filename ? (
                  <>
                    <h3 className="text-xl font-medium text-white">📤 Ready to Send</h3>
                    <p className="text-slate-400 text-sm max-w-[250px]">
                      Scan to download: <span className="text-white font-medium">{serverInfo.filename}</span>
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-medium text-white">📥 Ready to Receive</h3>
                    <p className="text-slate-400 text-sm max-w-[250px]">
                      Scan to upload files or receive from this device
                    </p>
                  </>
                )}
                <p className="text-slate-500 text-xs mt-2">
                  Ensure devices are on the same Wi-Fi network.
                </p>
              </div>
            </div>
          ) : (
            // Placeholder when no server is running
            <div className="flex flex-col items-center text-center opacity-40">
              <div className="w-48 h-48 border-2 border-dashed border-slate-600 rounded-2xl flex items-center justify-center mb-6">
                <svg className="w-12 h-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <p className="text-lg font-medium text-slate-300">Starting server...</p>
              <p className="text-sm text-slate-500">Please wait</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};