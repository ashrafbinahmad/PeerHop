import React from "react";
import { Monitor, Smartphone, HelpCircle } from "lucide-react";

interface Props {
  platform: string;
  size?: number;
  className?: string;
}

export const PlatformIcon: React.FC<Props> = ({
  platform,
  size = 16,
  className = "",
}) => {
  const p = platform.toLowerCase();

  if (p === "ios" || p === "macos" || p === "darwin") {
    // Apple Logo
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 384 512"
        fill="currentColor"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-53.7-88.7-54.6-37-.8-74.4 21.8-94.4 21.8-19.9 0-51.2-21.6-84.3-21.9-43.2-.4-83.3 25-105.8 63.5-45.9 78.6-11.8 194.5 32.7 260.6 21.8 32.2 47.9 68.3 82 66.8 33-1.4 45.4-21.4 85.3-21.4 39.7 0 51.1 21.4 86 20.6 35.5-.8 58-32.3 79.5-64.4 22-32.1 31-63.5 31.4-65.1-1.3-.8-60.8-23.4-61.7-120.5zM277.8 48.7C312 7.7 305.8 1 305.8 1c-34.1 0-77 22.7-93.1 53.6-14.2 26.9-10.6 77.2-10.6 77.2 38.3 3.6 76-29.2 75.7-83.1z" />
      </svg>
    );
  }

  if (p === "android") {
    // Android Logo
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 576 512"
        fill="currentColor"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M420.55 301.93a24 24 0 1 1 24-24 24 24 0 0 1-24 24m-265.1 0a24 24 0 1 1 24-24 24 24 0 0 1-24 24m273.7-144.48 47.94-83a10 10 0 1 0-17.27-10h-.04l-48.47 84C353.18 122.92 299.53 107 241.22 107s-112 15.92-169.11 41.45l-48.47-84h-.04a10 10 0 1 0-17.25 10l47.94 83C19.75 223.75 0 307.82 0 405h482.35c0-97.18-19.73-181.25-53.2-247.55" />
      </svg>
    );
  }

  if (p === "windows") {
    // Windows 11 Logo (Modern)
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M0 0h11.5v11.5H0V0zm12.5 0H24v11.5H12.5V0zM0 12.5h11.5V24H0V12.5zm12.5 0H24V24H12.5v-11.5z" />
      </svg>
    );
  }

  if (p === "linux") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer body */}
        <path
          d="M32 4C22 4 16 12 16 22c0 6 3 11 6 15-5 2-10 7-10 13 0 8 8 10 20 10s20-2 20-10c0-6-5-11-10-13 3-4 6-9 6-15C48 12 42 4 32 4Z"
          fill="currentColor"
        />

        {/* Belly */}
        <ellipse cx="32" cy="38" rx="12" ry="16" fill="white" />

        {/* Eyes */}
        <ellipse cx="26" cy="22" rx="4" ry="6" fill="white" />
        <ellipse cx="38" cy="22" rx="4" ry="6" fill="white" />

        {/* Pupils */}
        <ellipse cx="26" cy="24" rx="2" ry="3" fill="black" />
        <ellipse cx="38" cy="24" rx="2" ry="3" fill="black" />

        {/* Beak */}
        <path d="M28 30c2 2 6 2 8 0l-4 4-4-4Z" fill="#F4A300" />

        {/* Feet */}
        <ellipse cx="22" cy="54" rx="6" ry="3" fill="#F4A300" />
        <ellipse cx="42" cy="54" rx="6" ry="3" fill="#F4A300" />

        {/* Arms (subtle curves) */}
        <path
          d="M18 34c2 6 6 10 6 10"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M46 34c-2 6-6 10-6 10"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Default Fallbacks
  if (p.includes("mobile") || p.includes("phone"))
    return <Smartphone size={size} className={className} />;
  if (p.includes("monitor") || p.includes("desktop"))
    return <Monitor size={size} className={className} />;

  // Check for "Unknown" or generic
  return <HelpCircle size={size} className={className} />;
};
