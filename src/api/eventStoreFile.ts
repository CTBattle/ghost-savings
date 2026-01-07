import fs from "node:fs";
import path from "node:path";
import type { DomainEvent } from "../domain/ledger/events.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const EVENTS_PATH = path.join(DATA_DIR, "events.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadEventsFromDisk(): DomainEvent[] {
  try {
    if (!fs.existsSync(EVENTS_PATH)) return [];
    const raw = fs.readFileSync(EVENTS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DomainEvent[];
  } catch {
    return [];
  }
}

export function saveEventsToDisk(events: DomainEvent[]) {
  ensureDataDir();
  fs.writeFileSync(EVENTS_PATH, JSON.stringify(events, null, 2), "utf-8");
}

export function getEventsFilePath() {
  return EVENTS_PATH;
}
