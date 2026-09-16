// Definición del flujo BPMN "Gestión de solicitudes de mejora" (Célula de Mejora Operativa).
// Es la misma plantilla para todas las automatizaciones; cada flujo de la biblioteca
// solo guarda el estado y las notas de sus pasos.

export type Status = "todo" | "prog" | "test" | "done";

export const STATUSES: { key: Status; label: string }[] = [
  { key: "todo", label: "TODO" },
  { key: "prog", label: "In progress" },
  { key: "test", label: "For test" },
  { key: "done", label: "Done" },
];

export interface NodeState {
  s?: Status;
  n?: string;
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  nodes: Record<string, NodeState>;
  /** Enlace de cada documento, por nombre del documento (ver DOC_KEYS). */
  links?: Record<string, string>;
  /** Estado de cada documento, por nombre; si falta, el documento está "empty". */
  docs?: Record<string, DocStatus>;
  /** Material de apoyo propio de esta automatización (manuales, guías, enlaces…). */
  materials?: Material[];
  /** Si no es null/undefined, el flujo está cerrado: ver ClosedState. */
  closed?: ClosedState | null;
  /**
   * Respuesta elegida en cada compuerta (Sí/No…) que NO lleva directo a un final,
   * por id de la compuerta → id del nodo al que lleva la rama elegida. Las que sí
   * llevan directo a un final no se guardan aquí: cerrar ese final (ver `closed`)
   * ya deja registrada cuál rama se tomó.
   */
  gatewayAnswers?: Record<string, string>;
}

/**
 * Un flujo solo puede estar cerrado por un final a la vez (representa una sola
 * ejecución real de la automatización, que solo puede terminar de una forma).
 * `snapshot` guarda cómo estaban los pasos del camino justo antes de cerrar, para
 * poder revertir exactamente a eso en vez de simplemente vaciarlos.
 */
export interface ClosedState {
  /** ID del evento "Fin" (ver ENDS) por el que se cerró. */
  endId: string;
  snapshot: Record<string, NodeState>;
}

export interface Material {
  id: string;
  kind: "file" | "link";
  title: string;
  /** Enlace externo, o URL del archivo en el Blob privado (se descarga vía /api/material/[id]). */
  url: string;
  size?: number;
  contentType?: string;
  createdAt: number;
}

export const MAX_MATERIAL_BYTES = 50 * 1024 * 1024;

/** Tipos que el navegador puede mostrar sin riesgo; el resto se descarga. */
export const INLINE_MATERIAL_TYPES = /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain)$/;

/* ================= geometry ================= */
export const W = 8140;
export const H = 3150;
export const TW = 160;
export const TH = 105; // task
export const GW = 52; // gateway
export const ER = 26; // event
export const KR = 28; // timer
export const DW = 78;
export const DH = 96; // document
export const BW = 70;
export const BH = 80; // datastore

export const LANES = [
  { n: "LÍDER SOLICITANTE VICEPRESIDENCIA FINANCIERA Y ADMINISTRATIVO", y0: 60, y1: 563 },
  { n: "COORDINADOR, ANALISTA DE LA CÉLULA DE MEJORA OPERATIVA", y0: 563, y1: 1185 },
  { n: "INGENIERO DE PROCESOS", y0: 1185, y1: 1462 },
  { n: "GERENTE DE OPERACIONES", y0: 1462, y1: 1785 },
  { n: "LÍDER EXCELENCIA OPERACIONAL & AUTOMATIZACIONES", y0: 1785, y1: 2156 },
  { n: "LÍDERES VICEPRESIDENCIA FINANCIERA Y ADMINISTRATIVO", y0: 2156, y1: 2500 },
  { n: "CONTROL DE CAMBIOS", y0: 2500, y1: 3090 },
];

