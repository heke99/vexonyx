# Model rollback runbook

Stop new traffic to the candidate deployment, drain in-flight generations, restore the previous-good model version in routing/deployment configuration, run health + regression evals, then record the rollback and reason. Model rollback must not require a database schema rollback.
