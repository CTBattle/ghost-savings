import type { Cents } from "../shared/money.js";

export type DebtId = string;

export type Debt = {
  id: DebtId;
  name: string;
  balanceCents: Cents;
  minimumPaymentCents: Cents;
  aprPercent?: number;
};

export type GhostMode = "GHOST_PAY" | "GHOST_SPLIT";

export type PaymentPlanLine = {
  debtId: DebtId;
  minimumCents: Cents;
  extraCents: Cents;
  totalCents: Cents;
};

export type PaymentPlan = {
  mode: GhostMode;
  targetDebtId?: DebtId;
  freedMoneyCents: Cents;
  lines: PaymentPlanLine[];
};
