import type { TransferRequest } from "./types.js";

export type TransferResult =
  | { ok: true; providerRef: string }
  | { ok: false; errorCode: string; message: string };

export interface TransferProvider {
  requestTransfer(req: TransferRequest): Promise<TransferResult>;
}
