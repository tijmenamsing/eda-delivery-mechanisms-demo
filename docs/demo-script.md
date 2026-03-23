# Demo Script

## Preparation

1. Run `pnpm run setup` to start infrastructure and seed data
2. Run `pnpm run dev` to start all dev servers
3. Open three browser tabs:
   - **Tab 1**: Homepage (`http://localhost:3000`)
   - **Tab 2**: Live Blog (`http://localhost:3000/blog/b1e5a3f0-1234-4abc-9def-000000000001`)
   - **Tab 3**: Journalist Panel (`http://localhost:3000/journalist`)

## Act 1 — Polling (Homepage)

1. Show Tab 1 (Homepage): articles are visible, note the "Laatste update" timestamp
2. Switch to Tab 3 (Journalist Panel), publish a new article
3. Switch back to Tab 1 — article is **not yet visible**
4. Wait for the 60-second polling interval to pass
5. Article appears — this is **client-side polling** via Next.js ISR

**Key point**: Polling is simple and effective for content that doesn't need to be real-time.

## Act 2 — Server-Sent Events (Live Blog)

1. Show Tab 2 (Live Blog): existing updates are visible, SSE connection status is green
2. Switch to Tab 3 (Journalist Panel), select "Live update posten"
3. Post a goal update: type "Goal", minute "23", content "GOAL! Ajax 1-0!"
4. Switch back to Tab 2 — the update is **immediately visible** without page refresh

**Key point**: SSE delivers real-time updates with no polling delay. The update flows through:
`API → Redis pub/sub → SSE endpoint → Browser`

## Act 3 — Contrast

Show both tabs side by side:

- Homepage: delayed, eventually consistent, cacheable
- Live Blog: real-time, push-based, not cacheable

**Conclusion**: Choose the delivery mechanism that matches the user expectation. Not everything needs to be real-time.
