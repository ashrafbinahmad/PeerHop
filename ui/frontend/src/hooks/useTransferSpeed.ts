import { useState, useEffect, useRef } from "react";
import { Transaction } from "./useTransactions";

export const useTransferSpeed = (
  transactions: Transaction[],
  myIp?: string
) => {
  const [speeds, setSpeeds] = useState<Record<number, string>>({});
  const prevBytesRef = useRef<Record<number, number>>({});
  const prevTimeRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const now = Date.now();
    const newSpeeds: Record<number, string> = {};

    transactions.forEach((txn) => {
      // Skip if transaction is not in progress
      if (txn.status !== "in_progress") {
        return;
      }

      // Determine bytes
      let currentBytes = 0;

      // If myIp is provided, try to use client-specific bytes
      if (myIp && txn.clientBytes && txn.clientBytes[myIp] !== undefined) {
        currentBytes = txn.clientBytes[myIp];
      } else {
        // Fallback to global bytes
        currentBytes = txn.bytesTransferred || 0;
      }

      // Init/Update tracking
      const prevBytes = prevBytesRef.current[txn.id];
      const prevTime = prevTimeRef.current[txn.id];

      // If we don't have previous tracking, just set init
      if (prevBytes === undefined || prevTime === undefined) {
        prevBytesRef.current[txn.id] = currentBytes;
        prevTimeRef.current[txn.id] = now;
        newSpeeds[txn.id] = "0.0 MB/s"; // Start with 0
        return;
      }

      const timeDiff = (now - prevTime) / 1000;
      const bytesDiff = currentBytes - prevBytes;

      // Only update speed if meaningful time has passed (e.g. 500ms)
      if (timeDiff >= 0.5) {
        // Only calculate speed if bytes actually increased
        if (bytesDiff > 0) {
          const speed = bytesDiff / timeDiff; // B/s
          const mb = speed / (1024 * 1024);
          // Clamp to reasonable values (0 to 10000 MB/s)
          const clampedMb = Math.max(0, Math.min(10000, mb));
          newSpeeds[txn.id] = `${clampedMb.toFixed(1)} MB/s`;
        } else if (bytesDiff === 0) {
          // No progress - show 0 speed but keep tracking
          newSpeeds[txn.id] = "0.0 MB/s";
        }
        // If bytesDiff is negative (shouldn't happen but handle it), keep previous speed

        // Update refs only when we consume the diff for speed calc
        prevBytesRef.current[txn.id] = currentBytes;
        prevTimeRef.current[txn.id] = now;
      } else {
        // Not enough time has passed - keep the existing speed from state
        // This prevents speed from disappearing between updates
        if (speeds[txn.id]) {
          newSpeeds[txn.id] = speeds[txn.id];
        }
      }
    });

    // Only update state if we have new speeds to report, to avoid render loop
    if (Object.keys(newSpeeds).length > 0) {
      setSpeeds((prev) => ({ ...prev, ...newSpeeds }));
    }
  }, [transactions, myIp, speeds]);

  return speeds;
};

export const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
};
