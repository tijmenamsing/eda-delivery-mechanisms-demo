import type { Article } from "@newswire/types/models";
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
        padding: "1.25rem",
        background: "#1a1b23",
        borderRadius: "0.5rem",
        border: "1px solid #27272a",
      }}
    >
      <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        {article.title}
      </h2>
      <p
        style={{
          color: "#a1a1aa",
          fontSize: "0.875rem",
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
          color: "#71717a",
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
