import React from "react";
import { Monitor, Smartphone, HelpCircle } from "lucide-react";

interface Props {
  platform: string;
  size?: number;
  className?: string;
}

export const PlatformIcon: React.FC<Props> = ({ platform, size = 16, className = "" }) => {
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
    // Windows Logo
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 448 512"
        fill="currentColor"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M0 93.7l183.6-25.3v177.4H0V93.7zm0 189h183.6v190.1L0 418.3V282.7zm215.7-251.2l232.3-31.5v205.3H215.7V31.5zm0 302.2l232.3 46.8V175.4H215.7v158.3z" />
      </svg>
    );
  }

  if (p === "linux") {
    // Linux Penguin (Tux) - Simplified
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 448 512"
        fill="currentColor"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M429.6 156.4c-3.4-3.5-8.4-5.1-13.1-4.3l-84.9 14.1c-22-26.5-62.8-51.5-103.1-51.5-40.4 0-82.9 25.3-104.9 51.5L34.1 152.1c-4.7-.8-9.6.8-13.1 4.3C-1.8 181.3-6.1 271.7 10.9 337.8c10.2 39.8 45.3 71.7 86.8 77.2-2.3 8.2-3.8 17.5-3.8 27.5 0 44.5 31.7 82.2 74.5 89.2 14 2.3 28.2 3.6 42.6 3.6 13.9 0 27.7-1.2 41.3-3.4 43.1-6.8 75.3-44.4 75.3-89.4 0-9.6-1.5-18.7-3.7-26.5 41.5-6.5 76-37.4 86.1-77.2 16.9-66.3 12.8-156.9-10.4-182.4zM245.9 333c0 9.2-7.8 16.6-17.5 16.6-9.7 0-17.5-7.4-17.5-16.6 0-9.2 7.8-16.6 17.5-16.6 9.7 0 17.5 7.4 17.5 16.6zm-59.5 0c0 9.2-7.8 16.6-17.5 16.6-9.7 0-17.5-7.4-17.5-16.6 0-9.2 7.8-16.6 17.5-16.6 9.7 0 17.5 7.4 17.5 16.6zm81.4-96.1c-13.7 13.8-31 23-49.9 23-18.7 0-35.9-8.9-49.6-22.6-13.7 13.6-30.9 22.6-49.6 22.6-18.9 0-36.2-9.2-49.9-23-4-.7-7.9-1.9-11.7-3.4 9.1-39.2 24.3-94.4 69.3-95.3 19.3-.4 35.3 9.6 51 24.5 5.2 4.9 13.6 4.8 18.6-.2l.2-.2c15.8-15.1 31.9-25.1 51.2-24.8 45.4 1 60.1 56 69.3 95.3-4.1 1.7-8.1 2.9-12.1 3.7z" />
      </svg>
    );
  }

  // Default Fallbacks
  if (p.includes('mobile') || p.includes('phone')) return <Smartphone size={size} className={className} />;
  if (p.includes('monitor') || p.includes('desktop')) return <Monitor size={size} className={className} />;

  // Check for "Unknown" or generic
  return <HelpCircle size={size} className={className} />;
};
