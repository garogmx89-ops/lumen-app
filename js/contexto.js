// js/contexto.js — v4.9
// Módulo Contexto — fondos, presupuesto, vinculación y análisis IA

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let todosLosContextos = [];
let filtroActivo      = "todos";
let modoEdicion       = null;

// Arrays que guardan los vínculos seleccionados en el formulario
let normasVinculadas    = []; // [{ nombre }]
let entidadesVinculadas = []; // [{ id, nombre }]

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const contextosRef = collection(db, "usuarios", user.uid, "contextos");
  const normasRef    = collection(db, "usuarios", user.uid, "normatividad");
  const entidadesRef = collection(db, "usuarios", user.uid, "entidades");

  // ─── CARGAR CATÁLOGO DE NORMATIVIDAD ─────────────────────────────────────
  onSnapshot(query(normasRef, orderBy("creadoEn", "asc")), (snap) => {
    const selector = document.getElementById("contexto-selector-norma");
    if (!selector) return;
    selector.innerHTML = '<option value="">— Selecciona una norma —</option>';
    snap.docs.forEach(d => {
      const n = d.data();
      const opt = document.createElement("option");
      opt.value       = n.nombre || "(sin nombre)";
      opt.textContent = n.tipo ? `[${n.tipo}] ${n.nombre}` : (n.nombre || "(sin nombre)");
      selector.appendChild(opt);
    });
  });

  // ─── CARGAR CATÁLOGO DE ENTIDADES ─────────────────────────────────────────
  onSnapshot(query(entidadesRef, orderBy("creadoEn", "asc")), (snap) => {
    const selector = document.getElementById("contexto-selector-entidad");
    if (!selector) return;
    selector.innerHTML = '<option value="">— Selecciona una entidad —</option>';
    snap.docs.forEach(d => {
      const e = d.data();
      const opt = document.createElement("option");
      opt.value       = d.id;
      opt.textContent = e.nombre || e.siglas || "(sin nombre)";
      selector.appendChild(opt);
    });
  });

  // ─── SELECTOR DE NORMAS: agregar tag al hacer clic ───────────────────────
  const selectorNorma = document.getElementById("contexto-selector-norma");
  if (selectorNorma) {
    selectorNorma.addEventListener("change", () => {
      const nombre = selectorNorma.value;
      if (!nombre) return;
      if (normasVinculadas.find(n => n.nombre === nombre)) {
        selectorNorma.value = "";
        return;
      }
      normasVinculadas.push({ nombre });
      renderTagsNormas();
      selectorNorma.value = "";
    });
  }

  // ─── SELECTOR DE ENTIDADES: agregar tag al hacer clic ────────────────────
  const selectorEntidad = document.getElementById("contexto-selector-entidad");
  if (selectorEntidad) {
    selectorEntidad.addEventListener("change", () => {
      const id     = selectorEntidad.value;
      const nombre = selectorEntidad.options[selectorEntidad.selectedIndex].text;
      if (!id) return;
      if (entidadesVinculadas.find(e => e.id === id)) {
        selectorEntidad.value = "";
        return;
      }
      entidadesVinculadas.push({ id, nombre });
      renderTagsEntidades();
      selectorEntidad.value = "";
    });
  }

  // ─── RENDER TAGS NORMAS ───────────────────────────────────────────────────
  function renderTagsNormas() {
    const contenedor = document.getElementById("contexto-tags-normas");
    if (!contenedor) return;
    contenedor.innerHTML = normasVinculadas.map((n, i) => `
      <span class="participante-tag">
        📄 ${n.nombre}
        <button type="button" class="tag-remove" data-index="${i}" data-tipo="norma">×</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".tag-remove[data-tipo='norma']").forEach(btn => {
      btn.addEventListener("click", () => {
        normasVinculadas.splice(Number(btn.dataset.index), 1);
        renderTagsNormas();
      });
    });
  }

  // ─── RENDER TAGS ENTIDADES ────────────────────────────────────────────────
  function renderTagsEntidades() {
    const contenedor = document.getElementById("contexto-tags-entidades");
    if (!contenedor) return;
    contenedor.innerHTML = entidadesVinculadas.map((e, i) => `
      <span class="participante-tag">
        🏛️ ${e.nombre}
        <button type="button" class="tag-remove" data-index="${i}" data-tipo="entidad">×</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".tag-remove[data-tipo='entidad']").forEach(btn => {
      btn.addEventListener("click", () => {
        entidadesVinculadas.splice(Number(btn.dataset.index), 1);
        renderTagsEntidades();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ───────────────────────────────────────────────────
  function limpiarFormulario() {
    document.getElementById("contexto-nombre").value      = "";
    document.getElementById("contexto-periodo").value     = "";
    document.getElementById("contexto-asignado").value    = "";
    document.getElementById("contexto-ejercido").value    = "";
    document.getElementById("contexto-indicadores").value = "";
    document.getElementById("contexto-notas").value       = "";

    normasVinculadas    = [];
    entidadesVinculadas = [];
    renderTagsNormas();
    renderTagsEntidades();

    document.querySelector("#panel-contexto .reunion-form-card h2").textContent = "Nuevo Contexto";
    document.getElementById("btn-cancelar-contexto").style.display = "none";
    modoEdicion = null;

    actualizarFiltrosPeriodo();
  }

  // ─── ACTIVAR MODO EDICIÓN ─────────────────────────────────────────────────
  function activarEdicion(id) {
    const contexto = todosLosContextos.find(c => c.id === id);
    if (!contexto) return;

    modoEdicion = id;
    document.getElementById("contexto-nombre").value      = contexto.nombre      || "";
    document.getElementById("contexto-periodo").value     = contexto.periodo     || "";
    document.getElementById("contexto-asignado").value    = contexto.asignado    || "";
    document.getElementById("contexto-ejercido").value    = contexto.ejercido    || "";
    document.getElementById("contexto-indicadores").value = contexto.indicadores || "";
    document.getElementById("contexto-notas").value       = contexto.notas       || "";

    // Recuperar vínculos guardados
    normasVinculadas    = Array.isArray(contexto.normasVinculadas)    ? [...contexto.normasVinculadas]    : [];
    entidadesVinculadas = Array.isArray(contexto.entidadesVinculadas) ? [...contexto.entidadesVinculadas] : [];
    renderTagsNormas();
    renderTagsEntidades();

    document.querySelector("#panel-contexto .reunion-form-card h2").textContent = "Editar Contexto";
    document.getElementById("btn-cancelar-contexto").style.display = "inline-block";
    document.getElementById("panel-contexto").scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-contexto");
  if (btnGuardar) {
    const btnNuevo = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnNuevo, btnGuardar);

    btnNuevo.addEventListener("click", async () => {
      const nombre      = document.getElementById("contexto-nombre").value.trim();
      const periodo     = document.getElementById("contexto-periodo").value.trim();
      const asignado    = document.getElementById("contexto-asignado").value.trim();
      const ejercido    = document.getElementById("contexto-ejercido").value.trim();
      const indicadores = document.getElementById("contexto-indicadores").value.trim();
      const notas       = document.getElementById("contexto-notas").value.trim();

      if (!nombre) {
        alert("El nombre del fondo o programa es obligatorio.");
        return;
      }

      try {
        const datos = {
          nombre, periodo, asignado, ejercido, indicadores, notas,
          normasVinculadas,
          entidadesVinculadas
        };
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "contextos", modoEdicion), datos);
        } else {
          await addDoc(contextosRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar contexto:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ───────────────────────────────────────────────────────
  const btnCancelar = document.getElementById("btn-cancelar-contexto");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // ─── LEER EN TIEMPO REAL ──────────────────────────────────────────────────
  const q = query(contextosRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    todosLosContextos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    actualizarFiltrosPeriodo();
    renderContextos();
  });

  // ─── FILTROS POR PERIODO ──────────────────────────────────────────────────
  function actualizarFiltrosPeriodo() {
    const contenedorFiltros = document.getElementById("contexto-filtros");
    if (!contenedorFiltros) return;

    const periodos = [...new Set(
      todosLosContextos.map(c => c.periodo).filter(Boolean)
    )].sort().reverse();

    contenedorFiltros.innerHTML = `
      <button class="filtro-btn ${filtroActivo === 'todos' ? 'filtro-activo' : ''}"
        data-filtro="todos">Todos</button>
      ${periodos.map(p => `
        <button class="filtro-btn ${filtroActivo === p ? 'filtro-activo' : ''}"
          data-filtro="${p}">${p}</button>
      `).join("")}
    `;

    contenedorFiltros.querySelectorAll(".filtro-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        contenedorFiltros.querySelectorAll(".filtro-btn")
          .forEach(b => b.classList.remove("filtro-activo"));
        btn.classList.add("filtro-activo");
        filtroActivo = btn.dataset.filtro;
        renderContextos();
      });
    });
  }

  // ─── RENDER TARJETAS ──────────────────────────────────────────────────────
  function renderContextos() {
    const contenedor = document.getElementById("contexto-contenido");
    if (!contenedor) return;

    const filtrados = filtroActivo === "todos"
      ? todosLosContextos
      : todosLosContextos.filter(c => c.periodo === filtroActivo);

    if (filtrados.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay contextos registrados para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtrados.map((c) => {
      const tagsNormas = (c.normasVinculadas || []).map(n =>
        `<span class="participante-tag" style="font-size:0.75rem">📄 ${n.nombre}</span>`
      ).join("");

      const tagsEntidades = (c.entidadesVinculadas || []).map(e =>
        `<span class="participante-tag" style="font-size:0.75rem">🏛️ ${e.nombre}</span>`
      ).join("");

      const seccionVinculos = (tagsNormas || tagsEntidades)
        ? `<div class="reunion-card-participantes">${tagsNormas}${tagsEntidades}</div>`
        : "";

      return `
        <div class="reunion-card contexto-card">
          <div class="reunion-card-header">
            <div class="entidad-card-nombre">
              <span class="reunion-card-titulo">📊 ${c.nombre}</span>
              ${c.periodo ? `<span class="entidad-siglas-badge">${c.periodo}</span>` : ""}
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-briefing-ia" data-id="${c.id}" title="Generar análisis con IA">✨</button>
              <button class="btn-editar"      data-id="${c.id}" title="Editar contexto">✏️</button>
              <button class="btn-eliminar"    data-id="${c.id}" title="Eliminar contexto">🗑️</button>
            </div>
          </div>
          ${c.asignado || c.ejercido ? `
            <div class="contexto-montos">
              ${c.asignado ? `<div class="contexto-monto"><span class="contexto-monto-label">Asignado</span><span class="contexto-monto-valor">${c.asignado}</span></div>` : ""}
              ${c.ejercido ? `<div class="contexto-monto"><span class="contexto-monto-label">Ejercido</span><span class="contexto-monto-valor">${c.ejercido}</span></div>` : ""}
            </div>` : ""}
          ${c.indicadores ? `
            <div class="reunion-card-acuerdos">
              <strong>Indicadores:</strong> ${c.indicadores}
            </div>` : ""}
          ${c.notas ? `
            <div class="reunion-card-acuerdos">
              <strong>Notas:</strong> ${c.notas}
            </div>` : ""}
          ${seccionVinculos}
        </div>
      `;
    }).join("");

    // Botón ✨ Análisis IA
    contenedor.querySelectorAll(".btn-briefing-ia").forEach((btn) => {
      btn.addEventListener("click", () => generarAnalisisIA(btn.dataset.id, btn));
    });

    // Botones EDITAR
    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => activarEdicion(btn.dataset.id));
    });

    // Botones ELIMINAR
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este contexto? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "contextos", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }

  // ─── GENERAR ANÁLISIS IA ──────────────────────────────────────────────────
  async function generarAnalisisIA(id, btnOrigen) {
    const contexto = todosLosContextos.find(c => c.id === id);
    if (!contexto) return;

    btnOrigen.disabled    = true;
    btnOrigen.textContent = "⏳";

    const normasTexto    = (contexto.normasVinculadas    || []).map(n => n.nombre).join(", ") || "No especificadas";
    const entidadesTexto = (contexto.entidadesVinculadas || []).map(e => e.nombre).join(", ") || "No especificadas";

    const prompt = `Eres un asesor experto en finanzas públicas y política de vivienda en México, especializado en el seguimiento presupuestal y evaluación de programas federales en el ámbito de SEDUVOT Zacatecas (Secretaría de Desarrollo Urbano, Vivienda y Ordenamiento Territorial).

Se te presenta el contexto presupuestal de un fondo o programa federal. Genera un análisis ejecutivo cruzado que integre la información presupuestal con el marco normativo y las entidades involucradas.

FONDO O PROGRAMA:
${contexto.nombre || "No especificado"}

EJERCICIO FISCAL:
${contexto.periodo || "No especificado"}

MONTO ASIGNADO:
${contexto.asignado || "No registrado"}

MONTO EJERCIDO:
${contexto.ejercido || "No registrado"}

INDICADORES CLAVE:
${contexto.indicadores || "No registrados"}

NOTAS Y CONTEXTO GENERAL:
${contexto.notas || "Sin notas"}

NORMATIVIDAD APLICABLE:
${normasTexto}

ENTIDADES INVOLUCRADAS:
${entidadesTexto}

Genera un análisis ejecutivo con el siguiente formato:

**Situación presupuestal:**
(Evaluación del avance de ejercicio, eficiencia del gasto y cumplimiento de metas)

**Implicaciones normativas:**
(Cómo el marco legal vinculado condiciona o regula el ejercicio de este recurso)

**Coordinación interinstitucional:**
(Rol de las entidades involucradas y posibles cuellos de botella)

**Riesgos y recomendaciones:**
(Alertas operativas y acciones prioritarias para SEDUVOT)

Tono institucional, lenguaje técnico-administrativo. Máximo 300 palabras. Responde únicamente con el análisis, sin introducciones ni comentarios adicionales.`;

    try {
      const response = await fetch("https://lumen-briefing.garogmx89.workers.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await response.json();
      const texto = data.briefing || "No se pudo generar el análisis.";
      mostrarModalIA(contexto.nombre, texto);
    } catch (error) {
      console.error("Error al llamar a la IA:", error);
      alert("❌ Error al conectar con la IA. Intenta de nuevo.");
    } finally {
      btnOrigen.disabled    = false;
      btnOrigen.textContent = "✨";
    }
  }

  // ─── MODAL PARA MOSTRAR ANÁLISIS IA ──────────────────────────────────────
  function mostrarModalIA(titulo, texto) {
    // Reutilizar el modal de briefing de Reuniones si existe en el DOM
    const modalExistente = document.getElementById("modal-briefing");
    if (modalExistente) {
      const modalTitulo = document.getElementById("modal-briefing-titulo");
      const modalCuerpo = document.getElementById("modal-briefing-cuerpo");
      if (modalTitulo) modalTitulo.textContent = `✨ Análisis IA — ${titulo}`;
      if (modalCuerpo) {
        modalCuerpo.innerHTML = texto
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/^## (.+)$/gm, "<h3>$1</h3>")
          .replace(/\n/g, "<br>");
      }
      modalExistente.style.display = "flex";
      return;
    }

    // Fallback: crear modal propio si el de Reuniones no está disponible
    const existente = document.getElementById("modal-contexto-ia");
    if (existente) existente.remove();

    const modal = document.createElement("div");
    modal.id    = "modal-contexto-ia";
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);
      display:flex;align-items:center;justify-content:center;
      z-index:1000;padding:1rem;
    `;
    const html = texto
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^## (.+)$/gm, "<h3>$1</h3>")
      .replace(/\n/g, "<br>");
    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;
                  padding:1.5rem;max-width:600px;width:100%;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <strong style="color:var(--text)">✨ Análisis IA — ${titulo}</strong>
          <button id="cerrar-modal-contexto-ia"
            style="background:none;border:none;color:var(--text2);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div style="color:var(--text);line-height:1.6;font-size:0.9rem">${html}</div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById("cerrar-modal-contexto-ia")
      .addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  }

});
