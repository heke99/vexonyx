import { ContentPage } from "@/components/content-page";

export default function Page(){
  return <ContentPage label="PRODUCT" title="One workspace for serious security work." intro="VEXONYX connects projects, context, agents, findings, evidence and reports so security teams can move from authorized scope to a reviewable result without losing context." cards={[
    {title:"Project context",body:"Keep targets, authorizations, files, notes and findings connected to the same organization and project."},
    {title:"Persistent agents",body:"Follow long-running work with visible progress, approvals and recovery so a browser refresh does not erase the job."},
    {title:"Evidence first",body:"Preserve source files, hashes, versions and observations as findings move through review."},
    {title:"Private AI",body:"VEXONYX is designed so AI can be replaced or upgraded without moving customer workflow or project history."}
  ]}/>;
}
