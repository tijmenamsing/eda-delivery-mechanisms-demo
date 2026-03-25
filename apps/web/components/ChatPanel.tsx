"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { ReactNode, FormEvent } from "react";
import { useChat } from "@/hooks/useChat";

interface ChatPanelProps {
  blogId: string;
}

const PANEL_WIDTH = 350;

function generateNickname(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `Bezoeker-${suffix}`;
}

export function ChatPanel({ blogId }: ChatPanelProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const defaultNickname = useMemo(() => generateNickname(), []);
  const [nickname, setNickname] = useState(defaultNickname);
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, isConnected, error, sendMessage } = useChat({
    blogId,
    enabled: isOpen,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !nickname.trim()) return;
    sendMessage(content, nickname.trim());
    setDraft("");
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        style={{
          marginBottom: "1rem",
          padding: "0.6rem 1rem",
          background: isOpen ? "#FF6B00" : "rgba(255, 255, 255, 0.08)",
          border: `1px solid ${isOpen ? "#FF6B00" : "rgba(255, 255, 255, 0.15)"}`,
          borderRadius: 10,
          color: "#fff",
          cursor: "pointer",
          fontSize: "0.85rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          transition: "background 0.2s, border-color 0.2s",
        }}
      >
        💬 {isOpen ? "Chat sluiten" : "Chat openen"}
      </button>

      {/* Backdrop overlay */}
      <div
        onClick={() => setIsOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.4)",
          zIndex: 998,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Slide-in panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: PANEL_WIDTH,
          zIndex: 999,
          background: "#12151a",
          borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateX(0)" : `translateX(${PANEL_WIDTH}px)`,
          transition: "transform 0.3s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(0, 0, 0, 0.25)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: isConnected ? "#2ECC71" : "#FF6B00",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: "0.8rem", color: isConnected ? "#2ECC71" : "#FF6B00" }}>
              {isConnected ? "WebSocket verbonden" : "Verbinden..."}
            </span>
            {error && (
              <span style={{ fontSize: "0.7rem", color: "#FF6B00", marginLeft: "0.25rem" }}>
                {error}
              </span>
            )}
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255, 255, 255, 0.5)",
              cursor: "pointer",
              fontSize: "1.1rem",
              padding: "0 0.25rem",
              lineHeight: 1,
            }}
            title="Chat sluiten"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0.75rem 0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          {messages.length === 0 ? (
            <p
              style={{
                color: "rgba(255, 255, 255, 0.4)",
                textAlign: "center",
                padding: "3rem 1rem",
                fontSize: "0.85rem",
              }}
            >
              Nog geen berichten — begin het gesprek!
            </p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.messageId}
                style={{
                  padding: "0.4rem 0.6rem",
                  borderRadius: 8,
                  background: "rgba(255, 255, 255, 0.04)",
                  fontSize: "0.85rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "0.15rem",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#FF6B00" }}>
                    {msg.author}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: "0.7rem", color: "rgba(255, 255, 255, 0.4)" }}
                  >
                    {new Date(msg.postedAt).toLocaleTimeString("nl-NL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p style={{ margin: 0, color: "#fff", lineHeight: 1.4 }}>
                  {msg.content}
                </p>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            padding: "0.75rem",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            background: "rgba(0, 0, 0, 0.15)",
            flexShrink: 0,
          }}
        >
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Naam"
            style={{
              padding: "0.4rem 0.6rem",
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 6,
              color: "#fff",
              fontSize: "0.8rem",
            }}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Typ een bericht..."
              maxLength={500}
              disabled={!isConnected}
              style={{
                flex: 1,
                padding: "0.4rem 0.6rem",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 6,
                color: "#fff",
                fontSize: "0.8rem",
              }}
            />
            <button
              type="submit"
              disabled={!isConnected || !draft.trim() || !nickname.trim()}
              style={{
                padding: "0.4rem 0.75rem",
                background:
                  isConnected && draft.trim() && nickname.trim()
                    ? "#FF6B00"
                    : "rgba(255, 255, 255, 0.1)",
                border: "none",
                borderRadius: 6,
                color: "#fff",
                cursor:
                  isConnected && draft.trim() ? "pointer" : "not-allowed",
                fontSize: "0.8rem",
                fontWeight: 600,
              }}
            >
              ↑
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
