// Acceso a Turso (libSQL). Solo se usa en el servidor (Route Handlers y Server Actions).

import { createClient, type Client, type InStatement, type Row } from "@libsql/client";
import type { DocStatus, Flow, Material, NodeState } from "./flow-definition";

const SCHEMA = `CREATE TABLE IF NOT EXISTS flows (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  nodes       TEXT NOT NULL DEFAULT '{}',
  links       TEXT NOT NULL DEFAULT '{}',
  doc_status  TEXT NOT NULL DEFAULT '{}'
)`;

const MATERIALS_SCHEMA = `CREATE TABLE IF NOT EXISTS materials (
  id           TEXT PRIMARY KEY,
  flow_id      TEXT NOT NULL,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  size         INTEGER,
  content_type TEXT,
  created_at   INTEGER NOT NULL
)`;

let client: Client | null = null;
let ready: Promise<void> | null = null;

export function isDbConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

/** Crea las tablas y agrega columnas nuevas a bases creadas con versiones anteriores. */
async function migrate(c: Client) {
  await c.batch(
    [SCHEMA, MATERIALS_SCHEMA, "CREATE INDEX IF NOT EXISTS materials_flow ON materials (flow_id)"],
    "write",
  );
  const cols = await c.execute("PRAGMA table_info(flows)");
  if (!cols.rows.some((r) => r.name === "doc_status")) {
    try {
      await c.execute("ALTER TABLE flows ADD COLUMN doc_status TEXT NOT NULL DEFAULT '{}'");
    } catch (e) {
      // Otra instancia pudo agregarla al mismo tiempo.
      if (!String(e).includes("duplicate column")) throw e;
    }
  }
}

/** Cliente perezoso: no se crea en el build y prepara las tablas la primera vez. */
async function db(): Promise<Client> {
  if (!isDbConfigured()) throw new Error("Turso no está configurado (falta TURSO_DATABASE_URL).");
  if (!client) {
    const c = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    client = c;
    ready = migrate(c).catch((e) => {
      client = null;
      ready = null;
      throw e;
    });
  }
  await ready;
  return client!;
}

function parseJson<T>(v: unknown): T {
  try {
    return JSON.parse(String(v ?? "{}")) as T;
  } catch {
    return {} as T;
  }
}

function toFlow(r: Row): Flow {
  return {
    id: String(r.id),
    name: String(r.name),
    description: String(r.description ?? ""),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    nodes: parseJson<Record<string, NodeState>>(r.nodes),
    links: parseJson<Record<string, string>>(r.links),
    docs: parseJson<Record<string, DocStatus>>(r.doc_status),
  };
}

function toMaterial(r: Row): Material {
  return {
    id: String(r.id),
    kind: r.kind === "file" ? "file" : "link",
    title: String(r.title),
    url: String(r.url),
    size: r.size == null ? undefined : Number(r.size),
    contentType: r.content_type == null ? undefined : String(r.content_type),
    createdAt: Number(r.created_at),
  };
}

export async function listFlows(): Promise<Flow[]> {
  const [flows, materials] = await (await db()).batch(
    ["SELECT * FROM flows ORDER BY updated_at DESC", "SELECT * FROM materials ORDER BY created_at"],
    "read",
  );
  const byFlow = new Map<string, Material[]>();
  for (const r of materials.rows) {
    const key = String(r.flow_id);
    byFlow.set(key, [...(byFlow.get(key) ?? []), toMaterial(r)]);
  }
  return flows.rows.map((r) => ({ ...toFlow(r), materials: byFlow.get(String(r.id)) ?? [] }));
}

export async function flowExists(id: string) {
  const res = await (await db()).execute({ sql: "SELECT 1 FROM flows WHERE id = ?", args: [id] });
  return res.rows.length > 0;
}

function materialInsert(flowId: string, m: Material, orIgnore = false): InStatement {
  return {
    sql: `INSERT ${orIgnore ? "OR IGNORE " : ""}INTO materials (id, flow_id, kind, title, url, size, content_type, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [m.id, flowId, m.kind, m.title, m.url, m.size ?? null, m.contentType ?? null, m.createdAt],
  };
}

/** Inserta flujos (con su material); los que ya existan (mismo id) se ignoran. */
export async function insertFlows(flows: Flow[]) {
  if (!flows.length) return;
  await (await db()).batch(
    flows.flatMap((f) => [
      {
        sql: `INSERT OR IGNORE INTO flows (id, name, description, created_at, updated_at, nodes, links, doc_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          f.id,
          f.name,
          f.description,
          f.createdAt,
          f.updatedAt,
          JSON.stringify(f.nodes),
          JSON.stringify(f.links ?? {}),
          JSON.stringify(f.docs ?? {}),
        ],
      },
      ...(f.materials ?? []).map((m) => materialInsert(f.id, m, true)),
    ]),
    "write",
  );
}

