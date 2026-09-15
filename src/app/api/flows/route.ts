import { isDbConfigured, listFlows } from "@/lib/db";

// Lista de flujos. `configured: false` le dice al cliente que use localStorage;
// `uploads` indica si se pueden subir archivos al material de apoyo (Vercel Blob).
export async function GET() {
  if (!isDbConfigured()) return Response.json({ configured: false, uploads: false, flows: [] });
  try {
    const uploads = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
    return Response.json({ configured: true, uploads, flows: await listFlows() });
  } catch (e) {
    console.error("[flows] error leyendo Turso", e);
    return Response.json({ error: "No se pudo leer la base de datos" }, { status: 500 });
  }
}
