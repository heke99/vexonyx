import { ContentPage } from "@/components/content-page";

export default function Page(){
  return <ContentPage
    label="SECURITY · TRUST"
    title="AI never decides its own access."
    intro="VEXONYX is designed so identity, organization access, authorization, scope, billing limits and emergency controls are enforced independently from model output. This page summarizes current security principles without claiming certifications VEXONYX has not obtained."
    cards={[
      {title:"Organization isolation",body:"Projects and customer data are separated with database-level row access controls and server-side authorization checks. Privileged service operations use separate service boundaries rather than relying on browser-supplied organization identifiers."},
      {title:"Untrusted context",body:"Uploaded files, repositories, web content, prompts and external results are treated as untrusted context. They cannot grant themselves permissions, expand engagement scope or override server-side authorization controls."},
      {title:"Restricted execution",body:"Sensitive or active security actions are designed to pass identity, organization role, current authorization, normalized scope, exclusions, approval, budget and runtime safety checks before execution is enabled."},
      {title:"Fail-closed controls",body:"Capabilities that do not have an approved production runtime, authorization path or safe dependency remain disabled. Model availability and tool availability are separate from authorization to act."},
      {title:"Auditability",body:"Security-sensitive operations, usage, billing events and authorization state are designed to produce server-side records that can be investigated independently of a model transcript."},
      {title:"Secrets and credentials",body:"Users should minimize submission of credentials and secrets and use only those required by an authorized engagement. VEXONYX separates privileged application secrets from public client configuration and does not expose provider secret keys through browser-readable variables."},
      {title:"Payments",body:"Payment-card collection is handled by Stripe-hosted payment infrastructure. VEXONYX stores provider identifiers, billing state, amounts, tax snapshots and contractual acceptance evidence, but does not intentionally store complete raw payment-card numbers in its application database."},
      {title:"Incident response",body:"VEXONYX may isolate projects, suspend execution, restrict an organization or preserve relevant security evidence when needed to contain suspected compromise, abuse or unauthorized activity."},
      {title:"Responsible vulnerability reporting",body:"If you believe you found a vulnerability in VEXONYX itself, report it to info@vexonyx.com with a concise description, affected component, reproduction information and potential impact. Do not access other customers' data, persist after demonstrating the issue, deploy destructive payloads or publicly disclose an unremediated issue without coordinating with us."},
      {title:"No implied testing authorization",body:"This reporting invitation authorizes good-faith investigation only to the minimum extent necessary on accounts and data you control. It does not authorize social engineering, denial of service, access to another customer's workspace, data exfiltration, destructive actions or testing third-party providers outside their own published policies."},
      {title:"Customer questions",body:"Security architecture, data handling, retention and enterprise security questions can be sent to info@vexonyx.com. Material claims should be validated against the current product and contract before relying on them for a compliance assessment."},
    ]}
  />;
}
