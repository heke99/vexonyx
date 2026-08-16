import { ContentPage } from "@/components/content-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata(
  "AI Security Agents",
  "VEXONYX security agents combine project context, approval gates, crash-safe progress and hard execution limits for authorized security work.",
  "/agents",
);

export default function Page(){
  return <ContentPage label="AGENTS" title="Agents that stay inside the engagement." intro="VEXONYX agents can reason over project context while authorization, permissions and target scope remain outside model control." cards={[
    {title:"Right-sized intelligence",body:"Simple work stays fast while difficult security analysis can be escalated to stronger reasoning when needed."},
    {title:"Approval gates",body:"Teams can require a human decision before high-impact or sensitive actions continue."},
    {title:"Crash-safe progress",body:"Meaningful progress is saved so long-running work can recover safely after a disconnect or worker restart."},
    {title:"Hard limits",body:"Time, steps, tool use and cost can be capped to prevent runaway execution."}
  ]}/>;
}
