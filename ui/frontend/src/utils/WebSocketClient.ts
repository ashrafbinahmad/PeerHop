type MessageHandler = (message: any) => void;

class WebSocketClient {
  private static instance: WebSocketClient;
  private ws: WebSocket | null = null;
  private url: string | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private initialMessagesBuffer: any[] = []; // Buffer messages until first listener is added

  private constructor() {}

  public static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  public connect(url: string) {
    if (!url) return;

    // If we are already connected or connecting to the same URL
    if (
      this.url === url &&
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      // Already connected - notify listeners in case they missed the initial message
      if (this.ws.readyState === WebSocket.OPEN && this.isConnected) {
        this.notifyListeners({
          type: "connection_status",
          status: "connected",
        });
      }
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
      // Note: Backend sends WebSocket-level ping frames every 30s
      // Browser automatically responds with pong frames (no JS needed)
      // This works reliably even on iOS Safari when timers are throttled
      this.notifyListeners({ type: "connection_status", status: "connected" });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        // If no listeners yet, buffer the message (likely initial server messages)
        if (this.listeners.size === 0) {
          console.log(
            "[WebSocketClient] Buffering message (no listeners yet):",
            message.type
          );
          this.initialMessagesBuffer.push(message);
        } else {
          this.notifyListeners(message);
        }
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

      // Connection closed - cleanup handled by scheduleReconnect

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

  private cleanup(clearUrl = true) {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
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
    const isFirstListener = this.listeners.size === 0;
    this.listeners.add(handler);

    // If this is the first listener and we have buffered messages, replay them
    if (isFirstListener && this.initialMessagesBuffer.length > 0) {
      console.log(
        `[WebSocketClient] Replaying ${this.initialMessagesBuffer.length} buffered messages to first listener`
      );
      this.initialMessagesBuffer.forEach((msg) => {
        this.notifyListeners(msg);
      });
      // Clear buffer after replay
      this.initialMessagesBuffer = [];
    }

    // Immediately notify the new listener of current connection status
    // This fixes race condition where listener is added after connection is established
    if (this.isConnected) {
      handler({ type: "connection_status", status: "connected" });
    }
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
