import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "../env.js";
import * as schema from "./schema.js";

const sqlite = new Database(env.databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

/**
 * Closes the native SQLite handle. Must be called before process exit —
 * tsx watch (and any other hard process restart) can otherwise crash
 * with a native assertion failure while better-sqlite3 tears down mid-teardown.
 */
export function closeDb(): void {
  sqlite.close();
}
