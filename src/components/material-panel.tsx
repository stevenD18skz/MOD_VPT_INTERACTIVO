"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
import styles from "./flow-board.module.css";
import { INLINE_MATERIAL_TYPES, MAX_MATERIAL_BYTES, normalizeUrl, type Material } from "@/lib/flow-definition";
import { addFileMaterial, addLinkMaterial, removeMaterial, type Flow } from "@/lib/flow-store";

type UploadItem = { key: string; name: string; progress: number; state: "uploading" | "done" | "error"; error?: string };
type Filter = "all" | "file" | "link";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "file", label: "Archivos" },
  { key: "link", label: "Enlaces" },
];

/** Panel lateral con el material de apoyo del flujo: archivos (Blob privado) y enlaces. */
export function MaterialPanel({ flow, uploads, onClose }: { flow: Flow; uploads: boolean; onClose: () => void }) {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [linkForm, setLinkForm] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [flash, setFlash] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const items = [...(flow.materials ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const files = items.filter((m) => m.kind === "file").length;
  const shown = items.filter((m) => filter === "all" || m.kind === filter);

  const patch = (key: string, p: Partial<UploadItem>) =>
    setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const dismiss = (key: string) => setQueue((q) => q.filter((i) => i.key !== key));

  async function uploadOne(file: File) {
    const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (file.size > MAX_MATERIAL_BYTES) {
      setQueue((q) => [...q, { key, name: file.name, progress: 0, state: "error", error: "Supera el máximo de 50 MB" }]);
      return;
    }
    setQueue((q) => [...q, { key, name: file.name, progress: 0, state: "uploading" }]);
    try {
      // La ruta del Blob va sin acentos ni espacios; el nombre original se guarda como título.
      const safe =
        file.name
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .replace(/[^\w.-]+/g, "_")
          .slice(-120) || "archivo";
      const blob = await upload(`material/${flow.id}/${safe}`, file, {
        access: "private",
        handleUploadUrl: "/api/material/upload",
        clientPayload: JSON.stringify({ flowId: flow.id }),
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => patch(key, { progress: percentage }),
      });
      addFileMaterial(flow.id, {
        title: file.name.slice(0, 200),
        url: blob.url,
        size: file.size,
        contentType: blob.contentType || file.type || "application/octet-stream",
      });
      patch(key, { progress: 100, state: "done" });
      setTimeout(() => dismiss(key), 2000);
    } catch (e) {
      console.error("[material] error al subir", e);
      patch(key, { state: "error", error: "No se pudo subir. Inténtalo de nuevo." });
    }
  }

  function handleFiles(list: FileList | null) {
    if (!uploads || !list) return;
    for (const f of Array.from(list)) void uploadOne(f);
  }

  return (
    <aside
      id="material-drawer"
      className={styles.drawer}
      aria-label="Material de apoyo"
      onDragOver={(e) => {
        if (!uploads || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!uploads) return;
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <header className={styles.drawerHead}>
        <div>
          <h2 className={styles.drawerTitle}>Material de apoyo</h2>
          <p className={styles.drawerSub}>
            Manuales, guías, plantillas y enlaces de esta automatización · {files}{" "}
            {files === 1 ? "archivo" : "archivos"} · {items.length - files}{" "}
            {items.length - files === 1 ? "enlace" : "enlaces"}
          </p>
        </div>
        <button ref={closeRef} type="button" className={styles.iconBtn} onClick={onClose} aria-label="Cerrar material de apoyo">
          ✕
        </button>
      </header>

      {items.length > 0 && (
        <div className={styles.chips} role="group" aria-label="Filtrar material">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={styles.chip}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className={styles.drawerBody}>
        {items.length === 0 ? (
          <p className={styles.matEmpty}>
            <strong>Aún no hay material</strong>
            Sube el manual de usuario, guías o plantillas, o guarda enlaces útiles para esta automatización.
          </p>
        ) : (
          <ul className={`${styles.dlist} ${styles.matList}`}>
            {shown.map((m) => (
              <MaterialItem key={m.id} flowId={flow.id} m={m} />
            ))}
          </ul>
        )}
      </div>

      <div className={styles.matFooter}>
        {linkForm ? (
          <MaterialLinkForm
            onCancel={() => setLinkForm(false)}
            onSave={(title, url) => {
              addLinkMaterial(flow.id, title || new URL(url).hostname, url);
              setLinkForm(false);
              setFlash("Enlace guardado");
            }}
          />
        ) : (
          <div className={styles.dactions}>
            <button type="button" className={styles.docAction} onClick={() => setLinkForm(true)}>
              + Agregar enlace
            </button>
            <span className={styles.spacer} />
            {flash && (
              <span className={styles.ok} role="status">
                ✓ {flash}
              </span>
            )}
          </div>
        )}

        
        {uploads ? (
          <button
            type="button"
            className={`${styles.dropzone} ${dragOver ? styles.dropzoneOn : ""}`}
            onClick={() => inputRef.current?.click()}
          >
            <UploadGlyph />
            <strong>{dragOver ? "Suelta para subir" : "Arrastra archivos aquí"}</strong>
            <span>o haz clic para elegirlos · máximo 50 MB por archivo</span>
          </button>
        ) : (
          <p className={styles.matNote}>
            La subida de archivos no está configurada (Vercel Blob). Por ahora puedes guardar enlaces.
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {queue.length > 0 && (
          <ul className={styles.uploads} aria-label="Subidas">
            {queue.map((q) => (
              <li key={q.key} className={styles.uploadItem} data-state={q.state}>
                <span className={styles.uploadName} title={q.name}>
                  {q.name}
                </span>
                <span className={q.state === "error" ? styles.error : q.state === "done" ? styles.ok : styles.saved}>
                  {q.state === "uploading" ? `${Math.round(q.progress)}%` : q.state === "done" ? "✓ Subido" : q.error}
                  {q.state === "error" && (
                    <button type="button" className={styles.linkBtn} onClick={() => dismiss(q.key)}>
                      Cerrar
                    </button>
                  )}
                </span>
                <span className={styles.uploadBar} aria-hidden>
                  <span style={{ width: `${q.state === "error" ? 100 : q.progress}%` }} />
                </span>
              </li>
            ))}
          </ul>
        )}


      </div>
    </aside>
  );
}

function MaterialItem({ flowId, m }: { flowId: string; m: Material }) {
  const [confirming, setConfirming] = useState(false);
  const kind = kindOf(m);
  const href = m.kind === "file" ? `/api/material/${m.id}` : m.url;
  const opens = m.kind === "link" || INLINE_MATERIAL_TYPES.test(m.contentType ?? "");
  const date = new Date(m.createdAt).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
  const meta = m.kind === "file" ? `${kind.label} · ${formatBytes(m.size ?? 0)}` : hostOf(m.url);

  return (
    <li className={styles.mcard}>
      <span className={styles.micon} data-kind={kind.key} aria-hidden>
        {m.kind === "link" ? <LinkGlyph /> : kind.label}
      </span>
      <div className={styles.dmain}>
        <a href={href} target="_blank" rel="noopener noreferrer" className={styles.mtitle} title={m.title}>
          {m.title}
        </a>
        <p className={styles.dused}>
          {meta} · {date}
        </p>
      </div>
      {confirming ? (
        <span className={styles.mconfirm} role="alert">
          ¿Quitar?
          <button type="button" className={styles.dangerSolid} onClick={() => removeMaterial(flowId, m.id)}>
            Sí
          </button>
          <button type="button" className={styles.docAction} onClick={() => setConfirming(false)}>
            No
          </button>
        </span>
      ) : (
        <span className={styles.mactions}>
          <a href={href} target="_blank" rel="noopener noreferrer" className={styles.dgo}>
            {opens ? "Abrir ↗" : "Descargar"}
          </a>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setConfirming(true)}
            aria-label={`Quitar ${m.title}`}
            title="Quitar"
          >
            <TrashGlyph />
          </button>
        </span>
      )}
    </li>
  );
}

function MaterialLinkForm({ onSave, onCancel }: { onSave: (title: string, url: string) => void; onCancel: () => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className={styles.linkForm}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const clean = normalizeUrl(url);
        if (!clean) {
          setError(url.trim() ? "Ese enlace no es válido. Usa una dirección web (https://…)." : "Pega o escribe un enlace.");
          return;
        }
        onSave(title.trim(), clean);
      }}
      onKeyDown={(e) => {
        // Escape cancela el formulario sin cerrar el panel.
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <input
        autoFocus
        className={styles.linkInput}
        value={url}
        inputMode="url"
        onChange={(e) => {
          setUrl(e.target.value);
          setError("");
        }}
        placeholder="https://… (SharePoint, Drive, wiki…)"
        aria-label="Enlace"
        aria-invalid={!!error}
      />
      <input
        className={styles.linkInput}
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nombre (opcional), p. ej. Manual de usuario"
        aria-label="Nombre del enlace"
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.linkActions}>
        <span className={styles.spacer} />
        <button type="button" className={styles.tb} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.primary}>
          Guardar enlace
        </button>
      </div>
    </form>
  );
}

/* ================= utilidades ================= */

const KINDS: [RegExp, string, string][] = [
  [/\.pdf$/i, "pdf", "PDF"],
  [/\.docx?$/i, "word", "DOC"],
  [/\.(xlsx?|xlsm|csv)$/i, "excel", "XLS"],
  [/\.pptx?$/i, "ppt", "PPT"],
  [/\.(png|jpe?g|gif|webp|svg|bmp)$/i, "img", "IMG"],
  [/\.(zip|rar|7z)$/i, "zip", "ZIP"],
  [/\.(knwf|knar)$/i, "knime", "KNIME"],
  [/\.(pbix|pbit)$/i, "pbi", "PBI"],
  [/\.(py|ipynb)$/i, "py", "PY"],
  [/\.(txt|md|json|xml|sql)$/i, "text", "TXT"],
];

function kindOf(m: Material): { key: string; label: string } {
  if (m.kind === "link") return { key: "link", label: "Enlace" };
  const hit = KINDS.find(([re]) => re.test(m.title));
  if (hit) return { key: hit[1], label: hit[2] };
  const ext = /\.([a-z0-9]{1,5})$/i.exec(m.title)?.[1];
  return { key: "other", label: ext ? ext.toUpperCase() : "FILE" };
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* ================= iconos ================= */

export function ClipGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M13 7.5 8 12.5a3.2 3.2 0 0 1-4.5-4.5l5.3-5.3a2.1 2.1 0 0 1 3 3L6.5 11a1.1 1.1 0 0 1-1.5-1.5L10 4.5" />
    </svg>
  );
}

function UploadGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1" />
    </svg>
  );
}

function TrashGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9" />
    </svg>
  );
}
