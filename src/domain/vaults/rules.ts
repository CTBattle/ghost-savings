import type { Vault, WithdrawalDecision, MergeChoice, MergedVault } from "./types.js";
import type { ISODate } from "../shared/dates.js";
import { addDays, daysBetween, isBefore } from "../shared/dates.js";
import { money } from "../shared/money.js";

/**
 * Goal-based vault penalty rules:
 * - If goal is hit: 0% within 30-day grace from goalHitDate
 * - After grace: 3–10% based on goal size
 * - If goal never hit: conservative 10% (v1)
 */
function goalPenaltyPercent(vault: Vault, today: ISODate): number {
  if (vault.kind.type !== "GOAL_BASED") return 0;

  const { goalCents, goalHitDate } = vault.kind;

  if (!goalHitDate) return 10;

  const graceEnd = addDays(goalHitDate, 30);
  if (isBefore(today, graceEnd)) return 0;

  const goalDollars = money.toDollars(goalCents);
  if (goalDollars <= 500) return 3;
  if (goalDollars <= 2000) return 5;
  if (goalDollars <= 10000) return 7;
  return 10;
}

function timedPenaltyPercent(vault: Vault, today: ISODate): number {
  if (vault.kind.type !== "TIMED") return 0;
  return isBefore(today, vault.kind.maturityDate) ? 10 : 0;
}

function untilNeedPenaltyPercent(vault: Vault, today: ISODate): number {
  if (vault.kind.type !== "UNTIL_NEED") return 0;

  const ageDays = daysBetween(vault.kind.createdDate, today);
  if (ageDays < 90) return 10;
  return 3;
}

export function computeWithdrawal(vault: Vault, withdrawCents: number, today: ISODate): WithdrawalDecision {
  if (withdrawCents <= 0) return { allowed: false, reason: "Withdrawal must be > 0." };
  if (withdrawCents > vault.balanceCents) return { allowed: false, reason: "Insufficient vault balance." };

  let penaltyPercent = 0;
  let reason = "";

  if (vault.kind.type === "GOAL_BASED") {
    penaltyPercent = goalPenaltyPercent(vault, today);
    reason =
      penaltyPercent === 0
        ? "Goal met: withdrawal is penalty-free (within grace)."
        : "Goal-based vault penalty applies (after grace or goal not hit).";
  } else if (vault.kind.type === "TIMED") {
    penaltyPercent = timedPenaltyPercent(vault, today);
    reason = penaltyPercent === 0 ? "Maturity reached: penalty-free withdrawal." : "Early withdrawal before maturity.";
  } else {
    penaltyPercent = untilNeedPenaltyPercent(vault, today);
    reason = penaltyPercent === 10 ? "Early withdrawal before 90-day commitment." : "After 90 days: reduced penalty applies.";
  }

  const penaltyCents = money.pct(withdrawCents, penaltyPercent);
  const netCents = withdrawCents - penaltyCents;

  return { allowed: true, penaltyPercent, penaltyCents, netCents, reason };
}

/** Deposits never reset timers. For GOAL vault, first day balance >= goal sets goalHitDate. */
export function applyDeposit(vault: Vault, depositCents: number, today: ISODate): Vault {
  if (depositCents <= 0) return vault;

  const newBalance = vault.balanceCents + depositCents;

  if (vault.kind.type === "GOAL_BASED") {
    const alreadyHit = !!vault.kind.goalHitDate;
    const nowHit = newBalance >= vault.kind.goalCents;

    if (!alreadyHit && nowHit) {
      return {
        ...vault,
        balanceCents: newBalance,
        kind: { ...vault.kind, goalHitDate: today }
      };
    }
  }

  return { ...vault, balanceCents: newBalance };
}

/**
 * Merge rules:
 * - Original vaults close (handled by app layer)
 * - New merged vault starts fresh for commitment logic
 * - Choice:
 *   - UNTIL_NEED: 90-day rule from merge date
 *   - RESET_TIME: cannot bypass penalties; treat as UNTIL_NEED + forced 10% within first 90 days
 */
export function mergeVaults(
  vaults: Vault[],
  newVaultId: string,
  name: string,
  choice: MergeChoice,
  today: ISODate
): MergedVault {
  const total = vaults.reduce((sum, v) => sum + v.balanceCents, 0);

  return {
    id: newVaultId,
    name,
    balanceCents: total,
    kind: { type: "UNTIL_NEED", createdDate: today },
    mergePolicy: choice.mode
  };
}

export function computeMergedWithdrawal(vault: MergedVault, withdrawCents: number, today: ISODate): WithdrawalDecision {
  const base = computeWithdrawal(vault, withdrawCents, today);
  if (!base.allowed) return base;

  if (vault.mergePolicy === "RESET_TIME") {
    const created = vault.kind.type === "UNTIL_NEED" ? vault.kind.createdDate : today;
    const ageDays = daysBetween(created, today);
    if (ageDays < 90 && base.penaltyPercent < 10) {
      const penaltyCents = money.pct(withdrawCents, 10);
      return {
        allowed: true,
        penaltyPercent: 10,
        penaltyCents,
        netCents: withdrawCents - penaltyCents,
        reason: "Merge RESET_TIME: early-withdraw penalty enforced."
      };
    }
  }

  return base;
}
