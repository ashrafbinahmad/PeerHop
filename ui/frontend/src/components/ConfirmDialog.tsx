import React, { useState, useEffect, useRef } from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  confirmingText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  destructive?: boolean;
  isDarkMode?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  confirmingText = "Confirming...",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
  isDarkMode = false,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsConfirming(false);
      // Focus confirm button on open after a short delay to ensure modal is rendered
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      setIsConfirming(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={isConfirming ? undefined : onCancel}
      />

      {/* Dialog */}
      <div
        className={`relative backdrop-blur-xl rounded-xl shadow-2xl w-full max-w-[280px] overflow-hidden animate-in zoom-in-95 duration-200 ${
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
            disabled={isConfirming}
            className={`px-4 py-3 text-[17px] font-normal transition-colors bg-transparent outline-none focus:ring-2 focus:ring-inset ${
              isDarkMode
                ? "text-[#0A84FF] hover:bg-slate-700/50 active:bg-slate-700 focus:ring-white/20"
                : "text-[#007AFF] hover:bg-gray-50 active:bg-gray-100 focus:ring-black/10"
            } ${isConfirming ? "opacity-50 cursor-not-allowed " : ""}`}
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
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={isConfirming}
            className={`px-4 py-3 text-[17px] font-semibold transition-colors bg-transparent outline-none focus:ring-2 focus:ring-inset ${
              isDarkMode
                ? "hover:bg-slate-700/50 active:bg-slate-700 focus:ring-white/20"
                : "hover:bg-gray-50 active:bg-gray-100 focus:ring-black/10"
            } ${
              destructive
                ? isDarkMode
                  ? "text-red-500"
                  : "text-red-600"
                : isDarkMode
                  ? "text-[#0A84FF]"
                  : "text-[#007AFF]"
            } ${isConfirming ? "opacity-50 cursor-not-allowed " : ""}`}
          >
            {isConfirming ? confirmingText : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
