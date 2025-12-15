import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

export interface Transaction {
  id: number;
  clientId?: string;
  type: "file" | "text";
  senderId: string; // 'server' or client ID
  transactionPercent: number;
  downloadLink?: string;
  uploadLink?: string;
  savedInLocation?: string;
  filename?: string;
  fileSize?: number;
  textContent?: string;
  timestamp: string;
  bytesTransferred?: number;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  
  // Client-specific tracking
  clientProgress?: Record<string, number>; // clientId -> progress %
  clientStatus?: Record<string, "pending" | "in_progress" | "completed" | "failed">;
  clientBytes?: Record<string, number>; // clientId -> bytes transferred
}

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  isDarkMode: boolean;
  sendText: (
    text: string,
    senderId: string
  ) => Promise<void>;
  refreshTransactions: () => Promise<void>;
}

export const useTransactions = (
  _pollingInterval: number = 2000, // Kept for backwards compatibility but not used
  baseURL?: string,
  isSample = false
): UseTransactionsResult => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(true); // Default Dark
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      loading: false,
      error: null,
      isDarkMode: true,
      sendText: async () => {
        /* no-op */
      },
      refreshTransactions: async () => {
        /* no-op */
      },
    };
  }

  const fetchTransactions = useCallback(async () => {
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

  // Fetch initial theme
  useEffect(() => {
    const fetchTheme = async () => {
      try {
        const url = baseURL ? `${baseURL}/api/theme` : "/api/theme";
        const response = await axios.get(url);
        if (response.data && typeof response.data.isDarkMode === 'boolean') {
          setIsDarkMode(response.data.isDarkMode);
        }
      } catch (err) {
        // console.error("[useTransactions] Failed to fetch theme:", err);
      }
    };
    fetchTheme();
  }, [baseURL]);

  // Update theme-color meta tag and body background for mobile browsers
  useEffect(() => {
    const color = isDarkMode ? "#0f172a" : "#F2F2F7";
    
    // Update meta tag
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", color);
    }

    // Update body and html background (crucial for iOS Safari bottom bar matching)
    document.body.style.backgroundColor = color;
    document.documentElement.style.backgroundColor = color;
  }, [isDarkMode]);

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

  // WebSocket connection
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

      console.log("[useTransactions] Connecting to WebSocket:", wsURL);

      const ws = new WebSocket(wsURL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[useTransactions] WebSocket connected");
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          // console.log("[useTransactions] WebSocket message:", message);

          switch (message.type) {
            case "transactions_init":
              // Initial data
              setTransactions(message.data.transactions || []);
              setLoading(false);
              break;

            case "theme_update":
              // Global theme update
              setIsDarkMode(!!message.data.isDarkMode);
              break;

            case "transaction_update":
              // Update or add single transaction
              setTransactions((prevTransactions) => {
                const updatedTxn = message.data as Transaction;
                // console.log(`[useTransactions] Update: txn ${updatedTxn.id} - ${updatedTxn.filename} ${updatedTxn.transactionPercent.toFixed(0)}% (${updatedTxn.status})`);
                
                const existingIndex = prevTransactions.findIndex(
                  (t) => t.id === updatedTxn.id
                );

                if (existingIndex >= 0) {
                  // Update existing transaction
                  const newTransactions = [...prevTransactions];
                  newTransactions[existingIndex] = updatedTxn;
                  return newTransactions;
                } else {
                  // Add new transaction
                  return [...prevTransactions, updatedTxn];
                }
              });
              break;

            default:
                // console.log("[useTransactions] Unknown message type:", message.type);
          }
        } catch (err) {
          console.error("[useTransactions] Error processing WebSocket message:", err);
        }

      };

      ws.onerror = (error) => {
        console.error("[useTransactions] WebSocket error:", error);
        setError("WebSocket connection error");
      };

      ws.onclose = () => {
        console.log("[useTransactions] WebSocket closed, reconnecting in 3s...");
        wsRef.current = null;

        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };
    };

    // Initial fetch for fallback
    fetchTransactions();

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
  }, [baseURL, fetchTransactions]);

  return {
    transactions,
    loading,
    error,
    isDarkMode,
    sendText,
    refreshTransactions: fetchTransactions,
  };
};
