import type { Cents } from "../shared/money.js";
import type { ISODate } from "../shared/dates.js";

export type VaultId = string;

export type VaultKind =
  | { type: "GOAL_BASED"; goalCents: Cents; goalHitDate?: ISODate }
  | { type: "TIMED"; maturityDate: ISODate }
  | { type: "UNTIL_NEED"; createdDate: ISODate };

export type Vault = {
  id: VaultId;
  name: string;
  balanceCents: Cents;
  kind: VaultKind;
};

export type WithdrawalDecision =
  | { allowed: true; penaltyPercent: number; penaltyCents: Cents; netCents: Cents; reason: string }
  | { allowed: false; reason: string };

export type MergeChoice =
  | { mode: "RESET_TIME" }
  | { mode: "UNTIL_NEED" };

export type MergedVault = Vault & { mergePolicy: "RESET_TIME" | "UNTIL_NEED" };