export const PHASES = [
  { n: "Análisis", x0: 112, x1: 3805 },
  { n: "Diseño", x0: 3805, x1: 4268 },
  { n: "Desarrollo", x0: 4268, x1: 4680 },
  { n: "Pruebas", x0: 4680, x1: 5700 },
  { n: "Despliegue", x0: 5700, x1: 8100 },
];

export const LANE_X0 = 30;
export const LANE_X1 = 8100;
export const POOL_W = 26;
export const HEAD_W = 56;

/* ================= nodes ================= */
// t=task(editable) s=subprocess(editable) g=gateway p=parallel e=start f=end k=timer d=doc b=datastore
export type NodeType = "t" | "s" | "g" | "p" | "e" | "f" | "k" | "d" | "b";

export interface FlowNode {
  id: string;
  t: NodeType;
  x: number;
  y: number;
  l: string;
}

export const NODES: FlowNode[] = [
  // ---- lane 1 : líder solicitante
  { id: "e1", t: "e", x: 168, y: 265, l: "Necesidad de Mejora" },
  { id: "g1", t: "g", x: 298, y: 262, l: "¿La iniciativa es de la Vicepresidencia Financiera y Administrativa?" },
  { id: "s1", t: "s", x: 298, y: 453, l: "MN-095 Marco de Gobierno Automatización" },
  { id: "f1", t: "f", x: 497, y: 453, l: "Fin" },
  { id: "t1", t: "t", x: 566, y: 265, l: "Diligenciar Formato de Planteamiento de la Necesidad de Mejora" },
  { id: "t2", t: "t", x: 795, y: 265, l: "Realizar la solicitud de mejora adjuntando el documento debidamente diligenciado" },
  { id: "t3", t: "t", x: 1258, y: 265, l: "Complementar información requerida" },
  { id: "d1", t: "d", x: 566, y: 112, l: "FT-769 A3 PLANTEAMIENTO DE LA NECESIDAD DE MEJORA" },
  { id: "b1", t: "b", x: 795, y: 118, l: "Outlook / Buzón célula" },

  // ---- lane 2 : coordinador / analista
  { id: "t4", t: "t", x: 1258, y: 662, l: "Solicitar ajuste o información faltante" },
  { id: "t5", t: "t", x: 795, y: 883, l: "Recepcionar solicitud" },
  { id: "t6", t: "t", x: 1040, y: 883, l: "Validar integridad de la información recibida" },
  { id: "g2", t: "g", x: 1258, y: 883, l: "¿Información completa?" },
  { id: "t7", t: "t", x: 1440, y: 883, l: "Registrar iniciativa en el inventario de seguimiento" },
  { id: "d2", t: "d", x: 1440, y: 1062, l: "Inventario Célula Operaciones" },
  { id: "t8", t: "t", x: 1640, y: 883, l: "Analizar información de la iniciativa" },
  { id: "t9", t: "t", x: 1855, y: 883, l: "Diligenciar Matriz de Definición de Impacto" },
  { id: "d3", t: "d", x: 1855, y: 722, l: "FT-770 MATRIZ DE DEFINICIÓN DE IMPACTO INICIATIVAS" },
  { id: "t10", t: "t", x: 2060, y: 883, l: "Obtener Clasificación de la iniciativa · Bajo impacto · Alto impacto" },
  { id: "d4", t: "d", x: 2060, y: 722, l: "Resultado arrojado por la matriz de definición de impacto" },
  { id: "t11", t: "t", x: 2060, y: 1077, l: "Preparar iniciativas para sesión de priorización" },

  { id: "t12", t: "t", x: 2675, y: 878, l: "Actualizar estado de la iniciativa" },
  { id: "d5", t: "d", x: 2500, y: 878, l: "Inventario de la célula" },
  { id: "t13", t: "t", x: 2891, y: 878, l: "Notificar al líder solicitante que la iniciativa no fue priorizada" },
  { id: "b2", t: "b", x: 2891, y: 722, l: "Outlook" },
  { id: "f2", t: "f", x: 3075, y: 878, l: "Fin" },

  { id: "t14", t: "t", x: 3310, y: 878, l: "Actualizar estado de la iniciativa" },
  { id: "t15", t: "t", x: 3600, y: 878, l: "Realizar sesión de entendimiento con el líder del proceso (usuario ejecutante)" },

  { id: "t16", t: "t", x: 3984, y: 878, l: "Construir VSM AS-IS y TO-BE" },
  { id: "d6", t: "d", x: 3984, y: 722, l: "FT-772 ANÁLISIS & DISEÑO INICIATIVA VSM" },
  { id: "t17", t: "t", x: 4200, y: 878, l: "Documentar Historia de Usuario" },
  { id: "d7", t: "d", x: 4200, y: 722, l: "FT-773 HU CÉLULA OPERATIVA" },

  { id: "t18", t: "t", x: 4500, y: 878, l: "Desarrollar solución en el aplicativo correspondiente" },
  { id: "b3", t: "b", x: 4500, y: 722, l: "Stock Tecnológico Autorizado" },

  { id: "t19", t: "t", x: 4830, y: 878, l: "Preparar casos y datos de prueba" },
  { id: "d8", t: "d", x: 4830, y: 722, l: "FT-771 MATRIZ DE PRUEBAS_CERTIFICACIÓN" },
  { id: "t20", t: "t", x: 5060, y: 878, l: "Ejecutar pruebas" },
  { id: "t21", t: "t", x: 5060, y: 625, l: "Realizar las correcciones pertinentes" },
  { id: "t22", t: "t", x: 5290, y: 878, l: "Registrar evidencia formal de pruebas" },
  { id: "g3", t: "g", x: 5455, y: 878, l: "¿El resultado de todas las pruebas es exitoso?" },
  { id: "t23", t: "t", x: 5640, y: 878, l: "Emitir certificado de pruebas" },
  { id: "d9", t: "d", x: 5640, y: 1040, l: "FT-771 MATRIZ DE PRUEBAS_CERTIFICACIÓN" },

  { id: "t24", t: "t", x: 5953, y: 878, l: "Solicitar aprobación de despliegue al comité de cambios" },
  { id: "b4", t: "b", x: 5953, y: 722, l: "App Control de Cambios" },
  { id: "t25", t: "t", x: 6281, y: 878, l: "Realizar las respectivas correcciones y crear un nuevo caso" },

  { id: "t26", t: "t", x: 6531, y: 1063, l: "Realizar Despliegue" },
  { id: "g4", t: "g", x: 6759, y: 1063, l: "¿El despliegue fue exitoso?" },
  { id: "t27", t: "t", x: 6759, y: 900, l: "Realizar Correcciones requeridas" },
  { id: "t28", t: "t", x: 6978, y: 1063, l: "Realizar el manual de la solución y el Manual de Usuario" },
  { id: "p1", t: "p", x: 7190, y: 1063, l: "Paralelo" },
  { id: "t29", t: "t", x: 7330, y: 781, l: "Realizar entrega formal con el líder del proceso / usuario final y generar el acta de entrega" },
  { id: "d10", t: "d", x: 7330, y: 625, l: "FT-759 ACTA DE ENTREGA AUTOMATIZACIÓN" },
  { id: "t30", t: "t", x: 7510, y: 781, l: "Actualizar el estado de la solución" },
  { id: "d11", t: "d", x: 7510, y: 625, l: "Inventario de la célula" },
  { id: "t31", t: "t", x: 7690, y: 781, l: "Cargar documentación en el repositorio documental de las soluciones" },
  { id: "b5", t: "b", x: 7690, y: 628, l: "Sharepoint" },
  { id: "t32", t: "t", x: 7870, y: 781, l: "Realizar el acompañamiento post-entrega con el usuario final" },
  { id: "f3", t: "f", x: 7995, y: 781, l: "Fin" },
  { id: "t33", t: "t", x: 7320, y: 1063, l: "Solicitar la publicación de la documentación" },
  { id: "b6", t: "b", x: 7490, y: 1063, l: "Genial" },

  // ---- lane 3 : ingeniero de procesos
  { id: "t34", t: "t", x: 7320, y: 1330, l: "Publicar la documentación importada" },
  { id: "f4", t: "f", x: 7490, y: 1330, l: "Fin" },

  // ---- lane 4 : gerente de operaciones
  { id: "t35", t: "t", x: 2460, y: 1605, l: "Priorizar las iniciativas presentadas." },
  { id: "g5", t: "g", x: 2675, y: 1605, l: "¿La solicitud fue priorizada?" },
  { id: "t36", t: "t", x: 2960, y: 1605, l: "Definir frente de trabajo según clasificación de la iniciativa" },
  { id: "g6", t: "g", x: 3180, y: 1605, l: "Clasificación de la Iniciativa" },
  { id: "s2", t: "s", x: 3400, y: 1605, l: "MN-095 Marco de Gobierno Automatización" },
  { id: "f5", t: "f", x: 3570, y: 1605, l: "Fin" },

  // ---- lane 5 : excelencia operacional
  { id: "k1", t: "k", x: 2256, y: 1953, l: "15 DÍAS" },
  { id: "t37", t: "t", x: 2460, y: 1953, l: "Realizar sesión de alineación de iniciativas" },
  { id: "d12", t: "d", x: 2660, y: 1878, l: "Backlog Automatizaciones" },
  { id: "d13", t: "d", x: 2660, y: 2030, l: "Inventario de la célula" },

  // ---- lane 6 : líderes VP
  { id: "k2", t: "k", x: 2060, y: 2297, l: "Semanal" },
  { id: "t38", t: "t", x: 2256, y: 2297, l: "Priorizar iniciativas" },

  // ---- lane 7 : control de cambios
  { id: "t39", t: "t", x: 5953, y: 2798, l: "Revisar la solicitud de despliegue" },
  { id: "k3", t: "k", x: 6120, y: 2798, l: "2 Días hábiles" },
  { id: "g7", t: "g", x: 6281, y: 2798, l: "¿Aprueba el despliegue?" },
  { id: "t40", t: "t", x: 6281, y: 2630, l: "Rechazar solicitud de despliegue con novedades" },
  { id: "t41", t: "t", x: 6531, y: 2798, l: "Notificar la aprobación de despliegue" },
  { id: "d14", t: "d", x: 6700, y: 2798, l: "Acta de aprobación" },
];

