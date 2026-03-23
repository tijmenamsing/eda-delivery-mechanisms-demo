import { z } from "zod";

export const ArticleSchema = z.object({
  articleId: z.string().uuid(),
  title: z.string().min(1),
  content: z.string().min(1),
  author: z.string().min(1),
  publishedAt: z.string().datetime(),
  slug: z.string().min(1),
});

export type Article = z.infer<typeof ArticleSchema>;

export const BlogUpdateType = z.enum([
  "keynote",
  "session",
  "break",
  "commentary",
  "milestone",
  "social",
]);

export type BlogUpdateType_ = z.infer<typeof BlogUpdateType>;

export const BlogUpdateSchema = z.object({
  updateId: z.string().uuid(),
  blogId: z.string().uuid(),
  content: z.string().min(1),
  author: z.string().min(1),
  minute: z.number().int().nonnegative().nullable(),
  type: BlogUpdateType,
  postedAt: z.string().datetime(),
});

export type BlogUpdate = z.infer<typeof BlogUpdateSchema>;

export const BlogStatusSchema = z.enum(["active", "closed"]);

export const BlogSchema = z.object({
  blogId: z.string().uuid(),
  title: z.string().min(1),
  eventName: z.string().min(1),
  eventDate: z.string(),
  eventLocation: z.string().min(1),
  status: BlogStatusSchema,
  createdAt: z.string().datetime(),
});

export type Blog = z.infer<typeof BlogSchema>;
