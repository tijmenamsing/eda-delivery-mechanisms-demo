import type { Article } from "@bbtg-news/types/models";
import type { ReactNode } from "react";
import { ArticleCard } from "./ArticleCard";

interface ArticleListProps {
  articles: Article[];
}

export function ArticleList({ articles }: ArticleListProps): ReactNode {
  if (articles.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "3rem 1rem",
          color: "rgba(255,255,255,0.5)",
        }}
      >
        <p>Nog geen artikelen gepubliceerd.</p>
        <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
          Ga naar het{" "}
          <a href="/journalist">redactiepanel</a> om een artikel te publiceren.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {articles.map((article) => (
        <ArticleCard key={article.articleId} article={article} />
      ))}
    </div>
  );
}
