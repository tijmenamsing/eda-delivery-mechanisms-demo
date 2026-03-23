import type { ReactNode } from "react";
import type { Article, Blog } from "@newswire/types/models";
import { fetchArticles, fetchBlogs } from "@/lib/api";
import { PollingArticleList } from "@/components/PollingArticleList";

export const revalidate = 60;

export default async function HomePage(): Promise<ReactNode> {
  let articles: Article[];
  try {
    articles = await fetchArticles();
  } catch {
    articles = [];
  }

  let blogs: Blog[];
  try {
    blogs = await fetchBlogs();
  } catch {
    blogs = [];
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          📰 NewsWire
        </h1>
        <p style={{ color: "#a1a1aa", fontSize: "0.875rem" }}>
          Digitaal nieuwsplatform — Demonstratie polling delivery
        </p>
      </header>

      {/* Live blogs section */}
      {blogs.length > 0 && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1rem",
            background: "#1a1b23",
            borderRadius: "0.5rem",
            border: "1px solid #27272a",
          }}
        >
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem", color: "#e4e4e7" }}>
            ⚡ Live blogs
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {blogs.map((blog) => (
              <a
                key={blog.blogId}
                href={`/blog/${blog.blogId}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.5rem 0.75rem",
                  background: "#0f1115",
                  borderRadius: "0.375rem",
                  border: "1px solid #27272a",
                  textDecoration: "none",
                  color: "#e4e4e7",
                }}
              >
                <span style={{ fontSize: "0.875rem" }}>
                  ⚽ {blog.title}
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: blog.status === "active" ? "#4ade80" : "#71717a",
                  }}
                >
                  {blog.status === "active" ? "🔴 LIVE" : "Afgelopen"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <PollingArticleList initialArticles={articles} />

      <nav style={{ marginTop: "2rem", padding: "1rem 0", borderTop: "1px solid #27272a" }}>
        <a href="/journalist" style={{ marginRight: "1.5rem" }}>
          ✏️ Journalist Panel
        </a>
      </nav>
    </main>
  );
}
