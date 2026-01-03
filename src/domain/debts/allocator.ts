import type { Debt, PaymentPlan, GhostMode } from "./types.js";

function sortSnowball(debts: Debt[]): Debt[] {
  // smallest balance first
  return [...debts].sort((a, b) => a.balanceCents - b.balanceCents);
}

export function allocateGhostPayments(
  debts: Debt[],
  freedMoneyCents: number,
  mode: GhostMode,
  targetDebtId?: string
): PaymentPlan {
  const ordered = sortSnowball(debts);

  const lines = ordered.map(d => ({
    debtId: d.id,
    minimumCents: d.minimumPaymentCents,
    extraCents: 0,
    totalCents: d.minimumPaymentCents
  }));

  if (freedMoneyCents <= 0 || ordered.length === 0) {
    return { mode, targetDebtId, freedMoneyCents, lines };
  }

  if (mode === "GHOST_PAY") {
    const target = targetDebtId ?? ordered[0].id; // default to smallest debt
    const line = lines.find(l => l.debtId === target);

    if (line) {
      line.extraCents = freedMoneyCents;
      line.totalCents = line.minimumCents + line.extraCents;
    }

    return { mode, targetDebtId: target, freedMoneyCents, lines };
  }

  // GHOST_SPLIT: split freed money across ALL remaining debts evenly
  const n = lines.length;
  const base = Math.floor(freedMoneyCents / n);
  let remainder = freedMoneyCents - base * n;

  for (const line of lines) {
    line.extraCents = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    line.totalCents = line.minimumCents + line.extraCents;
  }

  return { mode, freedMoneyCents, lines };
}
