"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function clean(value: FormDataEntryValue | null, max = 160) {
  return String(value ?? "").trim().slice(0,max);
}

async function identity() {
  const supabase = await createClient();
  const {data} = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) throw new Error("Unauthorized");
  return {supabase,userId};
}

export async function renameConversation(formData:FormData) {
  const {supabase,userId} = await identity();
  const id = clean(formData.get("conversation_id"),36);
  const organizationId = clean(formData.get("organization_id"),36);
  const title = clean(formData.get("title"),120);
  if (!id || !organizationId || !title) return;
  await supabase.schema("app").from("conversations").update({title,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",organizationId).eq("user_id",userId);
  revalidatePath("/app/chat"); revalidatePath(`/app/chat/${id}`);
}

export async function setConversationStatus(formData:FormData) {
  const {supabase,userId} = await identity();
  const id = clean(formData.get("conversation_id"),36);
  const organizationId = clean(formData.get("organization_id"),36);
  const status = clean(formData.get("status"),20);
  if (!id || !organizationId || !["active","archived","deleted"].includes(status)) return;
  await supabase.schema("app").from("conversations").update({status,updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",organizationId).eq("user_id",userId);
  revalidatePath("/app/chat"); revalidatePath(`/app/chat/${id}`);
  if (status === "deleted") redirect("/app/chat");
}
