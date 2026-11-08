import "server-only";
import { randomUUID } from "node:crypto";
import type { Row, Transaction } from "@libsql/client";
import { getDatabase } from "@/lib/db";
import { ApiError, UUID, handle, json, readObject, requireOrigin, strictFields, validateId, validateQuery, validationErrors } from "./http";
import { ensureNotesSchema, requireForeignKeys } from "./schema";
import { credentialHash, requireOwner, sessionRequired } from "./session";

export type Note = {
  id: string;
  title: string;
  text: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
  revision: number;
};

const COLUMNS = "id, title, text, pinned, created_at, updated_at, revision";
type Mutation = "crear" | "guardar" | "fijar" | "eliminar";
type Receipt = { status: number; body: { note: Note } | { deleted: { id: string; revision: number; updated_at: string } } };

function noteFromRow(row: Row): Note {
  return {
    id: String(row.id),
    title: String(row.title),
    text: String(row.text),
    pinned: Number(row.pinned) === 1,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    revision: Number(row.revision),
  };
}

function notFound(): never {
  throw new ApiError(404, "NOT_FOUND", "No se encontró la nota.");
}

async function findNote(tx: Transaction, owner: string, id: string): Promise<Note> {
  const result = await tx.execute({
    sql: `SELECT ${COLUMNS} FROM notes WHERE owner_id = ? AND id = ?`,
    args: [owner, id],
  });
  return result.rows.length ? noteFromRow(result.rows[0]) : notFound();
}

async function ownedRead<T>(request: Request, read: (tx: Transaction, owner: string) => Promise<T>): Promise<T> {
  const hash = credentialHash(request) ?? sessionRequired();
  await ensureNotesSchema();
  const tx = await getDatabase().transaction("read");
  try {
    const owner = await requireOwner(tx, hash);
    const result = await read(tx, owner);
    await tx.commit();
    return result;
  } finally { tx.close(); }
}

async function allNotes(tx: Transaction, owner: string): Promise<Note[]> {
  const result = await tx.execute({
    sql: `SELECT ${COLUMNS} FROM notes WHERE owner_id = ? ORDER BY pinned DESC, updated_at DESC, id ASC`,
    args: [owner],
  });
  return result.rows.map(noteFromRow);
}

export function getNotes(request: Request) {
  return handle(async () => {
    const params = validateQuery(request, ["q"]);
    const query = (params.get("q") ?? "").toLowerCase();
    return json(await ownedRead(request, async (tx, owner) => {
      const all = await allNotes(tx, owner);
      const notes = query === "" ? all : all.filter((note) =>
        note.title.toLowerCase().includes(query) || note.text.toLowerCase().includes(query));
      return { notes, total: all.length, matched: notes.length };
    }));
  });
}

