import "server-only";
import { createClient, type Client } from "@libsql/client";

let client: Client | undefined;

// Resolve provisioned credentials only at runtime, never during page compilation.
export function getDatabase(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) throw new Error("Database configuration unavailable");
    client = createClient({ url, authToken });
  }
  return client;
}

// Retain the existing helper's export without eagerly opening a connection.
export const db: Client = new Proxy({} as Client, {
  get(_target, property) {
    const database = getDatabase();
    const value = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});
