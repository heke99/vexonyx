import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";

export function SeoJsonLd() {
  const json = JSON.stringify([organizationJsonLd, websiteJsonLd]).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
