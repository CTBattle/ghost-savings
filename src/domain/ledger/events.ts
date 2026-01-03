import type { Cents } from "../shared/money.js";
import type { ISODate } from "../shared/dates.js";
import type { VaultId, VaultKind } from "../vaults/types.js";
import type { ChallengeId } from "../challenges/types.js";

/**
 * DomainEvent is the single source of truth for everything that happens.
 * State is always derived by replaying these events.
 */
export type DomainEvent =
  // ─────────────────────────────────────────
  // Vault lifecycle
  // ─────────────────────────────────────────
  | {
      type: "VAULT_CREATED";
      vaultId: VaultId;
      name: string;
      kind: VaultKind;
      date: ISODate;
    }
  | {
      type: "VAULT_DEPOSITED";
      vaultId: VaultId;
      amountCents: Cents;
      date: ISODate;
    }
  | {
      type: "VAULT_WITHDRAWN";
      vaultId: VaultId;
      amountCents: Cents;   // gross withdrawn
      penaltyCents: Cents;  // discipline/platform fee
      date: ISODate;
    }

  // ─────────────────────────────────────────
  // Challenge lifecycle
  // ─────────────────────────────────────────
  | {
      type: "CHALLENGE_STARTED";
      challengeId: ChallengeId;
      startAmountCents: Cents;
      date: ISODate;
    }
  | {
      type: "CHALLENGE_WEEK_SUCCESS";
      challengeId: ChallengeId;
      amountCents: Cents;
      weekIndex: number; // completed week index
      date: ISODate;
    }
  | {
      type: "CHALLENGE_FAILED";
      challengeId: ChallengeId;
      penaltyCents: Cents;
      redirectedToVaultCents: Cents;
      date: ISODate;
    }
  | {
      type: "CHALLENGE_QUIT";
      challengeId: ChallengeId;
      penaltyCents: Cents;
      redirectedToVaultCents: Cents;
      date: ISODate;
    }

  // ─────────────────────────────────────────
  // Transfer intents + outcomes (real money boundary)
  // ─────────────────────────────────────────
  | {
      type: "TRANSFER_REQUESTED";
      transferId: string;
      userId: string;
      fromAccountId: string;
      toAccountId: string;
      amountCents: Cents;
      reason: "VAULT_DEPOSIT" | "VAULT_WITHDRAW" | "CHALLENGE_WEEKLY_AUTO_WITHDRAW";
      date: ISODate;
    }
  | {
      type: "TRANSFER_SUCCEEDED";
      transferId: string;
      providerRef: string;
      date: ISODate;
    }
  | {
      type: "TRANSFER_FAILED";
      transferId: string;
      errorCode: string;
      message: string;
      date: ISODate;
    };
    type DebtPaymentApplied = {
        type: "DEBT_PAYMENT_APPLIED";
        debtId: string;
        amountCents: number;
        date: string;
        meta?: { source?: string; transferId?: string };
      };
      