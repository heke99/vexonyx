# Database outage runbook

Treat PostgreSQL as authoritative durable state. Fail writes closed, avoid accepting side effects that cannot be checkpointed/audited, keep static marketing/health messaging available, restore database service, verify migration state and tenant isolation, then reconcile queues before resuming agents.
