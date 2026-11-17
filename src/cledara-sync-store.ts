import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { isExportMode } from "./export-mode.ts";

interface CledaraSyncStore {
  transactionIds: string[];
  updatedAt?: string;
}

const FILE = "cledara-sync.json";

function path(): string {
  return join(config.dataDir, FILE);
}

function readStore(): CledaraSyncStore {
  const file = path();
  if (!existsSync(file)) return { transactionIds: [] };
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CledaraSyncStore;
  } catch {
    return { transactionIds: [] };
  }
}

export function loadCledaraTransactionIds(): Set<string> {
  if (isExportMode()) return new Set();
  return new Set(readStore().transactionIds);
}

export function rememberCledaraTransactionIds(ids: string[]): void {
  if (!ids.length || isExportMode()) return;
  const store = readStore();
  const set = new Set(store.transactionIds);
  for (const id of ids) set.add(id);
  writeFileSync(path(), JSON.stringify({ transactionIds: [...set], updatedAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
}
