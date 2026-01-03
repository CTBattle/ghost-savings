import type { DomainEvent } from "../ledger/events.js";

/**
 * Human-readable ledger timeline entry
 */
export type LedgerEntry = {
  type: string;
  date: string;
  description: string;
};

/**
 * Converts domain events into a readable timeline.
 * Pure mapping — no logic, no math.
 */
export function selectLedgerTimeline(
  events: DomainEvent[]
): LedgerEntry[] {
  return events.map((e) => {
    switch (e.type) {
      case "TRANSFER_REQUESTED":
        return {
          type: e.type,
          date: e.date,
          description: `Transfer requested (${e.amountCents} cents)`
        };

      case "TRANSFER_SUCCEEDED":
        return {
          type: e.type,
          date: e.date,
          description: `Transfer succeeded`
        };

      case "TRANSFER_FAILED":
        return {
          type: e.type,
          date: e.date,
          description: `Transfer failed: ${e.message}`
        };

      case "CHALLENGE_WEEK_SUCCESS":
        return {
          type: e.type,
          date: e.date,
          description: `Challenge week ${e.weekIndex + 1} completed`
        };

      case "CHALLENGE_FAILED":
        return {
          type: e.type,
          date: e.date,
          description: `Challenge failed (${e.penaltyCents} cents discipline)`
        };

      case "CHALLENGE_QUIT":
        return {
          type: e.type,
          date: e.date,
          description: `Challenge quit`
        };

      case "VAULT_DEPOSITED":
        return {
          type: e.type,
          date: e.date,
          description: `Vault credited (${e.amountCents} cents)`
        };

      default:
        return {
          type: e.type,
          date: (e as any).date ?? "",
          description: e.type
        };
    }
  });
}
