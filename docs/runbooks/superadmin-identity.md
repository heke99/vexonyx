# Superadmin identity configuration

Superadmin email identities are production configuration and must not be committed to the public repository.

## Source of truth

- Table: `security.superadmin_identities`
- Access: service-role / database administration only
- Public, anonymous and authenticated roles have no table access
- `public.vexonyx_is_superadmin_email(text)` is callable only by the Auth service role and server service-role paths
- Public account creation remains blocked while VEXONYX is waitlist-only

## Rotation

To rotate the operator identity:

1. Add and activate the new normalized email in `security.superadmin_identities`.
2. Disable the previous identity.
3. Confirm `public.vexonyx_is_superadmin_email(...)` returns true only for the intended active identity.
4. If an old Auth account exists, remove its `app.profiles.is_superadmin` privilege.
5. Verify the new identity can request a magic link on `admin.vexonyx.com`.
6. Verify arbitrary addresses receive the same non-enumerating response but cannot create an Auth user.

Do not place real operator email addresses in source code, migrations, tests or documentation.
