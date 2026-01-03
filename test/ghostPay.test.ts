import { describe, it, expect } from "vitest";
import { replay } from "../src/domain/ledger/reducer.js";
import { money } from "../src/domain/shared/money.js";

// Import your debt creation command(s)
import { createDebtEvents } from "../src/domain/commands/debtCommands.js";

import {
  requestGhostPayTransfer,
  applyGhostPayAfterTransferSuccess
} from "../src/domain/commands/ghostDebtCommands.js";

describe("Ghost Pay (single-target)", () => {
  it("does not change debt until transfer succeeds, then applies payment", () => {
    // Arrange: 1 debt with $5 balance (500 cents)
    let events = [
      ...createDebtEvents(
        "u1",
        "d1",
        {
          name: "Card",
          balanceCents: money.fromDollars(5)
        },
        "2026-01-01"
      )
    ];

    const before = replay(events);
    const beforeBal =
      before.debtBalances?.["d1"] ??
      before.debts?.["d1"]?.balanceCents ??
      before.debts?.["d1"]?.remainingCents;

    expect(beforeBal).toBe(money.fromDollars(5));

    // Request ghost pay of $2
    events = events.concat(
      requestGhostPayTransfer(events, {
        transferId: "tg1",
        userId: "u1",
        targetDebtId: "d1",
        fromAccountId: "bank_checking",
        toAccountId: "debt_holding",
        amountCents: money.fromDollars(2),
        date: "2026-01-08"
      })
    );

    // Assert: still unchanged
    const mid = replay(events);
    const midBal =
      mid.debtBalances?.["d1"] ??
      mid.debts?.["d1"]?.balanceCents ??
      mid.debts?.["d1"]?.remainingCents;

    expect(midBal).toBe(money.fromDollars(5));

    // Apply after transfer success
    events = events.concat(
      applyGhostPayAfterTransferSuccess(events, {
        transferId: "tg1",
        providerRef: "prov_tg1",
        targetDebtId: "d1",
        date: "2026-01-08"
      })
    );

    const after = replay(events);
    const afterBal =
      after.debtBalances?.["d1"] ??
      after.debts?.["d1"]?.balanceCents ??
      after.debts?.["d1"]?.remainingCents;

    expect(afterBal).toBe(money.fromDollars(3));
  });

  it("idempotency: cannot apply ghost pay success twice", () => {
    let events = [
      ...createDebtEvents(
        "u1",
        "d2",
        {
          name: "Loan",
          balanceCents: money.fromDollars(5)
        },
        "2026-01-01"
      )
    ];

    events = events.concat(
      requestGhostPayTransfer(events, {
        transferId: "tg2",
        userId: "u1",
        targetDebtId: "d2",
        fromAccountId: "bank_checking",
        toAccountId: "debt_holding",
        amountCents: money.fromDollars(1),
        date: "2026-01-08"
      })
    );

    events = events.concat(
      applyGhostPayAfterTransferSuccess(events, {
        transferId: "tg2",
        providerRef: "prov_tg2",
        targetDebtId: "d2",
        date: "2026-01-08"
      })
    );

    expect(() =>
      applyGhostPayAfterTransferSuccess(events, {
        transferId: "tg2",
        providerRef: "prov_tg2_dup",
        targetDebtId: "d2",
        date: "2026-01-08"
      })
    ).toThrow(/REQUESTED/i);
  });

  it("does not overpay a debt (caps to remaining)", () => {
    let events = [
      ...createDebtEvents(
        "u1",
        "d3",
        {
          name: "Tiny",
          balanceCents: 50
        },
        "2026-01-01"
      )
    ];

    events = events.concat(
      requestGhostPayTransfer(events, {
        transferId: "tg3",
        userId: "u1",
        targetDebtId: "d3",
        fromAccountId: "bank_checking",
        toAccountId: "debt_holding",
        amountCents: 200, // try to overpay
        date: "2026-01-08"
      })
    );

    events = events.concat(
      applyGhostPayAfterTransferSuccess(events, {
        transferId: "tg3",
        providerRef: "prov_tg3",
        targetDebtId: "d3",
        date: "2026-01-08"
      })
    );

    const after = replay(events);
    const afterBal =
      after.debtBalances?.["d3"] ??
      after.debts?.["d3"]?.balanceCents ??
      after.debts?.["d3"]?.remainingCents;

    expect(afterBal).toBe(0);
  });
});
