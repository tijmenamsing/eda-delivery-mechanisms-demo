"use client";

import { useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { publishArticle } from "@/lib/api";

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
        background: "rgba(0, 0, 0, 0.18)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderRadius: 20,
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
      }}
    >
      <h3 style={{ fontSize: "1.1rem", fontWeight: 900, marginBottom: "1.25rem", color: "#fff" }}>
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
          background: "#FF6B00",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          cursor: status === "loading" ? "wait" : "pointer",
          fontSize: "0.9rem",
          fontWeight: 700,
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
