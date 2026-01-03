import { replay } from "../ledger/reducer.js";
import type { DomainEvent } from "../ledger/events.js";
import { requiredWeeklyAmountCents } from "../challenges/engine.js";

/**
 * Returns the challenge entity or null if missing.
 */
export function selectChallenge(
  events: DomainEvent[],
  challengeId: string
) {
  const state = replay(events);
  return state.challenges[challengeId] ?? null;
}

/**
 * Returns the next required weekly amount in cents,
 * or null if not actionable.
 */
export function selectChallengeNextRequiredAmount(
  events: DomainEvent[],
  challengeId: string
): number | null {
  const state = replay(events);
  const ch = state.challenges[challengeId];
  const total = state.challengeTotals[challengeId];

  if (!ch || total === undefined) return null;
  if (ch.status !== "ACTIVE") return null;
  if (ch.weekIndex >= 52) return null;

  return requiredWeeklyAmountCents(ch);
}

/**
 * Returns all transfers that are still pending action.
 */
export function selectPendingTransfers(events: DomainEvent[]) {
  const state = replay(events);
  return Object.values(state.transfers).filter(
    (t) => t.status === "REQUESTED"
  );
}

export function selectChallengeSummary(
    events: DomainEvent[],
    challengeId: string
  ): {
    challenge: unknown;
    status: string;
    weekIndex: number;
    totalSavedCents: number;
    nextRequiredCents: number | null;
  } | null {
    const state = replay(events);
    const ch = state.challenges[challengeId];
    const total = state.challengeTotals[challengeId];
  
    if (!ch || total === undefined) return null;
  
    const actionable = ch.status === "ACTIVE" && ch.weekIndex < 52;
  
    return {
      challenge: ch,
      status: ch.status,
      weekIndex: ch.weekIndex,
      totalSavedCents: total,
      nextRequiredCents: actionable ? requiredWeeklyAmountCents(ch) : null
    };
  }
  