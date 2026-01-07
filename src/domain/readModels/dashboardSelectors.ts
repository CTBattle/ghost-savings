import { replay } from "../ledger/reducer.js";
import type { DomainEvent } from "../ledger/events.js";
import type { Cents } from "../shared/money.js";
import type { VaultKind } from "../vaults/types.js";

function formatVaultKind(kind: VaultKind): {
  kindType: VaultKind["type"];
  kindLabel: string;
} {
  switch (kind.type) {
    case "UNTIL_NEED":
      return {
        kindType: kind.type,
        kindLabel: "Emergency Savings",
      };

    case "GOAL_BASED":
      return {
        kindType: kind.type,
        kindLabel: "Goal Savings",
      };

    case "TIMED":
      return {
        kindType: kind.type,
        kindLabel: "Timed Vault",
      };
  }
}

type PendingTransfer = {
  transferId: string;
  status: "REQUESTED";
  reason: string;
  amountCents: Cents;
};

export function selectDashboard(events: DomainEvent[]) {
  const state = replay(events);

  // ✅ Explicit DTO: do NOT spread v, otherwise we leak the domain `kind` object
  const vaults = Object.entries(state.vaults).map(([id, v]) => {
    const { kindType, kindLabel } = formatVaultKind(v.kind);

    return {
      id,
      name: v.name,
      balanceCents: state.vaultBalances[id] ?? (0 as Cents),
      kindType,
      kindLabel,
    };
  });

  const debts = Object.entries(state.debts).map(([id, d]: any) => ({
    ...d,
    id,
    // source of truth is debtBalances; reducer may also mirror it
    balanceCents: state.debtBalances[id] ?? d.balanceCents ?? (0 as Cents),
  }));

  const challenges = Object.entries(state.challenges).map(([id, ch]) => ({
    ...ch,
    id,
    totalSavedCents: state.challengeTotals[id] ?? (0 as Cents),
  }));

  const pendingTransfers: PendingTransfer[] = Object.entries(state.transfers)
    .filter(([, t]) => t.status === "REQUESTED")
    .map(([transferId, t]) => ({
      transferId,
      status: "REQUESTED",
      reason: t.reason,
      amountCents: t.amountCents,
    }));

  return { vaults, debts, challenges, pendingTransfers };
}
