import type { BlogUpdate } from "@bbtg-news/types/models";
import type { ReactNode } from "react";

interface LiveBlogUpdateProps {
  update: BlogUpdate;
}

const typeStyles: Record<BlogUpdate["type"], { icon: string; accent: string }> = {
  keynote: { icon: "🎤", accent: "#FF6B00" },
  session: { icon: "📚", accent: "#64D5FF" },
  break: { icon: "☕", accent: "#F19A16" },
  commentary: { icon: "💬", accent: "rgba(255,255,255,0.5)" },
  milestone: { icon: "🏁", accent: "#2ECC71" },
  social: { icon: "🥂", accent: "#c084fc" },
};

export function LiveBlogUpdate({ update }: LiveBlogUpdateProps): ReactNode {
  const style = typeStyles[update.type];
  const time = new Date(update.postedAt).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isHighlight = update.type === "keynote" || update.type === "milestone";

  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        background: isHighlight ? "rgba(0, 0, 0, 0.12)" : "transparent",
        borderRadius: 12,
        borderLeft: `3px solid ${style.accent}`,
      }}
    >
      {/* Time + minute */}
      <div
        className="mono"
        style={{
          minWidth: 60,
          fontSize: "0.75rem",
          color: "rgba(255,255,255,0.5)",
          paddingTop: 2,
        }}
      >
        <div>{time}</div>
        {update.minute !== null && (
          <div style={{ color: style.accent, fontWeight: 600 }}>
            {update.minute}&apos;
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
          <span>{style.icon}</span>
          <span
            style={{
              fontSize: "0.7rem",
              textTransform: "uppercase",
              color: style.accent,
              fontWeight: 600,
              letterSpacing: "0.05em",
            }}
          >
            {update.type}
          </span>
        </div>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "#fff" }}>{update.content}</p>
        <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)" }}>
          {update.author}
        </span>
      </div>
    </div>
  );
}
