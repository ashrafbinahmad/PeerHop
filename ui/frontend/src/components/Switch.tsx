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
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        checked ? "" : theme.iconBg
      } ${disabled ? "opacity-50 cursor-default" : ""} ${className}`}
      style={{
        backgroundColor: checked ? accentColor.color : undefined,
      }}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
};
