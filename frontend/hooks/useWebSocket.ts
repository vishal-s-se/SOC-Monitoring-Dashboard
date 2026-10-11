"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export type ConnectionStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "ERROR";

interface WebSocketMessage {
  type: string;
  timestamp: string;
  data: any;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/api/v1/ws/";

export function useWebSocket() {
  const [status, setStatus] = useState<ConnectionStatus>("DISCONNECTED");
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const isComponentMounted = useRef(true);

  const connect = useCallback(() => {
    if (typeof window !== "undefined" && window.location.pathname.startsWith('/login')) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    setStatus("CONNECTING");

    try {
      let url = WS_URL;
      const testToken = process.env.NEXT_PUBLIC_E2E_TOKEN;
      if (testToken) {
        url += `?token=${testToken}`;
      }
      const ws = new WebSocket(url);

      ws.onopen = () => {
        if (!isComponentMounted.current) return;
        setStatus("CONNECTED");
        reconnectAttemptsRef.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = undefined;
        }
      };

      ws.onmessage = (event) => {
        if (!isComponentMounted.current) return;
        try {
          const data = JSON.parse(event.data) as WebSocketMessage;
          setLastMessage(data);
        } catch (err) {
          console.error("Failed to parse websocket message", err);
        }
      };

      ws.onclose = (event) => {
        if (!isComponentMounted.current) return;
        setStatus("DISCONNECTED");
        wsRef.current = null;

        // Code 1008 is WS_POLICY_VIOLATION (Authentication Failure). Do not retry endlessly.
        if (event.code === 1008) {
          console.warn("WebSocket closed due to authentication failure (1008). Reconnect halted.");
          setStatus("ERROR");
          return;
        }

        // Bounded exponential backoff up to 30s, max 8 reconnect attempts
        if (reconnectAttemptsRef.current < 8 && !reconnectTimeoutRef.current) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(30000, 2000 * Math.pow(1.5, reconnectAttemptsRef.current));
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = undefined;
            if (isComponentMounted.current) {
              connect();
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        if (!isComponentMounted.current) return;
        setStatus("ERROR");
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("WebSocket connection error:", error);
      setStatus("ERROR");
    }
  }, []);

  const disconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("DISCONNECTED");
  }, []);

  useEffect(() => {
    isComponentMounted.current = true;
    connect();

    return () => {
      isComponentMounted.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    lastMessage,
    connect,
    disconnect
  };
}
