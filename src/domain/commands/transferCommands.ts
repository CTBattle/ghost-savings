import type { DomainEvent } from "../ledger/events.js";
import { replay } from "../ledger/reducer.js";
import type { ISODate } from "../shared/dates.js";
import type { Cents } from "../shared/money.js";
import { computeWithdrawal } from "../vaults/rules.js";

/**
 * Request a deposit transfer INTO the vault.
 * This does NOT change vault balance yet.
 */
export function requestVaultDepositTransfer(
  events: DomainEvent[],
  params: {
    transferId: string;
    userId: string;
    vaultId: string;
    fromAccountId: string; // user bank account
    toAccountId: string;   // vault account
    amountCents: Cents;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  if (!state.vaults[params.vaultId]) throw new Error("Vault not found.");
  if (params.amountCents <= 0) throw new Error("Deposit must be > 0.");

  return [
    {
      type: "TRANSFER_REQUESTED",
      transferId: params.transferId,
      userId: params.userId,
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId,
      amountCents: params.amountCents,
      reason: "VAULT_DEPOSIT",
      date: params.date
    }
  ];
}

/**
 * Apply deposit only AFTER transfer success.
 * Emits TRANSFER_SUCCEEDED + VAULT_DEPOSITED.
 */
export function applyVaultDepositAfterTransferSuccess(
  events: DomainEvent[],
  params: {
    transferId: string;
    providerRef: string;
    vaultId: string;
    amountCents: Cents;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const t = state.transfers[params.transferId];
  if (!t) throw new Error("Transfer not found.");
  if (t.status !== "REQUESTED") throw new Error("Transfer is not in REQUESTED state.");
  if (t.reason !== "VAULT_DEPOSIT") throw new Error("Transfer reason mismatch.");

  if (!state.vaults[params.vaultId]) throw new Error("Vault not found.");

  return [
    {
      type: "TRANSFER_SUCCEEDED",
      transferId: params.transferId,
      providerRef: params.providerRef,
      date: params.date
    },
    {
      type: "VAULT_DEPOSITED",
      vaultId: params.vaultId,
      amountCents: params.amountCents,
      date: params.date
    }
  ];
}

/**
 * Request a withdrawal transfer OUT of the vault.
 * This does NOT change vault balance yet.
 */
export function requestVaultWithdrawTransfer(
  events: DomainEvent[],
  params: {
    transferId: string;
    userId: string;
    vaultId: string;
    fromAccountId: string; // vault account
    toAccountId: string;   // user bank account
    amountCents: Cents;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const meta = state.vaults[params.vaultId];
  const balance = state.vaultBalances[params.vaultId];

  if (!meta || balance === undefined) throw new Error("Vault not found.");
  if (params.amountCents <= 0) throw new Error("Withdrawal must be > 0.");
  if (params.amountCents > balance) throw new Error("Insufficient vault balance.");

  // Compute penalty now (rules-based), but do not apply withdrawal until transfer success.
  const vaultForRules = { ...meta, balanceCents: balance };
  const decision = computeWithdrawal(vaultForRules, params.amountCents, params.date);
  if (!decision.allowed) throw new Error(decision.reason);

  return [
    {
      type: "TRANSFER_REQUESTED",
      transferId: params.transferId,
      userId: params.userId,
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId,
      amountCents: params.amountCents,
      reason: "VAULT_WITHDRAW",
      date: params.date
    }
  ];
}

/**
 * Apply withdrawal only AFTER transfer success.
 * Emits TRANSFER_SUCCEEDED + VAULT_WITHDRAWN.
 */
export function applyVaultWithdrawAfterTransferSuccess(
  events: DomainEvent[],
  params: {
    transferId: string;
    providerRef: string;
    vaultId: string;
    amountCents: Cents;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const t = state.transfers[params.transferId];
  if (!t) throw new Error("Transfer not found.");
  if (t.status !== "REQUESTED") throw new Error("Transfer is not in REQUESTED state.");
  if (t.reason !== "VAULT_WITHDRAW") throw new Error("Transfer reason mismatch.");

  const meta = state.vaults[params.vaultId];
  const balance = state.vaultBalances[params.vaultId];
  if (!meta || balance === undefined) throw new Error("Vault not found.");

  // Recompute penalty at success time (deterministic given same state/date)
  const vaultForRules = { ...meta, balanceCents: balance };
  const decision = computeWithdrawal(vaultForRules, params.amountCents, params.date);
  if (!decision.allowed) throw new Error(decision.reason);

  return [
    {
      type: "TRANSFER_SUCCEEDED",
      transferId: params.transferId,
      providerRef: params.providerRef,
      date: params.date
    },
    {
      type: "VAULT_WITHDRAWN",
      vaultId: params.vaultId,
      amountCents: params.amountCents,
      penaltyCents: decision.penaltyCents,
      date: params.date
    }
  ];
}
