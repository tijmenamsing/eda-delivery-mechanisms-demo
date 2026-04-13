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

// Mock xread to simulate BLOCK behavior — always wait a bit then return null
const mockXrange = vi.fn().mockResolvedValue([]);
const mockXread = vi.fn().mockImplementation(
  () => new Promise((resolve) => setTimeout(() => resolve(null), 100)),
);
const mockDisconnect = vi.fn();

vi.mock("../src/lib/redis.js", () => ({
  createSubscriberClient: () => ({
    disconnect: mockDisconnect,
    xread: vi.fn(),
  }),
  getRedisClient: () => ({
    xrange: vi.fn(),
  }),
  xrange: (...args: unknown[]) => mockXrange(...args),
  xread: (...args: unknown[]) => mockXread(...args),
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
  headers?: Record<string, string>,
  waitFor = "connected",
): Promise<{ headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === "string") {
      reject(new Error("Server not listening"));
      return;
    }

    const req = http.get(
      { hostname: "127.0.0.1", port: (address as { port: number }).port, path, headers },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => {
          body += chunk.toString();
          if (body.includes(waitFor)) {
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
    mockXrange.mockResolvedValue([]);
    mockXread.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 100)),
    );

    app = express();
    app.use("/stream", createStreamRouter());
    server = app.listen(0);
  });

  afterEach(() => {
    server.close();
  });

  describe("GET /stream/:blogId", () => {
    it("sets correct SSE headers", async () => {
      const { headers } = await collectSSE(server, "/stream/test-blog-id");

      expect(headers["content-type"]).toBe("text/event-stream");
      expect(headers["cache-control"]).toBe("no-cache");
      expect(headers["connection"]).toBe("keep-alive");
    });

    it("sends connected event with retry field on open", async () => {
      const { body } = await collectSSE(server, "/stream/test-blog-id");

      expect(body).toContain("retry: 3000");
      expect(body).toContain("event: connected");
      expect(body).toContain('"blogId":"test-blog-id"');
    });

    it("replays history from Redis Stream via XRANGE", async () => {
      mockXrange.mockResolvedValue([
        { id: "1700000000000-0", fields: { payload: '{"content":"Goal!"}' } },
      ]);

      const { body } = await collectSSE(server, "/stream/my-blog", undefined, "Goal!");

      expect(mockXrange).toHaveBeenCalledWith(
        "stream:blog:my-blog:updates",
        "-",
        "+",
      );
      expect(body).toContain("id: 1700000000000-0");
      expect(body).toContain('data: {"content":"Goal!"}');
    });

    it("uses exclusive start for Last-Event-ID reconnections", async () => {
      mockXrange.mockResolvedValue([]);

      await collectSSE(server, "/stream/my-blog", {
        "last-event-id": "1700000000000-0",
      });

      expect(mockXrange).toHaveBeenCalledWith(
        "stream:blog:my-blog:updates",
        "(1700000000000-0",
        "+",
      );
    });

    it("disconnects reader client on request close", async () => {
      await collectSSE(server, "/stream/test-blog-id");

      // Wait for close handler to fire
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockDisconnect).toHaveBeenCalled();
    });
  });
});
