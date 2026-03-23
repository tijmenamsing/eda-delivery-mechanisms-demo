import type { BlogUpdate } from "@newswire/types/models";
import type { ReactNode } from "react";

interface LiveBlogUpdateProps {
  update: BlogUpdate;
}

const typeStyles: Record<BlogUpdate["type"], { icon: string; accent: string }> = {
  goal: { icon: "⚽", accent: "#4ade80" },
  card: { icon: "🟨", accent: "#facc15" },
  substitution: { icon: "🔄", accent: "#60a5fa" },
  commentary: { icon: "💬", accent: "#a1a1aa" },
  halftime: { icon: "⏸", accent: "#c084fc" },
  fulltime: { icon: "🏁", accent: "#f87171" },
};

export function LiveBlogUpdate({ update }: LiveBlogUpdateProps): ReactNode {
  const style = typeStyles[update.type];
  const time = new Date(update.postedAt).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isHighlight = update.type === "goal" || update.type === "halftime" || update.type === "fulltime";

  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        background: isHighlight ? "#1a1b23" : "transparent",
        borderRadius: "0.375rem",
        borderLeft: `3px solid ${style.accent}`,
      }}
    >
      {/* Time + minute */}
      <div
        className="mono"
        style={{
          minWidth: 60,
          fontSize: "0.75rem",
          color: "#71717a",
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
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>{update.content}</p>
        <span style={{ fontSize: "0.7rem", color: "#71717a" }}>
          {update.author}
        </span>
      </div>
    </div>
  );
}
