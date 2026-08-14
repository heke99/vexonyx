import type { Metadata } from "next";
import "./globals.css";

const description = "AI platform for authorized penetration testing, web and API security, cloud and code review, evidence, security tool building and technical reporting.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://vexonyx.com"),
  title: { default: "VEXONYX — AI cybersecurity & penetration testing platform", template: "%s — VEXONYX" },
  description,
  robots: { index: true, follow: true },
  openGraph: {
    title: "VEXONYX — AI cybersecurity & penetration testing platform",
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VEXONYX — AI cybersecurity & penetration testing platform",
    description,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
