// js/analisis.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const colorEstado = {
  "Abierto":    "#9B2226",
  "En proceso": "#0077B6",
  "Resuelto":   "#2D6A4F"
};

let todosLosAnalisis = [];
let filtroActivo     = "todos";
let modoEdicion      = null;
let normasSeleccionadas = [];

// Helper: asigna valor a un elemento si existe
const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
const get = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const analisisRef = collection(db, "usuarios", user.uid, "analisis");
  const normasRef   = collection(db, "usuarios", user.uid, "normatividad");

  // ─── CARGAR CATÁLOGO DE NORMAS ────────────────────────────────────────────
  onSnapshot(query(normasRef, orderBy("creadoEn", "desc")), (snapshot) => {
    const select = document.getElementById("analisis-norma-select");
    if (!select) return;
    select.innerHTML = '<option value="">— Agregar norma del catálogo —</option>';
    snapshot.docs.forEach(d => {
      const n = d.data();
      const option = document.createElement("option");
      option.value = n.nombre;
      option.textContent = n.tipo ? `[${n.tipo}] ${n.nombre}` : n.nombre;
      select.appendChild(option);
    });
  });

  // ─── SELECCIONAR NORMA ────────────────────────────────────────────────────
  document.getElementById("analisis-norma-select")?.addEventListener("change", (e) => {
    const nombre = e.target.value;
    if (!nombre) return;
    if (normasSeleccionadas.find(n => n.nombre === nombre)) { e.target.value = ""; return; }
    normasSeleccionadas.push({ nombre });
    renderNormasSeleccionadas();
    e.target.value = "";
  });

  // ─── RENDER TAGS NORMAS ───────────────────────────────────────────────────
  function renderNormasSeleccionadas() {
    const contenedor = document.getElementById("analisis-normas-seleccionadas");
    if (!contenedor) return;
    if (normasSeleccionadas.length === 0) { contenedor.innerHTML = ""; return; }
    contenedor.innerHTML = normasSeleccionadas.map((n, i) => `
      <span class="participante-tag">
        📄 ${n.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}">✕</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".participante-tag-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        normasSeleccionadas.splice(Number(btn.dataset.index), 1);
        renderNormasSeleccionadas();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ───────────────────────────────────────────────────
  function limpiarFormulario() {
    set("analisis-pregunta",    "");
    set("analisis-estado",      "Abierto");
    set("analisis-norma-select","");
    set("analisis-norma",       "");
    set("analisis-ley",         "");
    set("analisis-practica",    "");
    set("analisis-precedente",  "");
    set("analisis-ia",          "");
    normasSeleccionadas = [];
    renderNormasSeleccionadas();
    const titulo = document.querySelector("#panel-analisis .reunion-form-card h2");
    if (titulo) titulo.textContent = "Nuevo Análisis";
    const btnCancelar = document.getElementById("btn-cancelar-analisis");
    if (btnCancelar) btnCancelar.style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ─────────────────────────────────────────────────
  function activarEdicion(id) {
    const analisis = todosLosAnalisis.find(a => a.id === id);
    if (!analisis) return;
    modoEdicion = id;
    set("analisis-pregunta",   analisis.pregunta   || "");
    set("analisis-estado",     analisis.estado     || "Abierto");
    set("analisis-norma",      analisis.norma      || "");
    set("analisis-ley",        analisis.ley        || "");
    set("analisis-practica",   analisis.practica   || "");
    set("analisis-precedente", analisis.precedente || "");
    set("analisis-ia",         analisis.ia         || "");
    normasSeleccionadas = Array.isArray(analisis.normasVinculadas)
      ? analisis.normasVinculadas.map(n => ({ ...n }))
      : [];
    renderNormasSeleccionadas();
    const titulo = document.querySelector("#panel-analisis .reunion-form-card h2");
    if (titulo) titulo.textContent = "Editar Análisis";
    const btnCancelar = document.getElementById("btn-cancelar-analisis");
    if (btnCancelar) btnCancelar.style.display = "inline-block";
    document.getElementById("panel-analisis")?.scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-analisis");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const pregunta   = get("analisis-pregunta");
      const estado     = get("analisis-estado");
      const norma      = get("analisis-norma");
      const ley        = get("analisis-ley");
      const practica   = get("analisis-practica");
      const precedente = get("analisis-precedente");
      const ia         = get("analisis-ia");

      if (!pregunta) { alert("La pregunta institucional es obligatoria."); return; }

      try {
        const datos = { pregunta, estado, norma, ley, practica, precedente, ia,
          normasVinculadas: normasSeleccionadas };
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "analisis", modoEdicion), datos);
        } else {
          await addDoc(analisisRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar análisis:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ───────────────────────────────────────────────────────
  const btnCancelar = document.getElementById("btn-cancelar-analisis");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // ─── BOTÓN GENERAR IA ─────────────────────────────────────────────────────
  const btnGenerarIA = document.getElementById("btn-generar-ia-analisis");
  if (btnGenerarIA) {
    btnGenerarIA.addEventListener("click", async () => {
      const pregunta   = get("analisis-pregunta");
      const ley        = get("analisis-ley");
      const practica   = get("analisis-practica");
      const precedente = get("analisis-precedente");

      if (!pregunta) { alert("Escribe primero la pregunta institucional."); return; }

      const campoIA = document.getElementById("analisis-ia");
      if (campoIA) campoIA.value = "⏳ Generando interpretación...";
      btnGenerarIA.disabled = true;
      btnGenerarIA.textContent = "⏳ Generando...";

      const normasTexto = normasSeleccionadas.map(n => n.nombre).join(", ") || "No especificadas";

      const prompt = `Eres un asesor jurídico-administrativo especializado en políticas públicas de vivienda y desarrollo urbano en México, con experiencia en el marco normativo federal y estatal aplicable a SEDUVOT Zacatecas.

Se te presenta un análisis institucional con tres capas ya desarrolladas. Tu tarea es generar la interpretación de la capa IA: una síntesis analítica que integre las tres capas y proporcione una conclusión operativa clara y fundamentada.

PREGUNTA INSTITUCIONAL:
${pregunta}

NORMAS RELACIONADAS:
${normasTexto}

CAPA 1 — LEY (qué dice la norma):
${ley || "No registrada"}

CAPA 2 — PRÁCTICA (cómo se aplica):
${practica || "No registrada"}

CAPA 3 — PRECEDENTE (casos anteriores):
${precedente || "No registrado"}

Genera la CAPA IA con este formato:
- Interpretación: (síntesis de las tres capas en 2-3 oraciones)
- Conclusión operativa: (respuesta directa a la pregunta institucional)
- Riesgo o consideración clave: (una alerta o recomendación para SEDUVOT)

Responde únicamente con el contenido de la capa IA, sin introducciones ni comentarios adicionales. Tono institucional, lenguaje técnico-administrativo, en español.`;

      try {
        const response = await fetch("https://lumen-briefing.garogmx89.workers.dev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        if (campoIA) campoIA.value = data.briefing || "No se pudo generar la interpretación.";
      } catch (error) {
        console.error("Error al llamar a la IA:", error);
        if (campoIA) campoIA.value = "❌ Error al conectar con la IA. Intenta de nuevo.";
      } finally {
        btnGenerarIA.disabled = false;
        btnGenerarIA.textContent = "✨ Generar con IA";
      }
    });
  }

  // ─── FILTROS ──────────────────────────────────────────────────────────────
  document.querySelectorAll("#panel-analisis .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#panel-analisis .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroActivo = btn.dataset.filtro;
      renderAnalisis();
    });
  });

  // ─── LEER EN TIEMPO REAL ──────────────────────────────────────────────────
  const q = query(analisisRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosAnalisis = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAnalisis();
  });

  // ─── RENDER TARJETAS ──────────────────────────────────────────────────────
  function renderAnalisis() {
    const contenedor = document.getElementById("analisis-contenido");
    if (!contenedor) return;

    const filtrados = filtroActivo === "todos"
      ? todosLosAnalisis
      : todosLosAnalisis.filter(a => a.estado === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay análisis registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((a) => {
      const color = colorEstado[a.estado] || "#555";
      const tagsNormas = Array.isArray(a.normasVinculadas) && a.normasVinculadas.length > 0
        ? `<div class="participantes-tags-display">
            ${a.normasVinculadas.map(n =>
              `<span class="participante-tag-display">📄 ${n.nombre}</span>`
            ).join("")}
           </div>`
        : "";
      return `
        <div class="reunion-card analisis-card">
          <div class="reunion-card-header">
            <div class="analisis-card-pregunta">
              <span class="norma-tipo-badge" style="background:${color}">${a.estado}</span>
              <span class="reunion-card-titulo">${a.pregunta}</span>
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar"   data-id="${a.id}" title="Editar análisis">✏️</button>
              <button class="btn-eliminar" data-id="${a.id}" title="Eliminar análisis">🗑️</button>
            </div>
          </div>
          ${tagsNormas}
          ${a.norma ? `<div class="reunion-card-meta">📄 ${a.norma}</div>` : ""}
          <div class="analisis-capas-display">
            ${a.ley        ? `<div class="capa-display"><span class="capa-titulo">⚖️ Ley</span><span class="capa-texto">${a.ley}</span></div>` : ""}
            ${a.practica   ? `<div class="capa-display"><span class="capa-titulo">🏛️ Práctica</span><span class="capa-texto">${a.practica}</span></div>` : ""}
            ${a.precedente ? `<div class="capa-display"><span class="capa-titulo">📂 Precedente</span><span class="capa-texto">${a.precedente}</span></div>` : ""}
            ${a.ia         ? `<div class="capa-display"><span class="capa-titulo">🤖 IA</span><span class="capa-texto">${a.ia}</span></div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este análisis? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "analisis", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }
});