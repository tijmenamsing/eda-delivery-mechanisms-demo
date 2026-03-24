"use client";

import type { ReactNode } from "react";
import type { BlogUpdate } from "@bbtg-news/types/models";
import { useLiveBlog } from "@/hooks/useLiveBlog";
import { LiveBlogUpdate } from "./LiveBlogUpdate";

interface LiveBlogProps {
  blogId: string;
  initialUpdates: BlogUpdate[];
}

export function LiveBlog({ blogId, initialUpdates }: LiveBlogProps): ReactNode {
  const { updates, isConnected, error } = useLiveBlog({
    blogId,
    initialUpdates,
  });

  return (
    <div>
      {/* Connection status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          padding: "0.5rem 0.75rem",
          background: "#12121c",
          borderRadius: "0.375rem",
          border: "1px solid #1e1e2e",
          fontSize: "0.8rem",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isConnected ? "#2ECC71" : "#FF6B00",
            display: "inline-block",
          }}
        />
        <span style={{ color: isConnected ? "#2ECC71" : "#FF6B00" }}>
          {isConnected ? "Live verbonden via SSE" : "Verbinding verbroken — herverbinden..."}
        </span>
        {error && (
          <span style={{ color: "#FF6B00", marginLeft: "auto" }}>{error}</span>
        )}
      </div>

      {/* Updates feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {updates.length === 0 ? (
          <p style={{ color: "#5e5e72", textAlign: "center", padding: "2rem 0" }}>
            Nog geen updates...
          </p>
        ) : (
          [...updates]
            .reverse()
            .map((update) => (
              <LiveBlogUpdate key={update.updateId} update={update} />
            ))
        )}
      </div>
    </div>
  );
}
