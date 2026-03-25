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
      <header style={{ marginBottom: "2rem", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://bbtg.com/assets/bbtg-logo-550x190-f846a0b3.png"
          alt="BBTG"
          style={{ height: 50 }}
        />
        <p style={{ color: "#fff", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700, marginTop: "0.25rem" }}>
          Vibe News
        </p>
      </header>

      {/* Live blogs section */}
      {blogs.length > 0 && (
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
            {blogs.map((blog) => (
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
                    color: blog.status === "active" ? "#2ECC71" : "rgba(255,255,255,0.5)",
                  }}
                >
                  {blog.status === "active" ? "🟢 LIVE" : "Afgelopen"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <PollingArticleList initialArticles={articles} />

      <nav style={{ marginTop: "2rem", padding: "1rem 0" }}>
        <a href="/journalist" style={{ marginRight: "1.5rem", color: "#fff" }}>
          ✏️ Redactiepanel
        </a>
      </nav>
    </main>
  );
}
