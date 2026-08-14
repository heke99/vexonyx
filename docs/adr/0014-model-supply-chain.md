# ADR 0014 — Model supply chain

**Status:** accepted

No checkpoint reaches production from an unpinned `latest`. VEXONYX records source repository, license, revision, quantization source/checksum where possible, runtime, container digest, CUDA/runtime version, GPU architecture and model configuration. Download scripts require a revision and fail closed on verification errors. Model inventory and evaluation status remain queryable before rollout.