export const BY_ID: Record<string, FlowNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));

/** Pasos editables (tareas y subprocesos): son los que llevan estado y notas. */
export const EDITABLE = NODES.filter((n) => n.t === "t" || n.t === "s");

/** Eventos "Fin" del flujo: se pueden cerrar para marcar listos todos los pasos previos. */
export const ENDS = NODES.filter((n) => n.t === "f");

/** Compuertas de decisión (rombos "Sí/No" o similares); "p" (paralelo) no cuenta, no decide nada. */
export const GATEWAYS = NODES.filter((n) => n.t === "g");

export function dims(n: FlowNode): { w: number; h: number } {
  switch (n.t) {
    case "g":
    case "p":
      return { w: GW, h: GW };
    case "e":
    case "f":
      return { w: ER * 2, h: ER * 2 };
    case "k":
      return { w: KR * 2, h: KR * 2 };
    case "d":
      return { w: DW, h: DH };
    case "b":
      return { w: BW, h: BH };
    default:
      return { w: TW, h: TH };
  }
}

type Side = "l" | "r" | "t" | "b";
type Point = [number, number];

function anchor(id: string, side: Side): Point {
  const n = BY_ID[id];
  const d = dims(n);
  if (side === "r") return [n.x + d.w / 2, n.y];
  if (side === "l") return [n.x - d.w / 2, n.y];
  if (side === "t") return [n.x, n.y - d.h / 2];
  return [n.x, n.y + d.h / 2];
}

