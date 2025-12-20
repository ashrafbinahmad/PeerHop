import { useState, useEffect, useRef } from "react";

export interface Client {
  id: string;
  name: string;
  userAgent: string;
  ip: string;
  lastSeen: string;
  platform: "android" | "iOS" | "windows" | "linux" | "unknown";
  blocked: boolean;
  sendingBlocked: boolean; // Add sendingBlocked field
}

interface UseDevicesResult {
  clients: Client[];
  loading: boolean;
  error: string | null;
}

export const useDevices = (baseURL?: string): UseDevicesResult => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket usage via Singleton
  useEffect(() => {
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
      import("../utils/WebSocketClient").then((mod) => {
        mod.default.connect(wsURL);
      });
    }

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

    import("../utils/WebSocketClient").then((mod) => {
      mod.default.addListener(handleMessage);
    });

    return () => {
      import("../utils/WebSocketClient").then((mod) => {
        mod.default.removeListener(handleMessage);
      });
    };
  }, [baseURL]);

  return {
    clients,
    loading,
    error,
  };
};
