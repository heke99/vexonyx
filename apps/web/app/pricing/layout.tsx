import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata(
  "Pricing",
  "VEXONYX pricing and usage controls for AI cybersecurity, authorized penetration testing and security-team workflows.",
  "/pricing",
);

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