/* ================= edges ================= */
// [fromId, fromSide, toId, toSide, label?, via?]
export type Edge = [string, Side, string, Side, (string | null)?, Point[]?];

export const EDGES: Edge[] = [
  ["e1", "r", "g1", "l"],
  ["g1", "b", "s1", "t", "No"],
  ["s1", "r", "f1", "l"],
  ["g1", "r", "t1", "l", "Sí"],
  ["t1", "r", "t2", "l"],
  ["t2", "b", "t5", "t"],
  ["t3", "l", "t2", "r"],
  ["t4", "t", "t3", "b"],
  ["g2", "t", "t4", "b", "No"],
  ["t5", "r", "t6", "l"],
  ["t6", "r", "g2", "l"],
  ["g2", "r", "t7", "l", "Sí"],
  ["t7", "r", "t8", "l"],
  ["t8", "r", "t9", "l"],
  ["t9", "r", "t10", "l"],
  ["t10", "b", "t11", "t"],
  ["t11", "b", "k2", "t"],
  ["k2", "r", "t38", "l"],
  ["t38", "t", "k1", "b"],
  ["k1", "r", "t37", "l"],
  ["t37", "t", "t35", "b"],
  ["t35", "r", "g5", "l"],
  ["g5", "t", "t12", "b", "No"],
  ["g5", "r", "t36", "l", "Sí"],
  ["t12", "r", "t13", "l"],
  ["t13", "r", "f2", "l"],
  ["t36", "r", "g6", "l"],
  ["g6", "r", "s2", "l", "Impacto Alto"],
  ["s2", "r", "f5", "l"],
  ["g6", "t", "t14", "b", "Impacto Bajo"],
  ["t14", "r", "t15", "l"],
  ["t15", "r", "t16", "l"],
  ["t16", "r", "t17", "l"],
  ["t17", "r", "t18", "l"],
  ["t18", "r", "t19", "l"],
  ["t19", "r", "t20", "l"],
  ["t21", "b", "t20", "t"],
  ["t20", "r", "t22", "l"],
  ["t22", "r", "g3", "l"],
  ["g3", "t", "t21", "r", "No", [[5455, 625]]],
  ["g3", "r", "t23", "l", "Sí"],
  ["t23", "r", "t24", "l"],
  ["t24", "b", "t39", "t"],
  ["t39", "r", "k3", "l"],
  ["k3", "r", "g7", "l"],
  ["g7", "t", "t40", "b", "No"],
  ["t40", "t", "t25", "b"],
  ["t25", "l", "t24", "r"],
  ["g7", "r", "t41", "l", "Sí"],
  ["t41", "t", "t26", "b"],
  ["t26", "r", "g4", "l"],
  ["g4", "t", "t27", "b", "No"],
  ["t27", "l", "t26", "t", null, [[6531, 900]]],
  ["g4", "r", "t28", "l", "Sí"],
  ["t28", "r", "p1", "l"],
  ["p1", "t", "t29", "l", "", [[7190, 781]]],
  ["p1", "r", "t33", "l"],
  ["t29", "r", "t30", "l"],
  ["t30", "r", "t31", "l"],
  ["t31", "r", "t32", "l"],
  ["t32", "r", "f3", "l"],
  ["t33", "b", "t34", "t"],
  ["t34", "r", "f4", "l"],
];

