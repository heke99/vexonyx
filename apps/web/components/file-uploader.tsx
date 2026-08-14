"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type UploadState = { kind: "idle" | "uploading" | "success" | "error"; message?: string };

export function FileUploader({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    if (file.size <= 0 || file.size > 100 * 1024 * 1024) {
      setState({ kind: "error", message: "Files must be between 1 byte and 100 MB." });
      return;
    }
    setState({ kind: "uploading", message: "Preparing secure upload…" });
    try {
      const response = await fetch("/api/v1/files/upload-ticket", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ organizationId, projectId, originalName: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      const ticket = await response.json() as { error?: string; bucket?: string; path?: string; token?: string };
      if (!response.ok || !ticket.bucket || !ticket.path || !ticket.token) throw new Error(ticket.error ?? "Unable to prepare the upload.");

      setState({ kind: "uploading", message: "Uploading securely…" });
      const supabase = createClient();
      const { error } = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (error) throw error;
      if (inputRef.current) inputRef.current.value = "";
      setState({ kind: "success", message: "Uploaded. VEXONYX will check the file before it becomes available for analysis." });
      router.refresh();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Upload failed." });
    }
  }

  return <form className="workspace-form" onSubmit={submit}>
    <input ref={inputRef} name="file" type="file" required aria-label="Choose file" />
    <button className="button" type="submit" disabled={state.kind === "uploading"}>{state.kind === "uploading" ? "Uploading…" : "Upload file"}</button>
    {state.message ? <p className={state.kind === "error" ? "form-error" : "form-note"} role="status">{state.message}</p> : null}
  </form>;
}
