"use client";

import { useState, useEffect } from "react";
import type { ReactNode, FormEvent } from "react";
import type { Blog } from "@bbtg-news/types/models";
import type { BlogUpdate } from "@bbtg-news/types/models";
import { postUpdate, fetchBlogs, closeBlog } from "@/lib/api";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  background: "rgba(0, 0, 0, 0.2)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  color: "#fff",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "rgba(255,255,255,0.7)",
  marginBottom: "0.375rem",
};

const updateTypes: { value: BlogUpdate["type"]; label: string }[] = [
  { value: "commentary", label: "💬 Commentaar" },
  { value: "keynote", label: "🎤 Keynote" },
  { value: "session", label: "📚 Sessie" },
  { value: "break", label: "☕ Pauze" },
  { value: "milestone", label: "🏁 Mijlpaal" },
  { value: "social", label: "🥂 Sociaal" },
];

export function PostUpdateForm(): ReactNode {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [blogId, setBlogId] = useState("");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [minute, setMinute] = useState("");
  const [type, setType] = useState<BlogUpdate["type"]>("commentary");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [blogClosed, setBlogClosed] = useState(false);
  const [closingBlog, setClosingBlog] = useState(false);

  useEffect(() => {
    fetchBlogs()
      .then((b) => {
        setBlogs(b);
        if (b.length > 0 && b[0]) {
          setBlogId(b[0].blogId);
          if (b[0].status === "closed") {
            setBlogClosed(true);
          }
        }
      })
      .catch(() => setMessage("Kon blogs niet laden"));
  }, []);

  // Update closed state when blog selection changes
  useEffect(() => {
    const selected = blogs.find((b) => b.blogId === blogId);
    setBlogClosed(selected?.status === "closed");
  }, [blogId, blogs]);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!blogId || blogClosed) return;
    setStatus("loading");
    setMessage("");

    try {
      await postUpdate({
        blogId,
        content,
        author,
        minute: minute ? parseInt(minute, 10) : null,
        type,
      });
      setStatus("success");
      setMessage("Update gepost! Direct zichtbaar op het live blog via SSE.");
      setContent("");
      setMinute("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Onbekende fout");
    }
  };

  const handleCloseBlog = async (): Promise<void> => {
    if (!blogId || blogClosed) return;
    if (!confirm("Weet je zeker dat je dit blog wilt sluiten? Alle chat-verbindingen worden verbroken.")) return;

    setClosingBlog(true);
    try {
      await closeBlog(blogId);
      setBlogClosed(true);
      setBlogs((prev) =>
        prev.map((b) => (b.blogId === blogId ? { ...b, status: "closed" as const } : b)),
      );
      setMessage("Blog gesloten. Alle WebSocket-verbindingen worden verbroken via EventBridge → Redis pub/sub.");
      setStatus("success");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Kon blog niet sluiten");
      setStatus("error");
    } finally {
      setClosingBlog(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "1.5rem",
        background: "rgba(0, 0, 0, 0.18)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderRadius: 20,
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
      }}
    >
      <h3 style={{ fontSize: "1.1rem", fontWeight: 900, marginBottom: "1.25rem", color: "#fff" }}>
        Live update posten
      </h3>

      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Blog</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <select
            value={blogId}
            onChange={(e) => setBlogId(e.target.value)}
            required
            style={{ ...inputStyle, flex: 1 }}
          >
            {blogs.length === 0 && <option value="">Laden...</option>}
            {blogs.map((blog) => (
              <option key={blog.blogId} value={blog.blogId}>
                {blog.title} {blog.status === "closed" ? "🔒" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCloseBlog}
            disabled={blogClosed || closingBlog || !blogId}
            style={{
              padding: "0.625rem 1rem",
              background: blogClosed ? "rgba(255,255,255,0.1)" : "rgba(231, 76, 60, 0.8)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              cursor: blogClosed || closingBlog ? "not-allowed" : "pointer",
              fontSize: "0.8rem",
              fontWeight: 700,
              fontFamily: "inherit",
              opacity: blogClosed ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {blogClosed ? "🔒 Gesloten" : closingBlog ? "Sluiten..." : "🔒 Blog sluiten"}
          </button>
        </div>
      </div>

      {blogClosed && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            borderRadius: 10,
            background: "rgba(231, 76, 60, 0.15)",
            border: "1px solid rgba(231, 76, 60, 0.3)",
            color: "#e74c3c",
            fontSize: "0.85rem",
          }}
        >
          Dit blog is gesloten. Er kunnen geen nieuwe updates meer gepost worden.
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BlogUpdate["type"])}
            style={inputStyle}
            disabled={blogClosed}
          >
            {updateTypes.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ width: 100 }}>
          <label style={labelStyle}>Tijdstip</label>
          <input
            type="number"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            placeholder="—"
            min={0}
            max={120}
            style={inputStyle}
            disabled={blogClosed}
          />
        </div>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Inhoud</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="De keynote over cloud soevereiniteit is begonnen..."
          required
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
          disabled={blogClosed}
        />
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label style={labelStyle}>Auteur</label>
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="BBTG Redactie"
          required
          style={inputStyle}
          disabled={blogClosed}
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading" || blogClosed}
        style={{
          padding: "0.625rem 1.5rem",
          background: blogClosed ? "rgba(255,255,255,0.1)" : "#FF6B00",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          cursor: status === "loading" || blogClosed ? "not-allowed" : "pointer",
          fontSize: "0.9rem",
          fontWeight: 700,
          fontFamily: "inherit",
          opacity: status === "loading" || blogClosed ? 0.5 : 1,
        }}
      >
        {status === "loading" ? "Posten..." : "⚡ Post live update"}
      </button>

      {message && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            borderRadius: 10,
            background: status === "success" ? "rgba(46,204,113,0.15)" : "rgba(255,107,0,0.15)",
            border: `1px solid ${status === "success" ? "rgba(46,204,113,0.3)" : "rgba(255,107,0,0.3)"}`,
            color: status === "success" ? "#2ECC71" : "#FF6B00",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}
    </form>
  );
}
