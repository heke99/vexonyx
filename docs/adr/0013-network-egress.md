# ADR 0013 — Network egress

**Status:** accepted

Future scope-bound execution receives network policy derived from the authorized target plus required support endpoints. Hostnames are normalized, resolved and checked against scope/exclusions and private/internal ranges for IPv4 and IPv6, with re-checks near connection time to reduce DNS-rebinding risk. Localhost, metadata endpoints and platform internals are denied unless an explicit isolated lab authorization covers them.