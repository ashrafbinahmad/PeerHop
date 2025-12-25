import { useState, useEffect, useRef } from "react";
import WebSocketClient from "../utils/WebSocketClient";

export interface Client {
  name: string;
  userAgent: string;
  ip: string;
  lastSeen: string;
  platform: "android" | "iOS" | "windows" | "linux" | "unknown";
  blocked: boolean;
  sendingBlocked: boolean;
}

interface UseDevicesResult {
  clients: Client[];
  loading: boolean;
  error: string | null;
}

export const useDevices = (
  baseURL?: string,
  isDesktop: boolean = false
): UseDevicesResult => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket usage via Singleton
  useEffect(() => {
    const handleMessage = (message: any) => {
      switch (message.type) {
        case "devices_init":
        case "devices_update":
          setClients(message.data.clients || []);
          setLoading(false);
          break;
        default:
          break;
      }
    };

    // Determine WebSocket URL for connection initiation
    let wsURL: string = "";
    if (baseURL) {
      wsURL = baseURL.replace(/^http/, "ws") + "/api/ws";
    } else {
      if (!window.location.host.includes("wails.localhost")) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        wsURL = `${protocol}//${window.location.host}/api/ws`;
      }
    }

    if (wsURL) {
      // Append desktop flag to skip client tracking for desktop app
      const wsURLWithFlag = isDesktop ? `${wsURL}?desktop=true` : wsURL;

      // CRITICAL: Add listener FIRST, then connect
      // Using static import to eliminate async delay
      WebSocketClient.addListener(handleMessage);
      WebSocketClient.connect(wsURLWithFlag);
    }

    return () => {
      WebSocketClient.removeListener(handleMessage);
    };
  }, [baseURL, isDesktop]);

  return {
    clients,
    loading,
    error,
  };
};
