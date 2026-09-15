// Acceso a Turso (libSQL). Solo se usa en el servidor (Route Handlers y Server Actions).

import { createClient, type Client, type Row } from "@libsql/client";
import type { Flow, NodeState } from "./flow-definition";

const SCHEMA = `CREATE TABLE IF NOT EXISTS flows (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  nodes       TEXT NOT NULL DEFAULT '{}',
  links       TEXT NOT NULL DEFAULT '{}'
)`;

let client: Client | null = null;
let ready: Promise<void> | null = null;

export function isDbConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

/** Cliente perezoso: no se crea en el build y crea la tabla la primera vez. */
async function db(): Promise<Client> {
  if (!isDbConfigured()) throw new Error("Turso no está configurado (falta TURSO_DATABASE_URL).");
  if (!client) {
    const c = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    client = c;
    ready = c.execute(SCHEMA).then(
      () => undefined,
      (e) => {
        client = null;
        ready = null;
        throw e;
      },
    );
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
  };
}

export async function listFlows(): Promise<Flow[]> {
  const res = await (await db()).execute("SELECT * FROM flows ORDER BY updated_at DESC");
  return res.rows.map(toFlow);
}

/** Inserta flujos; los que ya existan (mismo id) se ignoran. */
export async function insertFlows(flows: Flow[]) {
  if (!flows.length) return;
  await (await db()).batch(
    flows.map((f) => ({
      sql: `INSERT OR IGNORE INTO flows (id, name, description, created_at, updated_at, nodes, links)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        f.id,
        f.name,
        f.description,
        f.createdAt,
        f.updatedAt,
        JSON.stringify(f.nodes),
        JSON.stringify(f.links ?? {}),
      ],
    })),
    "write",
  );
}

export async function updateFlowInfo(id: string, name: string, description: string) {
  await (await db()).execute({
    sql: "UPDATE flows SET name = ?, description = ?, updated_at = ? WHERE id = ?",
    args: [name, description, Date.now(), id],
  });
}

export async function deleteFlow(id: string) {
  await (await db()).execute({ sql: "DELETE FROM flows WHERE id = ?", args: [id] });
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

export async function setDocLink(id: string, docKey: string, url: string | null) {
  const path = jsonPath(docKey);
  await (await db()).execute(
    url
      ? {
          sql: "UPDATE flows SET links = json_set(links, ?, ?), updated_at = ? WHERE id = ?",
          args: [path, url, Date.now(), id],
        }
      : {
          sql: "UPDATE flows SET links = json_remove(links, ?), updated_at = ? WHERE id = ?",
          args: [path, Date.now(), id],
        },
  );
}
