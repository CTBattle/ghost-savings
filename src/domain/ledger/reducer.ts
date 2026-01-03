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

/**
 * Tests expect debts[id].balanceCents to exist.
 * Some tests/fallback code also checks debts[id].remainingCents.
 *
 * We keep debtBalances as the source-of-truth, but we also store a "view"
 * object in debts that includes balanceCents (and remainingCents alias).
 */
type DebtView = Omit<Debt, "balanceCents"> & {
  balanceCents: Cents;
  remainingCents: Cents;
};

export type DomainState = {
  vaults: Record<string, Omit<Vault, "balanceCents">>;
  vaultBalances: Record<string, Cents>;

  challenges: Record<string, Omit<Challenge, "totalSavedCents">>;
  challengeTotals: Record<string, Cents>;

  // ✅ FIX: debts now include balanceCents + remainingCents so tests compile
  debts: Record<string, DebtView>;
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
      const view: DebtView = {
        id: event.debtId,
        name: event.name,
        minimumPaymentCents: event.minimumPaymentCents ?? 0,
        balanceCents: event.balanceCents,
        remainingCents: event.balanceCents
      };

      return {
        ...state,
        debts: {
          ...state.debts,
          [event.debtId]: view
        },
        debtBalances: {
          ...state.debtBalances,
          [event.debtId]: event.balanceCents
        }
      };
    }

    case "DEBT_PAYMENT_APPLIED": {
      ensureDebt(state, event.debtId);
      const current = state.debtBalances[event.debtId];
      const nextBal = money.sub(current, event.amountCents);

      return {
        ...state,
        debtBalances: {
          ...state.debtBalances,
          [event.debtId]: nextBal
        },
        debts: {
          ...state.debts,
          [event.debtId]: {
            ...state.debts[event.debtId],
            balanceCents: nextBal,
            remainingCents: nextBal
          }
        }
      };
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
  return events.reduce(applyEvent, emptyState());
}
