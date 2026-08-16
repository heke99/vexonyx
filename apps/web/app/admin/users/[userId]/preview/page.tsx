import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyUserPreviewPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  redirect(`/preview/users/${userId}`);
}
