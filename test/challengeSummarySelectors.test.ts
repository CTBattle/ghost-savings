import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { startChallengeEvents } from "../src/domain/commands/challengeCommands.js";
import {
  requestChallengeWeeklyTransfer,
  applyChallengeWeeklyAfterTransferSuccess
} from "../src/domain/commands/challengeTransferCommands.js";
import { selectChallengeSummary } from "../src/domain/readModels/challengeSelectors.js";

describe("Challenge summary selector", () => {
  it("returns status, weekIndex, totalSaved, and nextRequired", () => {
    let events = [
      ...startChallengeEvents("c_sum_1", money.fromDollars(1), "2026-01-01")
    ];

    // after start: weekIndex 0, totalSaved 0, nextRequired 100
    const s0 = selectChallengeSummary(events, "c_sum_1");
    expect(s0).toBeTruthy();
    if (!s0) throw new Error("missing summary");
    expect(s0.weekIndex).toBe(0);
    expect(s0.totalSavedCents).toBe(0);
    expect(s0.nextRequiredCents).toBe(100);

    // do one successful week: weekIndex 1, totalSaved 100, nextRequired 200
    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "t_sum_w1",
        userId: "u1",
        challengeId: "c_sum_1",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-08"
      })
    );
    events = events.concat(
      applyChallengeWeeklyAfterTransferSuccess(events, {
        transferId: "t_sum_w1",
        providerRef: "prov_sum_w1",
        challengeId: "c_sum_1",
        date: "2026-01-08"
      })
    );

    const s1 = selectChallengeSummary(events, "c_sum_1");
    expect(s1).toBeTruthy();
    if (!s1) throw new Error("missing summary");
    expect(s1.weekIndex).toBe(1);
    expect(s1.totalSavedCents).toBe(100);
    expect(s1.nextRequiredCents).toBe(200);
  });
});
