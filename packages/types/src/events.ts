import { z } from "zod";
import { BlogUpdateType } from "./models.js";

export const ArticlePublishedEventSchema = z.object({
  type: z.literal("ArticlePublished"),
  articleId: z.string().uuid(),
  title: z.string(),
  author: z.string(),
  publishedAt: z.string().datetime(),
});

export type ArticlePublishedEvent = z.infer<
  typeof ArticlePublishedEventSchema
>;

export const UpdatePostedEventSchema = z.object({
  type: z.literal("UpdatePosted"),
  updateId: z.string().uuid(),
  blogId: z.string().uuid(),
  content: z.string(),
  author: z.string(),
  minute: z.number().int().nonnegative().nullable(),
  updateType: BlogUpdateType,
  postedAt: z.string().datetime(),
});

export type UpdatePostedEvent = z.infer<typeof UpdatePostedEventSchema>;

export const DomainEventSchema = z.discriminatedUnion("type", [
  ArticlePublishedEventSchema,
  UpdatePostedEventSchema,
]);

export type DomainEvent = z.infer<typeof DomainEventSchema>;
