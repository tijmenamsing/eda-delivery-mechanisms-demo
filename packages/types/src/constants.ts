export const REDIS_CHANNELS = {
  blogUpdates: (blogId: string): string => `blog:${blogId}:updates`,
} as const;

export const SSE_EVENTS = {
  UPDATE: "update",
  CONNECTED: "connected",
  DONE: "done",
  ERROR: "error",
} as const;
