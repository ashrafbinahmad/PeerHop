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
  | "sending_completed" // file or text transfer completed (desktop → client), more specific than "sent"
  | "receiving_completed" // file or text transfer completed (client → desktop), more specific than "received"
  | "opened" // user opened a file
  | "closed" // app session ended
  | "started" // app launched
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

/** Append one entry; prune if over cap; check if feedback popup should show. */
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

    // Check if we should show the referral feedback popup
    checkAndShowFeedbackPopup();
  } catch {
    // localStorage may be unavailable in some environments – silently ignore
  }
}

/** Count activities with type "sent" or "received" in the current log. */
export function countShareAndReceiveActivities(): number {
  try {
    const activities = readActivity();
    return activities.filter((a) => a.type === "sent" || a.type === "received")
      .length;
  } catch {
    return 0;
  }
}

/** Check if user has already submitted a review. */
export function hasUserReviewed(): boolean {
  try {
    return localStorage.getItem("hasReviewed") === "true";
  } catch {
    return false;
  }
}

/** Save that user has reviewed. */
export function markAsReviewed(): void {
  try {
    localStorage.setItem("hasReviewed", "true");
  } catch {
    // silently ignore
  }
}

/** Check if feedback popup should display and emit event. */
export function checkAndShowFeedbackPopup(): void {
  try {
    if (hasUserReviewed()) return; // Already reviewed, don't show again

    const count = countShareAndReceiveActivities();
    const thresholds = [5, 10, 30, 40, 50]; // Show at these counts

    if (thresholds.includes(count)) {
      // Emit custom event that components can listen to
      window.dispatchEvent(
        new CustomEvent("showReferralFeedback", {
          detail: { thresholdReached: count },
        }),
      );
    }
  } catch {
    // silently ignore
  }
}

/**
 * Hook that exposes a stable `logActivity` function.
 * Can be also used as a standalone utility without the hook.
 */
export function useActivity(iframeRef: React.RefObject<HTMLIFrameElement>) {
  const logActivity = useCallback(
    (type: ActivityType, details: string) => {
      appendActivity({ type, details });
      if (!iframeRef.current?.contentWindow) return;
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "activity",
          data: {
            type,
            details: details,
            timestamp: new Date().toISOString(),
          },
        },
        "*",
      );
    },
    [iframeRef],
  );

  return { logActivity, readActivity };
}
