import type { Cents } from "../shared/money.js";
import type { ISODate } from "../shared/dates.js";

export type ChallengeId = string;

export type ChallengeStatus = "ACTIVE" | "FAILED" | "QUIT" | "COMPLETED";

export type Challenge = {
  id: ChallengeId;
  startDate: ISODate;
  startAmountCents: Cents; // X (locked)
  weekIndex: number;       // 0-based. week 0 requires X, week 1 requires 2X, etc.
  totalSavedCents: Cents;
  status: ChallengeStatus;
};

export type ChallengeEvent =
  | {
      type: "AUTO_WITHDRAW_SUCCESS";
      date: ISODate;
      amountCents: Cents;
      newWeekIndex: number;
    }
  | {
      type: "AUTO_WITHDRAW_MISSED_FAIL";
      date: ISODate;
      penaltyPercent: 1;
      penaltyCents: Cents;
      redirectedToVaultCents: Cents;
      scoreWeekIndex: number;
    }
  | {
      type: "USER_QUIT";
      date: ISODate;
      penaltyPercent: 5;
      penaltyCents: Cents;
      redirectedToVaultCents: Cents;
      scoreWeekIndex: number;
    }
  | {
      type: "CHALLENGE_COMPLETED";
      date: ISODate;
      finalWeekIndex: 52;
      totalSavedCents: Cents;
    };
