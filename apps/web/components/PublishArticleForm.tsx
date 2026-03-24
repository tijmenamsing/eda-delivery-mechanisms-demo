"use client";

import { useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { publishArticle } from "@/lib/api";

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
        background: "#12121c",
        borderRadius: "0.5rem",
        border: "1px solid #1e1e2e",
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
          placeholder="BBTG kondigt nieuwe samenwerking aan..."
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
          background: "#5000C4",
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
