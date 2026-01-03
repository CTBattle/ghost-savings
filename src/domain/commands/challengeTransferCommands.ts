import type { DomainEvent } from "../ledger/events.js";
import { replay } from "../ledger/reducer.js";
import type { ISODate } from "../shared/dates.js";
import type { Cents } from "../shared/money.js";
import { applyAutoWithdrawSuccess, failMissedWithdraw } from "../challenges/engine.js";

function percentOfCents(amount: Cents, percent: number): Cents {
  // integer-safe: amount * percent / 100
  return Math.floor((amount * percent) / 100);
}

/**
 * Request the weekly auto-withdraw transfer for a challenge.
 * No challenge state changes yet.
 */
export function requestChallengeWeeklyTransfer(
  events: DomainEvent[],
  params: {
    transferId: string;
    userId: string;
    challengeId: string;
    fromAccountId: string; // user bank account
    toAccountId: string;   // holding / internal account
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);
  const ch = state.challenges[params.challengeId];
  const total = state.challengeTotals[params.challengeId];

  if (!ch || total === undefined) throw new Error("Challenge not found.");
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");
  if (ch.weekIndex >= 52) throw new Error("Challenge is completed.");

  const full = { ...ch, totalSavedCents: total };
  const { event } = applyAutoWithdrawSuccess(full, params.date);

  return [
    {
      type: "TRANSFER_REQUESTED",
      transferId: params.transferId,
      userId: params.userId,
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId,
      amountCents: event.amountCents,
      reason: "CHALLENGE_WEEKLY_AUTO_WITHDRAW",
      date: params.date
    }
  ];
}

/**
 * Apply weekly success after transfer success.
 * Emits TRANSFER_SUCCEEDED + CHALLENGE_WEEK_SUCCESS.
 */
