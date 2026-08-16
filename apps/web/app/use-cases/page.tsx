import { ContentPage } from "@/components/content-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata(
  "AI Cybersecurity Use Cases",
  "Use VEXONYX for authorized security assessments, source-code analysis, attack-surface analysis, evidence collection and technical reporting.",
  "/use-cases",
);

export default function Page(){
  return <ContentPage label="USE CASES" title="Structured security work, not generic automation." intro="VEXONYX is designed for professional and explicitly authorized security teams working across applications, APIs, infrastructure, cloud and source code." cards={[
    {title:"Security assessments",body:"Organize authorization, target scope, project files, agent observations and findings in one engagement."},
    {title:"Source-code analysis",body:"Work with project-bound code context and keep every finding traceable back to its source."},
    {title:"Attack-surface analysis",body:"Correlate observed assets and services while keeping active work inside the approved scope."},
    {title:"Reporting",body:"Turn validated evidence into executive and technical reports without rebuilding project context at the end."}
  ]}/>;
}
