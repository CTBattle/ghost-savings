import type { DomainEvent } from "./events.js";
import type { Cents } from "../shared/money.js";
import { money } from "../shared/money.js";
import type { Vault, VaultKind } from "../vaults/types.js";
import type { Challenge, ChallengeStatus } from "../challenges/types.js";
import type { Debt } from "../debts/types.js";

type TransferReason =
  | "VAULT_DEPOSIT"
  | "VAULT_WITHDRAW"
  | "CHALLENGE_WEEKLY_AUTO_WITHDRAW"
  | "GHOST_DEBT_PAY"
  | "GHOST_DEBT_SPLIT_PAY";

export type DomainState = {
  vaults: Record<string, Omit<Vault, "balanceCents">>;
  vaultBalances: Record<string, Cents>;

  challenges: Record<string, Omit<Challenge, "totalSavedCents">>;
  challengeTotals: Record<string, Cents>;

  // ✅ NEW: debts
  debts: Record<string, Omit<Debt, "balanceCents">>;
  debtBalances: Record<string, Cents>;

  transfers: Record<
    string,
    {
      status: "REQUESTED" | "SUCCEEDED" | "FAILED";
      reason: TransferReason;
      amountCents: Cents;
    }
  >;
};

export function emptyState(): DomainState {
  return {
    vaults: {},
    vaultBalances: {},
    challenges: {},
    challengeTotals: {},
    debts: {},
    debtBalances: {},
    transfers: {}
  };
}

function ensureVault(state: DomainState, vaultId: string): void {
  if (!state.vaults[vaultId] || state.vaultBalances[vaultId] === undefined) {
    throw new Error(`Vault not found in state: ${vaultId}`);
  }
}

function ensureChallenge(state: DomainState, challengeId: string): void {
  if (!state.challenges[challengeId] || state.challengeTotals[challengeId] === undefined) {
    throw new Error(`Challenge not found in state: ${challengeId}`);
  }
}

// ✅ NEW
function ensureDebt(state: DomainState, debtId: string): void {
  if (!state.debts[debtId] || state.debtBalances[debtId] === undefined) {
    throw new Error(`Debt not found in state: ${debtId}`);
  }
}

function ensureTransfer(state: DomainState, transferId: string): void {
  if (!state.transfers[transferId]) {
    throw new Error(`Transfer not found in state: ${transferId}`);
  }
}

/**
 * Keep state.debts[*] and state.debtBalances in sync for callers/tests.
 * Tests (and some UI) expect debts[id].balanceCents to exist.
 * Source-of-truth remains debtBalances, but we mirror it onto the debt object.
 */
function mirrorDebtBalances(state: DomainState): DomainState {
  const debtIds = Object.keys(state.debts);
  if (!debtIds.length) return state;

  let changed = false;
  const nextDebts: DomainState["debts"] = { ...state.debts };

  for (const debtId of debtIds) {
    const bal = state.debtBalances?.[debtId];
    const d: any = nextDebts[debtId];
    if (!d) continue;

    // If we have a balance entry, ensure debts[*].balanceCents matches it.
    if (typeof bal === "number") {
      if (d.balanceCents !== bal) {
        nextDebts[debtId] = { ...d, balanceCents: bal };
        changed = true;
      }
      continue;
    }

    // Fallback: if reducer was given a debt without a balance entry somehow,
    // try to keep a numeric balanceCents present if remainingCents exists.
    const fallback = d.balanceCents ?? d.remainingCents;
    if (typeof fallback === "number" && d.balanceCents !== fallback) {
      nextDebts[debtId] = { ...d, balanceCents: fallback };
      changed = true;
    }
  }

  return changed ? { ...state, debts: nextDebts } : state;
}

