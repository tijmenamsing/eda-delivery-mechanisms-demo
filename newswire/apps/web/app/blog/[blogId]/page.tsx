import type { ReactNode } from "react";
import { fetchBlogDetail } from "@/lib/api";
import { LiveBlog } from "@/components/LiveBlog";
import { notFound } from "next/navigation";

interface BlogPageProps {
  params: Promise<{ blogId: string }>;
}

export default async function BlogPage({
  params,
}: BlogPageProps): Promise<ReactNode> {
  const { blogId } = await params;

  let blog;
  let updates;
  try {
    const data = await fetchBlogDetail(blogId);
    blog = data.blog;
    updates = data.updates;
  } catch {
    notFound();
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1rem" }}>
      <nav style={{ marginBottom: "1.5rem" }}>
        <a href="/" style={{ fontSize: "0.875rem", color: "#a1a1aa" }}>
          ← Terug naar overzicht
        </a>
      </nav>

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          {blog.title}
        </h1>
        <div style={{ display: "flex", gap: "1rem", color: "#a1a1aa", fontSize: "0.875rem" }}>
          <span>⚽ {blog.matchHomeTeam} vs {blog.matchAwayTeam}</span>
          <span>📅 {blog.matchDate}</span>
          <span
            style={{
              color: blog.status === "active" ? "#4ade80" : "#f87171",
              fontWeight: 600,
            }}
          >
            {blog.status === "active" ? "🔴 LIVE" : "⏹ Afgelopen"}
          </span>
        </div>
      </header>

      <LiveBlog blogId={blogId} initialUpdates={updates} />
    </main>
  );
}
