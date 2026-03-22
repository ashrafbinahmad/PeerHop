/**
 * useActivity – persists a lightweight activity log to localStorage.
 *
 * Activity entry shape:
 * {
 *   type: "sent" | "received" | "opened" | "closed"
 *   details: string       // e.g. "Sent report.pdf (12 MB)"
 *   timestamp: string     // ISO date string
 * }
 *
 * Only completed events are appended (no in-progress snapshots).
 * The log is capped at ACTIVITY_CAP entries (oldest pruned first).
 */

import { useCallback } from "react";

const STORAGE_KEY = "activity";
const ACTIVITY_CAP = 200; // maximum entries retained

export type ActivityType =
  | "sent" // file or text transfer completed (desktop → client)
  | "received" // file or text transfer completed (client → desktop)
  | "opened" // user opened a file
  | "closed" // app session ended
  | "started" // app launched
  | "shared" // file(s) selected / dropped / pasted to share
  | "cancelled" // transfer cancelled
  | "connected" // device connected
  | "disconnected" // device disconnected
  | "blocked" // device blocked or sending blocked
  | "restarted" // server restarted
  | "network_changed" // network/IP changed
  | "settings_changed" // any setting toggled
  | "feature_request_submitted"; // feature request submitted

export interface ActivityEntry {
  type: ActivityType;
  details: string;
  timestamp: string;
}

/** Read the current activity list from localStorage (safe – never throws). */
export function readActivity(): ActivityEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Append one entry; prune if over cap; then emit to adFrame iframe. */
export function appendActivity(entry: Omit<ActivityEntry, "timestamp">): void {
  try {
    const current = readActivity();
    const newEntry: ActivityEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };
    const next: ActivityEntry[] = [...current, newEntry];
    // Keep only the most recent ACTIVITY_CAP entries
    const pruned = next.slice(-ACTIVITY_CAP);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));

    // Emit to the ad iframe so it can react in real time
    const iframe = document.getElementById(
      "adFrame",
    ) as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "activity", data: newEntry },
        "*",
      );
    }
  } catch {
    // localStorage may be unavailable in some environments – silently ignore
  }
}

/**
 * Hook that exposes a stable `logActivity` function.
 * Can be also used as a standalone utility without the hook.
 */
export function useActivity() {
  const logActivity = useCallback((type: ActivityType, details: string) => {
    appendActivity({ type, details });
  }, []);

  return { logActivity, readActivity };
}
