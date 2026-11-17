import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { isExportMode } from "./export-mode.ts";

interface MercurySyncStore {
  transactionIds: string[];
  updatedAt?: string;
}

const FILE = "mercury-sync.json";

function path(): string {
  return join(config.dataDir, FILE);
}

function readStore(): MercurySyncStore {
  const file = path();
  if (!existsSync(file)) return { transactionIds: [] };
  try {
    return JSON.parse(readFileSync(file, "utf8")) as MercurySyncStore;
  } catch {
    return { transactionIds: [] };
  }
}

/** Load all known Mercury transaction ids once (O(1) lookups via Set). */
export function loadMercuryTransactionIds(): Set<string> {
  if (isExportMode()) return new Set();
  return new Set(readStore().transactionIds);
}

export function hasMercuryTransactionId(id: string, known?: Set<string>): boolean {
  return (known ?? loadMercuryTransactionIds()).has(id);
}

export function rememberMercuryTransactionIds(ids: string[]): void {
  if (!ids.length || isExportMode()) return;
  const store = readStore();
  const set = new Set(store.transactionIds);
  for (const id of ids) set.add(id);
  writeFileSync(path(), JSON.stringify({ transactionIds: [...set], updatedAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
}
