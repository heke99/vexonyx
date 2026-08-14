# Queue stuck

Check queue depth, oldest available job, active leases, dead letters and worker health. Never manually duplicate a leased job. Expired leases are reclaimed through fencing generation so stale workers cannot complete them. Pause low-priority work if interactive jobs are impacted. After recovery verify enqueue → claim → renew → complete and confirm no duplicate external side effects.