import { z } from "zod";
import {
  ArticleSchema,
  BlogSchema,
  BlogUpdateSchema,
  BlogUpdateType,
} from "./models.js";

// --- Articles ---

export const PostArticleRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  author: z.string().min(1, "Author is required"),
});

export type PostArticleRequest = z.infer<typeof PostArticleRequestSchema>;

export const PostArticleResponseSchema = z.object({
  article: ArticleSchema,
});

export type PostArticleResponse = z.infer<typeof PostArticleResponseSchema>;

export const GetArticlesResponseSchema = z.object({
  articles: z.array(ArticleSchema),
});

export type GetArticlesResponse = z.infer<typeof GetArticlesResponseSchema>;

// --- Updates ---

export const PostUpdateRequestSchema = z.object({
  blogId: z.string().uuid("Invalid blog ID"),
  content: z.string().min(1, "Content is required"),
  author: z.string().min(1, "Author is required"),
  minute: z.number().int().nonnegative().nullable(),
  type: BlogUpdateType,
});

export type PostUpdateRequest = z.infer<typeof PostUpdateRequestSchema>;

export const PostUpdateResponseSchema = z.object({
  update: BlogUpdateSchema,
});

export type PostUpdateResponse = z.infer<typeof PostUpdateResponseSchema>;

// --- Blogs ---

export const GetBlogsResponseSchema = z.object({
  blogs: z.array(BlogSchema),
});

export type GetBlogsResponse = z.infer<typeof GetBlogsResponseSchema>;

export const GetBlogDetailResponseSchema = z.object({
  blog: BlogSchema,
  updates: z.array(BlogUpdateSchema),
});

export type GetBlogDetailResponse = z.infer<
  typeof GetBlogDetailResponseSchema
>;
