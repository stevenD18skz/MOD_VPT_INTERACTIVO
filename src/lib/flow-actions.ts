"use server";

// Escrituras a Turso. Las Server Actions son endpoints públicos (POST), así que
// todo lo que llega del cliente se valida contra la definición del flujo.

import { del } from "@vercel/blob";
import * as db from "./db";
import {
  DOC_KEYS,
  DOC_STATUSES,
  EDITABLE,
  MAX_MATERIAL_BYTES,
  STATUSES,
  normalizeUrl,
  type DocStatus,
  type Flow,
  type Material,
  type NodeState,
  type Status,
} from "./flow-definition";

const NODE_IDS = new Set(EDITABLE.map((n) => n.id));
const DOC_SET = new Set(DOC_KEYS);
const STATUS_SET = new Set<string>(STATUSES.map((s) => s.key));
const DOC_STATUS_SET = new Set<string>(DOC_STATUSES.map((s) => s.key));
const MAX_NAME = 200;
const MAX_DESC = 2000;
const MAX_NOTE = 20000;

function check(cond: unknown): asserts cond {
  if (!cond) throw new Error("Datos no válidos");
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{4,40}$/.test(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const isName = (v: unknown): v is string => isText(v, MAX_NAME) && v.trim().length > 0;

function cleanNodes(raw: unknown): Record<string, NodeState> {
  const out: Record<string, NodeState> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, v] of Object.entries(raw as Record<string, NodeState>)) {
    if (!NODE_IDS.has(id) || !v || typeof v !== "object") continue;
    const st: NodeState = {};
    if (typeof v.s === "string" && STATUS_SET.has(v.s)) st.s = v.s;
    if (isText(v.n, MAX_NOTE)) st.n = v.n;
    out[id] = st;
  }
  return out;
}

function cleanLinks(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const url = typeof v === "string" ? normalizeUrl(v) : null;
    if (DOC_SET.has(key) && url) out[key] = url;
  }
  return out;
}

function cleanDocs(raw: unknown): Record<string, DocStatus> {
  const out: Record<string, DocStatus> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (DOC_SET.has(key) && typeof v === "string" && DOC_STATUS_SET.has(v) && v !== "empty") {
      out[key] = v as DocStatus;
    }
  }
  return out;
}

/** Del navegador solo pueden venir enlaces (los archivos exigen Turso + Blob). */
function cleanMaterials(raw: unknown): Material[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).flatMap((m: Partial<Material>) => {
    const url = m?.kind === "link" && typeof m.url === "string" ? normalizeUrl(m.url) : null;
    if (!url || !isId(m.id) || !isName(m.title)) return [];
    const createdAt = Number.isFinite(m.createdAt) ? Number(m.createdAt) : Date.now();
    return [{ id: m.id, kind: "link" as const, title: m.title.trim(), url, createdAt }];
  });
}

/** Solo se aceptan URLs del Blob de este proyecto. */
function isOwnBlobUrl(u: string) {
  try {
    const { protocol, hostname } = new URL(u);
    if (protocol !== "https:" || !hostname.endsWith(".blob.vercel-storage.com")) return false;
    const storeId = /^vercel_blob_rw_([^_]+)_/.exec(process.env.BLOB_READ_WRITE_TOKEN ?? "")?.[1];
    return !storeId || hostname.startsWith(`${storeId.toLowerCase()}.`);
  } catch {
    return false;
  }
}

async function removeBlobs(urls: string[]) {
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(urls);
  } catch (e) {
    console.error("[material] no se pudo borrar del Blob", e);
  }
}

/** Sube a la base de datos los flujos que existían solo en el navegador. */
export async function importFlows(flows: Flow[]) {
  check(Array.isArray(flows) && flows.length <= 500);
  const clean = flows.map((f) => {
    check(isId(f?.id) && isName(f.name) && isText(f.description ?? "", MAX_DESC));
    const now = Date.now();
    return {
      id: f.id,
      name: f.name.trim(),
      description: (f.description ?? "").trim(),
      createdAt: Number.isFinite(f.createdAt) ? f.createdAt : now,
      updatedAt: Number.isFinite(f.updatedAt) ? f.updatedAt : now,
      nodes: cleanNodes(f.nodes),
      links: cleanLinks(f.links),
      docs: cleanDocs(f.docs),
      materials: cleanMaterials(f.materials),
    };
  });
  await db.insertFlows(clean);
}

export async function createFlow(id: string, name: string, description: string) {
  check(isId(id) && isName(name) && isText(description, MAX_DESC));
  const now = Date.now();
  await db.insertFlows([
    { id, name: name.trim(), description: description.trim(), createdAt: now, updatedAt: now, nodes: {}, links: {} },
  ]);
}

export async function updateFlowInfo(id: string, name: string, description: string) {
  check(isId(id) && isName(name) && isText(description, MAX_DESC));
  await db.updateFlowInfo(id, name.trim(), description.trim());
}

export async function deleteFlow(id: string) {
  check(isId(id));
  await removeBlobs(await db.deleteFlow(id));
}

export async function setNodeStatus(id: string, nodeId: string, s: Status) {
  check(isId(id) && NODE_IDS.has(nodeId) && STATUS_SET.has(s));
  await db.patchNode(id, nodeId, { s });
}

export async function setNodeNote(id: string, nodeId: string, n: string) {
  check(isId(id) && NODE_IDS.has(nodeId) && isText(n, MAX_NOTE));
  await db.patchNode(id, nodeId, { n });
}

export async function setDocLink(id: string, docKey: string, url: string | null) {
  check(isId(id) && DOC_SET.has(docKey));
  const clean = url === null ? null : normalizeUrl(url);
  check(url === null || clean);
  await db.setDocLink(id, docKey, clean);
}

export async function setDocStatus(id: string, docKey: string, status: DocStatus) {
  check(isId(id) && DOC_SET.has(docKey) && DOC_STATUS_SET.has(status));
  await db.setDocStatus(id, docKey, status);
}

/* ================= material de apoyo ================= */

export async function addLinkMaterial(flowId: string, id: string, title: string, url: string) {
  const clean = normalizeUrl(url);
  check(isId(flowId) && isId(id) && isName(title) && clean);
  check(await db.flowExists(flowId));
  await db.insertMaterial(flowId, { id, kind: "link", title: title.trim(), url: clean, createdAt: Date.now() });
}

export async function addFileMaterial(
  flowId: string,
  id: string,
  file: { title: string; url: string; size: number; contentType: string },
) {
  check(isId(flowId) && isId(id) && isName(file?.title) && isOwnBlobUrl(file.url));
  check(Number.isFinite(file.size) && file.size >= 0 && file.size <= MAX_MATERIAL_BYTES);
  check(isText(file.contentType, 200));
  check(await db.flowExists(flowId));
  await db.insertMaterial(flowId, {
    id,
    kind: "file",
    title: file.title.trim(),
    url: file.url,
    size: file.size,
    contentType: file.contentType || "application/octet-stream",
    createdAt: Date.now(),
  });
}

export async function deleteMaterial(flowId: string, id: string) {
  check(isId(flowId) && isId(id));
  const m = await db.deleteMaterial(flowId, id);
  if (m?.kind === "file") await removeBlobs([m.url]);
}
