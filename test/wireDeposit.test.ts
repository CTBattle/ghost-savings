import { describe, it, expect } from "vitest";
import { money } from "../src/domain/shared/money.js";
import { replay } from "../src/domain/ledger/reducer.js";
import { createVaultEvent } from "../src/domain/commands/vaultCommands.js";
import {
  requestVaultDepositTransfer,
  applyVaultDepositAfterTransferSuccess
} from "../src/domain/commands/transferCommands.js";

describe("Wire Deposit (transfer → deposit event)", () => {
  it("deposit only increases balance after transfer success", () => {
    let events = [
      ...createVaultEvent("v1", "Emergency", { type: "UNTIL_NEED", createdDate: "2026-01-01" }, "2026-01-01")
    ];

    // Request deposit transfer (no balance change yet)
    events = events.concat(
      requestVaultDepositTransfer(events, {
        transferId: "td1",
        userId: "u1",
        vaultId: "v1",
        fromAccountId: "bank_checking",
        toAccountId: "vault_account",
        amountCents: money.fromDollars(25),
        date: "2026-01-02"
      })
    );

    expect(replay(events).vaultBalances["v1"]).toBe(0);

    // Transfer succeeds → now deposit applies
    events = events.concat(
      applyVaultDepositAfterTransferSuccess(events, {
        transferId: "td1",
        providerRef: "prov_dep",
        vaultId: "v1",
        amountCents: money.fromDollars(25),
        date: "2026-01-02"
      })
    );

    expect(replay(events).vaultBalances["v1"]).toBe(money.fromDollars(25));
  });
});
