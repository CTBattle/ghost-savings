import type { TransferProvider } from "./providers.js";
import type { TransferRequest } from "./types.js";

export type TransferOutcomeEvent =
  | { type: "TRANSFER_SUCCEEDED"; transferId: string; providerRef: string }
  | { type: "TRANSFER_FAILED"; transferId: string; errorCode: string; message: string };

export async function executeTransfer(
  provider: TransferProvider,
  req: TransferRequest
): Promise<TransferOutcomeEvent> {
  const result = await provider.requestTransfer(req);

  if (result.ok) {
    return { type: "TRANSFER_SUCCEEDED", transferId: req.transferId, providerRef: result.providerRef };
  }

  return { type: "TRANSFER_FAILED", transferId: req.transferId, errorCode: result.errorCode, message: result.message };
}
