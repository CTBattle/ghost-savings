import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { allocateGhostPayments } from "../src/domain/debts/allocator.js";
import type { Debt } from "../src/domain/debts/types.js";

describe("Debt accelerator (snowball + ghost modes)", () => {
  const debts: Debt[] = [
    // $500, $2,000, $12,000 balances with minimums
    { id: "d1", name: "Card", balanceCents: money.fromDollars(500), minimumPaymentCents: money.fromDollars(25) },
    { id: "d2", name: "Loan", balanceCents: money.fromDollars(2000), minimumPaymentCents: money.fromDollars(60) },
    { id: "d3", name: "Car",  balanceCents: money.fromDollars(12000), minimumPaymentCents: money.fromDollars(300) }
  ];

  it("orders debts smallest-to-largest for snowball", () => {
    const plan = allocateGhostPayments(debts, 0, "GHOST_PAY");
    expect(plan.lines.map((l) => l.debtId)).toEqual(["d1", "d2", "d3"]);
  });

  it("GHOST_PAY targets one debt (default smallest) with all freed money", () => {
    const plan = allocateGhostPayments(debts, money.fromDollars(100), "GHOST_PAY");
    const line1 = plan.lines.find((l) => l.debtId === "d1")!;
    const line2 = plan.lines.find((l) => l.debtId === "d2")!;
    const line3 = plan.lines.find((l) => l.debtId === "d3")!;

    expect(line1.extraCents).toBe(money.fromDollars(100));
    expect(line2.extraCents).toBe(0);
    expect(line3.extraCents).toBe(0);
  });

  it("GHOST_SPLIT splits freed money across all debts evenly (remainder to earliest)", () => {
    const plan = allocateGhostPayments(debts, money.fromDollars(10), "GHOST_SPLIT");
    const extras = plan.lines.map((l) => l.extraCents);

    // $10.00 => 1000 cents split across 3 debts:
    // 334, 333, 333 (remainder 1 cent goes to earliest)
    expect(extras).toEqual([334, 333, 333]);
    expect(extras.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("when freed money is 0, all extra allocations are 0", () => {
    const plan = allocateGhostPayments(debts, 0, "GHOST_SPLIT");
    expect(plan.lines.every((l) => l.extraCents === 0)).toBe(true);
  });
});