export function applyEvent(state: DomainState, event: DomainEvent): DomainState {
  switch (event.type) {
    case "VAULT_CREATED": {
      const kind: VaultKind = event.kind;
      return {
        ...state,
        vaults: {
          ...state.vaults,
          [event.vaultId]: { id: event.vaultId, name: event.name, kind }
        },
        vaultBalances: {
          ...state.vaultBalances,
          [event.vaultId]: 0
        }
      };
    }

    case "VAULT_DEPOSITED": {
      ensureVault(state, event.vaultId);
      const current = state.vaultBalances[event.vaultId];
      return {
        ...state,
        vaultBalances: {
          ...state.vaultBalances,
          [event.vaultId]: money.add(current, event.amountCents)
        }
      };
    }

    case "VAULT_WITHDRAWN": {
      ensureVault(state, event.vaultId);
      const current = state.vaultBalances[event.vaultId];
      return {
        ...state,
        vaultBalances: {
          ...state.vaultBalances,
          [event.vaultId]: money.sub(current, event.amountCents)
        }
      };
    }

    case "CHALLENGE_STARTED": {
      return {
        ...state,
        challenges: {
          ...state.challenges,
          [event.challengeId]: {
            id: event.challengeId,
            startDate: event.date,
            startAmountCents: event.startAmountCents,
            weekIndex: 0,
            status: "ACTIVE"
          }
        },
        challengeTotals: {
          ...state.challengeTotals,
          [event.challengeId]: 0
        }
      };
    }

    case "CHALLENGE_WEEK_SUCCESS": {
      ensureChallenge(state, event.challengeId);
      const ch = state.challenges[event.challengeId];
      const total = state.challengeTotals[event.challengeId];

      if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");

      return {
        ...state,
        challenges: {
          ...state.challenges,
          [event.challengeId]: { ...ch, weekIndex: ch.weekIndex + 1 }
        },
        challengeTotals: {
          ...state.challengeTotals,
          [event.challengeId]: money.add(total, event.amountCents)
        }
      };
    }

    case "CHALLENGE_FAILED":
    case "CHALLENGE_QUIT": {
      ensureChallenge(state, event.challengeId);
      const ch = state.challenges[event.challengeId];

      const status: ChallengeStatus =
        event.type === "CHALLENGE_FAILED" ? "FAILED" : "QUIT";

      return {
        ...state,
        challenges: {
          ...state.challenges,
          [event.challengeId]: { ...ch, status }
        }
      };
    }

    // ─────────────────────────────────────────
    // ✅ Debts
    // ─────────────────────────────────────────
    case "DEBT_CREATED": {
      // Store non-balance fields in debts, and balance in debtBalances,
      // but also mirror balanceCents onto the debt object so callers/tests
      // can rely on debts[id].balanceCents existing.
      const baseDebt = {
        id: event.debtId,
        name: event.name,
        minimumPaymentCents: event.minimumPaymentCents ?? 0
      };

      return mirrorDebtBalances({
        ...state,
        debts: {
          ...state.debts,
          [event.debtId]: { ...baseDebt, balanceCents: event.balanceCents } as any
        },
        debtBalances: {
          ...state.debtBalances,
          [event.debtId]: event.balanceCents
        }
      });
    }

    case "DEBT_PAYMENT_APPLIED": {
      ensureDebt(state, event.debtId);
      const current = state.debtBalances[event.debtId];

      const next = {
        ...state,
        debtBalances: {
          ...state.debtBalances,
          [event.debtId]: money.sub(current, event.amountCents)
        }
      };

      return mirrorDebtBalances(next);
    }

    // ─────────────────────────────────────────
    // Transfers (intent + outcome)
    // ─────────────────────────────────────────
    case "TRANSFER_REQUESTED": {
      return {
        ...state,
        transfers: {
          ...state.transfers,
          [event.transferId]: {
            status: "REQUESTED",
            reason: event.reason as TransferReason,
            amountCents: event.amountCents
          }
        }
      };
    }

    case "TRANSFER_SUCCEEDED": {
      ensureTransfer(state, event.transferId);
      const t = state.transfers[event.transferId];
      return {
        ...state,
        transfers: {
          ...state.transfers,
          [event.transferId]: { ...t, status: "SUCCEEDED" }
        }
      };
    }

    case "TRANSFER_FAILED": {
      ensureTransfer(state, event.transferId);
      const t = state.transfers[event.transferId];
      return {
        ...state,
        transfers: {
          ...state.transfers,
          [event.transferId]: { ...t, status: "FAILED" }
        }
      };
    }

    default: {
      const _exhaustive: never = event;
      return state;
    }
  }
}

export function replay(events: DomainEvent[]): DomainState {
  // Reduce events then ensure a final sync so debts[*].balanceCents is always present.
  const state = events.reduce(applyEvent, emptyState());
  return mirrorDebtBalances(state);
}
