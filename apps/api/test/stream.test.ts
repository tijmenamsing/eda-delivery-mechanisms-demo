import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import express from "express";
import { createStreamRouter } from "../src/routes/stream.js";

vi.mock("../src/lib/env.js", () => ({
  env: {
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
  },
}));

const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn();
const mockOn = vi.fn();

vi.mock("../src/lib/redis.js", () => ({
  createSubscriberClient: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    disconnect: mockDisconnect,
    on: mockOn,
  }),
  getRedisClient: () => ({
    publish: vi.fn(),
  }),
}));

vi.mock("../src/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

function collectSSE(
  server: http.Server,
  path: string,
): Promise<{ headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === "string") {
      reject(new Error("Server not listening"));
      return;
    }

    const req = http.get(
      `http://127.0.0.1:${address.port}${path}`,
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
          // Once we see the connected event, stop
          if (body.includes("connected")) {
            req.destroy();
            resolve({ headers: res.headers, body });
          }
        });
        res.on("error", () => resolve({ headers: res.headers, body }));
      },
    );
    req.on("error", () => {
      // Expected when we destroy the request
    });
    setTimeout(() => {
      req.destroy();
      reject(new Error("Timed out waiting for SSE data"));
    }, 3000);
  });
}

describe("Stream routes", () => {
  let app: ReturnType<typeof express>;
  let server: http.Server;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use("/stream", createStreamRouter());
    server = app.listen(0);
  });

  afterEach(() => {
    server.close();
    vi.restoreAllMocks();
  });

  describe("GET /stream/:blogId", () => {
    it("sets correct SSE headers", async () => {
      const { headers } = await collectSSE(server, "/stream/test-blog-id");

      expect(headers["content-type"]).toBe("text/event-stream");
      expect(headers["cache-control"]).toBe("no-cache");
      expect(headers["connection"]).toBe("keep-alive");
    });

    it("sends connected event on open", async () => {
      const { body } = await collectSSE(server, "/stream/test-blog-id");

      expect(body).toContain("event: connected");
      expect(body).toContain('"blogId":"test-blog-id"');
    });

    it("subscribes to correct Redis channel", async () => {
      await collectSSE(server, "/stream/my-blog");

      expect(mockSubscribe).toHaveBeenCalledWith("blog:my-blog:updates");
    });
  });
});
