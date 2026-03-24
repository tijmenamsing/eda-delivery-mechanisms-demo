"use client";

import { useState, useEffect } from "react";
import type { ReactNode, FormEvent } from "react";
import type { Blog } from "@bbtg-news/types/models";
import type { BlogUpdate } from "@bbtg-news/types/models";
import { postUpdate, fetchBlogs } from "@/lib/api";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  background: "#12121c",
  border: "1px solid #1e1e2e",
  borderRadius: "0.375rem",
  color: "#e8e8ef",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#9898ab",
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

  useEffect(() => {
    fetchBlogs()
      .then((b) => {
        setBlogs(b);
        if (b.length > 0 && b[0]) {
          setBlogId(b[0].blogId);
        }
      })
      .catch(() => setMessage("Kon blogs niet laden"));
  }, []);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!blogId) return;
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

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: "1.5rem",
        background: "#12121c",
        borderRadius: "0.5rem",
        border: "1px solid #1e1e2e",
      }}
    >
      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1.25rem" }}>
        Live update posten
      </h3>

      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Blog</label>
        <select
          value={blogId}
          onChange={(e) => setBlogId(e.target.value)}
          required
          style={inputStyle}
        >
          {blogs.length === 0 && <option value="">Laden...</option>}
          {blogs.map((blog) => (
            <option key={blog.blogId} value={blog.blogId}>
              {blog.title}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BlogUpdate["type"])}
            style={inputStyle}
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
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        style={{
          padding: "0.625rem 1.5rem",
          background: "#2ECC71",
          color: "white",
          border: "none",
          borderRadius: "0.375rem",
          cursor: status === "loading" ? "wait" : "pointer",
          fontSize: "0.9rem",
          fontWeight: 600,
          fontFamily: "inherit",
          opacity: status === "loading" ? 0.7 : 1,
        }}
      >
        {status === "loading" ? "Posten..." : "⚡ Post live update"}
      </button>

      {message && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            borderRadius: "0.375rem",
            background: status === "success" ? "#0a1f12" : "#2a0a00",
            border: `1px solid ${status === "success" ? "#1a4a2a" : "#8a3000"}`,
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
