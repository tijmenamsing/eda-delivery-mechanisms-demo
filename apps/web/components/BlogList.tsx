"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { Blog } from "@bbtg-news/types/models";
import type { GetBlogsResponse } from "@bbtg-news/types/api";

const API_URL =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

// Poll at the same cadence as articles so the status badge updates
// automatically when the blog is closed during a session.
const POLL_INTERVAL_MS = 10_000;

export function BlogList(): ReactNode {
  const [blogs, setBlogs] = useState<Blog[]>([]);

  const fetchBlogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/blogs`);
      if (res.ok) {
        const data = (await res.json()) as GetBlogsResponse;
        setBlogs(data.blogs);
      }
    } catch {
      // Silently ignore — section simply won't render on first load;
      // subsequent failures preserve the last known state.
    }
  }, []);

  useEffect(() => {
    void fetchBlogs();
    const interval = setInterval(() => void fetchBlogs(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBlogs]);

  const activeBlogs = blogs.filter((b) => b.status === "active");

  if (activeBlogs.length === 0) return null;

  return (
    <div
      style={{
        marginBottom: "1.5rem",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.18)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderRadius: 20,
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
      }}
    >
      <h2 style={{ fontSize: "0.9rem", fontWeight: 900, marginBottom: "0.75rem", color: "#fff" }}>
        ⚡ Live blogs
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {activeBlogs.map((blog) => (
          <a
            key={blog.blogId}
            href={`/blog/${blog.blogId}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.5rem 0.75rem",
              background: "rgba(0, 0, 0, 0.12)",
              borderRadius: 12,
              textDecoration: "none",
              color: "#fff",
            }}
          >
            <span style={{ fontSize: "0.875rem" }}>
              📡 {blog.title}
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "#2ECC71",
              }}
            >
              🟢 LIVE
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
