import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://vexonyx.com"),
  title: { default: "VEXONYX — AI security workspace", template: "%s — VEXONYX" },
  description: "AI agents, security workflows, evidence and reporting for authorized security teams.",
  robots: { index: true, follow: true },
  openGraph: { title: "VEXONYX", description: "AI agents for modern security teams", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
