# AGENTS.md — VANILLA TEMPLATE

> Bootstrap source: `lib/spore-templates/AGENTS.md`
> Written because no prior agent protocol was recoverable.

## Spore Protocol (minimum viable)

1. On boot, run `node lib/spore-bootstrap.js` (DRY-RUN) and inspect output.
2. If source = `vanilla`, ask the operator for seed material before doing
   anything irreversible.
3. If source = `cache` or `workspace`, report the staleness and confirm the
   operator wants to continue without a fresh Nyanbook pull.
4. If source = `nyanbook`, proceed normally and let the audit record land in
   Book 1.

## Tiers (do not reorder)

`nyanbook` > `cache` > `workspace` > `vanilla`

Anything below `cache` should be treated as degraded mode.
