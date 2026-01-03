import { describe, it, expect } from "vitest";
import { replay } from "../src/domain/ledger/reducer.js";
import { money } from "../src/domain/shared/money.js";

import { createDebtEvents } from "../src/domain/commands/debtCommands.js";

import {
  requestGhostSplitPayTransfers,
  applyGhostSplitPayAfterTransferSuccess
} from "../src/domain/commands/ghostDebtCommands.js";

describe("Ghost Split Pay (multi-target)", () => {
  it("does not change debts until transfers succeed, then applies split payments", () => {
    // 3 debts: 500, 500, 500
    let events = [
      ...createDebtEvents("d1", { name: "Card", balanceCents: money.fromDollars(5) }, "2026-01-01"),
      ...createDebtEvents("d2", { name: "Loan", balanceCents: money.fromDollars(5) }, "2026-01-01"),
      ...createDebtEvents("d3", { name: "Car",  balanceCents: money.fromDollars(5) }, "2026-01-01")
    ];

    // split $10 across 3 => 334,333,333 cents
    events = events.concat(
      requestGhostSplitPayTransfers(events, {
        userId: "u1",
        fromAccountId: "bank_checking",
        toAccountId: "debt_holding",
        debtIds: ["d1", "d2", "d3"],
        totalAmountCents: money.fromDollars(10),
        transferIds: ["ts1", "ts2", "ts3"],
        date: "2026-01-08"
      })
    );

    // balances unchanged before success
    const mid = replay(events);
    expect(mid.debts["d1"].balanceCents).toBe(money.fromDollars(5));
    expect(mid.debts["d2"].balanceCents).toBe(money.fromDollars(5));
    expect(mid.debts["d3"].balanceCents).toBe(money.fromDollars(5));

    // apply success per transfer
    events = events.concat(
      applyGhostSplitPayAfterTransferSuccess(events, {
        transferId: "ts1",
        providerRef: "prov_ts1",
        targetDebtId: "d1",
        date: "2026-01-08"
      })
    );
    events = events.concat(
      applyGhostSplitPayAfterTransferSuccess(events, {
        transferId: "ts2",
        providerRef: "prov_ts2",
        targetDebtId: "d2",
        date: "2026-01-08"
      })
    );
    events = events.concat(
      applyGhostSplitPayAfterTransferSuccess(events, {
        transferId: "ts3",
        providerRef: "prov_ts3",
        targetDebtId: "d3",
        date: "2026-01-08"
      })
    );

    const after = replay(events);

    // $5.00 - $3.34 = $1.66
    expect(after.debts["d1"].balanceCents).toBe(166);
    // $5.00 - $3.33 = $1.67
    expect(after.debts["d2"].balanceCents).toBe(167);
    expect(after.debts["d3"].balanceCents).toBe(167);
  });

  it("idempotency: cannot apply split success twice for the same transfer", () => {
    let events = [
      ...createDebtEvents("d1", { name: "Card", balanceCents: money.fromDollars(5) }, "2026-01-01")
    ];

    events = events.concat(
      requestGhostSplitPayTransfers(events, {
        userId: "u1",
        fromAccountId: "bank_checking",
        toAccountId: "debt_holding",
        debtIds: ["d1"],
        totalAmountCents: money.fromDollars(1),
        transferIds: ["ts_idem_1"],
        date: "2026-01-08"
      })
    );

    events = events.concat(
      applyGhostSplitPayAfterTransferSuccess(events, {
        transferId: "ts_idem_1",
        providerRef: "prov_once",
        targetDebtId: "d1",
        date: "2026-01-08"
      })
    );

    expect(() =>
      applyGhostSplitPayAfterTransferSuccess(events, {
        transferId: "ts_idem_1",
        providerRef: "prov_twice",
        targetDebtId: "d1",
        date: "2026-01-08"
      })
    ).toThrow(/REQUESTED/i);
  });

  it("does not overpay: caps each transfer to remaining", () => {
    let events = [
      ...createDebtEvents("d1", { name: "Tiny", balanceCents: 50 }, "2026-01-01"),
      ...createDebtEvents("d2", { name: "Other", balanceCents: 50 }, "2026-01-01")
    ];

    // total 400 cents across 2 => 200/200, but each debt only has 50 remaining
    events = events.concat(
      requestGhostSplitPayTransfers(events, {
        userId: "u1",
        fromAccountId: "bank_checking",
        toAccountId: "debt_holding",
        debtIds: ["d1", "d2"],
        totalAmountCents: 400,
        transferIds: ["ts_over_1", "ts_over_2"],
        date: "2026-01-08"
      })
    );

    events = events.concat(
      applyGhostSplitPayAfterTransferSuccess(events, {
        transferId: "ts_over_1",
        providerRef: "prov_over_1",
        targetDebtId: "d1",
        date: "2026-01-08"
      })
    );
    events = events.concat(
      applyGhostSplitPayAfterTransferSuccess(events, {
        transferId: "ts_over_2",
        providerRef: "prov_over_2",
        targetDebtId: "d2",
        date: "2026-01-08"
      })
    );

    const after = replay(events);
    expect(after.debts["d1"].balanceCents).toBe(0);
    expect(after.debts["d2"].balanceCents).toBe(0);
  });
});
