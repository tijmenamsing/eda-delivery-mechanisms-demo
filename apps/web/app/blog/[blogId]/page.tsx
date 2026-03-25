import type { ReactNode } from "react";
import { fetchBlogDetail, fetchBlogs } from "@/lib/api";
import { LiveBlog } from "@/components/LiveBlog";
import { ChatPanel } from "@/components/ChatPanel";
import { notFound } from "next/navigation";

interface BlogPageProps {
  params: Promise<{ blogId: string }>;
}

export async function generateStaticParams(): Promise<{ blogId: string }[]> {
  try {
    const blogs = await fetchBlogs();
    return blogs.map((b) => ({ blogId: b.blogId }));
  } catch {
    return [];
  }
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
        <a href="/" style={{ fontSize: "0.875rem", color: "rgba(255,255,255,0.7)" }}>
          ← Terug naar overzicht
        </a>
      </nav>

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 900, marginBottom: "0.5rem", color: "#fff" }}>
          {blog.title}
        </h1>
        <div style={{ display: "flex", gap: "1rem", color: "rgba(255,255,255,0.7)", fontSize: "0.875rem", flexWrap: "wrap" }}>
          <span>📡 {blog.eventName}</span>
          <span>📅 {blog.eventDate}</span>
          <span>📍 {blog.eventLocation}</span>
          <span
            style={{
              color: blog.status === "active" ? "#2ECC71" : "#FF6B00",
              fontWeight: 600,
            }}
          >
            {blog.status === "active" ? "🟢 LIVE" : "⏹ Afgelopen"}
          </span>
        </div>
      </header>

      <ChatPanel blogId={blogId} />
      <LiveBlog blogId={blogId} initialUpdates={updates} />
    </main>
  );
}
