import { useState, useEffect, useCallback } from "react";
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
  status: "pending" | "in_progress" | "completed" | "failed";
}

interface UseTransactionsResult {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  sendText: (
    text: string,
    senderId: string
  ) => Promise<void>;
  refreshTransactions: () => Promise<void>;
}

export const useTransactions = (
  pollingInterval: number = 2000,
  baseURL?: string,
  isSample = false
): UseTransactionsResult => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      // console.log('[useTransactions] Fetched transactions:', txns.length);
      setTransactions(txns);
      setError(null);
    } catch (err) {
      console.error("[useTransactions] Failed to fetch transactions:", err);
      setError("Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  }, [baseURL]);

  const sendText = useCallback(
    async (text: string, senderId: string) => {
      try {
        const url = baseURL ? `${baseURL}/api/send-text` : "/api/send-text";
        await axios.post(url, {
          text,
          senderId,
        });
        // Immediately refresh transactions after sending text
        await fetchTransactions();
      } catch (err) {
        console.error("Failed to send text:", err);
        throw err;
      }
    },
    [baseURL, fetchTransactions]
  );

  // Initial fetch
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTransactions();
    }, pollingInterval);

    return () => clearInterval(interval);
  }, [pollingInterval, fetchTransactions]);

  return {
    transactions,
    loading,
    error,
    sendText,
    refreshTransactions: fetchTransactions,
  };
};
