import "server-only";
import type { Transaction } from "@libsql/client";
import { getDatabase } from "@/lib/db";

let ready: Promise<void> | undefined;

export async function requireForeignKeys(tx: Transaction): Promise<void> {
  const result = await tx.execute("PRAGMA foreign_keys");
  // Turso enables foreign keys for every connection. Fail closed if a runtime
  // changes this; a PRAGMA on a different HTTP stream cannot configure this one.
  if (Number(result.rows[0]?.foreign_keys) !== 1) throw new Error("Foreign keys required");
}

async function migrate(): Promise<void> {
  const tx = await getDatabase().transaction("write");
  try {
    await requireForeignKeys(tx);
    await tx.execute(`CREATE TABLE IF NOT EXISTS notas_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`);
    const existing = await tx.execute("SELECT version FROM notas_schema_migrations ORDER BY version DESC LIMIT 1");
    const version = Number(existing.rows[0]?.version ?? 0);
    if (version > 1) throw new Error("Unsupported schema version");
    if (version < 1) {
      await tx.batch([
        `CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          credential_hash TEXT UNIQUE NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY NOT NULL,
          owner_id TEXT NOT NULL REFERENCES sessions(id),
          title TEXT NOT NULL,
          text TEXT NOT NULL,
          pinned INTEGER NOT NULL CHECK (pinned IN (0,1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision >= 1)
        )`,
        `CREATE TABLE IF NOT EXISTS operations (
          owner_id TEXT NOT NULL REFERENCES sessions(id),
          idempotency_key TEXT NOT NULL,
          payload TEXT NOT NULL,
          result TEXT NOT NULL,
          PRIMARY KEY (owner_id, idempotency_key)
        )`,
        "CREATE INDEX IF NOT EXISTS notes_owner_order ON notes(owner_id, pinned DESC, updated_at DESC, id ASC)",
        "CREATE INDEX IF NOT EXISTS notes_owner_recent ON notes(owner_id, updated_at DESC, id ASC)",
      ]);
      // Detect an incompatible preexisting starter schema without resetting it.
      await tx.execute("SELECT id, credential_hash FROM sessions LIMIT 0");
      await tx.execute({
        sql: "INSERT INTO notas_schema_migrations(version, applied_at) VALUES (?, ?)",
        args: [1, new Date().toISOString()],
      });
    }
    await tx.commit();
  } finally {
    // close() rolls back any still-open transaction, including failed migrations.
    tx.close();
  }
}

export function ensureNotesSchema(): Promise<void> {
  if (!ready) {
    ready = migrate().catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
  }
  return ready;
}
