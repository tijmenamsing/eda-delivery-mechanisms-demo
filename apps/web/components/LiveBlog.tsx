"use client";

import type { ReactNode } from "react";
import type { BlogUpdate } from "@newswire/types/models";
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
          background: "#1a1b23",
          borderRadius: "0.375rem",
          border: "1px solid #27272a",
          fontSize: "0.8rem",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isConnected ? "#4ade80" : "#f87171",
            display: "inline-block",
          }}
        />
        <span style={{ color: isConnected ? "#4ade80" : "#f87171" }}>
          {isConnected ? "Live verbonden via SSE" : "Verbinding verbroken — herverbinden..."}
        </span>
        {error && (
          <span style={{ color: "#f87171", marginLeft: "auto" }}>{error}</span>
        )}
      </div>

      {/* Updates feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {updates.length === 0 ? (
          <p style={{ color: "#71717a", textAlign: "center", padding: "2rem 0" }}>
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
