import type { ReactNode } from "react";
import type { Article, Blog } from "@bbtg-news/types/models";
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
          BBTG Nieuws
        </h1>
        <p style={{ color: "#9898ab", fontSize: "0.875rem" }}>
          Digitaal nieuwsplatform — Demonstratie event-driven delivery
        </p>
      </header>

      {/* Live blogs section */}
      {blogs.length > 0 && (
        <div
          style={{
            marginBottom: "1.5rem",
            padding: "1rem",
            background: "#12121c",
            borderRadius: "0.5rem",
            border: "1px solid #1e1e2e",
          }}
        >
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.75rem", color: "#e8e8ef" }}>
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
                  background: "#0a0a12",
                  borderRadius: "0.375rem",
                  border: "1px solid #1e1e2e",
                  textDecoration: "none",
                  color: "#e8e8ef",
                }}
              >
                <span style={{ fontSize: "0.875rem" }}>
                  📡 {blog.title}
                </span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    color: blog.status === "active" ? "#2ECC71" : "#5e5e72",
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

      <nav style={{ marginTop: "2rem", padding: "1rem 0", borderTop: "1px solid #1e1e2e" }}>
        <a href="/journalist" style={{ marginRight: "1.5rem" }}>
          ✏️ Redactiepanel
        </a>
      </nav>
    </main>
  );
}
