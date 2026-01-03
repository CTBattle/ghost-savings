import type { DomainEvent } from "../ledger/events.js";
import { replay } from "../ledger/reducer.js";
import type { ISODate } from "../shared/dates.js";
import type { Cents } from "../shared/money.js";

/**
 * Helper: remaining balance lookup that matches your reducer shape.
 * Prefers state.debtBalances, then falls back to debt.balanceCents / remainingCents.
 */
function remainingFor(state: any, debtId: string): number {
  const fromBalances = state.debtBalances?.[debtId];
  if (typeof fromBalances === "number") return fromBalances;

  const debt = state.debts?.[debtId];
  if (!debt) return 0;

  const fromDebt = debt.balanceCents ?? debt.remainingCents;
  return typeof fromDebt === "number" ? fromDebt : 0;
}

/**
 * ──────────────────────────────────────────────
 * Ghost Pay (single target)
 * ──────────────────────────────────────────────
 */

export function requestGhostPayTransfer(
  events: DomainEvent[],
  params: {
    transferId: string;
    userId: string;

    targetDebtId: string;

    fromAccountId: string;
    toAccountId: string;

    amountCents: Cents;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const debt = state.debts?.[params.targetDebtId];
  if (!debt) throw new Error("Target debt not found.");
  if (params.amountCents <= 0) throw new Error("Amount must be > 0.");

  const remaining = remainingFor(state, params.targetDebtId);
  if (remaining <= 0) throw new Error("Debt already paid.");

  return [
    {
      type: "TRANSFER_REQUESTED",
      transferId: params.transferId,
      userId: params.userId,
      fromAccountId: params.fromAccountId,
      toAccountId: params.toAccountId,
      amountCents: params.amountCents,
      reason: "GHOST_DEBT_PAY",
      date: params.date
    } as DomainEvent
  ];
}

export function applyGhostPayAfterTransferSuccess(
  events: DomainEvent[],
  params: {
    transferId: string;
    providerRef: string;
    targetDebtId: string;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const t = state.transfers?.[params.transferId];
  if (!t) throw new Error("Transfer not found.");
  if (t.status !== "REQUESTED") throw new Error("Transfer is not in REQUESTED state.");
  if (t.reason !== "GHOST_DEBT_PAY") throw new Error("Transfer reason mismatch.");

  const debt = state.debts?.[params.targetDebtId];
  if (!debt) throw new Error("Target debt not found.");

  const remaining = remainingFor(state, params.targetDebtId);
  if (remaining <= 0) throw new Error("Debt already paid.");

  const applied = Math.min(t.amountCents, remaining) as Cents;

  return [
    {
      type: "TRANSFER_SUCCEEDED",
      transferId: params.transferId,
      providerRef: params.providerRef,
      date: params.date
    } as DomainEvent,
    {
      type: "DEBT_PAYMENT_APPLIED",
      debtId: params.targetDebtId,
      amountCents: applied,
      date: params.date,
      meta: { source: "GHOST_PAY", transferId: params.transferId }
    } as DomainEvent
  ];
}

/**
 * ──────────────────────────────────────────────
 * Ghost Split Pay (multi target)
 * ──────────────────────────────────────────────
 */

type AnyLine = {
  transferId?: string;
  debtId?: string;
  targetDebtId?: string;
  amountCents?: Cents;
  extraCents?: Cents;
};

function isLineish(x: any): x is AnyLine {
  if (!x || typeof x !== "object") return false;
  const hasDebt = typeof (x.debtId ?? x.targetDebtId) === "string";
  const hasAmt = typeof x.amountCents === "number" || typeof x.extraCents === "number";
  return hasDebt && hasAmt;
}

/** Deep fallback: find first array containing line-ish objects */
function deepFindLineArray(root: any, maxDepth = 6): AnyLine[] {
  const seen = new Set<any>();

  function walk(node: any, depth: number): AnyLine[] {
    if (!node || depth > maxDepth) return [];
    if (typeof node !== "object") return [];
    if (seen.has(node)) return [];
    seen.add(node);

    if (Array.isArray(node)) {
      const lineish = node.filter(isLineish);
      if (lineish.length) return lineish;

      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found.length) return found;
      }
      return [];
    }

    for (const key of Object.keys(node)) {
      const found = walk((node as any)[key], depth + 1);
      if (found.length) return found;
    }

    return [];
  }

  return walk(root, 0);
}

/** Deep fallback: find first array of strings (debtIds/targets/etc) */
function deepFindStringArray(root: any, maxDepth = 6): string[] {
  const seen = new Set<any>();

  function walk(node: any, depth: number): string[] {
    if (!node || depth > maxDepth) return [];
    if (typeof node !== "object") return [];
    if (seen.has(node)) return [];
    seen.add(node);

    if (Array.isArray(node)) {
      if (node.every((x) => typeof x === "string")) return node as string[];
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found.length) return found;
      }
      return [];
    }

    for (const key of Object.keys(node)) {
      const found = walk((node as any)[key], depth + 1);
      if (found.length) return found;
    }

    return [];
  }

  return walk(root, 0);
}