export function getSummary(request: Request) {
  return handle(async () => {
    validateQuery(request);
    return json(await ownedRead(request, async (tx, owner) => {
      const all = await allNotes(tx, owner);
      const recent = [...all].sort((a, b) => {
        if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at ? -1 : 1;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      const pinnedNotes = recent.filter((note) => note.pinned);
      return { total: all.length, pinned: pinnedNotes.length, recent: recent.slice(0, 8), pinnedNotes };
    }));
  });
}

export function getNote(request: Request, id: string) {
  return handle(async () => {
    validateQuery(request);
    validateId(id);
    return json(await ownedRead(request, async (tx, owner) => ({ note: await findNote(tx, owner, id) })));
  });
}

function validateMutation(body: Record<string, unknown>, kind: Mutation): void {
  const allowed = ["idempotency_key"];
  if (kind !== "crear") allowed.push("expected_revision");
  if (kind === "crear" || kind === "guardar") allowed.push("title", "text");
  if (kind === "fijar") allowed.push("pinned");
  const fields = strictFields(body, allowed);
  if (typeof body.idempotency_key !== "string" || !UUID.test(body.idempotency_key)) {
    fields.idempotency_key = "Se requiere una clave UUID válida para esta operación.";
  }
  if (kind !== "crear" && (
    typeof body.expected_revision !== "number" ||
    !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 1
  )) fields.expected_revision = "Se requiere una revisión entera positiva válida.";
  if (kind === "crear" || kind === "guardar") {
    if (typeof body.title !== "string") fields.title = "El título debe ser texto.";
    else if (!body.title.trim().length) fields.title = "Escribe un título.";
    if (typeof body.text !== "string") fields.text = "El texto debe ser una cadena; puede estar vacía.";
  }
  if (kind === "fijar" && typeof body.pinned !== "boolean") fields.pinned = "Indica la fijación con un valor booleano.";
  validationErrors(fields);
}

// Mutation bodies are flat and strictly typed, so sorted top-level keys fully
// canonicalize intent without changing any string or scalar value.
function canonicalPayload(path: string, body: Record<string, unknown>): string {
  const sorted = Object.fromEntries(Object.keys(body).sort().map((key) => [key, body[key]]));
  return JSON.stringify({ method: "POST", path, body: sorted });
}

function isBusy(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return ["SQLITE_BUSY", "SQLITE_BUSY_SNAPSHOT", "SQLITE_LOCKED"].includes(String(error.code));
}

async function mutate(
  hash: string,
  kind: Mutation,
  id: string | undefined,
  body: Record<string, unknown>,
  payload: string,
): Promise<Receipt> {
  // BEGIN IMMEDIATE serializes first submissions as well as replays. Retry only
  // known lock contention; ambiguous commits stay uncertain for client recovery.
  for (let attempt = 0; ; attempt++) {
    let tx: Transaction | undefined;
    try {
      tx = await getDatabase().transaction("write");
      await requireForeignKeys(tx);
      const owner = await requireOwner(tx, hash);
      const key = body.idempotency_key as string;
      const previous = await tx.execute({
        sql: "SELECT payload, result FROM operations WHERE owner_id = ? AND idempotency_key = ?",
        args: [owner, key],
      });
      if (previous.rows.length) {
        if (previous.rows[0].payload !== payload) {
          throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Esta clave ya se usó para otra operación. Recupera la operación original o inicia una nueva.");
        }
        const receipt = JSON.parse(String(previous.rows[0].result)) as Receipt;
        await tx.commit();
        return receipt;
      }

      let receipt: Receipt;
      if (kind === "crear") {
        const now = new Date().toISOString();
        const result = await tx.execute({
          sql: `INSERT INTO notes(id, owner_id, title, text, pinned, created_at, updated_at, revision)
                VALUES (?, ?, ?, ?, 0, ?, ?, 1) RETURNING ${COLUMNS}`,
          args: [randomUUID(), owner, body.title as string, body.text as string, now, now],
        });
        receipt = { status: 201, body: { note: noteFromRow(result.rows[0]) } };
      } else {
        const current = await findNote(tx, owner, id!);
        if (current.revision !== body.expected_revision) {
          throw new ApiError(409, "REVISION_CONFLICT", "La nota ha cambiado. Compara las versiones antes de guardar.", undefined, current);
        }
        if (current.revision >= Number.MAX_SAFE_INTEGER) {
          throw new ApiError(503, "SERVICE_UNAVAILABLE", "No se puede actualizar esta nota ahora. Conserva el texto e inténtalo de nuevo.");
        }
        const now = new Date().toISOString();
        if (kind === "eliminar") {
          const result = await tx.execute({
            sql: "DELETE FROM notes WHERE owner_id = ? AND id = ? AND revision = ?",
            args: [owner, id!, current.revision],
          });
          if (result.rowsAffected !== 1) throw new Error("Conditional delete failed");
          receipt = { status: 200, body: { deleted: { id: id!, revision: current.revision + 1, updated_at: now } } };
        } else {
          // Column names are fixed by this whitelist, never supplied by a caller.
          const assignment = kind === "guardar" ? "title = ?, text = ?" : "pinned = ?";
          const changes = kind === "guardar"
            ? [body.title as string, body.text as string]
            : [body.pinned ? 1 : 0];
          const result = await tx.execute({
            sql: `UPDATE notes SET ${assignment}, revision = revision + 1, updated_at = ?
                  WHERE owner_id = ? AND id = ? AND revision = ? RETURNING ${COLUMNS}`,
            args: [...changes, now, owner, id!, current.revision],
          });
          if (result.rows.length !== 1) throw new Error("Conditional update failed");
          receipt = { status: 200, body: { note: noteFromRow(result.rows[0]) } };
        }
      }
      await tx.execute({
        sql: "INSERT INTO operations(owner_id, idempotency_key, payload, result) VALUES (?, ?, ?, ?)",
        args: [owner, key, payload, JSON.stringify(receipt)],
      });
      await tx.commit();
      return receipt;
    } catch (error) {
      if (!isBusy(error) || attempt >= 5) throw error;
    } finally {
      tx?.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
  }
}

export function postNote(request: Request, kind: Mutation, id?: string) {
  return handle(async () => {
    requireOrigin(request);
    validateQuery(request);
    if (kind !== "crear") validateId(id ?? "");
    const body = await readObject(request);
    validateMutation(body, kind);
    const hash = credentialHash(request) ?? sessionRequired();
    await ensureNotesSchema();
    const path = kind === "crear" ? "/api/notas" : `/api/notas/${id}/${kind}`;
    const receipt = await mutate(hash, kind, id, body, canonicalPayload(path, body));
    return json(receipt.body, receipt.status);
  });
}
