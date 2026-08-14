#!/usr/bin/env bash
set -euo pipefail
ALIAS="${1:-}"; REVISION="${2:-}"; ROOT="${MODEL_ROOT:-/models}"
if [[ -z "$ALIAS" || -z "$REVISION" ]]; then echo "usage: download-model.sh <model-alias> <revision>" >&2; exit 2; fi
case "$ALIAS" in
  vexonyx-small) REPO="huihui-ai/Huihui-gemma-4-12B-agentic-fable5-abliterated";;
  vexonyx-general) REPO="huihui-ai/Huihui-Qwen3.6-27B-abliterated";;
  vexonyx-security) REPO="huihui-ai/Huihui-CyberStrike-OffSec-35B-abliterated";;
  vexonyx-reasoning) REPO="huihui-ai/Huihui-GLM-5.2-abliterated-GGUF";;
  vexonyx-embedding) REPO="Qwen/Qwen3-Embedding-4B";;
  *) echo "unknown alias" >&2; exit 2;;
esac
command -v hf >/dev/null || { echo "hf CLI required" >&2; exit 3; }
[[ -n "${HF_TOKEN:-}" ]] || { echo "HF_TOKEN required" >&2; exit 4; }
DEST="$ROOT/$ALIAS"; mkdir -p "$DEST"
hf download "$REPO" --revision "$REVISION" --local-dir "$DEST"
printf '{"alias":"%s","source":"%s","revision":"%s","downloadedAt":"%s"}\n' "$ALIAS" "$REPO" "$REVISION" "$(date -u +%FT%TZ)" > "$DEST/download-manifest.json"
test -s "$DEST/download-manifest.json"
