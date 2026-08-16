import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";

const pages: Array<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/product", priority: 0.9, changeFrequency: "weekly" },
  { path: "/agents", priority: 0.9, changeFrequency: "weekly" },
  { path: "/use-cases", priority: 0.9, changeFrequency: "weekly" },
  { path: "/security", priority: 0.9, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "weekly" },
  { path: "/waitlist", priority: 0.8, changeFrequency: "weekly" },
  { path: "/contact", priority: 0.6, changeFrequency: "monthly" },
  { path: "/legal", priority: 0.4, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.4, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.4, changeFrequency: "monthly" },
  { path: "/acceptable-use", priority: 0.4, changeFrequency: "monthly" },
  { path: "/refunds", priority: 0.3, changeFrequency: "monthly" },
  { path: "/cookies", priority: 0.3, changeFrequency: "monthly" },
  { path: "/dpa", priority: 0.3, changeFrequency: "monthly" },
  { path: "/subprocessors", priority: 0.3, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(({ path, priority, changeFrequency }) => ({
    url: absoluteUrl(path),
    priority,
    changeFrequency,
  }));
}
