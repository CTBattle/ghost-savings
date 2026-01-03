import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { applyDeposit, computeWithdrawal, mergeVaults, computeMergedWithdrawal } from "../src/domain/vaults/rules.js";
import type { Vault } from "../src/domain/vaults/types.js";

describe("Vault rules", () => {
  it("Goal vault becomes penalty-free during 30-day grace after hitting goal", () => {
    let v: Vault = {
      id: "v1",
      name: "Emergency",
      balanceCents: money.fromDollars(0),
      kind: { type: "GOAL_BASED", goalCents: money.fromDollars(2000) }
    };

    v = applyDeposit(v, money.fromDollars(2000), "2026-01-02"); // hits goal
    const res = computeWithdrawal(v, money.fromDollars(100), "2026-01-10");
    expect(res.allowed).toBe(true);
    if (res.allowed) expect(res.penaltyPercent).toBe(0);
  });

  it("Until-need vault charges 10% before 90 days, then 3% after", () => {
    const v: Vault = {
      id: "v2",
      name: "Discipline",
      balanceCents: money.fromDollars(500),
      kind: { type: "UNTIL_NEED", createdDate: "2026-01-02" }
    };

    const early = computeWithdrawal(v, money.fromDollars(100), "2026-02-01");
    expect(early.allowed).toBe(true);
    if (early.allowed) expect(early.penaltyPercent).toBe(10);

    const late = computeWithdrawal(v, money.fromDollars(100), "2026-05-05");
    expect(late.allowed).toBe(true);
    if (late.allowed) expect(late.penaltyPercent).toBe(3);
  });

  it("Merge RESET_TIME cannot bypass early penalty", () => {
    const a: Vault = {
      id: "a",
      name: "A",
      balanceCents: money.fromDollars(100),
      kind: { type: "TIMED", maturityDate: "2026-12-31" }
    };
    const b: Vault = {
      id: "b",
      name: "B",
      balanceCents: money.fromDollars(100),
      kind: { type: "GOAL_BASED", goalCents: money.fromDollars(1000) }
    };

    const merged = mergeVaults([a, b], "m1", "Merged", { mode: "RESET_TIME" }, "2026-01-02");
    const res = computeMergedWithdrawal(merged, money.fromDollars(50), "2026-01-10");
    expect(res.allowed).toBe(true);
    if (res.allowed) expect(res.penaltyPercent).toBe(10);
  });
});
