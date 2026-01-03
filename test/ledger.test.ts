import { describe, it, expect } from "vitest";
import { replay } from "../src/domain/ledger/reducer.js";
import type { DomainEvent } from "../src/domain/ledger/events.js";
import { money } from "../src/domain/shared/money.js";

describe("DomainState replay", () => {
  it("replays vault metadata + balances", () => {
    const events: DomainEvent[] = [
      { type: "VAULT_CREATED", vaultId: "v1", name: "Emergency", kind: { type: "UNTIL_NEED", createdDate: "2026-01-01" }, date: "2026-01-01" },
      { type: "VAULT_DEPOSITED", vaultId: "v1", amountCents: money.fromDollars(500), date: "2026-01-02" },
      { type: "VAULT_WITHDRAWN", vaultId: "v1", amountCents: money.fromDollars(100), penaltyCents: money.fromDollars(10), date: "2026-01-10" }
    ];

    const state = replay(events);
    expect(state.vaults["v1"].name).toBe("Emergency");
    expect(state.vaultBalances["v1"]).toBe(money.fromDollars(400));
  });

  it("replays challenge state + totals", () => {
    const events: DomainEvent[] = [
      { type: "CHALLENGE_STARTED", challengeId: "c1", startAmountCents: money.fromDollars(1), date: "2026-01-01" },
      { type: "CHALLENGE_WEEK_SUCCESS", challengeId: "c1", amountCents: money.fromDollars(1), weekIndex: 0, date: "2026-01-08" },
      { type: "CHALLENGE_WEEK_SUCCESS", challengeId: "c1", amountCents: money.fromDollars(2), weekIndex: 1, date: "2026-01-15" }
    ];

    const state = replay(events);
    expect(state.challenges["c1"].status).toBe("ACTIVE");
    expect(state.challenges["c1"].weekIndex).toBe(2);
    expect(state.challengeTotals["c1"]).toBe(money.fromDollars(3));
  });
});
