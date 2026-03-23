"use client";

import { useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { publishArticle } from "@/lib/api";

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  background: "#1a1b23",
  border: "1px solid #27272a",
  borderRadius: "0.375rem",
  color: "#e4e4e7",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#a1a1aa",
  marginBottom: "0.375rem",
};

export function PublishArticleForm(): ReactNode {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const result = await publishArticle({ title, content, author });
      setStatus("success");
      setMessage(`Artikel "${result.article.title}" gepubliceerd! Verschijnt bij volgende poll.`);
      setTitle("");
      setContent("");
      setAuthor("");
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
        background: "#1a1b23",
        borderRadius: "0.5rem",
        border: "1px solid #27272a",
      }}
    >
      <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1.25rem" }}>
        Nieuw artikel
      </h3>

      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Titel</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ajax wint topper..."
          required
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={labelStyle}>Inhoud</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Schrijf het artikel..."
          required
          rows={6}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <label style={labelStyle}>Auteur</label>
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Jan de Vries"
          required
          style={inputStyle}
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        style={{
          padding: "0.625rem 1.5rem",
          background: "#3b82f6",
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
        {status === "loading" ? "Publiceren..." : "📰 Publiceer artikel"}
      </button>

      {message && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            borderRadius: "0.375rem",
            background: status === "success" ? "#052e16" : "#450a0a",
            border: `1px solid ${status === "success" ? "#166534" : "#991b1b"}`,
            color: status === "success" ? "#4ade80" : "#f87171",
            fontSize: "0.85rem",
          }}
        >
          {message}
        </div>
      )}
    </form>
  );
}
