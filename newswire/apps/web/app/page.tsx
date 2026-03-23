import type { ReactNode } from "react";
import type { Article } from "@newswire/types/models";
import { fetchArticles } from "@/lib/api";
import { ArticleList } from "@/components/ArticleList";

export const revalidate = 60;

export default async function HomePage(): Promise<ReactNode> {
  let articles: Article[];
  try {
    articles = await fetchArticles();
  } catch {
    articles = [];
  }

  const lastUpdated = new Date().toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          padding: "0.75rem 1rem",
          background: "#1a1b23",
          borderRadius: "0.5rem",
          border: "1px solid #27272a",
        }}
      >
        <span style={{ fontSize: "0.8rem", color: "#a1a1aa" }}>
          🔄 Pagina vernieuwt elke 60 seconden
        </span>
        <span className="mono" style={{ fontSize: "0.75rem", color: "#60a5fa" }}>
          Laatste update: {lastUpdated}
        </span>
      </div>

      <ArticleList articles={articles} />

      <nav style={{ marginTop: "2rem", padding: "1rem 0", borderTop: "1px solid #27272a" }}>
        <a href="/journalist" style={{ marginRight: "1.5rem" }}>
          ✏️ Journalist Panel
        </a>
      </nav>
    </main>
  );
}
