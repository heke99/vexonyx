import type { Metadata } from "next";

export const SITE_NAME = "VEXONYX";
export const SITE_URL = "https://www.vexonyx.com";
export const DEFAULT_DESCRIPTION =
  "AI platform for authorized penetration testing, web and API security, cloud and code review, evidence, security tool building and technical reporting.";

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function createPageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  const canonical = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} — ${SITE_NAME}`,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — ${SITE_NAME}`,
      description,
    },
  };
}

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: absoluteUrl("/icon.png"),
  email: "info@vexonyx.com",
  sameAs: ["https://github.com/heke99/vexonyx"],
};

export const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
};
