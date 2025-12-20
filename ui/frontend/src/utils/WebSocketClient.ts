type MessageHandler = (message: any) => void;

class WebSocketClient {
  private static instance: WebSocketClient;
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  public connect(url: string) {
    if (!url) return;

    // If we are already connected or connecting to the same URL, do nothing
    if (
      this.url === url &&
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // If URL changed, or simply not connected, start fresh
    this.url = url;
    this.cleanup(false); // Don't clear URL, we just set it
    this.initWebSocket();
  }

  private initWebSocket() {
    if (!this.url) return;

    console.log("[WebSocketClient] Connecting to:", this.url);
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      console.error("[WebSocketClient] Connection failed synchronously:", e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log("[WebSocketClient] Connected");
      this.isConnected = true;
      this.startPing();
      this.notifyListeners({ type: "connection_status", status: "connected" });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.notifyListeners(message);
      } catch (e) {
        console.error("[WebSocketClient] Parse error", e);
      }
    };

    this.ws.onclose = () => {
      console.log("[WebSocketClient] Closed");
      this.isConnected = false;
      this.notifyListeners({
        type: "connection_status",
        status: "disconnected",
      });

      // Clear ping interval immediately
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }

      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("[WebSocketClient] Error", error);
      // onError usually precedes onClose, so we handle reconnect in onClose
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      console.log("[WebSocketClient] Attempting reconnect...");
      this.initWebSocket();
    }, 3000);
  }

  private startPing() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: "ping" }));
        } catch (e) {
          console.error("[WebSocketClient] Failed to send ping", e);
        }
      }
    }, 5000);
  }

  private cleanup(clearUrl = true) {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      // Unbind handlers to prevent zombie calls
      this.ws.onclose = null;
      this.ws.onopen = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      this.ws.close();
      this.ws = null;
    }
    if (clearUrl) this.url = null;
    this.isConnected = false;
  }

  public addListener(handler: MessageHandler) {
    this.listeners.add(handler);
  }

  public removeListener(handler: MessageHandler) {
    this.listeners.delete(handler);
  }

  private notifyListeners(message: any) {
    this.listeners.forEach((l) => l(message));
  }

  public getStatus() {
    return this.isConnected;
  }
}

export default WebSocketClient.getInstance();
