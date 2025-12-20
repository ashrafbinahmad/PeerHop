import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { THEME_PRESETS } from "../themeConstants";

export interface Transaction {
  id: number;
  clientId?: string;
  type: "file" | "text";
  senderId: string; // 'server' or client ID
  transactionPercent: number;
  downloadLink?: string;
  uploadLink?: string;
  savedInLocation?: string;
  serverFilePath?: string; // absolute path on server for files sent from desktop
  filename?: string;
  fileSize?: number;
  textContent?: string;
  timestamp: string;
  bytesTransferred?: number;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";

  // Client-specific tracking
  clientProgress?: Record<string, number>; // clientId -> progress %
  clientStatus?: Record<
    string,
    "pending" | "in_progress" | "completed" | "failed"
  >;
  clientBytes?: Record<string, number>; // clientId -> bytes transferred
}

interface Client {
  id: string;
  name: string;
  userAgent: string;
  ip: string;
  lastSeen: string;
  platform: string;
  blocked: boolean;
  sendingBlocked: boolean; // Add sendingBlocked field
}

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  isDarkMode: boolean;
  activeThemeId: string;
  activeAccentId: string;
  isConnected: boolean;
  deviceName: string;
  textTransferEnabled: boolean;
  clients: Client[];
  sendText: (text: string, senderId: string) => Promise<void>;
  refreshTransactions: () => Promise<void>;
}

