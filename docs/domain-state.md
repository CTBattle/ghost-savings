# Domain State Shape (Event-Sourced)

This project uses event sourcing: **DomainEvents are the source of truth** and `replay(events)` derives the current `DomainState`.

## Balances live in separate maps

For entities with balances (vaults, challenges, debts), balances are stored in dedicated maps:

- `vaultBalances[vaultId]`
- `challengeTotals[challengeId]`
- `debtBalances[debtId]`

This keeps balance mutation logic centralized in the reducer and avoids mixing derived numeric totals into metadata objects.

## Why debts[*].balanceCents exists too (mirroring)

Some tests/UI read balances via:

- `state.debts[id].balanceCents`

However, the canonical balance is `state.debtBalances[id]`.

To keep the state ergonomic and compatible with callers, `replay()` mirrors:

- `debtBalances[id] → debts[id].balanceCents`

**Important:** The mirrored `balanceCents` is not independently authoritative; it must always reflect `debtBalances`.

## Ghost Debt commands: async transfer semantics

Ghost Pay and Ghost Split Pay are modeled as two-step flows:

1. `TRANSFER_REQUESTED` (no balance change)
2. On success: `TRANSFER_SUCCEEDED` + `DEBT_PAYMENT_APPLIED` (balance changes)

Rules:
- No debt balance changes until transfer succeeds
- Idempotency: cannot apply a transfer success twice
- No overpayment: debt payments are capped to remaining balance

