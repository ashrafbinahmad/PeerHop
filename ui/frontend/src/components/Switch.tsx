import React from "react";
import { AccentColor, Theme } from "../themeConstants";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  theme: Theme;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  accentColor: AccentColor;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  theme,
  disabled = false,
  className = "",
  ariaLabel,
  accentColor,
}) => {
  const handleClick = () => {
    if (disabled) return;
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={handleClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
        checked ? "" : theme.iconBg
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      style={{
        backgroundColor: checked ? accentColor.v1 : undefined,
      }}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
};
