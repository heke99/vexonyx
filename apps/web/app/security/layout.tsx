import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata(
  "Security & Trust",
  "Learn how VEXONYX separates AI output from identity, authorization, organization access, target scope, billing limits, auditability and restricted execution.",
  "/security",
);

export default function SecurityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
