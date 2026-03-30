export const REDIS_CHANNELS = {
  blogUpdates: (blogId: string): string => `blog:${blogId}:updates`,
  chatMessages: (blogId: string): string => `chat:${blogId}:messages`,
} as const;

export const SSE_EVENTS = {
  UPDATE: "update",
  CONNECTED: "connected",
  DONE: "done",
  ERROR: "error",
} as const;

export const WS_EVENTS = {
  MESSAGE: "message",
  HISTORY: "history",
  ERROR: "error",
} as const;

export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  INVALID_PAYLOAD: 4400,
  BLOG_NOT_FOUND: 4404,
  SERVER_ERROR: 4500,
} as const;
