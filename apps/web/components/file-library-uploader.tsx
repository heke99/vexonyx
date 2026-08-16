"use client";

import { useState } from "react";
import { FileUploader } from "./file-uploader";

type Project = { id: string; name: string };

export function FileLibraryUploader({ organizationId, projects }: { organizationId: string; projects: Project[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  if (!projects.length) return <div className="empty-state"><div><b>Create a project before uploading files.</b><p>Every file is attached to a project so authorization, evidence and reports stay traceable.</p></div></div>;

  return <div>
    <div className="workspace-form" style={{ paddingTop: 14 }}>
      <label style={{ display: "grid", gap: 6, minWidth: 240 }}><small>Project</small><select value={projectId} onChange={(event)=>setProjectId(event.target.value)}>{projects.map((project)=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    </div>
    {projectId ? <FileUploader organizationId={organizationId} projectId={projectId}/> : null}
  </div>;
}
