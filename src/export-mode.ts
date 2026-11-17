import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Export mode runs the normal sheet-sync code read-only: the sheet webhook is not called and the
 * per-bank "already synced" stores are neither read nor written. Used by POST /cron/export-transactions
 * so cfo.hosthub.com can pull transactions without changing what the sheet sync will add next.
 */
const store = new AsyncLocalStorage<true>();

export function isExportMode(): boolean {
  return store.getStore() === true;
}

export function runInExportMode<T>(fn: () => Promise<T>): Promise<T> {
  return store.run(true, fn);
}
