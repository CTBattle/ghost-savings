import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { replay } from "../src/domain/ledger/reducer.js";
import { createVaultEvent, depositVaultEvents, withdrawVaultEvents } from "../src/domain/commands/vaultCommands.js";
import { startChallengeEvents } from "../src/domain/commands/challengeCommands.js";

describe("Commands emit valid events (state-derived)", () => {
  it("create + deposit + withdraw changes derived vault balance", () => {
    let events = [
      ...createVaultEvent("v1", "Emergency", { type: "UNTIL_NEED", createdDate: "2026-01-01" }, "2026-01-01")
    ];

    events = events.concat(depositVaultEvents(events, "v1", money.fromDollars(100), "2026-01-02"));
    events = events.concat(withdrawVaultEvents(events, "v1", money.fromDollars(50), "2026-01-10"));

    const state = replay(events);
    expect(state.vaultBalances["v1"]).toBe(money.fromDollars(50));
  });

  it("startChallenge emits a start event", () => {
    const events = startChallengeEvents("c1", money.fromDollars(1), "2026-01-01");
    expect(events[0].type).toBe("CHALLENGE_STARTED");
  });
});
