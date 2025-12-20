import { useState, useEffect, useRef } from "react";
import { Transaction } from "./useTransactions";

export const useTransferSpeed = (
  transactions: Transaction[],
  myClientId?: string
) => {
  const [speeds, setSpeeds] = useState<Record<number, string>>({});
  const prevBytesRef = useRef<Record<number, number>>({});
  const prevTimeRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const now = Date.now();
    const newSpeeds: Record<number, string> = {};

    transactions.forEach((txn) => {
      // Determine bytes
      let currentBytes = 0;

      // If myClientId is provided, try to use client-specific bytes
      if (
        myClientId &&
        txn.clientBytes &&
        txn.clientBytes[myClientId] !== undefined
      ) {
        currentBytes = txn.clientBytes[myClientId];
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

      // Only update speed if meaningful time has passed (e.g. 500ms) or bytes changed
      if (timeDiff >= 0.5) {
        if (bytesDiff >= 0) {
          const speed = bytesDiff / timeDiff; // B/s
          const mb = speed / (1024 * 1024);
          newSpeeds[txn.id] = `${mb.toFixed(1)} MB/s`;
        }
        // Update refs only when we consume the diff for speed calc
        prevBytesRef.current[txn.id] = currentBytes;
        prevTimeRef.current[txn.id] = now;
      } else {
        // Keep existing speed
      }
    });

    // Only update state if we have new speeds to report, to avoid render loop
    if (Object.keys(newSpeeds).length > 0) {
      setSpeeds((prev) => ({ ...prev, ...newSpeeds }));
    }
  }, [transactions, myClientId]);

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
