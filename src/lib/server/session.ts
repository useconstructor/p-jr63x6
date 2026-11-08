import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import { getDatabase } from "@/lib/db";
import { ApiError, handle, json, readObject, requireOrigin, strictFields, validateQuery, validationErrors } from "./http";
import { ensureNotesSchema, requireForeignKeys } from "./schema";

export const SESSION_COOKIE = "notas_session";

export function credentialHash(request: Request): string | undefined {
  const matches = (request.headers.get("cookie") ?? "").split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (matches.length !== 1) return undefined;
  const credential = matches[0].slice(SESSION_COOKIE.length + 1);
  if (!/^[0-9a-f]{64}$/.test(credential)) return undefined;
  return createHash("sha256").update(credential).digest("hex");
}

export function sessionRequired(): never {
  throw new ApiError(401, "SESSION_REQUIRED", "Necesitas una sesión privada. Comprueba que las cookies estén permitidas e inténtalo de nuevo.");
}

export async function ownerForHash(tx: Transaction, hash: string): Promise<string | undefined> {
  const result = await tx.execute({
    sql: "SELECT id FROM sessions WHERE credential_hash = ?",
    args: [hash],
  });
  return result.rows.length ? String(result.rows[0].id) : undefined;
}

export async function requireOwner(tx: Transaction, hash: string): Promise<string> {
  return (await ownerForHash(tx, hash)) ?? sessionRequired();
}

export function postSession(request: Request) {
  return handle(async () => {
    const origin = requireOrigin(request);
    validateQuery(request);
    const body = await readObject(request);
    const fields = strictFields(body, ["action"]);
    if (body.action !== "ensure" && body.action !== "verify") {
      fields.action = "Elige ensure o verify para la sesión.";
    }
    validationErrors(fields);
    const hash = credentialHash(request);
    if (body.action === "verify" && !hash) sessionRequired();
    await ensureNotesSchema();
    const tx = await getDatabase().transaction(body.action === "ensure" ? "write" : "read");
    try {
      await requireForeignKeys(tx);
      const owner = hash ? await ownerForHash(tx, hash) : undefined;
      if (owner) {
        await tx.commit();
        return json({ ready: true });
      }
      if (body.action === "verify") sessionRequired();
      const credential = randomBytes(32).toString("hex");
      await tx.execute({
        sql: "INSERT INTO sessions(id, credential_hash) VALUES (?, ?)",
        args: [randomUUID(), createHash("sha256").update(credential).digest("hex")],
      });
      await tx.commit();
      const response = json({ ready: true });
      // Origin was checked against trusted runtime configuration. This also
      // works behind HTTPS termination, where the internal Request URL is HTTP.
      const secure = new URL(origin).protocol === "https:";
      response.cookies.set(SESSION_COOKIE, credential, {
        path: "/",
        httpOnly: true,
        secure,
        sameSite: secure ? "none" : "lax",
        ...(secure ? { partitioned: true } : {}),
        maxAge: 60 * 60 * 24 * 365,
      });
      return response;
    } finally {
      tx.close();
    }
  });
}
