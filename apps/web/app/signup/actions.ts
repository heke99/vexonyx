"use server";

import { redirect } from "next/navigation";

export async function signup() {
  redirect("/waitlist");
}
