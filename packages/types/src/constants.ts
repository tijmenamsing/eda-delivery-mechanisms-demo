export const REDIS_CHANNELS = {
  chatMessages: (blogId: string): string => `chat:${blogId}:messages`,
  blogClosed: (blogId: string): string => `blog:${blogId}:closed`,
} as const;

export const REDIS_STREAMS = {
  blogUpdates: (blogId: string): string => `stream:blog:${blogId}:updates`,
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
  CLOSED: "closed",
  ERROR: "error",
} as const;

export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  INVALID_PAYLOAD: 4400,
  BLOG_NOT_FOUND: 4404,
  BLOG_CLOSED: 4410,
  SERVER_ERROR: 4500,
} as const;
