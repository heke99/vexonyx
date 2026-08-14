# VEXONYX Agent Memory

This directory is the canonical persistent progress system for AI-agent work
in VEXONYX.

Repository code, database schema, migrations, tests and executed runtime
verification always have higher authority than memory.

Before every non-trivial task read:

1. current-state.md
2. current-task.md
3. checkpoint.json
4. handover.md
5. open-blockers.md
6. work-plan.md
7. decisions.md
8. known-failures.md

Rules:

- Maintain one active work item at a time.
- Never mark work complete without verification.
- Update checkpoint after each meaningful atomic task.
- Record the exact next action.
- Never restart verified work merely because chat context was lost.
- Never store secrets, tokens, credentials or customer data here.
- If memory contradicts repository truth, repository truth wins.
- Mark stale memory as SUPERSEDED rather than silently trusting it.

Statuses:

NOT_STARTED
IN_PROGRESS
PARTIAL
BLOCKED
IMPLEMENTED_NOT_VERIFIED
VERIFIED
FAILED
SUPERSEDED
NOT_APPLICABLE
