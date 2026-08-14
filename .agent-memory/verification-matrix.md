# Verification matrix

| Area | State | Evidence |
|---|---|---|
| Supabase migrations | applied | remote migration history through 20260814125944 |
| RLS enabled | verified | all VEXONYX app/domain/control tables report RLS enabled |
| Security advisor | reviewed | only intentional deny-all/no-policy control-plane INFO items |
| FK performance | remediated | covering-index migration applied for advisor findings |
| GitHub app build | pending CI | CI workflow included; do not mark green before run |
| Vercel deployment | pending | Vercel project did not exist at start |
| GPU inference | disabled | model aliases seeded disabled; manifest unverified |
| Tool execution | disabled | system state defaults external tools/sandbox/network false |
| Load/restore tests | pending | required before production/beta acceptance |
