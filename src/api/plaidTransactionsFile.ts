import fs from "fs";
import path from "path";

type TxStore = Record<string, any>; // key = `${userId}:${transaction_id}`

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "plaidTransactions.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function safeParse(raw: string): TxStore {
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object") return obj as TxStore;
    return {};
  } catch {
    return {};
  }
}

function keyOf(userId: string, transaction_id: string) {
  return `${userId}:${transaction_id}`;
}

export function loadPlaidTransactions(): TxStore {
  ensureDataDir();
  if (!fs.existsSync(FILE_PATH)) return {};
  const raw = fs.readFileSync(FILE_PATH, "utf8");
  if (!raw.trim()) return {};
  return safeParse(raw);
}

export function savePlaidTransactions(store: TxStore) {
  ensureDataDir();
  fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function upsertPlaidTransactions(userId: string, txs: any[]) {
  const store = loadPlaidTransactions();
  let inserted = 0;

  for (const t of txs) {
    const id = t?.transaction_id;
    if (!id) continue;

    const k = keyOf(userId, id);
    if (!store[k]) inserted++;
    store[k] = t;
  }

  savePlaidTransactions(store);

  const totalForUser = Object.keys(store).filter((k) => k.startsWith(`${userId}:`))
    .length;

  return { inserted, totalForUser };
}
export function getPlaidTransactionsForUser(userId: string): any[] {
    const store = loadPlaidTransactions();
    return Object.entries(store)
      .filter(([k]) => k.startsWith(`${userId}:`))
      .map(([, v]) => v);
  }
  