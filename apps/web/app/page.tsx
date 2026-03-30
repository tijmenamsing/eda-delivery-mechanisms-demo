import type { ReactNode } from "react";
import type { Article } from "@bbtg-news/types/models";
import { fetchArticles } from "@/lib/api";
import { PollingArticleList } from "@/components/PollingArticleList";
import { BlogList } from "@/components/BlogList";

export const revalidate = 60;

export default async function HomePage(): Promise<ReactNode> {
  let articles: Article[];
  try {
    articles = await fetchArticles();
  } catch {
    articles = [];
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

      {/* BlogList fetches on mount — always reflects current blog status */}
      <BlogList />

      <PollingArticleList initialArticles={articles} />

      <nav style={{ marginTop: "2rem", padding: "1rem 0" }}>
        <a href="/journalist" style={{ marginRight: "1.5rem", color: "#fff" }}>
          ✏️ Redactiepanel
        </a>
      </nav>
    </main>
  );
}
