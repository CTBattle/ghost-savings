// src/api/plaidTokenFile.ts
import fs from "node:fs";
import path from "node:path";

export type PlaidTokenRecord = {
  access_token: string;
  item_id: string;
};

type PlaidTokenStore = Record<string, PlaidTokenRecord>;

const DEFAULT_PATH = path.join(process.cwd(), "data", "plaidTokens.json");

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

export function loadPlaidTokens(filePath = DEFAULT_PATH): PlaidTokenStore {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PlaidTokenStore;
  } catch {
    // If file is corrupted, fail "safe" to empty
    return {};
  }
}

export function savePlaidTokens(store: PlaidTokenStore, filePath = DEFAULT_PATH) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf8");
}

export function upsertPlaidToken(
  userId: string,
  record: PlaidTokenRecord,
  filePath = DEFAULT_PATH
) {
  const store = loadPlaidTokens(filePath);
  store[userId] = record;
  savePlaidTokens(store, filePath);
}

export function getPlaidToken(userId: string, filePath = DEFAULT_PATH): PlaidTokenRecord | null {
  const store = loadPlaidTokens(filePath);
  return store[userId] ?? null;
}
