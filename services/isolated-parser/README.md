# VEXONYX isolated parser

This service is the execution boundary for risky customer documents and archives. It is intentionally separate from the Next.js application and from future agent/tool sandboxes.

## Runtime contract

Production MUST run the pinned image with:

- `--network=none` (no DNS, no outbound or inbound application network)
- read-only root filesystem
- non-root UID 10001
- no new privileges; drop all Linux capabilities
- seccomp/AppArmor or equivalent hardened profile
- explicit CPU, memory, PID, disk and wall-clock limits from `artifacts.parser_jobs`
- exactly one input file mounted read-only and one bounded output channel
- a fresh container/VM per task; destroy after result collection
- immutable image digest and parser version recorded on every job

The parser does not execute macros, JavaScript, embedded programs, URLs, archive content or document actions. Archives are inventoried without extraction. DOCX is read as bounded OOXML. PDF parsing supports a safe text-only subset and fails closed on unsupported filters/content.

## Worker flow

1. Main file-processing worker classifies a risky format and inserts `artifacts.parser_jobs`.
2. Isolated scheduler claims one job and downloads the private object outside this container.
3. Scheduler mounts it as `/input/document` read-only and runs this image with `--network=none`.
4. `parser.py` emits one bounded JSON object to stdout.
5. Scheduler validates the JSON schema and size before writing sanitized text/chunks back to Supabase.
6. Raw input is never made public and the isolated runtime is destroyed.

Example local invocation:

```sh
docker run --rm --network=none --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --memory=512m --cpus=1 --pids-limit=64 \
  -v "$PWD/sample.pdf:/input/document:ro" \
  vexonyx-isolated-parser --input /input/document --mime application/pdf --name sample.pdf
```

Production scheduling remains disabled until the isolated compute environment enforces this contract end-to-end.
