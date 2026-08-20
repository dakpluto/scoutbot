import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { env } from "../env.js";

const sqlite = new Database(env.databasePath);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: "./drizzle" });

console.log(`Migrations applied to ${env.databasePath}`);
sqlite.close();
