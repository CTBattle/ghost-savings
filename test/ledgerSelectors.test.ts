import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { startChallengeEvents } from "../src/domain/commands/challengeCommands.js";
import { requestChallengeWeeklyTransfer } from "../src/domain/commands/challengeTransferCommands.js";
import { selectLedgerTimeline } from "../src/domain/readModels/ledgerSelectors.js";

describe("Ledger timeline selector", () => {
  it("returns readable ledger entries", () => {
    let events = [
      ...startChallengeEvents("c_led_1", money.fromDollars(1), "2026-01-01")
    ];

    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "t_led_1",
        userId: "u1",
        challengeId: "c_led_1",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-08"
      })
    );

    const timeline = selectLedgerTimeline(events);

    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.some((e) => e.description.includes("Transfer requested"))).toBe(true);

  });
});

