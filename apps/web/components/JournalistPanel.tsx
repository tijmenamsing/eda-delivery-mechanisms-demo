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
    background: activeTab === tab ? "#1e1e2e" : "transparent",
    color: activeTab === tab ? "#e8e8ef" : "#5e5e72",
    border: "1px solid",
    borderColor: activeTab === tab ? "#2a2a3e" : "transparent",
    borderRadius: "0.375rem",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: activeTab === tab ? 600 : 400,
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
