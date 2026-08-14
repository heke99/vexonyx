# Prompt rollback

Freeze promotion of the suspect prompt version, identify affected generations through `prompt_version`, and switch routing/configuration to the previous good prompt without a code rollback. Run prompt-injection, structured-output, citations and representative task evals. Restore canary only after evidence is green. Audit the activation and rollback with actor and reason.