import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import http from "node:http";
import express from "express";
import WebSocket from "ws";
import { setupWebSocket, closeWebSocket } from "../src/ws/setup.js";

vi.mock("../src/lib/env.js", () => ({
  env: {
    BLOGS_TABLE: "test-blogs",
    CHAT_MESSAGES_TABLE: "test-chat-messages",
    REDIS_URL: "redis://localhost:6379",
    NODE_ENV: "test",
  },
}));

const mockGetItem = vi.fn();
const mockQueryItems = vi.fn();
const mockPutItem = vi.fn();

vi.mock("../src/lib/dynamo.js", () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  queryItems: (...args: unknown[]) => mockQueryItems(...args),
  putItem: (...args: unknown[]) => mockPutItem(...args),
}));

const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
const mockDisconnect = vi.fn();
const mockRedisOn = vi.fn();
const mockPublish = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/lib/redis.js", () => ({
  createSubscriberClient: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    disconnect: mockDisconnect,
    on: mockRedisOn,
  }),
  getRedisClient: () => ({
    publish: mockPublish,
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

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for WS message")),
      3000,
    );
    ws.once("message", (data: WebSocket.Data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out waiting for WS close")),
      3000,
    );
    ws.once("close", (code: number, reason: Buffer) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

describe("WebSocket chat", () => {
  let app: ReturnType<typeof express>;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    server = app.listen(0);
    const addr = server.address();
    port = typeof addr === "object" && addr !== null ? addr.port : 0;
    setupWebSocket(server);
  });

  afterEach(async () => {
    await closeWebSocket();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sends history event on connection with blog data", async () => {
    const blog = { blogId: "b1", title: "Test Blog" };
    const chatHistory = [
      { messageId: "m1", blogId: "b1", author: "Alice", content: "Hello", postedAt: "2026-04-15T14:00:00.000Z" },
    ];

    mockGetItem.mockResolvedValue(blog);
    mockQueryItems.mockResolvedValue(chatHistory);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/chat/b1`);
    const msg = await waitForMessage(ws);

    expect(msg.event).toBe("history");
    expect(msg.data).toEqual(chatHistory);

    ws.close();
  });

  it("closes with 4404 when blog not found", async () => {
    mockGetItem.mockResolvedValue(null);

    // Use hex-only blogId to pass the URL pattern regex
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/chat/00000000-0000-0000-0000-000000000000`);
    const { code } = await waitForClose(ws);

    expect(code).toBe(4404);
  });

  it("rejects upgrade for non-chat paths", (ctx) => {
    return new Promise<void>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/other/path`);
      ws.on("error", (err) => {
        expect(err.message).toContain("404");
        resolve();
      });
    });
  });

  it("broadcasts message via Redis after receiving from client", async () => {
    const blog = { blogId: "b2", title: "Test Blog" };
    mockGetItem.mockResolvedValue(blog);
    mockQueryItems.mockResolvedValue([]);
    mockPutItem.mockResolvedValue(undefined);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/chat/b2`);

    // Wait for history event
    await waitForMessage(ws);

    // Send a chat message
    ws.send(JSON.stringify({ author: "TestUser", content: "Hello world" }));

    // Wait for the Redis message callback to be triggered
    await vi.waitFor(() => {
      expect(mockPutItem).toHaveBeenCalledOnce();
    }, { timeout: 2000 });

    // Verify DynamoDB write
    expect(mockPutItem).toHaveBeenCalledWith(
      "test-chat-messages",
      expect.objectContaining({
        blogId: "b2",
        author: "TestUser",
        content: "Hello world",
        ttl: expect.any(Number),
      }),
    );

    // Verify Redis publish
    expect(mockPublish).toHaveBeenCalledWith(
      "chat:b2:messages",
      expect.stringContaining("TestUser"),
    );

    ws.close();
  });

  it("returns error for invalid message payload", async () => {
    const blog = { blogId: "b3", title: "Test Blog" };
    mockGetItem.mockResolvedValue(blog);
    mockQueryItems.mockResolvedValue([]);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/chat/b3`);
    await waitForMessage(ws); // history

    // Send invalid payload (missing required fields)
    ws.send(JSON.stringify({ invalid: true }));
    const errorMsg = await waitForMessage(ws);

    expect(errorMsg.event).toBe("error");

    ws.close();
  });

  it("disconnects subscriber on close", async () => {
    const blog = { blogId: "b4", title: "Test Blog" };
    mockGetItem.mockResolvedValue(blog);
    mockQueryItems.mockResolvedValue([]);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/chat/b4`);
    await waitForMessage(ws); // history

    ws.close();

    // Wait for cleanup
    await vi.waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalled();
    }, { timeout: 2000 });

    expect(mockUnsubscribe).toHaveBeenCalledWith("chat:b4:messages");
  });
});
