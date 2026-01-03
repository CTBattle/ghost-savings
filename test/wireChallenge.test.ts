import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { replay } from "../src/domain/ledger/reducer.js";
import { startChallengeEvents } from "../src/domain/commands/challengeCommands.js";
import { createVaultEvent } from "../src/domain/commands/vaultCommands.js";
import {
  requestChallengeWeeklyTransfer,
  applyChallengeWeeklyAfterTransferSuccess,
  applyChallengeWeeklyAfterTransferFail,
  applyChallengeRedirectAfterTransferSuccess
} from "../src/domain/commands/challengeTransferCommands.js";

describe("Wire Challenge weekly auto-withdraw", () => {
  it("success: does not advance week until transfer succeeds", () => {
    let events = [
      ...startChallengeEvents("c1", money.fromDollars(1), "2026-01-01")
    ];

    // request weekly transfer
    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "tc1w1",
        userId: "u1",
        challengeId: "c1",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-08"
      })
    );

    // still weekIndex 0
    expect(replay(events).challenges["c1"].weekIndex).toBe(0);

    // apply success → week advances
    events = events.concat(
      applyChallengeWeeklyAfterTransferSuccess(events, {
        transferId: "tc1w1",
        providerRef: "prov_ch_1",
        challengeId: "c1",
        date: "2026-01-08"
      })
    );

    expect(replay(events).challenges["c1"].weekIndex).toBe(1);
    expect(replay(events).challengeTotals["c1"]).toBe(money.fromDollars(1));
  });

  it("idempotency: cannot apply weekly success twice for the same transfer", () => {
    let events = [
      ...startChallengeEvents("c4", money.fromDollars(1), "2026-01-01")
    ];

    // request weekly transfer
    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "tc4w1",
        userId: "u1",
        challengeId: "c4",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-08"
      })
    );

    // apply success once
    events = events.concat(
      applyChallengeWeeklyAfterTransferSuccess(events, {
        transferId: "tc4w1",
        providerRef: "prov_c4_w1",
        challengeId: "c4",
        date: "2026-01-08"
      })
    );

    // applying success again should throw because transfer is no longer REQUESTED
    expect(() =>
      applyChallengeWeeklyAfterTransferSuccess(events, {
        transferId: "tc4w1",
        providerRef: "prov_c4_w1_dup",
        challengeId: "c4",
        date: "2026-01-08"
      })
    ).toThrow(/REQUESTED/i);
  });

  it("cannot request weekly transfer once completed (weekIndex >= 52)", () => {
    let events = [
      ...startChallengeEvents("c3", money.fromDollars(1), "2026-01-01")
    ];

    // Drive the challenge to completion through the real wiring:
    // request -> transfer succeeded -> apply success, repeated 52 times.
    for (let i = 0; i < 52; i++) {
      const transferId = `tc3w${i + 1}`;

      events = events.concat(
        requestChallengeWeeklyTransfer(events, {
          transferId,
          userId: "u1",
          challengeId: "c3",
          fromAccountId: "bank_checking",
          toAccountId: "challenge_holding",
          date: "2026-01-08"
        })
      );

      events = events.concat(
        applyChallengeWeeklyAfterTransferSuccess(events, {
          transferId,
          providerRef: `prov_c3_w${i + 1}`,
          challengeId: "c3",
          date: "2026-01-08"
        })
      );
    }

    // Sanity: completed state reached (weekIndex 52)
    expect(replay(events).challenges["c3"].weekIndex).toBe(52);

    // Attempt week 53 request -> should be blocked by guard
    expect(() =>
      requestChallengeWeeklyTransfer(events, {
        transferId: "tc3w53",
        userId: "u1",
        challengeId: "c3",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-08"
      })
    ).toThrow(/completed/i);
  });

  it("fail: after one success, a missed auto-withdraw FAILS with 1% penalty and redirects 99% (deposit after redirect success)", () => {
    let events = [
      ...startChallengeEvents("c2", money.fromDollars(1), "2026-01-01"),
      ...createVaultEvent(
        "rv1",
        "Redirect Vault",
        { type: "UNTIL_NEED", createdDate: "2026-01-01" },
        "2026-01-01"
      )
    ];

    // Week 1 request + success → totalSaved = $1, weekIndex = 1
    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "tc2w1",
        userId: "u1",
        challengeId: "c2",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-08"
      })
    );

    events = events.concat(
      applyChallengeWeeklyAfterTransferSuccess(events, {
        transferId: "tc2w1",
        providerRef: "prov_c2_w1",
        challengeId: "c2",
        date: "2026-01-08"
      })
    );

    const afterW1 = replay(events);
    expect(afterW1.challengeTotals["c2"]).toBe(money.fromDollars(1));
    expect(afterW1.challenges["c2"].weekIndex).toBe(1);
    expect(afterW1.challenges["c2"].status).toBe("ACTIVE");

    // Week 2 request (no state change yet)
    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "tc2w2",
        userId: "u1",
        challengeId: "c2",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-15"
      })
    );

    // Fail week 2 transfer → CHALLENGE_FAILED + redirect transfer request
    events = events.concat(
      applyChallengeWeeklyAfterTransferFail(events, {
        transferId: "tc2w2",
        userId: "u1",
        challengeId: "c2",

        redirectVaultId: "rv1",
        redirectFromAccountId: "challenge_holding",
        redirectToAccountId: "vault_account",
        redirectTransferId: "tr_redirect_2",

        errorCode: "INSUFFICIENT_FUNDS",
        message: "Not enough money.",
        date: "2026-01-15"
      })
    );

    // Verify exact 1% math from emitted CHALLENGE_FAILED event
    const failedEvt = events.find((e) => e.type === "CHALLENGE_FAILED");
    expect(failedEvt).toBeTruthy();
    if (!failedEvt || failedEvt.type !== "CHALLENGE_FAILED") {
      throw new Error("Missing CHALLENGE_FAILED event.");
    }

    const totalSaved = money.fromDollars(1); // 100 cents
    const expectedPenalty = Math.floor((totalSaved * 1) / 100); // 1%
    const expectedRedirect = totalSaved - expectedPenalty;      // 99%

    expect(failedEvt.penaltyCents).toBe(expectedPenalty);
    expect(failedEvt.redirectedToVaultCents).toBe(expectedRedirect);

    const mid = replay(events);
    expect(mid.challenges["c2"].status).toBe("FAILED");

    // Redirect transfer was requested (vault still 0 before success)
    expect(mid.transfers["tr_redirect_2"].status).toBe("REQUESTED");
    expect(mid.transfers["tr_redirect_2"].reason).toBe("VAULT_DEPOSIT");
    expect(mid.vaultBalances["rv1"]).toBe(0);
    expect(mid.transfers["tr_redirect_2"].amountCents).toBe(expectedRedirect);

    // Apply redirect success → vault credited with redirect amount
    events = events.concat(
      applyChallengeRedirectAfterTransferSuccess(events, {
        redirectTransferId: "tr_redirect_2",
        providerRef: "prov_redirect_2",
        redirectVaultId: "rv1",
        date: "2026-01-15"
      })
    );

    const after = replay(events);
    expect(after.vaultBalances["rv1"]).toBe(expectedRedirect);
  });

  it("idempotency: cannot apply weekly fail twice for the same transfer", () => {
    let events = [
      ...startChallengeEvents("c5", money.fromDollars(1), "2026-01-01"),
      ...createVaultEvent(
        "rv5",
        "Redirect Vault",
        { type: "UNTIL_NEED", createdDate: "2026-01-01" },
        "2026-01-01"
      )
    ];

    // Week 1 request + success
    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "tc5w1",
        userId: "u1",
        challengeId: "c5",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-08"
      })
    );

    events = events.concat(
      applyChallengeWeeklyAfterTransferSuccess(events, {
        transferId: "tc5w1",
        providerRef: "prov_c5_w1",
        challengeId: "c5",
        date: "2026-01-08"
      })
    );

    // Week 2 request
    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "tc5w2",
        userId: "u1",
        challengeId: "c5",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-15"
      })
    );

    // Apply fail once
    events = events.concat(
      applyChallengeWeeklyAfterTransferFail(events, {
        transferId: "tc5w2",
        userId: "u1",
        challengeId: "c5",

        redirectVaultId: "rv5",
        redirectFromAccountId: "challenge_holding",
        redirectToAccountId: "vault_account",
        redirectTransferId: "tr_redirect_5",

        errorCode: "INSUFFICIENT_FUNDS",
        message: "Not enough money.",
        date: "2026-01-15"
      })
    );

    // Applying fail again should throw because transfer is no longer REQUESTED
    expect(() =>
      applyChallengeWeeklyAfterTransferFail(events, {
        transferId: "tc5w2",
        userId: "u1",
        challengeId: "c5",

        redirectVaultId: "rv5",
        redirectFromAccountId: "challenge_holding",
        redirectToAccountId: "vault_account",
        redirectTransferId: "tr_redirect_5_dup",

        errorCode: "INSUFFICIENT_FUNDS",
        message: "Not enough money.",
        date: "2026-01-15"
      })
    ).toThrow(/REQUESTED/i);
  });
});
