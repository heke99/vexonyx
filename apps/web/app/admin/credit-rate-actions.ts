"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/admin/guard";

function text(formData:FormData,key:string,max=80){return String(formData.get(key)??"").trim().slice(0,max);}

export async function publishCreditRate(formData:FormData){
  const {admin,userId}=await requireSuperadmin();
  const metric=text(formData,"metric").toLowerCase();
  const unit=text(formData,"unit").toLowerCase();
  const creditsPerUnit=Number(String(formData.get("credits_per_unit")??""));
  const active=String(formData.get("active"))==="true";
  if(!/^[a-z0-9][a-z0-9_.:-]{1,79}$/.test(metric)||!/^[a-z0-9][a-z0-9_.:-]{1,79}$/.test(unit)||!Number.isFinite(creditsPerUnit)||creditsPerUnit<=0||creditsPerUnit>1000000000){
    throw new Error("Invalid credit rate");
  }

  const {data,error}=await admin.schema("billing").rpc("create_credit_rate_version",{
    p_metric:metric,
    p_unit:unit,
    p_credits_per_unit:creditsPerUnit,
    p_active:active,
  });
  if(error)throw error;

  const audit=await admin.schema("audit").from("audit_logs").insert({
    actor_user_id:userId,
    actor_type:"superadmin",
    action:"billing.credit_rate_created",
    resource_type:"credit_rate",
    resource_id:String(data),
    metadata:{metric,unit,credits_per_unit:creditsPerUnit,active},
  });
  if(audit.error)throw audit.error;
  revalidatePath("/admin/credits");
}
