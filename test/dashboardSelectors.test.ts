import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { selectDashboard } from "../src/domain/readModels/dashboardSelectors.js";

import { createVaultEvent } from "../src/domain/commands/vaultCommands.js";
import { createDebtEvents } from "../src/domain/commands/debtCommands.js";
import { startChallengeEvents } from "../src/domain/commands/challengeCommands.js";

describe("dashboardSelectors", () => {
  it("returns vaults, debts, challenges, and pending transfers in one shape", () => {
    const events = [
      ...createVaultEvent("v1", "Emergency", "SAVINGS" as any, "2026-01-01"),

      // ✅ 4-arg signature (per your TS error)
      ...createDebtEvents(
        "d1",
        "u1",
        { name: "Card", balanceCents: money.fromDollars(5) },
        "2026-01-01"
      ),

      ...startChallengeEvents("c1", money.fromDollars(1), "2026-01-01")
    ];

    const dash = selectDashboard(events);

    expect(dash.vaults.length).toBe(1);
    expect(dash.debts.length).toBe(1);
    expect(dash.challenges.length).toBe(1);
    expect(dash.pendingTransfers.length).toBe(0);

    expect(dash.debts[0].balanceCents).toBe(money.fromDollars(5));
    expect(dash.challenges[0].totalSavedCents).toBe(0);
  });
});