export const useTransactions = (
  _pollingInterval: number = 2000, // Kept for backwards compatibility but not used
  baseURL?: string,
  isSample = false
): UseTransactionsResult => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true); // Default Dark
  const [activeThemeId, setActiveThemeId] = useState("night");
  const [activeAccentId, setActiveAccentId] = useState("blue");
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("PeerHop"); // Default to "PeerHop"
  const [textTransferEnabled, setTextTransferEnabled] = useState(false); // Default to false

  if (isSample) {
    return {
      transactions: [
        {
          id: 1,
          type: "file",
          senderId: "server",
          transactionPercent: 30,
          downloadLink: "http://example.com/download/file1",
          savedInLocation: "/downloads/file1",
          filename: "file1.txt",
          fileSize: 2048,
          timestamp: new Date().toISOString(),
          bytesTransferred: 1800,
          status: "in_progress",
        },
        {
          id: 2,
          type: "text",
          senderId: "client_1",
          transactionPercent: 100,
          textContent: "Hello, World!",
          timestamp: new Date().toISOString(),
          status: "completed",
        },
      ],
      clients: [],
      loading: false,
      error: null,
      isDarkMode: true,
      activeThemeId: "night",
      activeAccentId: "blue",
      isConnected: true,
      deviceName: "PeerHop",
      textTransferEnabled: false,
      sendText: async () => {
        /* no-op */
      },
      refreshTransactions: async () => {
        /* no-op */
      },
    };
  }
  // ... (rest of file) ...
  // Update the return at the end and the message handling logic
  const fetchTransactions = useCallback(async () => {
    if (!baseURL && window.location.host.includes("wails.localhost")) {
      return;
    }
    try {
      const url = baseURL ? `${baseURL}/api/transactions` : "/api/transactions";
      const response = await axios.get(url);
      const txns = response.data.transactions || [];
      setTransactions(txns);
      setError(null);
    } catch (err) {
      console.error("[useTransactions] Failed to fetch transactions:", err);
      setError("Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  }, [baseURL]);

  // Need to fetch devices initially via HTTP too just in case WS takes time?
  // Actually unified_handler doesn't seem to expose devices via public API easily maybe?
  // Wait, /api/clients is available.
  const fetchClients = useCallback(async () => {
    if (!baseURL && window.location.host.includes("wails.localhost")) {
      return;
    }
    try {
      const url = baseURL ? `${baseURL}/api/clients` : "/api/clients";
      const response = await axios.get(url);
      const clis = response.data.clients || [];
      setClients(clis);
    } catch (err) {
      // console.error("[useTransactions] Failed to fetch clients:", err);
    }
  }, [baseURL]);

  useEffect(() => {
    fetchTransactions();
    fetchClients();
  }, [fetchTransactions, fetchClients]);

  // Rest of useEffects...
  // I need to patch the WebSocket message handler loop without replacing the whole file if possible.
  // Actually I'll use replace_file_content carefully.

  // ... this is getting complicated to patch via chunks because of the large function body.
  // I'll assume I can just update the `return` and `case "devices_update"`

  // Wait, I can't easily insert `fetchClients` call inside `useEffect` without replacing the whole useEffect.
  // I'll skip the HTTP fetch for clients for now (WS is primary source).

  // Let's just update the return statement and the state var declaration.
  // And the WS handler.

  useEffect(() => {
    const fetchTheme = async () => {
      if (!baseURL && window.location.host.includes("wails.localhost")) {
        return;
      }
      try {
        const url = baseURL ? `${baseURL}/api/theme` : "/api/theme";
        const response = await axios.get(url);
        if (response.data) {
          if (typeof response.data.isDarkMode === "boolean") {
            setIsDarkMode(response.data.isDarkMode);
          }
          if (response.data.themeId) {
            setActiveThemeId(response.data.themeId);
          }
          if (response.data.accentId) {
            setActiveAccentId(response.data.accentId);
          }
        }
      } catch (err) {
        // console.error("[useTransactions] Failed to fetch theme:", err);
      }
    };
    fetchTheme();
  }, [baseURL]);

  // Update theme-color meta tag and body background for mobile browsers
  useEffect(() => {
    // specific color based on theme preset
    const activeTheme =
      THEME_PRESETS.find((t) => t.id === activeThemeId) ||
      THEME_PRESETS.find((t) => t.id === "night") ||
      THEME_PRESETS[3];

    const color = activeTheme.metaColor || (isDarkMode ? "#0f172a" : "#F2F2F7");

    // Update meta tag
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", color);
    }

    // Update body and html background (crucial for iOS Safari bottom bar matching)
    document.body.style.backgroundColor = color;
    document.documentElement.style.backgroundColor = color;
  }, [isDarkMode, activeThemeId]);

  const sendText = useCallback(
    async (text: string, senderId: string) => {
      try {
        const url = baseURL ? `${baseURL}/api/send-text` : "/api/send-text";
        await axios.post(url, {
          text,
          senderId,
        });
        // No need to manually refresh - WebSocket will push update
      } catch (err) {
        console.error("Failed to send text:", err);
        throw err;
      }
    },
    [baseURL]
  );

  // WebSocket connection via Singleton
  useEffect(() => {
    // Determine WebSocket URL
    let wsURL: string = "";
    if (baseURL) {
      // Convert http://host:port to ws://host:port
      wsURL = baseURL.replace(/^http/, "ws") + "/api/ws";
    } else {
      // Skip connection if in Wails but no baseURL yet
      if (window.location.host.includes("wails.localhost")) {
        return;
      }
      // Use current location
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsURL = `${protocol}//${window.location.host}/api/ws`;
    }

    if (wsURL) {
      import("../utils/WebSocketClient").then((mod) => {
        mod.default.connect(wsURL);
      });
    }
  }, [baseURL]);

  // WebSocket Message Listener
  useEffect(() => {
    const handleMessage = (message: any) => {
      // Handle connection status messages from the Client
      if (message.type === "connection_status") {
        setIsConnected(message.status === "connected");
        return;
      }

      // Any other message means we are receiving data (implies connected)
      setIsConnected(true);

      switch (message.type) {
        case "pong":
          break;

        case "transactions_init":
          setTransactions(message.data.transactions || []);
          setLoading(false);
          break;

        case "theme_init":
        case "theme_update":
          if (message.data.isDarkMode !== undefined) {
            setIsDarkMode(!!message.data.isDarkMode);
          }
          if (message.data.themeId) {
            setActiveThemeId(message.data.themeId);
          }
          if (message.data.accentId) {
            setActiveAccentId(message.data.accentId);
          }
          break;

        case "devices_init":
        case "devices_update":
          if (message.data.clients && Array.isArray(message.data.clients)) {
            const clients = message.data.clients as Client[];
            setClients(clients);

            if (clients.length > 0) {
              const desktopClient = clients.find(
                (c) =>
                  c.platform === "windows" ||
                  c.platform === "linux" ||
                  c.platform === "iOS"
              );
              if (desktopClient && desktopClient.name) {
                setDeviceName(desktopClient.name);
              }
            }
          }
          break;

        case "desktop_name_init":
        case "desktop_name_update":
          if (message.data && message.data.name) {
            setDeviceName(message.data.name);
          }
          break;

        case "settings_init":
        case "settings_update":
          if (
            message.data &&
            typeof message.data.textTransferEnabled === "boolean"
          ) {
            setTextTransferEnabled(message.data.textTransferEnabled);
          }
          break;

        case "transaction_update":
          setTransactions((prevTransactions) => {
            const updatedTxn = message.data as Transaction;
            const existingIndex = prevTransactions.findIndex(
              (t) => t.id === updatedTxn.id
            );

            if (existingIndex >= 0) {
              const newTransactions = [...prevTransactions];
              newTransactions[existingIndex] = updatedTxn;
              return newTransactions;
            } else {
              return [...prevTransactions, updatedTxn];
            }
          });
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
  }, []);

  return {
    transactions,
    loading,
    error,
    isDarkMode,
    activeThemeId,
    activeAccentId,
    isConnected,
    deviceName,
    textTransferEnabled,
    clients,
    sendText,
    refreshTransactions: fetchTransactions,
  };
};
