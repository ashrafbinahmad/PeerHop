import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  text: string;
  className?: string;
  iconSize?: number;
  title?: string;
  isDarkMode?: boolean;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  className = "",
  iconSize = 14,
  title = "Copy",
  isDarkMode = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Fallback copy mechanism
    const fallbackCopy = (text: string) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand("copy");
      } catch (err) {
        console.error("Fallback copy failed", err);
      }
      document.body.removeChild(textArea);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        })
        .catch(() => {
          fallbackCopy(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        });
    } else {
      fallbackCopy(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`${className} relative flex items-center justify-center transition-colors`}
      title={copied ? "Copied!" : title}
    >
      <div className="relative" style={{ width: iconSize, height: iconSize }}>
        <div
          className={`absolute inset-0 transition-all duration-200 flex items-center justify-center ${
            copied
              ? "opacity-0 scale-50 rotate-90"
              : "opacity-100 scale-100 rotate-0"
          }`}
        >
          <Copy size={iconSize} />
        </div>
        <div
          className={`absolute inset-0 transition-all duration-200 flex items-center justify-center ${
            copied
              ? "opacity-100 scale-100 rotate-0"
              : "opacity-0 scale-50 -rotate-90"
          }`}
        >
          <Check size={iconSize} />
        </div>
      </div>
    </button>
  );
};
