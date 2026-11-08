import { getNotes, postNote } from "@/lib/server/notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = getNotes;
export function POST(request: Request) {
  return postNote(request, "crear");
}
