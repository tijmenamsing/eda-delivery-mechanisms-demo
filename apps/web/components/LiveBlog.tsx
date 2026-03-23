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
          background: "rgba(0, 0, 0, 0.18)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderRadius: 20,
          boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
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
          <p style={{ color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "2rem 0" }}>
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