// dotted artifact associations
export const ASSOCIATIONS: [string, string][] = [
  ["d1", "t1"], ["b1", "t2"], ["d2", "t7"], ["d3", "t9"], ["d4", "t10"], ["d5", "t12"],
  ["b2", "t13"], ["d6", "t16"], ["d7", "t17"], ["b3", "t18"], ["d8", "t19"], ["d9", "t23"],
  ["b4", "t24"], ["d10", "t29"], ["d11", "t30"], ["b5", "t31"], ["b6", "t33"],
  ["d12", "t37"], ["d13", "t37"], ["d14", "t41"],
];

/** Documentos (d) y repositorios/sistemas (b) que acompañan a los pasos. */
export const ARTIFACTS = NODES.filter((n) => n.t === "d" || n.t === "b");

/**
 * Los enlaces se guardan por nombre del documento: un mismo documento que aparece en
 * varios lugares del flujo (p. ej. "Inventario de la célula") comparte un solo enlace.
 */
export const DOC_KEYS = [...new Set(ARTIFACTS.map((n) => n.l))];

export type DocStatus = "empty" | "prog" | "done";

export const DOC_STATUSES: { key: DocStatus; label: string }[] = [
  { key: "empty", label: "Vacío" },
  { key: "prog", label: "En progreso" },
  { key: "done", label: "Completo" },
];

