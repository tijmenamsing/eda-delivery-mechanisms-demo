import type { ReactNode } from "react";
import { JournalistPanel } from "@/components/JournalistPanel";

export default function JournalistPage(): ReactNode {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1rem" }}>
      <nav style={{ marginBottom: "1.5rem" }}>
        <a href="/" style={{ fontSize: "0.875rem", color: "#a1a1aa" }}>
          ← Terug naar overzicht
        </a>
      </nav>

      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.25rem" }}>
          ✏️ Journalist Panel
        </h1>
        <p style={{ color: "#a1a1aa", fontSize: "0.875rem" }}>
          Publiceer artikelen en post live updates
        </p>
      </header>

      <JournalistPanel />
    </main>
  );
}