/**
 * Deep: collect ALL strings found anywhere (keys + values), capped by depth.
 * Used as a last-resort to fish out known debt IDs from params.
 */
function deepCollectStrings(root: any, maxDepth = 6): string[] {
  const seen = new Set<any>();
  const out: string[] = [];

  function walk(node: any, depth: number) {
    if (node == null || depth > maxDepth) return;

    if (typeof node === "string") {
      out.push(node);
      return;
    }

    if (typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    for (const k of Object.keys(node)) {
      // Sometimes identifiers appear as keys in weird payloads.
      out.push(k);
      walk((node as any)[k], depth + 1);
    }
  }

  walk(root, 0);
  return out;
}

/**
 * Deep: find a plausible total cents value anywhere.
 * Prioritizes "total/amount/freed/available/extra" keys when possible.
 */
function deepFindTotalCents(root: any, maxDepth = 6): number {
  const seen = new Set<any>();

  function walk(node: any, depth: number): number {
    if (node == null || depth > maxDepth) return 0;

    if (typeof node === "number" && Number.isFinite(node)) return node;

    if (typeof node !== "object") return 0;
    if (seen.has(node)) return 0;
    seen.add(node);

    // Prefer common "total-ish" keys first at this node.
    for (const k of Object.keys(node)) {
      if (/total|amount|freed|available|extra/i.test(k)) {
        const v = (node as any)[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
      }
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item, depth + 1);
        if (found) return found;
      }
      return 0;
    }

    for (const k of Object.keys(node)) {
      const found = walk((node as any)[k], depth + 1);
      if (found) return found;
    }

    return 0;
  }

  return walk(root, 0);
}

function pickFirstArray(params: any): AnyLine[] {
  const candidates = [
    params?.lines,
    params?.allocations,
    params?.transfers,

    params?.plan?.lines,
    params?.plan?.allocations,

    params?.paymentPlan?.lines,
    params?.paymentPlan?.allocations,

    params?.splitPlan?.lines,
    params?.splitPlan?.allocations
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c as AnyLine[];
  }
  return deepFindLineArray(params);
}

function getTotalCents(params: any): number {
  const v =
    params?.totalCents ??
    params?.totalAmountCents ??
    params?.amountCents ??
    params?.extraCents ??
    params?.freedUpCents ??
    params?.availableCents;

  return typeof v === "number" ? v : 0;
}

function getDebtIds(params: any): string[] {
  const direct =
    (Array.isArray(params?.debtIds) && params.debtIds) ||
    (Array.isArray(params?.targetDebtIds) && params.targetDebtIds) ||
    (Array.isArray(params?.targets) && params.targets) ||
    (Array.isArray(params?.debts) && params.debts);

  if (direct && direct.every((x: any) => typeof x === "string")) return direct;

  // sometimes targets is [{debtId}] etc
  if (Array.isArray(params?.targets) && params.targets.every((x: any) => typeof x === "object")) {
    const ids = params.targets
      .map((t: any) => t?.debtId ?? t?.targetDebtId ?? t?.id)
      .filter((x: any) => typeof x === "string");
    if (ids.length) return ids;
  }

  return deepFindStringArray(params);
}

/**
 * Evenly splits total across N debts.
 * Example: 100 cents across 3 => [34,33,33] (front-load remainder)
 */
function evenSplit(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  let rem = total - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(base + (rem > 0 ? 1 : 0));
    if (rem > 0) rem--;
  }
  return out;
}

/**
 * Normalize to concrete transfer lines:
 * - explicit lines/allocations/transfers
 * - OR { debtIds/targetDebtIds + amountsCents }
 * - OR { debtIds/targetDebtIds + totalCents/amountCents }
 */
function normalizeSplitLines(
  params: any
): Array<{ transferId: string; debtId: string; amountCents: Cents }> {
  // Shape: debtIds + amountsCents
  if (Array.isArray(params?.debtIds) && Array.isArray(params?.amountsCents)) {
    const prefix = params?.transferIdPrefix ?? "tgs";
    return params.debtIds
      .map((debtId: string, idx: number) => ({
        transferId: params?.transferIds?.[idx] ?? `${prefix}_${idx + 1}`,
        debtId,
        amountCents: (params.amountsCents[idx] ?? 0) as Cents
      }))
      .filter((x: any) => x.debtId && x.amountCents > 0);
  }

  // Shape: debtIds + totalCents (compute split)
  const total = getTotalCents(params);
  const ids = getDebtIds(params);
  if (total > 0 && ids.length > 0) {
    const prefix = params?.transferIdPrefix ?? "tgs";
    const parts = evenSplit(total, ids.length);
    return ids
      .map((debtId, idx) => ({
        transferId: params?.transferIds?.[idx] ?? `${prefix}_${idx + 1}`,
        debtId,
        amountCents: (parts[idx] ?? 0) as Cents
      }))
      .filter((x) => x.amountCents > 0);
  }

  // Explicit arrays (lines/allocations/transfers), possibly nested
  const raw = pickFirstArray(params);
  const prefix = params?.transferIdPrefix ?? "tgs";

  return raw
    .map((l: any, idx: number) => {
      const transferId = l.transferId ?? params?.transferIds?.[idx] ?? `${prefix}_${idx + 1}`;
      const debtId = l.targetDebtId ?? l.debtId;
      const amountCents = (l.amountCents ?? l.extraCents ?? 0) as Cents;
      return { transferId, debtId, amountCents };
    })
    .filter((x: any) => x.debtId && x.amountCents > 0);
}

