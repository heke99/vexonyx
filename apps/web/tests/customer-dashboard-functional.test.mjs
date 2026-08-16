import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(path)=>fs.readFileSync(new URL(path,import.meta.url),"utf8");

test("customer shell exposes every product tab and logout",()=>{
 const shell=read("../components/customer-app-shell.tsx");
 for(const href of ["/app","/app/chat","/app/projects","/app/agents","/app/files","/app/findings","/app/reports","/app/integrations","/app/usage","/app/billing","/app/team","/app/settings"]) assert.match(shell,new RegExp(href.replaceAll("/","\\/")));
 assert.match(shell,/\/auth\/signout/);
});

test("projects create persistently and open the created project",()=>{
 const actions=read("../app/app/actions.ts");
 assert.match(actions,/from\("projects"\)\.insert/);
 assert.match(actions,/select\("id"\)\.single/);
 assert.match(actions,/redirect\(`\/app\/projects\/\$\{project\.id\}`\)/);
 const detail=read("../app/app/projects/[id]/actions.ts");
 for(const action of ["renameProject","setProjectArchive","duplicateProject","softDeleteProject","restoreDeletedProject","purgeProject","createEngagement","addScope","createAuthorization","addNote","addFinding","createReport","addProjectMember","removeProjectMember"]) assert.match(detail,new RegExp(`function ${action}|${action}\\(`));
});

test("chat creates persistent conversations and messages",()=>{
 const chat=read("../components/mock-chat.tsx");
 const api=read("../app/api/v1/ai/mock/route.ts");
 assert.match(chat,/\/api\/v1\/ai\/mock/);
 assert.match(api,/from\("conversations"\)\.insert/);
 assert.match(api,/from\("messages"\)\.insert/);
 assert.match(api,/usage_events/);
 assert.match(api,/external_execution:false/);
});

test("agents can be started and opened without external execution",()=>{
 const page=read("../app/app/agents/page.tsx");
 const actions=read("../app/app/agents/actions.ts");
 assert.match(page,/action=\{startPreGpuAgentRun\}/);
 assert.match(page,/href=\{`\/app\/agents\/\$\{run\.id\}`\}/);
 assert.match(actions,/start_pre_gpu_agent_run/);
 assert.match(actions,/redirect\(`\/app\/agents\/\$\{row\.run_id\}`\)/);
});

test("files tab can upload through signed storage ticket flow",()=>{
 const page=read("../app/app/files/page.tsx");
 const library=read("../components/file-library-uploader.tsx");
 const uploader=read("../components/file-uploader.tsx");
 assert.match(page,/FileLibraryUploader/);
 assert.match(library,/FileUploader/);
 assert.match(uploader,/\/api\/v1\/files\/upload-ticket/);
 assert.match(uploader,/uploadToSignedUrl/);
 assert.match(uploader,/\/api\/v1\/files\/complete/);
});

test("findings and evidence are editable and versioned",()=>{
 const detail=read("../app/app/findings/[id]/actions.ts");
 assert.match(detail,/updateFinding/);
 assert.match(detail,/create_finding_evidence/);
 assert.match(detail,/append_finding_evidence_version/);
});

test("reports can be created, edited, snapshotted and exported",()=>{
 const library=read("../app/app/reports/actions.ts");
 const detail=read("../app/app/reports/[id]/page.tsx");
 assert.match(library,/createReportFromLibrary/);
 assert.match(library,/redirect\(`\/app\/reports\/\$\{report\.id\}`\)/);
 assert.match(detail,/snapshotReport/);
 assert.match(detail,/saveReportSection/);
 assert.match(detail,/requestReportExport/);
});

test("team and settings mutate through scoped server boundaries",()=>{
 const team=read("../app/api/v1/team/invitations/route.ts");
 const invite=read("../app/invite/[id]/actions.ts");
 const settings=read("../app/app/settings/actions.ts");
 const migration=read("../../../supabase/migrations/20260816143009_customer_quota_settings.sql");
 assert.match(team,/create_organization_invitation/);
 assert.match(invite,/accept_organization_invitation/);
 assert.match(settings,/updatePersonalSettings/);
 assert.match(settings,/updateOrganizationSettings/);
 assert.match(settings,/updateSafetyBudgets/);
 assert.match(migration,/admin_required/);
 assert.match(migration,/revoke all.*from public, anon/is);
});

test("usage and billing remain backed by workspace data and provider checkout",()=>{
 const usage=read("../app/app/usage/page.tsx");
 const billing=read("../app/app/billing/page.tsx");
 assert.match(usage,/usage_user_monthly/);
 assert.match(usage,/credit_user_monthly/);
 assert.match(billing,/CheckoutButton/);
 assert.match(billing,/CancelSubscriptionButton/);
 assert.match(billing,/payment_transactions/);
});

test("planned connectors are not presented as fake live OAuth connections",()=>{
 const integrations=read("../app/app/integrations/page.tsx");
 assert.match(integrations,/planned|Planned/i);
 assert.doesNotMatch(integrations,/>Connect<|>Connect now</i);
});
