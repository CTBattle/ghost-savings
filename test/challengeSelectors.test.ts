import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { startChallengeEvents } from "../src/domain/commands/challengeCommands.js";
import { selectChallengeNextRequiredAmount } from "../src/domain/readModels/challengeSelectors.js";

describe("Challenge selectors", () => {
  it("returns correct next required weekly amount", () => {
    const events = startChallengeEvents(
      "c_sel_1",
      money.fromDollars(1),
      "2026-01-01"
    );

    // weekIndex = 0 → required = $1 = 100 cents
    expect(selectChallengeNextRequiredAmount(events, "c_sel_1")).toBe(100);
  });
});
