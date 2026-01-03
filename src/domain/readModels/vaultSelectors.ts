import { replay } from "../ledger/reducer.js";
import type { DomainEvent } from "../ledger/events.js";
import type { Cents } from "../shared/money.js";

/**
 * Returns the current balance of a vault, or null if the vault does not exist.
 */
export function selectVaultBalance(
  events: DomainEvent[],
  vaultId: string
): Cents | null {
  const state = replay(events);
  const vault = state.vaults[vaultId];
  if (!vault) return null;

  return (state.vaultBalances[vaultId] ?? 0) as Cents;
}

/**
 * Returns vault metadata + current balance together,
 * or null if the vault does not exist.
 */
export function selectVaultSummary(
  events: DomainEvent[],
  vaultId: string
): {
  vault: unknown; // keep generic; UI doesn’t mutate this
  balanceCents: Cents;
} | null {
  const state = replay(events);
  const vault = state.vaults[vaultId];
  if (!vault) return null;

  return {
    vault,
    balanceCents: (state.vaultBalances[vaultId] ?? 0) as Cents
  };
}
