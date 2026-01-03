import { describe, it, expect } from "vitest";
import { replay } from "../src/domain/ledger/reducer.js";
import { createVaultEvent } from "../src/domain/commands/vaultCommands.js";
import { selectVaultBalance } from "../src/domain/readModels/vaultSelectors.js";

describe("Vault selectors", () => {
  it("returns 0 for a newly created vault", () => {
    const events = createVaultEvent(
      "v_sel_1",
      "Selector Vault",
      { type: "UNTIL_NEED", createdDate: "2026-01-01" },
      "2026-01-01"
    );

    // sanity: vault exists
    expect(replay(events).vaults["v_sel_1"]).toBeTruthy();

    expect(selectVaultBalance(events, "v_sel_1")).toBe(0);
  });
});
