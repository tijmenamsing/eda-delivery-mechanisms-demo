import type { Article, Blog, BlogUpdate } from "@bbtg-news/types/models";
import type {
  GetArticlesResponse,
  GetBlogsResponse,
  GetBlogDetailResponse,
  PostArticleRequest,
  PostArticleResponse,
  PostUpdateRequest,
  PostUpdateResponse,
} from "@bbtg-news/types/api";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? process.env["API_URL"] ?? "http://localhost:3001";

export async function fetchArticles(): Promise<Article[]> {
  const res = await fetch(`${API_URL}/articles`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch articles: ${res.status}`);
  }
  const data = (await res.json()) as GetArticlesResponse;
  return data.articles;
}

export async function publishArticle(
  body: PostArticleRequest,
): Promise<PostArticleResponse> {
  const res = await fetch(`${API_URL}/articles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? `Request failed: ${res.status}`,
    );
  }
  return (await res.json()) as PostArticleResponse;
}

export async function fetchBlogs(): Promise<Blog[]> {
  const res = await fetch(`${API_URL}/blogs`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch blogs: ${res.status}`);
  }
  const data = (await res.json()) as GetBlogsResponse;
  return data.blogs;
}

export async function fetchBlogDetail(
  blogId: string,
): Promise<{ blog: Blog; updates: BlogUpdate[] }> {
  const res = await fetch(`${API_URL}/blogs/${blogId}`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch blog: ${res.status}`);
  }
  const data = (await res.json()) as GetBlogDetailResponse;
  return data;
}

export async function postUpdate(
  body: PostUpdateRequest,
): Promise<PostUpdateResponse> {
  const res = await fetch(`${API_URL}/updates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(
      (err as { error?: { message?: string } }).error?.message ?? `Request failed: ${res.status}`,
    );
  }
  return (await res.json()) as PostUpdateResponse;
}

export function getSSEUrl(blogId: string): string {
  // In production, SSE goes through CloudFront (same origin) to avoid
  // mixed-content issues. NEXT_PUBLIC_API_URL points to the CloudFront domain.
  const base =
    typeof window !== "undefined"
      ? (window.location.origin ?? API_URL)
      : API_URL;
  return `${base}/stream/${blogId}`;
}

export function getWSUrl(blogId: string): string {
  // In production, WebSocket goes through CloudFront (same origin) to avoid
  // mixed-content issues. Derive wss:// URL from the page origin.
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return `wss://${window.location.host}/ws/chat/${blogId}`;
  }
  // Local development: use API_URL with ws:// protocol
  const wsBase = API_URL.replace(/^http/, "ws");
  return `${wsBase}/ws/chat/${blogId}`;
}
