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
    ? "bg-white/20 hover:bg-white/30 text-white"
    : isDarkMode
      ? "bg-slate-700/50 hover:bg-slate-700 text-slate-300"
      : "bg-gray-100 hover:bg-gray-200 text-gray-600";

  return (
    <div className="flex gap-2 items-stretch">
      {!compact && (
        <div
          className={`text-[10px] ${
            isDarkMode ? "text-slate-500" : "text-gray-400"
          }`}
        >
          {new Date(transaction.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          <Check size={12} className="ml-1 inline" />
        </div>
      )}

      <button
        onClick={handleChooseApp}
        className={`px-2 text-xs rounded-md transition-colors ${buttonClass}`}
        title="Open with…"
      >
        Open with
      </button>

      <button
        onClick={handleShowInFolder}
        className={`p-1.5 rounded-md transition-colors ${buttonClass}`}
        title="Show in Folder"
      >
        <FolderOpen size={12} />
      </button>

      <button
        onClick={handleOpen}
        className={`px-2 text-xs rounded-md transition-colors ${buttonClass}`}
        title="Open"
      >
        <ExternalLink size={12} />
      </button>
    </div>
  );
};
