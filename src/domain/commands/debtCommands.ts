import type { DomainEvent } from "../ledger/events.js";
import type { ISODate } from "../shared/dates.js";
import type { Cents } from "../shared/money.js";

/**
 * Create a debt via events (event-sourced).
 * Designed to be spread into an event list:
 *   events = [...events, ...createDebtEvents(...)]
 */
export function createDebtEvents(
  userId: string,
  debtId: string,
  params: {
    name: string;
    balanceCents: Cents;
    minimumPaymentCents?: Cents;
  },
  date: ISODate
): DomainEvent[] {
  return [
    {
      type: "DEBT_CREATED",
      userId,
      debtId,
      name: params.name,
      balanceCents: params.balanceCents,
      minimumPaymentCents: params.minimumPaymentCents ?? (0 as Cents),
      date
    }
  ];
}
