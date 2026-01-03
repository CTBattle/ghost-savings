import type { DomainEvent } from "../ledger/events.js";
import { replay } from "../ledger/reducer.js";
import { computeWithdrawal } from "../vaults/rules.js";
import type { VaultKind } from "../vaults/types.js";
import type { ISODate } from "../shared/dates.js";
import type { Cents } from "../shared/money.js";

export function createVaultEvent(vaultId: string, name: string, kind: VaultKind, date: ISODate): DomainEvent[] {
  return [{ type: "VAULT_CREATED", vaultId, name, kind, date }];
}

export function depositVaultEvents(events: DomainEvent[], vaultId: string, amountCents: Cents, date: ISODate): DomainEvent[] {
  if (amountCents <= 0) throw new Error("Deposit must be > 0.");

  const state = replay(events);
  if (!state.vaults[vaultId]) throw new Error("Vault not found.");

  return [{ type: "VAULT_DEPOSITED", vaultId, amountCents, date }];
}

export function withdrawVaultEvents(events: DomainEvent[], vaultId: string, withdrawCents: Cents, date: ISODate): DomainEvent[] {
  const state = replay(events);
  const meta = state.vaults[vaultId];
  const balance = state.vaultBalances[vaultId];

  if (!meta || balance === undefined) throw new Error("Vault not found.");
  if (withdrawCents <= 0) throw new Error("Withdrawal must be > 0.");
  if (withdrawCents > balance) throw new Error("Insufficient vault balance.");

  const vaultForRules = { ...meta, balanceCents: balance };
  const decision = computeWithdrawal(vaultForRules, withdrawCents, date);
  if (!decision.allowed) throw new Error(decision.reason);

  return [
    { type: "VAULT_WITHDRAWN", vaultId, amountCents: withdrawCents, penaltyCents: decision.penaltyCents, date }
  ];
}
