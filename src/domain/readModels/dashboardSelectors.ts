import { replay } from "../ledger/reducer.js";
import type { DomainEvent } from "../ledger/events.js";
import type { Cents } from "../shared/money.js";

type PendingTransfer = {
  transferId: string;
  status: "REQUESTED";
  reason: string;
  amountCents: Cents;
};

export function selectDashboard(events: DomainEvent[]) {
  const state = replay(events);

  const vaults = Object.entries(state.vaults).map(([id, v]) => ({
    ...v, // spread first so we don't duplicate id
    id,
    balanceCents: state.vaultBalances[id] ?? (0 as Cents)
  }));

  const debts = Object.entries(state.debts).map(([id, d]: any) => ({
    ...d,
    id,
    // source of truth is debtBalances; reducer may also mirror it
    balanceCents: state.debtBalances[id] ?? d.balanceCents ?? (0 as Cents)
  }));

  const challenges = Object.entries(state.challenges).map(([id, ch]) => ({
    ...ch,
    id,
    totalSavedCents: state.challengeTotals[id] ?? (0 as Cents)
  }));

  const pendingTransfers: PendingTransfer[] = Object.entries(state.transfers)
    .filter(([, t]) => t.status === "REQUESTED")
    .map(([transferId, t]) => ({
      transferId,
      status: "REQUESTED",
      reason: t.reason,
      amountCents: t.amountCents
    }));

  return { vaults, debts, challenges, pendingTransfers };
}
