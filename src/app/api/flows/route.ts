import { isDbConfigured, listFlows } from "@/lib/db";

// Lista de flujos. `configured: false` le dice al cliente que use localStorage.
export async function GET() {
  if (!isDbConfigured()) return Response.json({ configured: false, flows: [] });
  try {
    return Response.json({ configured: true, flows: await listFlows() });
  } catch (e) {
    console.error("[flows] error leyendo Turso", e);
    return Response.json({ error: "No se pudo leer la base de datos" }, { status: 500 });
  }
}
