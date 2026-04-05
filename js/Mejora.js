// js/mejora.js
// Módulo Áreas de Mejora — situación problemática + impacto + acción sugerida
// IA en dos pasos: propuesta de mitigación + redacción de respuesta institucional

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorEstado = {
  "Identificada": "#0077B6",
  "En proceso":   "#E9C46A",
  "Resuelta":     "#2D6A4F",
  "Cancelada":    "#6C757D"
};

const colorPrioridad = {
  "Alta":  "#9B2226",
  "Media": "#E9C46A",
  "Baja":  "#2D6A4F"
};

const WORKER_URL = "https://lumen-briefing.garogmx89.workers.dev";

let todasLasMejoras       = [];
let filtroActivo          = "todos";
let modoEdicion           = null;
let procesosSeleccionados = [];
let normasSeleccionadas   = [];

const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const mejoraRef   = collection(db, "usuarios", user.uid, "mejoras");
  const procesosRef = collection(db, "usuarios", user.uid, "procesos");
  const normasRef   = collection(db, "usuarios", user.uid, "normatividad");

  // ─── CATÁLOGO PROCESOS ────────────────────────────────────────────────────
  onSnapshot(query(procesosRef, orderBy("creadoEn", "desc")), (snap) => {
    const sel = document.getElementById("mejora-proceso-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Agregar proceso —</option>';
    snap.docs.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.data().nombre || "(sin nombre)";
      opt.dataset.nombre = d.data().nombre || d.id;
      sel.appendChild(opt);
    });
  });

  // ─── CATÁLOGO NORMAS ──────────────────────────────────────────────────────
  onSnapshot(query(normasRef, orderBy("creadoEn", "desc")), (snap) => {
    const sel = document.getElementById("mejora-norma-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">— Agregar norma —</option>';
    snap.docs.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.data().nombre || d.id;
      opt.textContent = d.data().nombre || "(sin nombre)";
      sel.appendChild(opt);
    });
  });

  // ─── SELECTORES ───────────────────────────────────────────────────────────
  document.getElementById("mejora-proceso-select")?.addEventListener("change", (e) => {
    const id = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
    if (!id) return;
    if (procesosSeleccionados.find(x => x.id === id)) { e.target.value = ""; return; }
    procesosSeleccionados.push({ id, nombre });
    renderTagsProcesos();
    e.target.value = "";
  });

  document.getElementById("mejora-norma-select")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (!nombre) return;
    if (normasSeleccionadas.find(n => n.nombre === nombre)) { e.target.value = ""; return; }
    normasSeleccionadas.push({ nombre });
    renderTagsNormas();
    e.target.value = "";
  });

  function renderTagsProcesos() {
    const c = document.getElementById("mejora-procesos-seleccionados");
    if (!c) return;
    c.innerHTML = procesosSeleccionados.map((p, i) => `
      <span class="participante-tag">⚙️ ${p.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}" data-tipo="proceso">✕</button>
      </span>`).join("");
    c.querySelectorAll(".participante-tag-quitar[data-tipo='proceso']").forEach(btn => {
      btn.addEventListener("click", () => {
        procesosSeleccionados.splice(Number(btn.dataset.index), 1);
        renderTagsProcesos();
      });
    });
  }

  function renderTagsNormas() {
    const c = document.getElementById("mejora-normas-seleccionadas");
    if (!c) return;
    c.innerHTML = normasSeleccionadas.map((n, i) => `
      <span class="participante-tag">📄 ${n.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}" data-tipo="norma">✕</button>
      </span>`).join("");
    c.querySelectorAll(".participante-tag-quitar[data-tipo='norma']").forEach(btn => {
      btn.addEventListener("click", () => {
        normasSeleccionadas.splice(Number(btn.dataset.index), 1);
        renderTagsNormas();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ───────────────────────────────────────────────────
  function limpiarFormulario() {
    ["mejora-titulo","mejora-situacion","mejora-impacto","mejora-accion",
     "mejora-mitigacion","mejora-respuesta"].forEach(id => set(id, ""));
    set("mejora-estado",    "Identificada");
    set("mejora-prioridad", "Alta");

    const mField = document.getElementById("mejora-mitigacion");
    const rField = document.getElementById("mejora-respuesta");
    if (mField) { mField.readOnly = false; mField.style.opacity = "0.7"; }
    if (rField) { rField.readOnly = false; rField.style.opacity = "0.7"; }

    procesosSeleccionados = [];
    normasSeleccionadas   = [];
    renderTagsProcesos();
    renderTagsNormas();

    const titulo = document.querySelector("#panel-mejora .reunion-form-card h2");
    if (titulo) titulo.textContent = "Nueva Área de Mejora";
    const btnCancelar = document.getElementById("btn-cancelar-mejora");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ─────────────────────────────────────────────────
  function activarEdicion(id) {
    const m = todasLasMejoras.find(x => x.id === id);
    if (!m) return;
    modoEdicion = id;

    set("mejora-titulo",     m.titulo);
    set("mejora-estado",     m.estado     || "Identificada");
    set("mejora-prioridad",  m.prioridad  || "Alta");
    set("mejora-situacion",  m.situacion);
    set("mejora-impacto",    m.impacto);
    set("mejora-accion",     m.accion);
    set("mejora-mitigacion", m.mitigacion);
    set("mejora-respuesta",  m.respuesta);

    const mField = document.getElementById("mejora-mitigacion");
    const rField = document.getElementById("mejora-respuesta");
    if (mField && m.mitigacion) { mField.readOnly = true; mField.style.opacity = "1"; }
    if (rField && m.respuesta)  { rField.readOnly = true; rField.style.opacity = "1"; }

    procesosSeleccionados = Array.isArray(m.procesosVinculados) ? m.procesosVinculados.map(x => ({...x})) : [];
    normasSeleccionadas   = Array.isArray(m.normasVinculadas)   ? m.normasVinculadas.map(x => ({...x}))   : [];
    renderTagsProcesos();
    renderTagsNormas();

    const titulo = document.querySelector("#panel-mejora .reunion-form-card h2");
    if (titulo) titulo.textContent = "Editar Área de Mejora";
    const btnCancelar = document.getElementById("btn-cancelar-mejora");
    if (btnCancelar) btnCancelar.style.display = "inline-block";
    document.getElementById("panel-mejora")?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-mejora");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);
    btnNuevo.addEventListener("click", async () => {
      const titulo = get("mejora-titulo");
      if (!titulo) { alert("El título es obligatorio."); return; }

      const datos = {
        titulo,
        estado:     get("mejora-estado"),
        prioridad:  get("mejora-prioridad"),
        situacion:  get("mejora-situacion"),
        impacto:    get("mejora-impacto"),
        accion:     get("mejora-accion"),
        mitigacion: get("mejora-mitigacion"),
        respuesta:  get("mejora-respuesta"),
        procesosVinculados: procesosSeleccionados,
        normasVinculadas:   normasSeleccionadas
      };

      try {
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "mejoras", modoEdicion), datos);
        } else {
          await addDoc(mejoraRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  document.getElementById("btn-cancelar-mejora")?.addEventListener("click", limpiarFormulario);

  // ─── IA: GENERAR MITIGACIÓN ───────────────────────────────────────────────
  const btnMitigacion = document.getElementById("btn-mejora-mitigacion");
  if (btnMitigacion) {
    const btnM = btnMitigacion.cloneNode(true);
    btnMitigacion.parentNode.replaceChild(btnM, btnMitigacion);
    btnM.addEventListener("click", async () => {
      const titulo    = get("mejora-titulo");
      const situacion = get("mejora-situacion");
      const impacto   = get("mejora-impacto");
      const accion    = get("mejora-accion");

      if (!situacion) { alert("Describe primero la situación problemática."); return; }

      const campoM = document.getElementById("mejora-mitigacion");
      if (campoM) { campoM.value = "⏳ Generando propuesta de mitigación..."; campoM.readOnly = true; campoM.style.opacity = "0.6"; }
      btnM.disabled = true; btnM.textContent = "⏳ Generando...";

      const procesosTexto = procesosSeleccionados.map(p => p.nombre).join(", ") || "No especificados";
      const normasTexto   = normasSeleccionadas.map(n => n.nombre).join(", ")   || "No especificadas";

      const prompt = `Eres un asesor especializado en mejora continua institucional para dependencias del gobierno del estado de Zacatecas, México.

Se te presenta un área de mejora detectada en SEDUVOT (Secretaría de Desarrollo Urbano, Vivienda y Ordenamiento Territorial).

TÍTULO: ${titulo || "Sin título"}
SITUACIÓN PROBLEMÁTICA: ${situacion}
IMPACTO INSTITUCIONAL: ${impacto || "No especificado"}
ACCIÓN SUGERIDA: ${accion || "No especificada"}
PROCESOS RELACIONADOS: ${procesosTexto}
NORMATIVIDAD RELACIONADA: ${normasTexto}

Genera una PROPUESTA DE MITIGACIÓN con el siguiente formato EXACTO:

**Diagnóstico:**
(2 oraciones que sinteticen la causa raíz del problema)

**Acciones de mitigación:**
1. (Acción inmediata — plazo: días/semanas)
2. (Acción de mediano plazo — plazo: semanas/meses)
3. (Acción estructural — plazo: meses)

**Indicador de seguimiento:**
(Cómo medir que el problema se resolvió)

**Riesgo si no se atiende:**
(Consecuencia institucional concreta)

Tono técnico-administrativo. En español. Solo el contenido solicitado, sin introducciones.`;

      try {
        const resp = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });
        const data = await resp.json();
        const texto = data.briefing || "No se pudo generar la propuesta.";
        if (campoM) { campoM.value = texto; campoM.readOnly = true; campoM.style.opacity = "1"; }
        // Habilitar botón de respuesta institucional
        const btnR = document.getElementById("btn-mejora-respuesta");
        if (btnR) { btnR.style.borderColor = "var(--accent)"; btnR.style.color = "var(--accent)"; }
      } catch (err) {
        console.error("Error IA mitigación:", err);
        if (campoM) { campoM.value = "❌ Error al conectar con la IA."; campoM.readOnly = false; campoM.style.opacity = "1"; }
      } finally {
        btnM.disabled = false; btnM.textContent = "✨ Generar mitigación";
      }
    });
  }

  // ─── IA: REDACTAR RESPUESTA INSTITUCIONAL ────────────────────────────────
  const btnRespuesta = document.getElementById("btn-mejora-respuesta");
  if (btnRespuesta) {
    const btnR = btnRespuesta.cloneNode(true);
    btnRespuesta.parentNode.replaceChild(btnR, btnRespuesta);
    btnR.addEventListener("click", async () => {
      const mitigacion = get("mejora-mitigacion");
      const situacion  = get("mejora-situacion");
      const titulo     = get("mejora-titulo");

      if (!mitigacion || mitigacion.startsWith("⏳") || mitigacion.startsWith("❌")) {
        alert("Primero genera la propuesta de mitigación."); return;
      }

      const campoR = document.getElementById("mejora-respuesta");
      if (campoR) { campoR.value = "⏳ Redactando respuesta institucional..."; campoR.readOnly = true; campoR.style.opacity = "0.6"; }
      btnR.disabled = true; btnR.textContent = "⏳ Redactando...";

      const prompt = `Eres un redactor especializado en documentos institucionales del gobierno del estado de Zacatecas, México.

Con base en el siguiente análisis de una área de mejora de SEDUVOT, redacta una RESPUESTA INSTITUCIONAL FORMAL que pueda ser utilizada como base para un oficio, memorando o informe interno.

ÁREA DE MEJORA: ${titulo}
SITUACIÓN DETECTADA: ${situacion}
PROPUESTA DE MITIGACIÓN:
${mitigacion}

Redacta la respuesta con este formato:

**Antecedentes:**
(Descripción objetiva de la situación detectada, en 2-3 oraciones formales)

**Análisis:**
(Evaluación institucional del impacto y causas, en 2-3 oraciones)

**Acciones a implementar:**
(Lista numerada de las acciones comprometidas, con responsables genéricos y plazos)

**Seguimiento:**
(Mecanismo de verificación y fecha estimada de revisión)

Utiliza lenguaje formal institucional, primera persona del plural ("se ha detectado", "esta Secretaría", "se implementarán"). Sin introducciones ni cierres adicionales.`;

      try {
        const resp = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });
        const data = await resp.json();
        const texto = data.briefing || "No se pudo generar la respuesta.";
        if (campoR) { campoR.value = texto; campoR.readOnly = true; campoR.style.opacity = "1"; }
      } catch (err) {
        console.error("Error IA respuesta:", err);
        if (campoR) { campoR.value = "❌ Error al conectar con la IA."; campoR.readOnly = false; campoR.style.opacity = "1"; }
      } finally {
        btnR.disabled = false; btnR.textContent = "📝 Redactar respuesta";
      }
    });
  }

  // ─── FILTROS ──────────────────────────────────────────────────────────────
  document.querySelectorAll("#panel-mejora .filtro-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-mejora .filtro-btn").forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderMejoras();
    });
  });

  // ─── LEER EN TIEMPO REAL ──────────────────────────────────────────────────
  const q = query(mejoraRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todasLasMejoras = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMejoras();
    // Actualizar badge del sidebar
    const pendientes = todasLasMejoras.filter(m => m.estado === "Identificada" || m.estado === "En proceso").length;
    const badge = document.getElementById("badge-mejora");
    if (badge) { badge.textContent = pendientes > 0 ? pendientes : ""; }
  });

  // ─── RENDER TARJETAS ──────────────────────────────────────────────────────
  function renderMejoras() {
    const contenedor = document.getElementById("mejora-contenido");
    if (!contenedor) return;

    const filtradas = filtroActivo === "todos"
      ? todasLasMejoras
      : todasLasMejoras.filter(m => m.estado === filtroActivo);

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay áreas de mejora para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtradas.map(m => {
      const colorE = colorEstado[m.estado]       || "#555";
      const colorP = colorPrioridad[m.prioridad] || "#555";

      const tagsProc = (m.procesosVinculados || [])
        .map(p => `<span class="participante-tag-display">⚙️ ${p.nombre}</span>`).join("");
      const tagsNorm = (m.normasVinculadas || [])
        .map(n => `<span class="participante-tag-display">📄 ${n.nombre}</span>`).join("");
      const secVinc = (tagsProc || tagsNorm)
        ? `<div class="participantes-tags-display">${tagsProc}${tagsNorm}</div>` : "";

      const iaIcons = [
        m.mitigacion ? "✨" : "",
        m.respuesta  ? "📝" : ""
      ].filter(Boolean).join(" ");

      return `
        <div class="reunion-card mejora-card mejora-card--clickable" data-id="${m.id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;min-width:0">
              <span class="norma-tipo-badge" style="background:${colorE}">${m.estado}</span>
              <span class="norma-tipo-badge" style="background:${colorP}">${m.prioridad}</span>
              <span class="reunion-card-titulo">${m.titulo}</span>
              ${iaIcons ? `<span style="font-size:0.8rem;margin-left:0.2rem" title="Tiene IA generada">${iaIcons}</span>` : ""}
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar"   data-id="${m.id}" title="Editar">✏️</button>
              <button class="btn-eliminar" data-id="${m.id}" title="Eliminar">🗑️</button>
            </div>
          </div>
          ${m.situacion ? `<div class="reunion-card-acuerdos" style="margin-top:0.3rem">${m.situacion.slice(0,200)}${m.situacion.length > 200 ? "…" : ""}</div>` : ""}
          ${secVinc}
        </div>`;
    }).join("");

    // Listeners
    contenedor.querySelectorAll(".mejora-card--clickable").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const m = todasLasMejoras.find(x => x.id === card.dataset.id);
        if (m) mostrarDetalle(m);
      });
    });

    contenedor.querySelectorAll(".btn-editar").forEach(btn => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta área de mejora? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "mejoras", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (err) {
          console.error("Error al eliminar:", err);
          alert("No se pudo eliminar.");
        }
      });
    });
  }

  // ─── MODAL DE DETALLE ─────────────────────────────────────────────────────
  function mostrarDetalle(m) {
    const colorE = colorEstado[m.estado]       || "#555";
    const colorP = colorPrioridad[m.prioridad] || "#555";

    const sec = (titulo, texto, color = null) => texto
      ? `<div class="detalle-seccion">
           <div class="detalle-seccion-titulo">${titulo}</div>
           <div class="detalle-seccion-texto"${color ? ` style="border-left:3px solid ${color};padding-left:0.6rem"` : ""}>${texto}</div>
         </div>`
      : "";

    const fmtIA = (texto) => texto
      ? texto.split("\n").filter(l => l.trim()).map(l => {
          if (l.startsWith("**") && l.endsWith("**")) return `<strong>${l.slice(2,-2)}</strong>`;
          l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
          return `<p style="margin:0.2rem 0">${l}</p>`;
        }).join("")
      : null;

    const tagsProc = (m.procesosVinculados || [])
      .map(p => `<span class="participante-tag" style="font-size:0.8rem">⚙️ ${p.nombre}</span>`).join("");
    const tagsNorm = (m.normasVinculadas || [])
      .map(n => `<span class="participante-tag" style="font-size:0.8rem">📄 ${n.nombre}</span>`).join("");

    let modal = document.getElementById("detalle-mejora-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-mejora-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;width:100%;max-width:580px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--bg2);z-index:1;">
          <div>
            <div style="display:flex;gap:0.4rem;margin-bottom:0.4rem;flex-wrap:wrap">
              <span style="background:${colorE};color:white;font-size:0.72rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:20px">${m.estado}</span>
              <span style="background:${colorP};color:white;font-size:0.72rem;font-weight:700;padding:0.2rem 0.6rem;border-radius:20px">${m.prioridad}</span>
            </div>
            <div style="font-size:1rem;font-weight:700;color:var(--text)">${m.titulo || "Sin título"}</div>
          </div>
          <button id="detalle-mejora-cerrar" style="background:none;border:none;color:var(--text2);font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>
        </div>
        <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">
          ${sec("🔍 Situación problemática", m.situacion)}
          ${sec("⚡ Impacto institucional", m.impacto)}
          ${sec("💡 Acción sugerida", m.accion)}
          ${(tagsProc || tagsNorm) ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">🔗 Vínculos</div><div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">${tagsProc}${tagsNorm}</div></div>` : ""}
          ${m.mitigacion ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">✨ Propuesta de mitigación</div><div class="detalle-seccion-texto" style="border-left:3px solid var(--accent);padding-left:0.6rem">${fmtIA(m.mitigacion)}</div></div>` : ""}
          ${m.respuesta  ? `<div class="detalle-seccion"><div class="detalle-seccion-titulo">📝 Respuesta institucional</div><div class="detalle-seccion-texto" style="border-left:3px solid #2D6A4F;padding-left:0.6rem">${fmtIA(m.respuesta)}</div></div>` : ""}
        </div>
        <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;position:sticky;bottom:0;background:var(--bg2);">
          <button id="detalle-mejora-editar" style="background:var(--accent);color:white;border:none;border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;font-family:inherit;font-weight:600;">✏️ Editar</button>
        </div>
      </div>`;

    document.getElementById("detalle-mejora-cerrar").addEventListener("click", () => { modal.style.display = "none"; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });
    document.getElementById("detalle-mejora-editar").addEventListener("click", () => { modal.style.display = "none"; activarEdicion(m.id); });
    modal.style.display = "flex";
  }

});