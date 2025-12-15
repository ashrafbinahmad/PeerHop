import React from "react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
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
      <div className="relative bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-[280px] overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Content */}
        <div className="px-4 pt-5 pb-4 text-center">
          <h3 className="text-[17px] font-semibold text-gray-900 mb-2">
            {title}
          </h3>
          <p className="text-[13px] text-gray-600 leading-relaxed">
            {message}
          </p>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-200/60" />

        {/* Actions */}
        <div className="grid grid-cols-2">
          {/* Cancel Button */}
          <button
            onClick={onCancel}
            className="px-4 py-3 text-[17px] font-normal text-[#007AFF] bg-transparent hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            {cancelText}
          </button>

          {/* Divider */}
          <div className="absolute left-1/2 bottom-0 w-px h-[48px] bg-gray-200/60" />

          {/* Confirm Button */}
          <button
            onClick={onConfirm}
            className={`px-4 py-3 text-[17px] font-semibold bg-transparent hover:bg-gray-50 active:bg-gray-100 transition-colors ${destructive ? "text-red-600" : "text-[#007AFF]"
              }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
