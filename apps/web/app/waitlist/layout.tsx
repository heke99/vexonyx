import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata(
  "Join the VEXONYX Waitlist",
  "Join the VEXONYX waitlist for AI cybersecurity and authorized penetration-testing access for pentesters, researchers, developers and security teams.",
  "/waitlist",
);

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
