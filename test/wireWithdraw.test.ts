import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { replay } from "../src/domain/ledger/reducer.js";
import { createVaultEvent, depositVaultEvents } from "../src/domain/commands/vaultCommands.js";
import { requestVaultWithdrawTransfer, applyVaultWithdrawAfterTransferSuccess } from "../src/domain/commands/transferCommands.js";

describe("Wire Withdraw (transfer → withdraw event)", () => {
  it("withdrawal only reduces balance after transfer success", () => {
    let events = [
      ...createVaultEvent("v1", "Emergency", { type: "UNTIL_NEED", createdDate: "2026-01-01" }, "2026-01-01")
    ];

    // Put money in vault (instant deposit event for now)
    events = events.concat(depositVaultEvents(events, "v1", money.fromDollars(100), "2026-01-02"));
    expect(replay(events).vaultBalances["v1"]).toBe(money.fromDollars(100));

    // Request withdraw transfer (no balance change)
    events = events.concat(
      requestVaultWithdrawTransfer(events, {
        transferId: "tw1",
        userId: "u1",
        vaultId: "v1",
        fromAccountId: "vault_account",
        toAccountId: "bank_checking",
        amountCents: money.fromDollars(50),
        date: "2026-01-10"
      })
    );

    expect(replay(events).vaultBalances["v1"]).toBe(money.fromDollars(100));

    // Transfer succeeds → now withdrawal applies
    events = events.concat(
      applyVaultWithdrawAfterTransferSuccess(events, {
        transferId: "tw1",
        providerRef: "prov_abc",
        vaultId: "v1",
        amountCents: money.fromDollars(50),
        date: "2026-01-10"
      })
    );

    expect(replay(events).vaultBalances["v1"]).toBe(money.fromDollars(50));
  });
});
