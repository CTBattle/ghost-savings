import { describe, it, expect } from "vitest";
import { executeTransfer } from "../src/domain/payments/orchestrator.js";
import type { TransferProvider } from "../src/domain/payments/providers.js";
import type { TransferRequest } from "../src/domain/payments/types.js";
import { money } from "../src/domain/shared/money.js";

describe("Payments orchestrator", () => {
  it("emits TRANSFER_SUCCEEDED when provider succeeds", async () => {
    const provider: TransferProvider = {
      async requestTransfer() {
        return { ok: true, providerRef: "prov_123" };
      }
    };

    const req: TransferRequest = {
      transferId: "t1",
      userId: "u1",
      fromAccountId: "bank_checking",
      toAccountId: "vault_ledger",
      direction: "INTO_VAULT",
      amountCents: money.fromDollars(10),
      reason: "VAULT_DEPOSIT",
      createdDate: "2026-01-02"
    };

    const out = await executeTransfer(provider, req);
    expect(out.type).toBe("TRANSFER_SUCCEEDED");
  });

  it("emits TRANSFER_FAILED when provider fails", async () => {
    const provider: TransferProvider = {
      async requestTransfer() {
        return { ok: false, errorCode: "INSUFFICIENT_FUNDS", message: "Not enough balance." };
      }
    };

    const req: TransferRequest = {
      transferId: "t2",
      userId: "u1",
      fromAccountId: "bank_checking",
      toAccountId: "vault_ledger",
      direction: "INTO_VAULT",
      amountCents: money.fromDollars(999),
      reason: "CHALLENGE_WEEKLY_AUTO_WITHDRAW",
      createdDate: "2026-01-02"
    };

    const out = await executeTransfer(provider, req);
    expect(out.type).toBe("TRANSFER_FAILED");
    if (out.type === "TRANSFER_FAILED") {
      expect(out.errorCode).toBe("INSUFFICIENT_FUNDS");
    }
  });
});
