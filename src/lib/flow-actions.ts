"use server";

// Escrituras a Turso. Las Server Actions son endpoints públicos (POST), así que
// todo lo que llega del cliente se valida contra la definición del flujo.

import * as db from "./db";
import {
  DOC_KEYS,
  DOC_STATUSES,
  EDITABLE,
  STATUSES,
  normalizeUrl,
  type DocStatus,
  type Flow,
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
  await db.deleteFlow(id);
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
