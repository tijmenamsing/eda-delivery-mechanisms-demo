"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage } from "@bbtg-news/types/models";
import { WS_EVENTS } from "@bbtg-news/types/constants";
import { getWSUrl } from "@/lib/api";

interface UseChatOptions {
  blogId: string;
  enabled: boolean;
}

interface UseChatResult {
  messages: ChatMessage[];
  isConnected: boolean;
  error: string | null;
  sendMessage: (content: string, author: string) => void;
}

interface WsEnvelope {
  event: string;
  data: unknown;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export function useChat({ blogId, enabled }: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendMessage = useCallback((content: string, author: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ content, author }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Clean up if chat panel is closed
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      setIsConnected(false);
      setMessages([]);
      setError(null);
      return;
    }

    function connect(): void {
      const url = getWSUrl(blogId);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempt.current = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const envelope = JSON.parse(event.data as string) as WsEnvelope;

          if (envelope.event === WS_EVENTS.HISTORY) {
            const history = envelope.data as ChatMessage[];
            setMessages(history);
          } else if (envelope.event === WS_EVENTS.MESSAGE) {
            const msg = envelope.data as ChatMessage;
            setMessages((prev) => [...prev, msg]);
          } else if (envelope.event === WS_EVENTS.ERROR) {
            const errData = envelope.data as { message: string };
            setError(errData.message);
          }
        } catch {
          console.error("Failed to parse WebSocket message");
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        wsRef.current = null;

        // Don't reconnect if closed normally or component unmounted
        if (event.code === 1000 || event.code === 1001) return;

        // Exponential backoff reconnect
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
          RECONNECT_MAX_MS,
        );
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        setError("Verbindingsfout");
      };
    }

    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
      setIsConnected(false);
    };
  }, [blogId, enabled]);

  return { messages, isConnected, error, sendMessage };
}
