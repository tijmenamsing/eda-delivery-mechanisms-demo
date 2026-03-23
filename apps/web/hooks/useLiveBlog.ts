"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { UpdatePostedEvent } from "@newswire/types/events";
import type { BlogUpdate } from "@newswire/types/models";
import { SSE_EVENTS } from "@newswire/types/constants";
import { getSSEUrl } from "@/lib/api";

interface UseLiveBlogOptions {
  blogId: string;
  initialUpdates: BlogUpdate[];
}

interface UseLiveBlogResult {
  updates: BlogUpdate[];
  isConnected: boolean;
  error: string | null;
}

export function useLiveBlog({
  blogId,
  initialUpdates,
}: UseLiveBlogOptions): UseLiveBlogResult {
  const [updates, setUpdates] = useState<BlogUpdate[]>(initialUpdates);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleUpdate = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string) as UpdatePostedEvent;
      const newUpdate: BlogUpdate = {
        updateId: data.updateId,
        blogId: data.blogId,
        content: data.content,
        author: data.author,
        minute: data.minute,
        type: data.updateType,
        postedAt: data.postedAt,
      };
      setUpdates((prev) => [...prev, newUpdate]);
    } catch {
      console.error("Failed to parse SSE update");
    }
  }, []);

  useEffect(() => {
    const url = getSSEUrl(blogId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener(SSE_EVENTS.CONNECTED, () => {
      setIsConnected(true);
      setError(null);
    });

    es.addEventListener(SSE_EVENTS.UPDATE, handleUpdate);

    es.addEventListener(SSE_EVENTS.ERROR, (event) => {
      const data = (event as MessageEvent).data as string;
      setError(data);
    });

    es.onerror = () => {
      setIsConnected(false);
      // EventSource auto-reconnects — no need to manually reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [blogId, handleUpdate]);

  return { updates, isConnected, error };
}
