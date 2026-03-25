import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import { logger } from "../lib/logger.js";
import { handleChatConnection } from "./chat-handler.js";

const WS_PATH_PATTERN = /^\/ws\/chat\/([a-f0-9-]+)$/;

let wss: WebSocketServer | null = null;

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const match = WS_PATH_PATTERN.exec(url.pathname);

    if (!match?.[1]) {
      // Not a chat WebSocket request — reject the upgrade
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    const blogId = match[1];

    wss!.handleUpgrade(req, socket, head, (ws) => {
      handleChatConnection(ws, req, blogId).catch((err: unknown) => {
        logger.error({ err, blogId }, "Failed to handle chat connection");
        ws.close(4500, "Internal server error");
      });
    });
  });

  logger.info("WebSocket server attached (path: /ws/chat/:blogId)");
}

export function closeWebSocket(): Promise<void> {
  return new Promise((resolve) => {
    if (!wss) {
      resolve();
      return;
    }

    // Close all active connections
    for (const client of wss.clients) {
      client.close(1001, "Server shutting down");
    }

    wss.close(() => {
      logger.info("WebSocket server closed");
      wss = null;
      resolve();
    });
  });
}
