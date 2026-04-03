import React from "react";
import {
  ShowInFolder,
  ShowOpenWithDialog,
  OpenSourceFile,
} from "../../../wailsjs/go/main/App";
import { Check, FolderOpen, ExternalLink } from "lucide-react";

export const TransactionActions = ({
  transaction,
  isDarkMode,
  compact = false,
  filePath,
  isOnBlueBubble = false,
  onOpen,
}: {
  transaction: any;
  isDarkMode: boolean;
  compact?: boolean;
  filePath?: string;
  isOnBlueBubble?: boolean;
  onOpen?: (filename: string) => void;
}) => {
  // Use provided filePath or fall back to transaction absolute paths
  const resolvedPath =
    filePath ||
    transaction.serverFilePath ||
    transaction.savedInLocation ||
    transaction.filename ||
    "";

  const handleShowInFolder = async () => {
    console.log("Show in Folder: resolvedPath =", resolvedPath);
    try {
      await ShowInFolder(resolvedPath);
    } catch (err) {
      console.error(err);
    }
  };

  const handleChooseApp = async () => {
    try {
      await ShowOpenWithDialog(resolvedPath);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpen = async () => {
    try {
      await OpenSourceFile(resolvedPath);
      onOpen?.(transaction.filename || resolvedPath);
    } catch (err) {
      console.error(err);
    }
  };

  const buttonClass = isOnBlueBubble
    ? "bg-white/20 hover:bg-white/30 text-white border border-white/10"
    : isDarkMode
      ? "bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm"
      : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm";

  return (
    <div className="flex gap-1 items-center">
      {!compact && (
        <div
          className={`text-[9px] flex items-center ${
            isDarkMode ? "text-slate-500" : "text-gray-400"
          }`}
        >
          {new Date(transaction.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          <Check size={10} className="ml-0.5 inline" />
        </div>
      )}

      <button
        onClick={handleChooseApp}
        className={`truncate px-2 py-1 text-[10px] font-semibold rounded-md transition-all active:scale-95 ${buttonClass}`}
        title="Open with…"
      >
        Open with
      </button>

      <button
        onClick={handleShowInFolder}
        className={`p-1.5 rounded-md transition-all active:scale-95 ${buttonClass}`}
        title="Show in Folder"
      >
        <FolderOpen size={12} />
      </button>

      <button
        onClick={handleOpen}
        className={`p-1.5 rounded-md transition-all active:scale-95 ${buttonClass}`}
        title="Open"
      >
        <ExternalLink size={12} />
      </button>
    </div>
  );
};
