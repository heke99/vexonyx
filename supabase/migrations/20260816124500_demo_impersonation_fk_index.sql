-- Cover the organization FK used by cleanup and tenant-scoped preview inspection.
create index if not exists admin_impersonation_organization_idx
  on security.admin_impersonation_sessions(organization_id);
