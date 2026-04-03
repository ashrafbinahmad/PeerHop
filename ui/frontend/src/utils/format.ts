import { Transaction } from "../hooks/useTransactions";

export const formatBytes = (bytes?: number, appendingUnits?: string[]) => {
  if (bytes === undefined || bytes === null || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB"];
  if (appendingUnits) {
    units.push(...appendingUnits);
  }
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(2)} ${units[i]}`;
};

export const calculateSpeedForClient = (bytes: number, timestamp: string) => {
  if (!bytes || !timestamp) return "0.0 MB/s";

  const startTime = new Date(timestamp).getTime();
  const currentTime = Date.now();
  const timeDiff = (currentTime - startTime) / 1000; // in seconds

  if (timeDiff <= 0) return "0.0 MB/s";

  const mb = bytes / (1024 * 1024);
  const speed = mb / timeDiff;

  // Clamp to 0 and avoid Infinity
  if (!isFinite(speed) || speed < 0) return "0.0 MB/s";

  return `${speed.toFixed(2)} MB/s`;
};

export const formatLiveSpeed = (speedBps: number): string => {
  if (!isFinite(speedBps) || speedBps <= 0) return "0.0 MB/s";
  const mbps = speedBps / (1024 * 1024);
  return `${mbps.toFixed(2)} MB/s`;
};

const previousStats: Record<
  number,
  { bytes: number; time: number; speed: number }
> = {};

export const calculateSpeed = (tx: Transaction): string => {
  if (!tx.bytesTransferred) return "0 B/s";

  const now = Date.now();
  const prev = previousStats[tx.id];

  // First time
  if (!prev) {
    previousStats[tx.id] = {
      bytes: tx.bytesTransferred,
      time: now,
      speed: 0,
    };
    return "0 B/s";
  }

  const timeDiffMs = now - prev.time;

  // ⛔ Only calculate every 500ms
  if (timeDiffMs < 500) {
    return formatSpeed(prev.speed);
  }

  const timeDiffSec = timeDiffMs / 1000;
  const byteDiff = tx.bytesTransferred - prev.bytes;

  const speed = timeDiffSec > 0 ? byteDiff / timeDiffSec : 0;

  // Update state
  previousStats[tx.id] = {
    bytes: tx.bytesTransferred,
    time: now,
    speed,
  };

  return formatSpeed(speed);
};

const formatSpeed = (bytesPerSec: number): string => {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024)
    return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
  if (bytesPerSec < 1024 * 1024 * 1024)
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;

  return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
};
