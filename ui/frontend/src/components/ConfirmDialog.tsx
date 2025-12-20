import React from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  isDarkMode?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
  isDarkMode = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        className={`relative backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-[280px] overflow-hidden animate-in zoom-in-95 duration-200 ${
          isDarkMode ? "bg-[#1e293b]/95 text-slate-100" : "bg-white/95"
        }`}
      >
        {/* Content */}
        <div className="px-4 pt-5 pb-4 text-center">
          <h3
            className={`text-[17px] font-semibold mb-2 ${
              isDarkMode ? "text-slate-100" : "text-gray-900"
            }`}
          >
            {title}
          </h3>
          <p
            className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
              isDarkMode ? "text-slate-400" : "text-gray-600"
            }`}
          >
            {message}
          </p>
        </div>

        {/* Divider */}
        <div
          className={`h-px ${
            isDarkMode ? "bg-slate-700/60" : "bg-gray-200/60"
          }`}
        />

        {/* Actions */}
        <div className="grid grid-cols-2">
          {/* Cancel Button */}
          <button
            onClick={onCancel}
            className={`px-4 py-3 text-[17px] font-normal transition-colors bg-transparent ${
              isDarkMode
                ? "text-[#0A84FF] hover:bg-slate-700/50 active:bg-slate-700"
                : "text-[#007AFF] hover:bg-gray-50 active:bg-gray-100"
            }`}
          >
            {cancelText}
          </button>

          {/* Divider */}
          <div
            className={`absolute left-1/2 bottom-0 w-px h-[48px] ${
              isDarkMode ? "bg-slate-700/60" : "bg-gray-200/60"
            }`}
          />

          {/* Confirm Button */}
          <button
            onClick={onConfirm}
            className={`px-4 py-3 text-[17px] font-semibold transition-colors bg-transparent ${
              destructive
                ? isDarkMode
                  ? "text-red-500"
                  : "text-red-600"
                : isDarkMode
                ? "text-[#0A84FF]"
                : "text-[#007AFF]"
            } ${
              isDarkMode
                ? "hover:bg-slate-700/50 active:bg-slate-700"
                : "hover:bg-gray-50 active:bg-gray-100"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
