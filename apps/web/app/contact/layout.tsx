import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata(
  "Contact",
  "Contact VEXONYX about AI cybersecurity, authorized penetration testing, product access, security, privacy, billing or enterprise questions.",
  "/contact",
);

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