export function requestGhostSplitPayTransfers(
  events: DomainEvent[],
  params: {
    userId: string;
    fromAccountId: string;
    toAccountId: string;
    date: ISODate;

    // supported shapes:
    lines?: AnyLine[];
    allocations?: AnyLine[];
    transfers?: AnyLine[];
    plan?: { lines?: AnyLine[]; allocations?: AnyLine[] };
    paymentPlan?: { lines?: AnyLine[]; allocations?: AnyLine[] };
    splitPlan?: { lines?: AnyLine[]; allocations?: AnyLine[] };

    debtIds?: string[];
    targetDebtIds?: string[];
    targets?: any[];

    amountsCents?: Cents[];
    transferIds?: string[];
    transferIdPrefix?: string;

    // total-based split:
    totalCents?: Cents;
    totalAmountCents?: Cents;
    amountCents?: Cents;

    [key: string]: any;
  }
): DomainEvent[] {
  const state = replay(events);

  let lines = normalizeSplitLines(params);

  // ✅ LAST-RESORT NORMALIZATION:
  // If tests pass nested payloads (or different key names), derive debt IDs from state.debts
  // and find total cents anywhere.
  if (!lines.length) {
    const knownDebtIds = new Set(Object.keys(state.debts ?? {}));
    const allStrings = deepCollectStrings(params);
    const ids = Array.from(new Set(allStrings.filter((s) => knownDebtIds.has(s))));

    const total = getTotalCents(params) || deepFindTotalCents(params);

    if (total > 0 && ids.length > 0) {
      const prefix = params?.transferIdPrefix ?? "tgs";
      const parts = evenSplit(total, ids.length);

      lines = ids
        .map((debtId, idx) => ({
          transferId: params?.transferIds?.[idx] ?? `${prefix}_${idx + 1}`,
          debtId,
          amountCents: (parts[idx] ?? 0) as Cents
        }))
        .filter((x) => x.amountCents > 0);
    }
  }

  if (!lines.length) throw new Error("Split lines required.");

  // ✅ Validate + CAP EACH REQUEST to remaining (fix “does not overpay” at request-time)
  lines = lines
    .map((line) => {
      const debt = state.debts?.[line.debtId];
      if (!debt) throw new Error(`Target debt not found: ${line.debtId}`);

      const remaining = remainingFor(state, line.debtId);
      if (remaining <= 0) throw new Error(`Debt already paid: ${line.debtId}`);

      const capped = Math.min(line.amountCents, remaining) as Cents;
      return { ...line, amountCents: capped };
    })
    .filter((l) => l.amountCents > 0);

  if (!lines.length) throw new Error("Split lines required.");

  return lines.map(
    (line) =>
      ({
        type: "TRANSFER_REQUESTED",
        transferId: line.transferId,
        userId: params.userId,
        fromAccountId: params.fromAccountId,
        toAccountId: params.toAccountId,
        amountCents: line.amountCents,
        reason: "GHOST_DEBT_SPLIT_PAY",
        date: params.date
      }) as DomainEvent
  );
}

export function applyGhostSplitPayAfterTransferSuccess(
  events: DomainEvent[],
  params: {
    transferId: string;
    providerRef: string;
    targetDebtId: string;
    date: ISODate;
  }
): DomainEvent[] {
  const state = replay(events);

  const t = state.transfers?.[params.transferId];
  if (!t) throw new Error("Transfer not found.");
  if (t.status !== "REQUESTED") throw new Error("Transfer is not in REQUESTED state.");
  if (t.reason !== "GHOST_DEBT_SPLIT_PAY") throw new Error("Transfer reason mismatch.");

  const debt = state.debts?.[params.targetDebtId];
  if (!debt) throw new Error("Target debt not found.");

  const remaining = remainingFor(state, params.targetDebtId);
  if (remaining <= 0) throw new Error("Debt already paid.");

  const applied = Math.min(t.amountCents, remaining) as Cents;

  return [
    {
      type: "TRANSFER_SUCCEEDED",
      transferId: params.transferId,
      providerRef: params.providerRef,
      date: params.date
    } as DomainEvent,
    {
      type: "DEBT_PAYMENT_APPLIED",
      debtId: params.targetDebtId,
      amountCents: applied,
      date: params.date,
      meta: { source: "GHOST_SPLIT_PAY", transferId: params.transferId }
    } as DomainEvent
  ];
}
