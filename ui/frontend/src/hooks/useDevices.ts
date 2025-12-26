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
  isDesktop: boolean = false,
  token?: string // Optional security/admin token
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
      // Append desktop flag and token
      let wsURLWithParams = wsURL;
      const params = new URLSearchParams();

      if (isDesktop) {
        params.append("desktop", "true");
        if (token) params.append("admin", token);
      } else if (token) {
        params.append("security", token);
      }

      const queryString = params.toString();
      if (queryString) {
        wsURLWithParams += `?${queryString}`;
      }

      // CRITICAL: Add listener FIRST, then connect
      // Using static import to eliminate async delay
      WebSocketClient.addListener(handleMessage);
      WebSocketClient.connect(wsURLWithParams);
    }

    return () => {
      WebSocketClient.removeListener(handleMessage);
    };
  }, [baseURL, isDesktop, token]);

  return {
    clients,
    loading,
    error,
  };
};
