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

  const amountCents = event.amountCents;

  // ✅ Deterministic transfer id (stable for a given week/date)
  // Note: challenge.weekIndex is the NEXT week index after applying success.
  const transferId = `t_${challengeId}_${challenge.weekIndex}_${date}`;

  return [
    // 1) Challenge progression
    {
      type: "CHALLENGE_WEEK_SUCCESS",
      challengeId,
      amountCents,
      weekIndex: challenge.weekIndex - 1,
      date
    },

    // 2) Transfer boundary (intent)
    {
      type: "TRANSFER_REQUESTED",
      transferId,
      userId: "u1",
      fromAccountId: `challenge:${challengeId}`,
      toAccountId: "vault:v1", // ✅ Emergency vault
      amountCents,
      reason: "CHALLENGE_WEEKLY_AUTO_WITHDRAW",
      date
    },

    // 3) Transfer outcome (simulated success for now)
    {
      type: "TRANSFER_SUCCEEDED",
      transferId,
      providerRef: `sim_${transferId}`,
      date
    },

    // 4) Vault effect
    {
      type: "VAULT_DEPOSITED",
      vaultId: "v1",
      amountCents,
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

// -------------------------
// Catch-up helpers (TOP-LEVEL)
// -------------------------

function isoToDate(iso: ISODate): Date {
  // ISODate is YYYY-MM-DD; make it UTC-safe
  return new Date(`${iso}T00:00:00.000Z`);
}

function addDaysIso(start: ISODate, days: number): ISODate {
  const d = isoToDate(start);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) as ISODate;
}

function weeksElapsed(start: ISODate, today: ISODate): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(
    (isoToDate(today).getTime() - isoToDate(start).getTime()) / msPerDay
  );
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7);
}

/**
 * Generate missing CHALLENGE_WEEK_SUCCESS events up to `today`.
 * Pure event-sourcing: returns events; caller decides to append/persist.
 *
 * ✅ Improvement: each weekly success event is stamped with its "real" week date:
 *   startDate + 7 days, +14 days, +21 days, ...
 */
export function catchUpChallengeWeekSuccessEvents(
  events: DomainEvent[],
  challengeId: string,
  today: ISODate
): DomainEvent[] {
  const state = replay(events);
  const ch = state.challenges[challengeId];

  if (!ch) throw new Error("Challenge not found.");
  if (ch.status !== "ACTIVE") return []; // no catch-up for inactive challenges

  const shouldBeWeekIndex = weeksElapsed(ch.startDate, today);
  const currentWeekIndex = ch.weekIndex;

  const missing = shouldBeWeekIndex - currentWeekIndex;
  if (missing <= 0) return [];

  // Build events iteratively so engine/replay stays consistent each week.
  let allEvents = events.slice();
  const out: DomainEvent[] = [];

  for (let i = 0; i < missing; i++) {
    // week 1 completes at startDate + 7 days, week 2 at +14 days, etc.
    const nextWeekNumber = currentWeekIndex + i + 1; // 1-based completion count
    const eventDate = addDaysIso(ch.startDate, nextWeekNumber * 7);

    const next = challengeWeekSuccessEvents(allEvents, challengeId, eventDate);
    out.push(...next);
    allEvents = allEvents.concat(next);
  }

  return out;
}
