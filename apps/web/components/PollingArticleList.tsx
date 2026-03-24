"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { Article } from "@bbtg-news/types/models";
import type { GetArticlesResponse } from "@bbtg-news/types/api";
import { ArticleList } from "./ArticleList";

const POLL_INTERVAL_MS = 10_000;

interface PollingArticleListProps {
  initialArticles: Article[];
}

export function PollingArticleList({
  initialArticles,
}: PollingArticleListProps): ReactNode {
  const [articles, setArticles] = useState<Article[]>(initialArticles);
  // Initialize as null to avoid hydration mismatch — Date.now() differs between server and client
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nextPollIn, setNextPollIn] = useState(POLL_INTERVAL_MS / 1000);

  const poll = useCallback(async () => {
    try {
      const apiUrl =
        process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
      const res = await fetch(`${apiUrl}/articles`);
      if (res.ok) {
        const data = (await res.json()) as GetArticlesResponse;
        setArticles(data.articles);
        setLastUpdated(new Date());
        setNextPollIn(POLL_INTERVAL_MS / 1000);
      }
    } catch {
      // Poll will retry on next interval
    }
  }, []);

  // Set initial timestamp on mount (client-only)
  useEffect(() => {
    setLastUpdated(new Date());
  }, []);

  // Poll every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [poll]);

  // Countdown timer so the polling is visible during the demo
  useEffect(() => {
    const countdown = setInterval(() => {
      setNextPollIn((prev) => (prev <= 1 ? POLL_INTERVAL_MS / 1000 : prev - 1));
    }, 1000);

    return () => clearInterval(countdown);
  }, []);

  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          padding: "0.75rem 1rem",
          background: "#12121c",
          borderRadius: "0.5rem",
          border: "1px solid #1e1e2e",
        }}
      >
        <span style={{ fontSize: "0.8rem", color: "#9898ab" }}>
          🔄 Volgende poll over{" "}
          <span
            className="mono"
            style={{ color: "#FF6B00", fontWeight: 600 }}
          >
            {nextPollIn}s
          </span>
        </span>
        <span
          className="mono"
          style={{ fontSize: "0.75rem", color: "#64D5FF" }}
          suppressHydrationWarning
        >
          Laatste update: {formattedTime}
        </span>
      </div>

      <ArticleList articles={articles} />
    </>
  );
}
