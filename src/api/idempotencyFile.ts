import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const IDEMPOTENCY_FILE = path.join(DATA_DIR, "idempotency.json");

type Store = Record<string, unknown>;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadIdempotencyStore(): Store {
  try {
    ensureDataDir();
    if (!fs.existsSync(IDEMPOTENCY_FILE)) return {};
    const raw = fs.readFileSync(IDEMPOTENCY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export function saveIdempotencyStore(store: Store) {
  ensureDataDir();
  fs.writeFileSync(IDEMPOTENCY_FILE, JSON.stringify(store, null, 2), "utf8");
}

export function getIdempotentResponse(store: Store, key: string) {
  return store[key];
}

export function setIdempotentResponse(store: Store, key: string, value: unknown) {
  store[key] = value;
  saveIdempotencyStore(store);
}
