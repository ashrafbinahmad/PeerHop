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

export const calculateSpeed = (bytes: number, timestamp: string) => {
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