/**
 * Documentos agrupados por la fase del diagrama donde aparecen, en orden del flujo.
 * Un documento usado en dos fases (p. ej. "Inventario de la célula") sale en ambas.
 */
export const PHASE_DOCS = PHASES.map((p) => {
  const seen = new Map<string, FlowNode>();
  for (const n of [...ARTIFACTS].sort((a, b) => a.x - b.x)) {
    if (phaseOf(n.x) === p.n && !seen.has(n.l)) seen.set(n.l, n);
  }
  return { phase: p.n, docs: [...seen].map(([key, node]) => ({ key, node })) };
});

export function docsForStep(stepId: string): FlowNode[] {
  return ASSOCIATIONS.filter(([, s]) => s === stepId).map(([a]) => BY_ID[a]);
}

export function stepsForDoc(label: string): FlowNode[] {
  return ASSOCIATIONS.filter(([a]) => BY_ID[a].l === label).map(([, s]) => BY_ID[s]);
}

/** Devuelve la URL normalizada (http/https) o `null` si no es un enlace web válido. */
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(v);
  try {
    const u = new URL(hasScheme ? v : `https://${v}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Sin esquema exigimos un dominio con punto para no aceptar texto suelto ("hola").
    if (!hasScheme && !u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function route(e: Edge): Point[] {
  const [a, as, b, bs, , via] = e;
  const p0 = anchor(a, as);
  const p1 = anchor(b, bs);
  if (via && via.length) return [p0, ...via, p1];
  const hz = as === "r" || as === "l";
  const hzb = bs === "r" || bs === "l";
  if (hz && hzb) {
    if (Math.abs(p0[1] - p1[1]) < 1.5) return [p0, p1];
    const mx = (p0[0] + p1[0]) / 2;
    return [p0, [mx, p0[1]], [mx, p1[1]], p1];
  }
  if (!hz && !hzb) {
    if (Math.abs(p0[0] - p1[0]) < 1.5) return [p0, p1];
    const my = (p0[1] + p1[1]) / 2;
    return [p0, [p0[0], my], [p1[0], my], p1];
  }
  if (!hz && hzb) return [p0, [p0[0], p1[1]], p1];
  return [p0, [p1[0], p0[1]], p1];
}

export interface UpstreamPath {
  /** Todo nodo (paso, compuerta, evento…) recorrido yendo hacia atrás desde nodeId. */
  nodes: Set<string>;
  /** Índices en EDGES de las flechas efectivamente recorridas (para atenuar el resto). */
  edges: Set<number>;
}

/**
 * Recorre el grafo hacia atrás desde un nodo (p. ej. un evento Fin), siguiendo
 * solo las flechas que realmente llevan hasta él. Se usa para "cerrar" un final:
 * ese camino queda resaltado y todo lo demás se puede atenuar/deshabilitar.
 */
export function upstreamPath(nodeId: string): UpstreamPath {
  const nodes = new Set<string>();
  const edges = new Set<number>();
  const visit = (id: string) => {
    if (nodes.has(id)) return;
    nodes.add(id);
    EDGES.forEach((edge, i) => {
      if (edge[2] === id) {
        edges.add(i);
        visit(edge[0]);
      }
    });
  };
  EDGES.forEach((edge, i) => {
    if (edge[2] === nodeId) {
      edges.add(i);
      visit(edge[0]);
    }
  });
  return { nodes, edges };
}

/**
 * IDs de los pasos (t/s) que preceden a un nodo, siguiendo las flechas hacia atrás.
 * Se usa para "cerrar" un evento Fin: marca como Done todo lo que lleva hasta él.
 */
export function upstreamSteps(nodeId: string): string[] {
  return [...upstreamPath(nodeId).nodes].filter((id) => {
    const node = BY_ID[id];
    return node && (node.t === "t" || node.t === "s");
  });
}

/**
 * Si tomar esta rama lleva sin ambigüedad hasta un evento Fin (solo pasando por
 * pasos con una única salida, sin cruzar otra compuerta sin responder), devuelve
 * el id de ese Fin. Si en el camino aparece otra compuerta/paralelo, o un ciclo,
 * devuelve null: ese caso no se puede resolver solo con esta respuesta.
 */
export function leadsToEnd(startId: string): string | null {
  const seen = new Set<string>();
  let cur = startId;
  while (true) {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const node = BY_ID[cur];
    if (!node) return null;
    if (node.t === "f") return cur;
    if (node.t === "g" || node.t === "p") return null;
    const outs = EDGES.filter((e) => e[0] === cur);
    if (outs.length !== 1) return null;
    cur = outs[0][2];
  }
}

export interface GatewayBranch {
  edgeIndex: number;
  label: string;
  target: string;
}

/** Las ramas que salen de una compuerta (en este flujo, siempre dos). */
export function gatewayBranches(gatewayId: string): GatewayBranch[] {
  const branches: GatewayBranch[] = [];
  EDGES.forEach((e, i) => {
    if (e[0] === gatewayId) branches.push({ edgeIndex: i, label: e[4] ?? "", target: e[2] });
  });
  return branches;
}

/** Parte un texto en líneas de como máximo `max` caracteres (por palabras). */
export function wrapWords(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if ((cur + " " + w).trim().length > max) {
      lines.push(cur.trim());
      cur = w;
    } else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

export function laneOf(y: number): string {
  return LANES.find((L) => y >= L.y0 && y < L.y1)?.n ?? "";
}

export function phaseOf(x: number): string {
  return PHASES.find((P) => x >= P.x0 && x < P.x1)?.n ?? "";
}

/** Resumen de avance de un flujo: conteo por estado, avance por fase y documentos enlazados. */
export function summarize({ nodes, links = {}, docs: docStatus = {} }: Pick<Flow, "nodes" | "links" | "docs">) {
  const counts: Record<Status, number> = { todo: 0, prog: 0, test: 0, done: 0 };
  const phases = PHASES.map((p) => ({ name: p.n, total: 0, done: 0 }));
  for (const n of EDITABLE) {
    const s = nodes[n.id]?.s ?? "todo";
    counts[s]++;
    const ph = phases.find((p) => p.name === phaseOf(n.x));
    if (ph) {
      ph.total++;
      if (s === "done") ph.done++;
    }
  }
  const current = phases.find((p) => p.done < p.total)?.name ?? null;
  const docs = {
    linked: DOC_KEYS.filter((k) => links[k]).length,
    done: DOC_KEYS.filter((k) => docStatus[k] === "done").length,
    prog: DOC_KEYS.filter((k) => docStatus[k] === "prog").length,
    total: DOC_KEYS.length,
  };
  return { counts, total: EDITABLE.length, phases, current, docs };
}
