"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { PublishArticleForm } from "./PublishArticleForm";
import { PostUpdateForm } from "./PostUpdateForm";

type Tab = "article" | "update";

export function JournalistPanel(): ReactNode {
  const [activeTab, setActiveTab] = useState<Tab>("article");

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: "0.5rem 1.25rem",
    background: activeTab === tab ? "rgba(0, 0, 0, 0.25)" : "transparent",
    backdropFilter: activeTab === tab ? "blur(14px)" : undefined,
    WebkitBackdropFilter: activeTab === tab ? "blur(14px)" : undefined,
    color: activeTab === tab ? "#fff" : "rgba(255,255,255,0.5)",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: activeTab === tab ? 700 : 400,
    fontFamily: "inherit",
  });

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button style={tabStyle("article")} onClick={() => setActiveTab("article")}>
          📰 Artikel publiceren
        </button>
        <button style={tabStyle("update")} onClick={() => setActiveTab("update")}>
          ⚡ Live update posten
        </button>
      </div>

      {/* Active tab content */}
      {activeTab === "article" ? <PublishArticleForm /> : <PostUpdateForm />}
    </div>
  );
}
