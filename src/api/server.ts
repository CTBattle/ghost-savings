import "dotenv/config";
import Fastify from "fastify";

import type { DomainEvent } from "../domain/ledger/events.js";
import { selectDashboard } from "../domain/readModels/dashboardSelectors.js";

import { createVaultEvent } from "../domain/commands/vaultCommands.js";
import { createDebtEvents } from "../domain/commands/debtCommands.js";
import {
  startChallengeEvents,
  catchUpChallengeWeekSuccessEvents,
} from "../domain/commands/challengeCommands.js";

import { money } from "../domain/shared/money.js";
import type { VaultKind } from "../domain/vaults/types.js";

import { loadEventsFromDisk, saveEventsToDisk } from "./eventStoreFile.js";
import { replay } from "../domain/ledger/reducer.js";

import {
  loadIdempotencyStore,
  getIdempotentResponse,
  setIdempotentResponse,
} from "./idempotencyFile.js";

import { plaid } from "../infra/plaid/plaidClient.js";

import type { Products, CountryCode } from "plaid";
import { upsertPlaidToken, getPlaidToken } from "./plaidTokenFile.js";

const app = Fastify({ logger: true });

// DEV ONLY: in-memory token store (replace with DB later)
const plaidStore = {
  accessTokenByUserId: new Map<string, string>(),
  itemIdByUserId: new Map<string, string>(),
};

/**
 * API-level vault kind input (simple strings from client).
 * This is NOT the same as the domain VaultKind (which is an object union).
 */
const ALLOWED_VAULT_KINDS = ["SAVINGS", "DEBT"] as const;
type VaultKindInput = (typeof ALLOWED_VAULT_KINDS)[number];

function isVaultKindInput(v: unknown): v is VaultKindInput {
  return (
    typeof v === "string" &&
    (ALLOWED_VAULT_KINDS as readonly string[]).includes(v)
  );
}

/**
 * Convert API kind -> domain VaultKind (object union).
 *
 * Your domain kinds are:
 *  - GOAL_BASED
 *  - TIMED
 *  - UNTIL_NEED
 *
 * For now, we map "SAVINGS" to UNTIL_NEED using the provided isoDate.
 * "DEBT" is currently mapped the same way until/unless you add a true domain meaning.
 */
function toDomainVaultKind(kind: VaultKindInput, isoDate: string): VaultKind {
  switch (kind) {
    case "SAVINGS":
      return { type: "UNTIL_NEED", createdDate: isoDate as any };
    case "DEBT":
      // If you later create a real "DEBT" vault concept, update this mapping.
      return { type: "UNTIL_NEED", createdDate: isoDate as any };
  }
}

/**
 * Seed events used ONLY if no persisted events exist yet.
 */
const seededEvents: DomainEvent[] = [
  // seed vault (Emergency fund)
  ...createVaultEvent(
    "v1",
    "Emergency",
    toDomainVaultKind("SAVINGS", "2026-01-01"),
    "2026-01-01"
  ),

  // ✅ userId first, debtId second
  ...createDebtEvents(
    "u1",
    "d1",
    { name: "Card", balanceCents: money.fromDollars(5) },
    "2026-01-01"
  ),

  // seed challenge
  ...startChallengeEvents("c1", money.fromDollars(1), "2026-01-01"),
];

/**
 * Persistent event store (file-backed).
 * - Load from disk if present
 * - Otherwise seed and immediately persist
 */
const loaded = loadEventsFromDisk();
const eventStore: DomainEvent[] = loaded.length > 0 ? loaded : seededEvents;

if (loaded.length === 0) {
  saveEventsToDisk(eventStore);
}

/**
 * Persistent idempotency store (file-backed).
 * Used ONLY when client provides Idempotency-Key header.
 */
const idemStore = loadIdempotencyStore();

