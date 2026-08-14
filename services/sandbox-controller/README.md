# Sandbox Controller

Future isolated scheduler for scope-bound tool jobs. It must not run on Vercel and must not share the GPU inference trust boundary.

Before activation: authorization re-check, scope normalization, approval gate, egress policy, resource limits, image digest pinning, idempotency/fencing and kill-switch verification are required.
