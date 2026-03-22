import { useEffect, useRef } from "react";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import { GetSharedFiles } from "../../wailsjs/go/main/App";

export const useShareTarget = (onShareReceived: (data: any) => void) => {
  const lastShareKey = useRef<string | null>(null);

  const shouldProcessShare = (data: any) => {
    if (!data) return false;
    const fileKey = Array.isArray(data.files) ? data.files.join("|") : "";
    const key = `files:${fileKey};text:${data.text || ""};url:${data.url || ""}`;
    if (key === lastShareKey.current) {
      return false;
    }
    lastShareKey.current = key;
    return true;
  };

  useEffect(() => {
    // 1. Listen for runtime events from Go
    const unsubscribe = EventsOn("share:received", (data) => {
      console.log("Share data received via event:", data);
      if (shouldProcessShare(data)) {
        onShareReceived(data);
      } else {
        console.log("Duplicate share event ignored");
      }
    });

    // 2. Check for data on mount (in case app was already launched via share)
    GetSharedFiles().then((data) => {
      if (data && (data.files?.length > 0 || data.text || data.url)) {
        console.log("Share data received on mount:", data);
        if (shouldProcessShare(data)) {
          onShareReceived(data);
        } else {
          console.log("Duplicate share mount data ignored");
        }
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [onShareReceived]);
};
