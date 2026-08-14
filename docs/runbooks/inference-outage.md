# Inference outage

1. Confirm workspace/API/database health separately from AI health.
2. Disable new generation routing or mark AI degraded; do not disable project reads.
3. Drain or retain queued interactive work according to retry policy; avoid retry storms.
4. Check inference deployment health and provider status without exposing endpoint secrets.
5. Restore a previous known-good model/deployment if the outage follows a rollout.
6. Verify chat acknowledgement, queue latency and one synthetic generation before normal mode.
7. Record incident timeline and affected request IDs.