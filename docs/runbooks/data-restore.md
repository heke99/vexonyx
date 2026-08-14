# Data restore

Restore into an isolated recovery environment first. Apply/version-check migrations, restore PostgreSQL and object-storage inventory, then validate row counts, foreign keys, RLS, organization isolation and representative file hashes. Run application smoke tests before cutover. Document RPO/RTO achieved. A backup is not considered proven until this restore procedure succeeds.