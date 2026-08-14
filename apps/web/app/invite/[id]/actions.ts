"use server";

import { redirect } from "next/navigation";

export async function acceptInvitation() {
  redirect("/waitlist");
}
