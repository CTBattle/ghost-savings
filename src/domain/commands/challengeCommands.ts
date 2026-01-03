import type { DomainEvent } from "../ledger/events.js";
import { replay } from "../ledger/reducer.js";
import type { ISODate } from "../shared/dates.js";
import type { Cents } from "../shared/money.js";
import {
  applyAutoWithdrawSuccess,
  failMissedWithdraw,
  quitChallenge
} from "../challenges/engine.js";
import type { ChallengeEvent } from "../challenges/types.js";

function assertAutoWithdrawSuccess(
  e: ChallengeEvent
): asserts e is Extract<ChallengeEvent, { type: "AUTO_WITHDRAW_SUCCESS" }> {
  if (e.type !== "AUTO_WITHDRAW_SUCCESS") {
    throw new Error(`Expected AUTO_WITHDRAW_SUCCESS, got ${e.type}`);
  }
}

export function startChallengeEvents(
  challengeId: string,
  startAmountCents: Cents,
  date: ISODate
): DomainEvent[] {
  if (startAmountCents <= 0) throw new Error("Start amount must be > 0.");
  return [{ type: "CHALLENGE_STARTED", challengeId, startAmountCents, date }];
}

export function challengeWeekSuccessEvents(
  events: DomainEvent[],
  challengeId: string,
  date: ISODate
): DomainEvent[] {
  const state = replay(events);
  const ch = state.challenges[challengeId];
  const total = state.challengeTotals[challengeId];

  if (!ch || total === undefined) throw new Error("Challenge not found.");
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");

  // Engine expects Challenge to include totalSavedCents
  const full = { ...ch, totalSavedCents: total };
  const { challenge, event } = applyAutoWithdrawSuccess(full, date);

  // ✅ Narrow before reading amountCents
  assertAutoWithdrawSuccess(event);

  return [
    {
      type: "CHALLENGE_WEEK_SUCCESS",
      challengeId,
      amountCents: event.amountCents,
      weekIndex: challenge.weekIndex - 1,
      date
    }
  ];
}

export function challengeFailEvents(
  events: DomainEvent[],
  challengeId: string,
  date: ISODate
): DomainEvent[] {
  const state = replay(events);
  const ch = state.challenges[challengeId];
  const total = state.challengeTotals[challengeId];

  if (!ch || total === undefined) throw new Error("Challenge not found.");
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");

  const full = { ...ch, totalSavedCents: total };
  const { event } = failMissedWithdraw(full, date);

  if (event.type !== "AUTO_WITHDRAW_MISSED_FAIL") {
    throw new Error(`Unexpected event type: ${event.type}`);
  }

  return [
    {
      type: "CHALLENGE_FAILED",
      challengeId,
      penaltyCents: event.penaltyCents,
      redirectedToVaultCents: event.redirectedToVaultCents,
      date
    }
  ];
}

export function challengeQuitEvents(
  events: DomainEvent[],
  challengeId: string,
  date: ISODate
): DomainEvent[] {
  const state = replay(events);
  const ch = state.challenges[challengeId];
  const total = state.challengeTotals[challengeId];

  if (!ch || total === undefined) throw new Error("Challenge not found.");
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");

  const full = { ...ch, totalSavedCents: total };
  const { event } = quitChallenge(full, date);

  if (event.type !== "USER_QUIT") {
    throw new Error(`Unexpected event type: ${event.type}`);
  }

  return [
    {
      type: "CHALLENGE_QUIT",
      challengeId,
      penaltyCents: event.penaltyCents,
      redirectedToVaultCents: event.redirectedToVaultCents,
      date
    }
  ];
}
