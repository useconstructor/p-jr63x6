export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    nombre: "Notas de Bolsillo",
    descripcion: "Un ejemplo de Esteban para probar Constructor.",
  }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
