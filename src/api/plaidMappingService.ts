// src/api/plaidMappingService.ts

import { createVaultEvent } from "../domain/commands/vaultCommands.js";
import type { DomainEvent } from "../domain/ledger/events.js";

import {
  getMappedVaultId,
  upsertPlaidAccountMap,
} from "./plaidAccountMapFile.js";

export function ensurePlaidAccountMapped(opts: {
  userId: string;
  plaid_account_id: string;
  eventStore: DomainEvent[];
  save: (events: DomainEvent[]) => void;
  nameHint?: string | null;
}) {
  const { userId, plaid_account_id, eventStore, save, nameHint } = opts;

  const existingVaultId = getMappedVaultId(userId, plaid_account_id);
  if (existingVaultId) {
    return {
      vaultId: existingVaultId,
      mapped: true,
      created: false,
      appended: 0,
    };
  }

  const vaultId = `v_plaid_${plaid_account_id}`;
  const isoDate = new Date().toISOString().slice(0, 10);

  const displayName =
    (nameHint && nameHint.trim().length > 0 ? nameHint.trim() : null) ??
    `Plaid Account ${plaid_account_id.slice(-4)}`;

  const newEvents = createVaultEvent(
    vaultId,
    displayName,
    { type: "UNTIL_NEED", createdDate: isoDate as any },
    isoDate
  ) as DomainEvent[];

  eventStore.push(...newEvents);
  save(eventStore);

  upsertPlaidAccountMap({
    userId,
    plaid_account_id,
    vault_id: vaultId,
  });

  return {
    vaultId,
    mapped: true,
    created: true,
    appended: newEvents.length,
  };
}