export function applyChallengeWeeklyAfterTransferSuccess(
  events: DomainEvent[],
  params: {
    transferId: string;
    providerRef: string;
    challengeId: string;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const t = state.transfers[params.transferId];
  if (!t) throw new Error("Transfer not found.");
  if (t.status !== "REQUESTED") throw new Error("Transfer is not in REQUESTED state.");
  if (t.reason !== "CHALLENGE_WEEKLY_AUTO_WITHDRAW") throw new Error("Transfer reason mismatch.");

  const ch = state.challenges[params.challengeId];
  const total = state.challengeTotals[params.challengeId];
  if (!ch || total === undefined) throw new Error("Challenge not found.");
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");
  if (ch.weekIndex >= 52) throw new Error("Challenge is completed.");

  const full = { ...ch, totalSavedCents: total };
  const { challenge, event } = applyAutoWithdrawSuccess(full, params.date);

  return [
    {
      type: "TRANSFER_SUCCEEDED",
      transferId: params.transferId,
      providerRef: params.providerRef,
      date: params.date
    },
    {
      type: "CHALLENGE_WEEK_SUCCESS",
      challengeId: params.challengeId,
      amountCents: event.amountCents,
      weekIndex: challenge.weekIndex - 1,
      date: params.date
    }
  ];
}

/**
 * Apply weekly failure after transfer fails.
 * Emits:
 * - TRANSFER_FAILED (weekly)
 * - CHALLENGE_FAILED (penalty + redirect amounts)
 * - TRANSFER_REQUESTED (redirect deposit into chosen vault)
 */
export function applyChallengeWeeklyAfterTransferFail(
  events: DomainEvent[],
  params: {
    transferId: string;
    userId: string;
    challengeId: string;

    // redirect destination
    redirectVaultId: string;
    redirectFromAccountId: string;
    redirectToAccountId: string;
    redirectTransferId: string;

    // failure info
    errorCode: string;
    message: string;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const t = state.transfers[params.transferId];
  if (!t) throw new Error("Transfer not found.");
  if (t.status !== "REQUESTED") throw new Error("Transfer is not in REQUESTED state.");
  if (t.reason !== "CHALLENGE_WEEKLY_AUTO_WITHDRAW") throw new Error("Transfer reason mismatch.");

  const ch = state.challenges[params.challengeId];
  const total = state.challengeTotals[params.challengeId];
  if (!ch || total === undefined) throw new Error("Challenge not found.");
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");
  if (ch.weekIndex >= 52) throw new Error("Challenge is completed.");

  if (!state.vaults[params.redirectVaultId]) throw new Error("Redirect vault not found.");

  const full = { ...ch, totalSavedCents: total };
  const { event } = failMissedWithdraw(full, params.date);
  if (event.type !== "AUTO_WITHDRAW_MISSED_FAIL") throw new Error("Unexpected event type.");

  const weeklyFailed: DomainEvent = {
    type: "TRANSFER_FAILED",
    transferId: params.transferId,
    errorCode: params.errorCode,
    message: params.message,
    date: params.date
  };

  const challengeFailed: DomainEvent = {
    type: "CHALLENGE_FAILED",
    challengeId: params.challengeId,
    penaltyCents: event.penaltyCents,
    redirectedToVaultCents: event.redirectedToVaultCents,
    date: params.date
  };

  const redirectRequested: DomainEvent = {
    type: "TRANSFER_REQUESTED",
    transferId: params.redirectTransferId,
    userId: params.userId,
    fromAccountId: params.redirectFromAccountId,
    toAccountId: params.redirectToAccountId,
    amountCents: event.redirectedToVaultCents,
    reason: "VAULT_DEPOSIT",
    date: params.date
  };

  return [weeklyFailed, challengeFailed, redirectRequested];
}

/**
 * User voluntarily quits an ACTIVE challenge.
 * Emits:
 * - CHALLENGE_QUIT (5% penalty, 95% redirected)
 * - TRANSFER_REQUESTED (redirect deposit into chosen vault)
 */
export function applyChallengeQuit(
  events: DomainEvent[],
  params: {
    userId: string;
    challengeId: string;

    redirectVaultId: string;
    redirectFromAccountId: string;
    redirectToAccountId: string;
    redirectTransferId: string;

    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const ch = state.challenges[params.challengeId];
  const total = state.challengeTotals[params.challengeId];
  if (!ch || total === undefined) throw new Error("Challenge not found.");
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");

  if (!state.vaults[params.redirectVaultId]) throw new Error("Redirect vault not found.");

  const penaltyCents = percentOfCents(total, 5);
  const redirectedToVaultCents = (total - penaltyCents) as Cents;

  const quitEvent: DomainEvent = {
    type: "CHALLENGE_QUIT",
    challengeId: params.challengeId,
    penaltyCents,
    redirectedToVaultCents,
    date: params.date
  };

  const redirectRequested: DomainEvent = {
    type: "TRANSFER_REQUESTED",
    transferId: params.redirectTransferId,
    userId: params.userId,
    fromAccountId: params.redirectFromAccountId,
    toAccountId: params.redirectToAccountId,
    amountCents: redirectedToVaultCents,
    reason: "VAULT_DEPOSIT",
    date: params.date
  };

  return [quitEvent, redirectRequested];
}

/**
 * Apply redirect deposit only AFTER redirect transfer succeeds.
 * Emits TRANSFER_SUCCEEDED + VAULT_DEPOSITED.
 */
export function applyChallengeRedirectAfterTransferSuccess(
  events: DomainEvent[],
  params: {
    redirectTransferId: string;
    providerRef: string;
    redirectVaultId: string;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const t = state.transfers[params.redirectTransferId];
  if (!t) throw new Error("Transfer not found.");
  if (t.status !== "REQUESTED") throw new Error("Transfer is not in REQUESTED state.");
  if (t.reason !== "VAULT_DEPOSIT") throw new Error("Transfer reason mismatch.");

  if (!state.vaults[params.redirectVaultId]) throw new Error("Redirect vault not found.");

  return [
    {
      type: "TRANSFER_SUCCEEDED",
      transferId: params.redirectTransferId,
      providerRef: params.providerRef,
      date: params.date
    },
    {
      type: "VAULT_DEPOSITED",
      vaultId: params.redirectVaultId,
      amountCents: t.amountCents,
      date: params.date
    }
  ];
}
