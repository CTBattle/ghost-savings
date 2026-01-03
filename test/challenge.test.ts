import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { requiredWeeklyAmountCents, applyAutoWithdrawSuccess, failMissedWithdraw, quitChallenge } from "../src/domain/challenges/engine.js";
import type { Challenge } from "../src/domain/challenges/types.js";

describe("52-week challenge engine", () => {
  it("required amount doubles each week", () => {
    const ch: Challenge = {
      id: "c1",
      startDate: "2026-01-02",
      startAmountCents: money.fromDollars(1),
      weekIndex: 0,
      totalSavedCents: 0,
      status: "ACTIVE"
    };

    expect(requiredWeeklyAmountCents(ch)).toBe(money.fromDollars(1));
    expect(requiredWeeklyAmountCents({ ...ch, weekIndex: 1 })).toBe(money.fromDollars(2));
    expect(requiredWeeklyAmountCents({ ...ch, weekIndex: 2 })).toBe(money.fromDollars(4));
  });

  it("success increments weekIndex and totalSaved", () => {
    const ch: Challenge = {
      id: "c1",
      startDate: "2026-01-02",
      startAmountCents: money.fromDollars(2),
      weekIndex: 0,
      totalSavedCents: 0,
      status: "ACTIVE"
    };

    const { challenge, event } = applyAutoWithdrawSuccess(ch, "2026-01-09");
    expect(event.type).toBe("AUTO_WITHDRAW_SUCCESS");
    expect(challenge.weekIndex).toBe(1);
    expect(challenge.totalSavedCents).toBe(money.fromDollars(2));
  });

  it("missed withdraw fails with 1% penalty and redirects 99%", () => {
    const ch: Challenge = {
      id: "c1",
      startDate: "2026-01-02",
      startAmountCents: money.fromDollars(1),
      weekIndex: 10,
      totalSavedCents: money.fromDollars(100),
      status: "ACTIVE"
    };

    const { challenge, event } = failMissedWithdraw(ch, "2026-03-01");
    expect(challenge.status).toBe("FAILED");
    expect(event.type).toBe("AUTO_WITHDRAW_MISSED_FAIL");
    if (event.type === "AUTO_WITHDRAW_MISSED_FAIL") {
      expect(event.penaltyCents).toBe(money.fromDollars(1));     // 1% of 100
      expect(event.redirectedToVaultCents).toBe(money.fromDollars(99));
    }
  });

  it("quit ends with 5% penalty and redirects 95%", () => {
    const ch: Challenge = {
      id: "c1",
      startDate: "2026-01-02",
      startAmountCents: money.fromDollars(1),
      weekIndex: 10,
      totalSavedCents: money.fromDollars(200),
      status: "ACTIVE"
    };

    const { challenge, event } = quitChallenge(ch, "2026-03-01");
    expect(challenge.status).toBe("QUIT");
    expect(event.type).toBe("USER_QUIT");
    if (event.type === "USER_QUIT") {
      expect(event.penaltyCents).toBe(money.fromDollars(10));    // 5% of 200
      expect(event.redirectedToVaultCents).toBe(money.fromDollars(190));
    }
  });
});
