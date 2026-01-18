import fs from "fs";
import path from "path";

export type PlaidAccountMapRecord = {
  userId: string;
  plaid_account_id: string;
  vault_id: string;
  created_at: string;
};

// key = `${userId}:${plaid_account_id}`
type StoreShape = Record<string, PlaidAccountMapRecord>;

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "plaidAccountMap.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function safeParse(raw: string): StoreShape {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object") return obj as StoreShape;
    return {};
  } catch {
    return {};
  }
}

function keyOf(userId: string, plaid_account_id: string) {
  return `${userId}:${plaid_account_id}`;
}

export function loadPlaidAccountMap(): StoreShape {
  ensureDataDir();
  if (!fs.existsSync(FILE_PATH)) return {};
  const raw = fs.readFileSync(FILE_PATH, "utf8");
  if (!raw.trim()) return {};
  return safeParse(raw);
}

export function savePlaidAccountMap(store: StoreShape) {
  ensureDataDir();
  fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function getMappedVaultId(
  userId: string,
  plaid_account_id: string
): string | null {
  const store = loadPlaidAccountMap();
  return store[keyOf(userId, plaid_account_id)]?.vault_id ?? null;
}

/**
 * List mappings.
 * - If userId provided, returns only that user's mappings.
 * - Otherwise returns all mappings (dev/admin).
 */
export function getAllPlaidAccountMaps(userId?: string): PlaidAccountMapRecord[] {
  const store = loadPlaidAccountMap();
  const all = Object.values(store);
  return userId ? all.filter((r) => r.userId === userId) : all;
}

/**
 * Upsert a mapping.
 * - Preserves created_at if the record already exists
 */
export function upsertPlaidAccountMap(rec: {
  userId: string;
  plaid_account_id: string;
  vault_id: string;
}) {
  const store = loadPlaidAccountMap();
  const k = keyOf(rec.userId, rec.plaid_account_id);
  const existing = store[k];

  store[k] = {
    userId: rec.userId,
    plaid_account_id: rec.plaid_account_id,
    vault_id: rec.vault_id,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };

  savePlaidAccountMap(store);
}

/**
 * Delete a mapping (dev cleanup)
 */
export function deletePlaidAccountMap(
  userId: string,
  plaid_account_id: string
): boolean {
  const store = loadPlaidAccountMap();
  const k = keyOf(userId, plaid_account_id);
  if (!store[k]) return false;
  delete store[k];
  savePlaidAccountMap(store);
  return true;
}