function getIdemKey(req: any): string | null {
  // Fastify lower-cases incoming header names
  const raw = req.headers?.["idempotency-key"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/**
 * Shared: build allocations (same algorithm as commit route)
 */
function buildAllocations(
  total: number,
  items: { debtId: string; remainingCents: number }[]
): { debtId: string; amountCents: number }[] {
  const n = items.length;
  const base = Math.floor(total / n);
  let rem = total % n;

  const out = items.map((it) => {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem--;

    // cap by remaining
    const amt = Math.min(it.remainingCents, base + extra);
    return { debtId: it.debtId, amountCents: amt };
  });

  let used = out.reduce((s, x) => s + x.amountCents, 0);
  let leftover = total - used;

  if (leftover > 0) {
    // redistribute 1 pass (good enough for our small leftover cases)
    for (const it of items) {
      if (leftover <= 0) break;
      const entry = out.find((x) => x.debtId === it.debtId)!;
      const room = it.remainingCents - entry.amountCents;
      if (room <= 0) continue;
      const add = Math.min(room, leftover);
      entry.amountCents += add;
      leftover -= add;
    }
  }

  return out.filter((x) => x.amountCents > 0);
}

// Health check
app.get("/health", async () => {
  return { ok: true, service: "ghost-savings", ts: new Date().toISOString() };
});

// Simple ping endpoint (nice for mobile reachability checks)
app.get("/ping", async () => {
  return { ok: true, ts: new Date().toISOString() };
});

/**
 * Plaid: create link_token
 * POST /plaid/link-token
 */
app.post("/plaid/link-token", async (req, reply) => {
  try {
    const resp = await plaid.linkTokenCreate({
      user: { client_user_id: "default" },
      client_name: "Ghost Savings",
      products: ["transactions"] as Products[],
      country_codes: ["US"] as CountryCode[],
      language: "en",
      // redirect_uri intentionally omitted for sandbox unless configured in Plaid dashboard
    });

    return reply.send({
      ok: true,
      link_token: resp.data.link_token,
    });
  } catch (err: any) {
    const data = err?.response?.data;
    req.log.error({ err: data ?? err }, "Plaid linkTokenCreate failed");

    return reply.status(400).send({
      ok: false,
      error: "PLAID_LINK_TOKEN_CREATE_FAILED",
      plaid: data ?? { message: err?.message ?? String(err) },
    });
  }
});


/**
 * Plaid: exchange public_token -> access_token
 * POST /plaid/exchange-token
 * body: { public_token: string }
 */
app.post<{
  Body: { public_token: string };
}>("/plaid/exchange-token", async (req, reply) => {
  try {

    const { public_token } = req.body ?? ({} as any);

    if (!public_token || typeof public_token !== "string") {
      return reply.status(400).send({
        ok: false,
        error: "public_token is required",
      });
    }

    const resp = await plaid.itemPublicTokenExchange({ public_token });

    const userId = "u1"; // TODO: replace with real signed-in user id later

    plaidStore.accessTokenByUserId.set(userId, resp.data.access_token);
plaidStore.itemIdByUserId.set(userId, resp.data.item_id);
upsertPlaidToken(userId, {
  access_token: resp.data.access_token,
  item_id: resp.data.item_id,
});

return reply.send({
  ok: true,
  userId,
  access_token: resp.data.access_token,
  item_id: resp.data.item_id,
});

  } catch (err: any) {
    const data = err?.response?.data;
    req.log.error({ err: data ?? err }, "Plaid itemPublicTokenExchange failed");

    return reply.status(400).send({
      ok: false,
      error: "PLAID_PUBLIC_TOKEN_EXCHANGE_FAILED",
      plaid: data ?? { message: err?.message ?? String(err) },
    });
  }
});
/**
 * Plaid: fetch accounts for the current dev user
 * GET /plaid/accounts
 */
app.get("/plaid/accounts", async (req, reply) => {
  try {
    const userId = "u1"; // TEMP: replace with real auth later
    let access_token = plaidStore.accessTokenByUserId.get(userId);

    if (!access_token) {
      const saved = getPlaidToken(userId);
      if (saved?.access_token) {
        access_token = saved.access_token;
    
        // warm in-memory cache too
        plaidStore.accessTokenByUserId.set(userId, saved.access_token);
        plaidStore.itemIdByUserId.set(userId, saved.item_id);
      }
    }
    if (!access_token) {
      return reply.status(400).send({
        ok: false,
        error: "NO_PLAID_ACCESS_TOKEN",
        message: "No access token stored. Complete Plaid Link + exchange-token first.",
      });
    }
    
    const resp = await plaid.accountsGet({ access_token });

    const accounts = resp.data.accounts.map((a) => ({
      account_id: a.account_id,
      name: a.name,
      official_name: a.official_name ?? null,
      type: a.type,
      subtype: a.subtype ?? null,
      mask: a.mask ?? null,
      balances: {
        available: a.balances.available ?? null,
        current: a.balances.current ?? null,
        iso_currency_code: a.balances.iso_currency_code ?? null,
        unofficial_currency_code: a.balances.unofficial_currency_code ?? null,
      },
    }));

    return reply.send({
      ok: true,
      userId,
      item_id: plaidStore.itemIdByUserId.get(userId) ?? null,
      accounts,
    });
  } catch (err: any) {
    const data = err?.response?.data;
    req.log.error({ err: data ?? err }, "Plaid accountsGet failed");

    return reply.status(400).send({
      ok: false,
      error: "PLAID_ACCOUNTS_GET_FAILED",
      plaid: data ?? { message: err?.message ?? String(err) },
    });
  }
});
/**
 * Plaid: fetch transactions for the current dev user
 * GET /plaid/transactions
 */
app.get("/plaid/transactions", async (req, reply) => {
  try {
    const userId = "u1"; // TEMP: replace with real auth later
    let access_token = plaidStore.accessTokenByUserId.get(userId);

    if (!access_token) {
      const saved = getPlaidToken(userId);
      if (saved?.access_token) {
        access_token = saved.access_token;

        // warm in-memory cache too
        plaidStore.accessTokenByUserId.set(userId, saved.access_token);
        plaidStore.itemIdByUserId.set(userId, saved.item_id);
      }
    }

    if (!access_token) {
      return reply.status(400).send({
        ok: false,
        error: "NO_PLAID_ACCESS_TOKEN",
        message: "No access token stored. Complete Plaid Link + exchange-token first.",
      });
    }

    // last 30 days
    const end_date = new Date();
    const start_date = new Date();
    start_date.setDate(end_date.getDate() - 30);

    const resp = await plaid.transactionsGet({
      access_token,
      start_date: start_date.toISOString().slice(0, 10),
      end_date: end_date.toISOString().slice(0, 10),
      options: {
        count: 50,
        offset: 0,
      },
    });

    const transactions = resp.data.transactions.map((t) => ({
      transaction_id: t.transaction_id,
      account_id: t.account_id,
      name: t.name,
      amount: t.amount,
      iso_currency_code: t.iso_currency_code,
      date: t.date,
      pending: t.pending,
      category: t.category ?? [],
    }));

    return reply.send({
      ok: true,
      userId,
      total: resp.data.total_transactions,
      transactions,
    });
  } catch (err: any) {
    const data = err?.response?.data;
    req.log.error({ err: data ?? err }, "Plaid transactionsGet failed");

    return reply.status(400).send({
      ok: false,
      error: "PLAID_TRANSACTIONS_GET_FAILED",
      plaid: data ?? { message: err?.message ?? String(err) },
    });
  }
});

// Dashboard read model (derived from ALL events)
app.get("/dashboard", async () => {
  const today = new Date().toISOString().slice(0, 10) as any;

  // Compute current state to find active challenges
  const state = replay(eventStore);

  // Catch up each active challenge
  let appended = 0;
  for (const [challengeId, ch] of Object.entries(state.challenges)) {
    if (ch.status !== "ACTIVE") continue;

    const newEvents = catchUpChallengeWeekSuccessEvents(
      eventStore,
      challengeId,
      today
    );
    if (newEvents.length > 0) {
      eventStore.push(...newEvents);
      appended += newEvents.length;
    }
  }

  if (appended > 0) {
    saveEventsToDisk(eventStore);
  }

  return selectDashboard(eventStore);
});

// Debug: view raw events
app.get("/events", async () => {
  return { ok: true, count: eventStore.length, events: eventStore };
});

/**
 * COMMAND: Create a vault
 * POST /vaults
 * body: { vaultId, name, kind, date? }
 */
app.post<{
  Body: { vaultId: string; name: string; kind: unknown; date?: string };
}>("/vaults", async (req, reply) => {
  const { vaultId, name, kind, date } = req.body ?? ({} as any);

  if (!vaultId || !name || kind == null) {
    return reply.status(400).send({
      ok: false,
      error: "vaultId, name, kind are required",
    });
  }

  // runtime guard (req.body is untrusted)
  if (!isVaultKindInput(kind)) {
    return reply.status(400).send({
      ok: false,
      error: `Invalid kind "${String(kind)}". Expected ${ALLOWED_VAULT_KINDS.join(
        " or "
      )}.`,
    });
  }

  const isoDate = date ?? new Date().toISOString().slice(0, 10);

  // ✅ convert API kind -> domain VaultKind object
  const domainKind = toDomainVaultKind(kind, isoDate);

  const newEvents = createVaultEvent(vaultId, name, domainKind, isoDate);
  eventStore.push(...newEvents);
  saveEventsToDisk(eventStore);

  return { ok: true, appended: newEvents.length, count: eventStore.length };
});

/**
 * COMMAND: Create a debt
 * POST /debts
 * body: { debtId, userId, name, balanceCents, date? }
 */
app.post<{
  Body: {
    debtId: string;
    userId: string;
    name: string;
    balanceCents: number; // cents
    date?: string;
  };
}>("/debts", async (req, reply) => {
  const { debtId, userId, name, balanceCents, date } = req.body ?? ({} as any);

  if (!debtId || !userId || !name) {
    return reply.status(400).send({
      ok: false,
      error: "debtId, userId, name are required",
    });
  }

  const cents = Number(balanceCents ?? 0);
  if (!Number.isFinite(cents) || cents < 0) {
    return reply.status(400).send({
      ok: false,
      error: "balanceCents must be a non-negative number",
    });
  }

  const isoDate = date ?? new Date().toISOString().slice(0, 10);

  // ✅ createDebtEvents expects (userId, debtId, params, date)
  const newEvents = createDebtEvents(
    userId,
    debtId,
    { name, balanceCents: cents as any },
    isoDate as any
  );

  eventStore.push(...newEvents);
  saveEventsToDisk(eventStore);

  return { ok: true, appended: newEvents.length, count: eventStore.length };
});

/**
 * COMMAND: Start a challenge
 * POST /challenges
 * body: { startAmountCents, date? }
 *
 * ✅ Server generates the challengeId (authoritative)
 */
app.post<{
  Body: {
    startAmountCents: number; // cents
    date?: string;
  };
}>("/challenges", async (req, reply) => {
  const { startAmountCents, date } = req.body ?? ({} as any);

  const cents = Number(startAmountCents ?? 0);
  if (!Number.isFinite(cents) || cents < 0) {
    return reply.status(400).send({
      ok: false,
      error: "startAmountCents must be a non-negative number",
    });
  }

  const isoDate = date ?? new Date().toISOString().slice(0, 10);

  // ✅ SERVER ID (authoritative)
  const challengeId = `c${Date.now()}`;

  // extra safety: prevent accidental duplicates (rare, but free)
  const alreadyStarted = eventStore.some(
    (e: any) => e.type === "CHALLENGE_STARTED" && e.challengeId === challengeId
  );
  if (alreadyStarted) {
    return reply.status(409).send({
      ok: false,
      error: `Challenge ${challengeId} already exists`,
    });
  }

  const newEvents = startChallengeEvents(
    challengeId,
    cents as any,
    isoDate as any
  );
  eventStore.push(...newEvents);
  saveEventsToDisk(eventStore);

  return {
    ok: true,
    challengeId,
    appended: newEvents.length,
    count: eventStore.length,
  };
});

/**
 * PREVIEW: Ghost Pay (no events appended)
 * POST /ghost-pay/preview
 */
app.post<{
  Body: {
    userId: string;
    vaultId: string;
    debtId: string;
    amountCents: number;
    date?: string;
  };
}>("/ghost-pay/preview", async (req, reply) => {
  const { userId, vaultId, debtId, amountCents, date } = req.body ?? ({} as any);

  if (!userId || !vaultId || !debtId) {
    return reply.status(400).send({
      ok: false,
      error: "userId, vaultId, debtId are required",
    });
  }

  const requested = Number(amountCents ?? 0);
  if (!Number.isFinite(requested) || requested <= 0) {
    return reply.status(400).send({
      ok: false,
      error: "amountCents must be a number > 0",
    });
  }

  const isoDate = (date ?? new Date().toISOString().slice(0, 10)) as any;

  const state = replay(eventStore);

  const vaultExists = state.vaults[vaultId] != null;
  const vaultBal = state.vaultBalances[vaultId] ?? 0;

  const debtExists = state.debts[debtId] != null;
  const debtBal = state.debtBalances[debtId] ?? 0;

  if (!vaultExists) {
    return reply
      .status(404)
      .send({ ok: false, error: `Vault not found: ${vaultId}` });
  }
  if (!debtExists) {
    return reply
      .status(404)
      .send({ ok: false, error: `Debt not found: ${debtId}` });
  }
  if (vaultBal <= 0) {
    return reply
      .status(400)
      .send({ ok: false, error: `Vault ${vaultId} has no funds.` });
  }
  if (debtBal <= 0) {
    return reply
      .status(400)
      .send({ ok: false, error: `Debt ${debtId} is already paid off.` });
  }

  const paidCents = Math.min(requested, vaultBal, debtBal);

  let clampReason: null | "VAULT_BALANCE" | "DEBT_REMAINING" | "REQUESTED_ZERO" =
    null;
  if (requested <= 0) clampReason = "REQUESTED_ZERO";
  else if (paidCents < requested) {
    if (paidCents === vaultBal) clampReason = "VAULT_BALANCE";
    else if (paidCents === debtBal) clampReason = "DEBT_REMAINING";
  }

  return reply.send({
    ok: true,
    date: isoDate,
    userId,
    vaultId,
    debtId,
    requestedCents: requested,
    paidCents,
    totals: {
      numDebts: 1,
      requestedCents: requested,
      paidCents,
      sumAllocationsCents: paidCents,
      clampReason,
    },
    preview: {
      vaultBalanceBeforeCents: vaultBal,
      vaultBalanceAfterCents: vaultBal - paidCents,
      debtRemainingBeforeCents: debtBal,
      debtRemainingAfterCents: debtBal - paidCents,
    },
  });
});

/**
 * PREVIEW: Ghost Split Pay (no events appended)
 * POST /ghost-split-pay/preview
 */
app.post<{
  Body: {
    userId: string;
    vaultId: string;
    debtIds: string[];
    amountCents: number;
    date?: string;
  };
}>("/ghost-split-pay/preview", async (req, reply) => {
  const { userId, vaultId, debtIds, amountCents, date } = req.body ?? ({} as any);

  if (!userId || !vaultId || !Array.isArray(debtIds) || debtIds.length === 0) {
    return reply.status(400).send({
      ok: false,
      error: "userId, vaultId, debtIds[] are required",
    });
  }

  const requested = Number(amountCents ?? 0);
  if (!Number.isFinite(requested) || requested <= 0) {
    return reply.status(400).send({
      ok: false,
      error: "amountCents must be a number > 0",
    });
  }

  const isoDate = (date ?? new Date().toISOString().slice(0, 10)) as any;

  const state = replay(eventStore);

  const vaultExists = state.vaults[vaultId] != null;
  const vaultBal = state.vaultBalances[vaultId] ?? 0;

  if (!vaultExists) {
    return reply
      .status(404)
      .send({ ok: false, error: `Vault not found: ${vaultId}` });
  }
  if (vaultBal <= 0) {
    return reply
      .status(400)
      .send({ ok: false, error: `Vault ${vaultId} has no funds.` });
  }

  // Optional: dedupe debt ids (prevents weird “double pay” if client sends duplicates)
  const uniqueDebtIds = Array.from(new Set(debtIds));

  const missing = uniqueDebtIds.filter((id) => state.debts[id] == null);
  if (missing.length > 0) {
    return reply.status(404).send({
      ok: false,
      error: `Debt(s) not found: ${missing.join(", ")}`,
    });
  }

  const payable = uniqueDebtIds
    .map((id) => ({
      debtId: id,
      remainingCents: state.debtBalances[id] ?? 0,
    }))
    .filter((d) => d.remainingCents > 0);

  if (payable.length === 0) {
    return reply.status(400).send({
      ok: false,
      error: "All selected debts are already paid off.",
    });
  }

  const totalRemaining = payable.reduce((sum, d) => sum + d.remainingCents, 0);

  const payTotal = Math.min(requested, vaultBal, totalRemaining);
  if (payTotal <= 0) {
    return reply.status(400).send({ ok: false, error: "Nothing to pay." });
  }

  const allocations = buildAllocations(payTotal, payable);
  const paidCents = allocations.reduce((s, a) => s + a.amountCents, 0);
  const sumAllocationsCents = paidCents;

  let clampReason: null | "VAULT_BALANCE" | "TOTAL_REMAINING" | "REQUESTED_ZERO" =
    null;
  if (requested <= 0) clampReason = "REQUESTED_ZERO";
  else if (paidCents < requested) {
    if (paidCents === vaultBal) clampReason = "VAULT_BALANCE";
    else if (paidCents === totalRemaining) clampReason = "TOTAL_REMAINING";
  }

  const debtRemainingAfterCents: Record<string, number> = {};
  for (const d of payable) {
    const paidForDebt =
      allocations.find((a) => a.debtId === d.debtId)?.amountCents ?? 0;
    debtRemainingAfterCents[d.debtId] = d.remainingCents - paidForDebt;
  }

  return reply.send({
    ok: true,
    date: isoDate,
    userId,
    vaultId,
    requestedCents: requested,
    paidCents,
    allocations,
    totals: {
      numDebts: allocations.length,
      requestedCents: requested,
      paidCents,
      sumAllocationsCents,
      clampReason,
    },
    preview: {
      vaultBalanceBeforeCents: vaultBal,
      vaultBalanceAfterCents: vaultBal - paidCents,
      debtRemainingBeforeCents: Object.fromEntries(
        payable.map((d) => [d.debtId, d.remainingCents])
      ),
      debtRemainingAfterCents,
    },
  });
});

/**
 * COMMAND: Ghost Pay (pay a single debt from a vault)
 * POST /ghost-pay
 * body: { userId, vaultId, debtId, amountCents, date? }
 */
app.post<{
  Body: {
    userId: string;
    vaultId: string;
    debtId: string;
    amountCents: number; // cents
    date?: string;
  };
}>("/ghost-pay", async (req, reply) => {
  const { userId, vaultId, debtId, amountCents, date } = req.body ?? ({} as any);

  if (!userId || !vaultId || !debtId) {
    return reply.status(400).send({
      ok: false,
      error: "userId, vaultId, debtId are required",
    });
  }

  const requested = Number(amountCents ?? 0);
  if (!Number.isFinite(requested) || requested <= 0) {
    return reply.status(400).send({
      ok: false,
      error: "amountCents must be a number > 0",
    });
  }

  const isoDate = (date ?? new Date().toISOString().slice(0, 10)) as any;

  // ✅ idempotency (if provided)
  const idemKey = getIdemKey(req);
  if (idemKey) {
    const cached = getIdempotentResponse(idemStore, `ghost-pay:${idemKey}`);
    if (cached) return reply.send(cached);
  }

  // Compute current balances from event-sourced state
  const state = replay(eventStore);

  const vaultExists = state.vaults[vaultId] != null;
  const vaultBal = state.vaultBalances[vaultId] ?? 0;

  const debtExists = state.debts[debtId] != null;
  const debtBal = state.debtBalances[debtId] ?? 0;

  if (!vaultExists) {
    return reply.status(404).send({
      ok: false,
      error: `Vault not found: ${vaultId}`,
    });
  }
  if (!debtExists) {
    return reply
      .status(404)
      .send({ ok: false, error: `Debt not found: ${debtId}` });
  }

  if (vaultBal <= 0) {
    return reply.status(400).send({
      ok: false,
      error: `Vault ${vaultId} has no funds.`,
    });
  }
  if (debtBal <= 0) {
    return reply.status(400).send({
      ok: false,
      error: `Debt ${debtId} is already paid off.`,
    });
  }

  // Clamp to available + owed
  const payCents = Math.min(requested, vaultBal, debtBal);
  if (payCents <= 0) {
    return reply.status(400).send({
      ok: false,
      error: "Nothing to pay (amount too small, debt paid, or vault empty).",
    });
  }

  const transferId = `t${Date.now()}`;
  const providerRef = `sim_${transferId}`;

  const newEvents: DomainEvent[] = [
    {
      type: "TRANSFER_REQUESTED",
      transferId,
      userId,
      fromAccountId: vaultId,
      toAccountId: debtId,
      amountCents: payCents as any,
      reason: "GHOST_DEBT_PAY",
      date: isoDate,
    },
    {
      type: "TRANSFER_SUCCEEDED",
      transferId,
      providerRef,
      date: isoDate,
    },
    {
      type: "VAULT_WITHDRAWN",
      vaultId,
      amountCents: payCents as any,
      penaltyCents: 0 as any,
      date: isoDate,
    },
    {
      type: "DEBT_PAYMENT_APPLIED",
      debtId,
      amountCents: payCents as any,
      date: isoDate,
      meta: { source: "GHOST_PAY", transferId },
    },
  ];

  eventStore.push(...newEvents);
  saveEventsToDisk(eventStore);

  // Return updated balances for UI
  const after = replay(eventStore);
  const nextVaultBal = after.vaultBalances[vaultId] ?? 0;
  const nextDebtBal = after.debtBalances[debtId] ?? 0;

  // totals/clampReason (parity with preview)
  let clampReason: null | "VAULT_BALANCE" | "DEBT_REMAINING" | "REQUESTED_ZERO" =
    null;
  if (requested <= 0) clampReason = "REQUESTED_ZERO";
  else if (payCents < requested) {
    if (payCents === vaultBal) clampReason = "VAULT_BALANCE";
    else if (payCents === debtBal) clampReason = "DEBT_REMAINING";
  }

  const payload = {
    ok: true,
    date: isoDate,
    userId,
    vaultId,

    transferId,
    providerRef,

    requestedCents: requested,
    paidCents: payCents,

    allocations: [{ debtId, amountCents: payCents }],

    totals: {
      numDebts: 1,
      requestedCents: requested,
      paidCents: payCents,
      sumAllocationsCents: payCents,
      clampReason,
    },

    preview: {
      vaultBalanceBeforeCents: vaultBal,
      vaultBalanceAfterCents: nextVaultBal,
      debtRemainingBeforeCents: debtBal,
      debtRemainingAfterCents: nextDebtBal,
    },

    debtId,
    vaultBalanceCents: nextVaultBal,
    debtRemainingCents: nextDebtBal,

    appended: newEvents.length,
    count: eventStore.length,
  };

  if (idemKey) setIdempotentResponse(idemStore, `ghost-pay:${idemKey}`, payload);

  return reply.send(payload);
});

/**
 * COMMAND: Ghost Split Pay (pay multiple debts from a vault)
 * POST /ghost-split-pay
 * body: { userId, vaultId, debtIds, amountCents, date? }
 */
app.post<{
  Body: {
    userId: string;
    vaultId: string;
    debtIds: string[];
    amountCents: number; // cents
    date?: string;
  };
}>("/ghost-split-pay", async (req, reply) => {
  const { userId, vaultId, debtIds, amountCents, date } = req.body ?? ({} as any);

  if (!userId || !vaultId || !Array.isArray(debtIds) || debtIds.length === 0) {
    return reply.status(400).send({
      ok: false,
      error: "userId, vaultId, debtIds[] are required",
    });
  }

  const requested = Number(amountCents ?? 0);
  if (!Number.isFinite(requested) || requested <= 0) {
    return reply.status(400).send({
      ok: false,
      error: "amountCents must be a number > 0",
    });
  }

  const isoDate = (date ?? new Date().toISOString().slice(0, 10)) as any;

  // ✅ idempotency (if provided)
  const idemKey = getIdemKey(req);
  if (idemKey) {
    const cached = getIdempotentResponse(idemStore, `ghost-split-pay:${idemKey}`);
    if (cached) return reply.send(cached);
  }

  // Event-sourced state
  const state = replay(eventStore);

  const vaultExists = state.vaults[vaultId] != null;
  const vaultBal = state.vaultBalances[vaultId] ?? 0;

  if (!vaultExists) {
    return reply
      .status(404)
      .send({ ok: false, error: `Vault not found: ${vaultId}` });
  }
  if (vaultBal <= 0) {
    return reply
      .status(400)
      .send({ ok: false, error: `Vault ${vaultId} has no funds.` });
  }

  // ✅ dedupe debt ids (prevents weird “double pay” if client sends duplicates)
  const uniqueDebtIds = Array.from(new Set(debtIds));

  // Validate debts exist
  const missing = uniqueDebtIds.filter((id) => state.debts[id] == null);
  if (missing.length > 0) {
    return reply.status(404).send({
      ok: false,
      error: `Debt(s) not found: ${missing.join(", ")}`,
    });
  }

  // Only pay debts that still have remaining > 0
  const payable = uniqueDebtIds
    .map((id) => ({
      debtId: id,
      remainingCents: state.debtBalances[id] ?? 0,
    }))
    .filter((d) => d.remainingCents > 0);

  if (payable.length === 0) {
    return reply.status(400).send({
      ok: false,
      error: "All selected debts are already paid off.",
    });
  }

  const totalRemaining = payable.reduce((sum, d) => sum + d.remainingCents, 0);

  // Clamp: cannot pay more than requested, vault balance, or remaining owed
  const payTotal = Math.min(requested, vaultBal, totalRemaining);
  if (payTotal <= 0) {
    return reply.status(400).send({ ok: false, error: "Nothing to pay." });
  }

  const allocations = buildAllocations(payTotal, payable);
  const allocatedTotal = allocations.reduce((s, a) => s + a.amountCents, 0);
  // ^^^ BUG FIX NOTE: If you see a TypeScript error here, replace line above with the correct one below:
  // const allocatedTotal = allocations.reduce((s, a) => s + a.amountCents, 0);

  const transferId = `t${Date.now()}`;
  const providerRef = `sim_${transferId}`;

  const newEvents: DomainEvent[] = [
    {
      type: "TRANSFER_REQUESTED",
      transferId,
      userId,
      fromAccountId: vaultId,
      toAccountId: `debts:${allocations.map((a) => a.debtId).join(",")}`,
      amountCents: allocatedTotal as any,
      reason: "GHOST_DEBT_SPLIT_PAY",
      date: isoDate,
    },
    {
      type: "TRANSFER_SUCCEEDED",
      transferId,
      providerRef,
      date: isoDate,
    },
    {
      type: "VAULT_WITHDRAWN",
      vaultId,
      amountCents: allocatedTotal as any,
      penaltyCents: 0 as any,
      date: isoDate,
    },
    ...allocations.map(
      (a): DomainEvent => ({
        type: "DEBT_PAYMENT_APPLIED",
        debtId: a.debtId,
        amountCents: a.amountCents as any,
        date: isoDate,
        meta: { source: "GHOST_SPLIT_PAY", transferId },
      })
    ),
  ];

  eventStore.push(...newEvents);
  saveEventsToDisk(eventStore);

  const after = replay(eventStore);
  const nextVaultBal = after.vaultBalances[vaultId] ?? 0;

  const debtRemainingCents: Record<string, number> = {};
  for (const a of allocations) {
    debtRemainingCents[a.debtId] = after.debtBalances[a.debtId] ?? 0;
  }

  // totals/clampReason (parity with preview)
  let clampReason: null | "VAULT_BALANCE" | "TOTAL_REMAINING" | "REQUESTED_ZERO" =
    null;
  if (requested <= 0) clampReason = "REQUESTED_ZERO";
  else if (allocatedTotal < requested) {
    if (allocatedTotal === vaultBal) clampReason = "VAULT_BALANCE";
    else if (allocatedTotal === totalRemaining) clampReason = "TOTAL_REMAINING";
  }

  const debtRemainingBeforeCents = Object.fromEntries(
    payable.map((d) => [d.debtId, d.remainingCents])
  );
  const debtRemainingAfterCents = debtRemainingCents;

  const payload = {
    ok: true,
    date: isoDate,
    userId,
    vaultId,

    transferId,
    providerRef,

    requestedCents: requested,
    paidCents: allocatedTotal,

    allocations,

    totals: {
      numDebts: allocations.length,
      requestedCents: requested,
      paidCents: allocatedTotal,
      sumAllocationsCents: allocatedTotal,
      clampReason,
    },

    preview: {
      vaultBalanceBeforeCents: vaultBal,
      vaultBalanceAfterCents: nextVaultBal,
      debtRemainingBeforeCents,
      debtRemainingAfterCents,
    },

    vaultBalanceCents: nextVaultBal,
    debtRemainingCents,

    appended: newEvents.length,
    count: eventStore.length,
  };

  if (idemKey) {
    setIdempotentResponse(idemStore, `ghost-split-pay:${idemKey}`, payload);
  }

  return reply.send(payload);
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`Server listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}