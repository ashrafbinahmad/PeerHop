import { useState, useEffect, useRef } from "react";

export interface Client {
  id: string;
  userAgent: string;
  ip: string;
  lastSeen: string;
  platform: "android" | "ios" | "windows" | "linux" | "unknown";
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connectWebSocket = () => {
      // Determine WebSocket URL
      let wsURL: string;
      if (baseURL) {
        // Convert http://host:port to ws://host:port
        wsURL = baseURL.replace(/^http/, "ws") + "/api/ws";
      } else {
        // Use current location
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        wsURL = `${protocol}//${window.location.host}/api/ws`;
      }

      console.log("[useDevices] Connecting to WebSocket:", wsURL);

      const ws = new WebSocket(wsURL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[useDevices] WebSocket connected");
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("[useDevices] WebSocket message:", message);

          switch (message.type) {
            case "devices_init":
              // Initial data
              setClients(message.data.clients || []);
              setLoading(false);
              break;

            case "devices_update":
              // Update devices list
              setClients(message.data.clients || []);
              break;

            default:
              // Ignore other message types (they're for transactions)
              break;
          }
        } catch (err) {
          console.error("[useDevices] Error processing WebSocket message:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("[useDevices] WebSocket error:", error);
        setError("WebSocket connection error");
      };

      ws.onclose = () => {
        console.log("[useDevices] WebSocket closed, reconnecting in 3s...");
        wsRef.current = null;

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };
    };

    // Connect WebSocket
    connectWebSocket();

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [baseURL]);

  return {
    clients,
    loading,
    error,
  };
};
