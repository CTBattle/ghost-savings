import type { Cents } from "../shared/money.js";
import type { ISODate } from "../shared/dates.js";

export type TransferId = string;

export type TransferDirection = "INTO_VAULT" | "OUT_OF_VAULT";

export type TransferReason =
  | "VAULT_DEPOSIT"
  | "VAULT_WITHDRAW"
  | "CHALLENGE_WEEKLY_AUTO_WITHDRAW";

export type TransferRequest = {
  transferId: TransferId;
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  direction: TransferDirection;
  amountCents: Cents;
  reason: TransferReason;
  createdDate: ISODate;
};
