import Link from "next/link";
import { ContentPage } from "@/components/content-page";

export default function Page(){
  return <><ContentPage label="PRICING" title="Private beta first." intro="VEXONYX pricing is not published yet. Usage and hard cost limits are already prepared so organizations can understand and control consumption as AI features are introduced." cards={[
    {title:"Usage-aware",body:"AI generations, agent runs, external execution, storage and report exports can be measured per organization."},
    {title:"Hard caps",body:"Organization and run budgets can pause runaway spend instead of producing surprise bills."}
  ]}/><div className="shell" style={{paddingBottom:80}}><Link className="button" href="/waitlist">Join the waitlist</Link></div></>;
}
