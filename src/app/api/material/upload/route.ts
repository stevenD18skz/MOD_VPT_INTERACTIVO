import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { flowExists, isDbConfigured } from "@/lib/db";
import { MAX_MATERIAL_BYTES } from "@/lib/flow-definition";

// Autoriza subidas directas del navegador al Blob privado. El registro en la base
// de datos lo hace la Server Action `addFileMaterial` cuando termina la subida.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { flowId } = JSON.parse(clientPayload ?? "{}") as { flowId?: unknown };
        if (!isDbConfigured() || typeof flowId !== "string" || !/^[a-z0-9]{4,40}$/.test(flowId)) {
          throw new Error("Flujo no válido");
        }
        if (!pathname.startsWith(`material/${flowId}/`) || !(await flowExists(flowId))) {
          throw new Error("Flujo no válido");
        }
        return { maximumSizeInBytes: MAX_MATERIAL_BYTES, addRandomSuffix: true };
      },
    });
    return Response.json(result);
  } catch (e) {
    console.error("[material] subida rechazada", e);
    return Response.json({ error: e instanceof Error ? e.message : "No se pudo subir" }, { status: 400 });
  }
}
