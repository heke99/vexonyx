import { ContentPage } from "@/components/content-page";

export default function Page(){
  return <ContentPage label="SECURITY" title="AI never decides its own access." intro="Identity, organization access, authorization, scope, budgets and emergency controls are enforced independently from model output." cards={[
    {title:"Organization isolation",body:"Projects and customer data are separated with database-level access rules and server-side checks."},
    {title:"Untrusted context",body:"Uploaded files, repositories, web content and external results stay untrusted and cannot grant themselves access."},
    {title:"Restricted execution",body:"Active requests must pass permissions, current authorization, normalized scope, exclusions, approval and budget checks."},
    {title:"Safe when AI is offline",body:"Projects and evidence remain available if AI is unavailable, while active external actions can stay disabled independently."}
  ]}/>;
}
