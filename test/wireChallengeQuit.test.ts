import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { replay } from "../src/domain/ledger/reducer.js";
import { startChallengeEvents } from "../src/domain/commands/challengeCommands.js";
import { createVaultEvent } from "../src/domain/commands/vaultCommands.js";
import {
  requestChallengeWeeklyTransfer,
  applyChallengeWeeklyAfterTransferSuccess,
  applyChallengeQuit,
  applyChallengeRedirectAfterTransferSuccess
} from "../src/domain/commands/challengeTransferCommands.js";

describe("Wire Challenge quit (5% penalty)", () => {
  it("quit: sets status QUIT and redirects 95% into vault only after redirect transfer success", () => {
    let events = [
      ...startChallengeEvents("cq1", money.fromDollars(1), "2026-01-01"),
      ...createVaultEvent(
        "rvq",
        "Quit Redirect Vault",
        { type: "UNTIL_NEED", createdDate: "2026-01-01" },
        "2026-01-01"
      )
    ];

    // Complete week 1 successfully so totalSavedCents = $1
    events = events.concat(
      requestChallengeWeeklyTransfer(events, {
        transferId: "cq1w1",
        userId: "u1",
        challengeId: "cq1",
        fromAccountId: "bank_checking",
        toAccountId: "challenge_holding",
        date: "2026-01-08"
      })
    );

    events = events.concat(
      applyChallengeWeeklyAfterTransferSuccess(events, {
        transferId: "cq1w1",
        providerRef: "prov_cq1w1",
        challengeId: "cq1",
        date: "2026-01-08"
      })
    );

    const beforeQuit = replay(events);
    const totalSaved = beforeQuit.challengeTotals["cq1"];
    expect(totalSaved).toBe(money.fromDollars(1));
    expect(beforeQuit.challenges["cq1"].status).toBe("ACTIVE");

    // Quit → emits CHALLENGE_QUIT + redirect transfer request (no vault credit yet)
    events = events.concat(
      applyChallengeQuit(events, {
        userId: "u1",
        challengeId: "cq1",
        redirectVaultId: "rvq",
        redirectFromAccountId: "challenge_holding",
        redirectToAccountId: "vault_account",
        redirectTransferId: "tr_quit_redirect_1",
        date: "2026-01-09"
      })
    );

    // Find quit event to assert exact math
    const quitEvt = events.find((e) => e.type === "CHALLENGE_QUIT");
    expect(quitEvt).toBeTruthy();
    if (!quitEvt || quitEvt.type !== "CHALLENGE_QUIT") throw new Error("Missing CHALLENGE_QUIT event.");

    // Verify state after quit
    const mid = replay(events);
    expect(mid.challenges["cq1"].status).toBe("QUIT");
    expect(mid.transfers["tr_quit_redirect_1"].status).toBe("REQUESTED");
    expect(mid.transfers["tr_quit_redirect_1"].reason).toBe("VAULT_DEPOSIT");
    expect(mid.vaultBalances["rvq"]).toBe(0);

    const redirected = mid.transfers["tr_quit_redirect_1"].amountCents;

    // Exact 5% penalty math (integer-safe)
    const expectedPenalty = Math.floor((totalSaved * 5) / 100);
    const expectedRedirect = totalSaved - expectedPenalty;

    expect(quitEvt.penaltyCents).toBe(expectedPenalty);
    expect(quitEvt.redirectedToVaultCents).toBe(expectedRedirect);

    // Transfer amount must match redirect amount from the quit event
    expect(redirected).toBe(expectedRedirect);

    // Redirect transfer succeeds → vault credited
    events = events.concat(
      applyChallengeRedirectAfterTransferSuccess(events, {
        redirectTransferId: "tr_quit_redirect_1",
        providerRef: "prov_quit_redirect_1",
        redirectVaultId: "rvq",
        date: "2026-01-09"
      })
    );

    const after = replay(events);
    expect(after.vaultBalances["rvq"]).toBe(redirected);
  });
});
