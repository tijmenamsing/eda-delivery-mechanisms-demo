import type { Article } from "@bbtg-news/types/models";
import type { ReactNode } from "react";

interface ArticleCardProps {
  article: Article;
}

export function ArticleCard({ article }: ArticleCardProps): ReactNode {
  const date = new Date(article.publishedAt);
  const formattedDate = date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      style={{
        padding: "1.5rem",
        background: "rgba(0, 0, 0, 0.18)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderRadius: 20,
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
      }}
    >
      <h2 style={{ fontSize: "1.375rem", fontWeight: 900, marginBottom: "0.5rem", color: "#fff", textTransform: "none" }}>
        {article.title}
      </h2>
      <p
        style={{
          color: "rgba(255,255,255,0.85)",
          fontSize: "1rem",
          lineHeight: 1.6,
          marginBottom: "0.75rem",
        }}
      >
        {article.content}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.75rem",
          color: "rgba(255,255,255,0.5)",
        }}
      >
        <span>Door {article.author}</span>
        <span>
          {formattedDate} om {formattedTime}
        </span>
      </div>
    </article>
  );
}