export async function updateFlowInfo(id: string, name: string, description: string) {
  await (await db()).execute({
    sql: "UPDATE flows SET name = ?, description = ?, updated_at = ? WHERE id = ?",
    args: [name, description, Date.now(), id],
  });
}

/** Borra el flujo y su material; devuelve las URLs de archivos para borrarlos del Blob. */
export async function deleteFlow(id: string): Promise<string[]> {
  const c = await db();
  const files = await c.execute({
    sql: "SELECT url FROM materials WHERE flow_id = ? AND kind = 'file'",
    args: [id],
  });
  await c.batch(
    [
      { sql: "DELETE FROM materials WHERE flow_id = ?", args: [id] },
      { sql: "DELETE FROM flows WHERE id = ?", args: [id] },
    ],
    "write",
  );
  return files.rows.map((r) => String(r.url));
}

// Las rutas JSON usan claves entre comillas; los ids de paso y nombres de documento
// vienen de listas fijas (validadas en las Server Actions) y no contienen comillas.
const jsonPath = (key: string) => `$."${key}"`;

/** Mezcla `patch` en el estado de un paso sin tocar el resto de pasos. */
export async function patchNode(id: string, nodeId: string, patch: NodeState) {
  const path = jsonPath(nodeId);
  await (await db()).execute({
    sql: `UPDATE flows
          SET nodes = json_set(nodes, ?, json(json_patch(coalesce(json_extract(nodes, ?), '{}'), ?))),
              updated_at = ?
          WHERE id = ?`,
    args: [path, path, JSON.stringify(patch), Date.now(), id],
  });
}

/** Asigna (o quita, con `null`) una clave de un objeto JSON de la fila. */
async function setJsonKey(column: "links" | "doc_status", id: string, key: string, value: string | null) {
  const path = jsonPath(key);
  await (await db()).execute(
    value
      ? {
          sql: `UPDATE flows SET ${column} = json_set(${column}, ?, ?), updated_at = ? WHERE id = ?`,
          args: [path, value, Date.now(), id],
        }
      : {
          sql: `UPDATE flows SET ${column} = json_remove(${column}, ?), updated_at = ? WHERE id = ?`,
          args: [path, Date.now(), id],
        },
  );
}

export async function setDocLink(id: string, docKey: string, url: string | null) {
  await setJsonKey("links", id, docKey, url);
}

/** "empty" es el estado por defecto, así que se guarda quitando la clave. */
export async function setDocStatus(id: string, docKey: string, status: DocStatus) {
  await setJsonKey("doc_status", id, docKey, status === "empty" ? null : status);
}

/* ================= material de apoyo ================= */

export async function insertMaterial(flowId: string, m: Material) {
  await (await db()).batch(
    [materialInsert(flowId, m), { sql: "UPDATE flows SET updated_at = ? WHERE id = ?", args: [Date.now(), flowId] }],
    "write",
  );
}

export async function getMaterial(id: string): Promise<Material | null> {
  const res = await (await db()).execute({ sql: "SELECT * FROM materials WHERE id = ?", args: [id] });
  return res.rows.length ? toMaterial(res.rows[0]) : null;
}

/** Borra un material del flujo y lo devuelve (para borrar su archivo del Blob). */
export async function deleteMaterial(flowId: string, id: string): Promise<Material | null> {
  const c = await db();
  const res = await c.execute({
    sql: "SELECT * FROM materials WHERE id = ? AND flow_id = ?",
    args: [id, flowId],
  });
  if (!res.rows.length) return null;
  await c.batch(
    [
      { sql: "DELETE FROM materials WHERE id = ?", args: [id] },
      { sql: "UPDATE flows SET updated_at = ? WHERE id = ?", args: [Date.now(), flowId] },
    ],
    "write",
  );
  return toMaterial(res.rows[0]);
}
