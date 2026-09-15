import { get } from "@vercel/blob";
import { getMaterial, isDbConfigured } from "@/lib/db";
import { INLINE_MATERIAL_TYPES } from "@/lib/flow-definition";

const notFound = () => new Response("Archivo no encontrado", { status: 404 });

// Sirve un archivo del Blob privado. PDFs, imágenes y texto se abren en el navegador;
// cualquier otro tipo se descarga (evita ejecutar HTML/SVG subidos como página).
export async function GET(_request: Request, ctx: RouteContext<"/api/material/[id]">) {
  const { id } = await ctx.params;
  if (!isDbConfigured() || !/^[a-z0-9]{4,40}$/.test(id)) return notFound();

  const material = await getMaterial(id);
  if (!material || material.kind !== "file") return notFound();

  const res = await get(material.url, { access: "private" });
  if (!res || res.statusCode !== 200) return notFound();

  const type = res.blob.contentType || "application/octet-stream";
  const disposition = INLINE_MATERIAL_TYPES.test(type) ? "inline" : "attachment";
  return new Response(res.stream, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(res.blob.size),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(material.title)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
