import "server-only";
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public current?: unknown,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie, Origin",
    },
  });
}

export async function handle(action: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ApiError) {
      return json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.fields ? { fields: error.fields } : {}),
        },
        ...(error.current ? { current: error.current } : {}),
      }, error.status);
    }
    // Never serialize database errors, submitted content, cookies or diagnostics.
    return json({ error: {
      code: "SERVICE_UNAVAILABLE",
      message: "No se pudo completar la solicitud. Inténtalo de nuevo.",
    } }, 503);
  }
}

function configuredOrigin(value: string | undefined, preview = false): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(preview && !value.includes("://") ? `https://${value}` : value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function requireOrigin(request: Request): string {
  const allowed = [
    configuredOrigin(process.env.APP_ORIGIN),
    configuredOrigin(process.env.VERCEL_URL, true),
  ].filter((value): value is string => Boolean(value));
  const origin = request.headers.get("origin");
  if (!origin || !allowed.includes(origin)) {
    throw new ApiError(403, "ORIGIN_REJECTED", "El origen de la solicitud no está permitido.");
  }
  return origin;
}

export async function readObject(request: Request): Promise<Record<string, unknown>> {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Envía la solicitud como JSON.");
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new ApiError(400, "INVALID_JSON", "El JSON de la solicitud no es válido."); }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Envía un objeto JSON.", { body: "Se requiere un objeto JSON." });
  }
  return body as Record<string, unknown>;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateId(id: string): void {
  if (!UUID.test(id)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Revisa el identificador de la nota.", { id: "Se requiere un identificador UUID válido." });
  }
}

export function strictFields(body: Record<string, unknown>, allowed: readonly string[]): Record<string, string> {
  const errors: Record<string, string> = Object.create(null);
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) errors[key] = "Este campo no está permitido.";
  }
  return errors;
}

export function validationErrors(fields: Record<string, string>): void {
  if (Object.keys(fields).length) {
    throw new ApiError(400, "VALIDATION_ERROR", "Revisa los campos indicados.", fields);
  }
}

export function validateQuery(request: Request, allowed: readonly string[] = []): URLSearchParams {
  const params = new URL(request.url).searchParams;
  const fields: Record<string, string> = Object.create(null);
  for (const key of params.keys()) {
    if (!allowed.includes(key)) fields[key] = "Este parámetro no está permitido.";
    else if (params.getAll(key).length !== 1) fields[key] = "Envía este parámetro una sola vez.";
  }
  validationErrors(fields);
  return params;
}
