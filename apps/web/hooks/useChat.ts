import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage } from "@bbtg-news/types/models";
import { WS_EVENTS, WS_CLOSE_CODES } from "@bbtg-news/types/constants";
import { getWSUrl, fetchChatMessages } from "@/lib/api";

interface UseChatOptions {
  blogId: string;
  enabled: boolean;
  initialClosed?: boolean;
}

interface UseChatResult {
  messages: ChatMessage[];
  isConnected: boolean;
  isBlogClosed: boolean;
  error: string | null;
  sendMessage: (content: string, author: string) => void;
}

interface WsEnvelope {
  event: string;
  data: unknown;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export function useChat({ blogId, enabled, initialClosed = false }: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isBlogClosed, setIsBlogClosed] = useState(initialClosed);
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
      // Preserve isBlogClosed — it's derived from the blog status, not the connection
      return;
    }

    // Blog is already closed: skip WebSocket, fetch read-only history via REST
    if (initialClosed || isBlogClosed) {
      setIsBlogClosed(true);
      fetchChatMessages(blogId).then(setMessages).catch(() => {});
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
          } else if (envelope.event === WS_EVENTS.CLOSED) {
            // Server is about to close the WS — mark blog as closed immediately
            // so the UI updates before the connection teardown completes.
            setIsBlogClosed(true);
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

        if (event.code === WS_CLOSE_CODES.BLOG_CLOSED) {
          setIsBlogClosed(true);
          setError(null);
          // Fetch REST history in case WS closed before the history event arrived
          // (e.g. blog was already closed when user opened chat).
          setMessages((prev) => {
            if (prev.length === 0) {
              fetchChatMessages(blogId).then(setMessages).catch(() => {});
            }
            return prev;
          });
          return;
        }

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
  }, [blogId, enabled, initialClosed, isBlogClosed]);

  return { messages, isConnected, isBlogClosed, error, sendMessage };
}
