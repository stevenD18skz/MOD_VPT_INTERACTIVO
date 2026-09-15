// Biblioteca de flujos guardada en localStorage (solo en este navegador).

import { useSyncExternalStore } from "react";
import type { NodeState, Status } from "./flow-definition";

export interface Flow {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  nodes: Record<string, NodeState>;
  /** Enlace de cada documento, por nombre del documento (ver DOC_KEYS). */
  links?: Record<string, string>;
}

const KEY = "flujo-interactivo:flows:v1";
const listeners = new Set<() => void>();
let cache: Flow[] | null = null;

function read(): Flow[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: Flow[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Mantiene sincronizadas otras pestañas abiertas.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Lista de flujos; `null` mientras no se ha leído el navegador (render en servidor). */
export function useFlows(): Flow[] | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createFlow(name: string, description: string): string {
  const now = Date.now();
  const flow: Flow = { id: newId(), name, description, createdAt: now, updatedAt: now, nodes: {} };
  write([...read(), flow]);
  return flow.id;
}

function updateFlow(id: string, fn: (f: Flow) => Flow) {
  write(read().map((f) => (f.id === id ? { ...fn(f), updatedAt: Date.now() } : f)));
}

export function updateFlowInfo(id: string, name: string, description: string) {
  updateFlow(id, (f) => ({ ...f, name, description }));
}

export function deleteFlow(id: string) {
  write(read().filter((f) => f.id !== id));
}

export function setNodeStatus(id: string, nodeId: string, s: Status) {
  updateFlow(id, (f) => ({ ...f, nodes: { ...f.nodes, [nodeId]: { ...f.nodes[nodeId], s } } }));
}

export function setNodeNote(id: string, nodeId: string, n: string) {
  updateFlow(id, (f) => ({ ...f, nodes: { ...f.nodes, [nodeId]: { ...f.nodes[nodeId], n } } }));
}

/** Guarda (o quita, con `null`) el enlace de un documento. */
export function setDocLink(id: string, docKey: string, url: string | null) {
  updateFlow(id, (f) => {
    const links = { ...f.links };
    if (url) links[docKey] = url;
    else delete links[docKey];
    return { ...f, links };
  });
}
