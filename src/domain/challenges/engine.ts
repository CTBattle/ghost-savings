import type { Challenge, ChallengeEvent } from "./types.js";
import { money } from "../shared/money.js";

/** Required amount for current week: X * 2^(weekIndex) */
export function requiredWeeklyAmountCents(ch: Challenge): number {
  const multiplier = Math.pow(2, ch.weekIndex);
  return money.mul(ch.startAmountCents, multiplier);
}

export function applyAutoWithdrawSuccess(
  ch: Challenge,
  date: string
): { challenge: Challenge; event: ChallengeEvent } {
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");

  const amt = requiredWeeklyAmountCents(ch);
  const newWeekIndex = ch.weekIndex + 1;
  const newTotal = money.add(ch.totalSavedCents, amt);

  const isComplete = newWeekIndex === 52;

  const updated: Challenge = {
    ...ch,
    weekIndex: newWeekIndex,
    totalSavedCents: newTotal,
    status: isComplete ? "COMPLETED" : ch.status
  };

  if (isComplete) {
    return {
      challenge: updated,
      event: {
        type: "CHALLENGE_COMPLETED",
        date,
        finalWeekIndex: 52,
        totalSavedCents: newTotal
      }
    };
  }

  return {
    challenge: updated,
    event: {
      type: "AUTO_WITHDRAW_SUCCESS",
      date,
      amountCents: amt,
      newWeekIndex
    }
  };
}

export function failMissedWithdraw(
  ch: Challenge,
  date: string
): { challenge: Challenge; event: ChallengeEvent } {
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");

  const penaltyCents = money.pct(ch.totalSavedCents, 1);
  const redirected = money.sub(ch.totalSavedCents, penaltyCents);

  const updated: Challenge = { ...ch, status: "FAILED" };

  return {
    challenge: updated,
    event: {
      type: "AUTO_WITHDRAW_MISSED_FAIL",
      date,
      penaltyPercent: 1,
      penaltyCents,
      redirectedToVaultCents: redirected,
      scoreWeekIndex: Math.max(0, ch.weekIndex - 1)
    }
  };
}

export function quitChallenge(
  ch: Challenge,
  date: string
): { challenge: Challenge; event: ChallengeEvent } {
  if (ch.status !== "ACTIVE") throw new Error("Challenge is not active.");

  const penaltyCents = money.pct(ch.totalSavedCents, 5);
  const redirected = money.sub(ch.totalSavedCents, penaltyCents);

  const updated: Challenge = { ...ch, status: "QUIT" };

  return {
    challenge: updated,
    event: {
      type: "USER_QUIT",
      date,
      penaltyPercent: 5,
      penaltyCents,
      redirectedToVaultCents: redirected,
      scoreWeekIndex: Math.max(0, ch.weekIndex - 1)
    }
  };
}
