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
      const asignado    = document.getElementById("contexto-asignado").value.trim().replace(/^\$/, "").trim();
      const ejercido    = document.getElementById("contexto-ejercido").value.trim().replace(/^\$/, "").trim();
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

    const eb_contexto = document.getElementById("contexto-export-bar");
    if (eb_contexto && !eb_contexto.dataset.init) {
      eb_contexto.dataset.init = "1";
      eb_contexto.innerHTML = `<button id="btn-xls-contexto" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📊 Exportar Excel</button><button id="btn-pdf-contexto" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📄 Exportar PDF</button>`;
      document.getElementById("btn-xls-contexto").addEventListener("click", () => exportarExcel_contexto());
      document.getElementById("btn-pdf-contexto").addEventListener("click", () => exportarPDF_contexto());
    }

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
        <div class="reunion-card contexto-card contexto-card--clickable" data-id="${c.id}" style="cursor:pointer">
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
              ${c.asignado ? `<div class="contexto-monto"><span class="contexto-monto-label">Asignado</span><span class="contexto-monto-valor">$${c.asignado}</span></div>` : ""}
              ${c.ejercido ? `<div class="contexto-monto"><span class="contexto-monto-label">Ejercido</span><span class="contexto-monto-valor">$${c.ejercido}</span></div>` : ""}
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

    // Clic en tarjeta → modal de detalle
    contenedor.querySelectorAll(".contexto-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const ctx = todosLosContextos.find(c => c.id === card.dataset.id);
        if (ctx) mostrarDetalle(ctx);
      });
    });

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
  async function generarAnalisisIA(id, btnOrigen, forzarRegeneracion = false) {
    const contexto = todosLosContextos.find(c => c.id === id);
    if (!contexto) return;

    // Si ya hay análisis guardado y no se pidió regenerar, mostrar al instante
    if (contexto.analisisIA && !forzarRegeneracion) {
      mostrarModalIA(contexto.nombre, contexto.analisisIA, id);
      return;
    }

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

      // Guardar en Firestore para no regenerar la próxima vez
      await updateDoc(doc(db, "usuarios", user.uid, "contextos", id), { analisisIA: texto });

      mostrarModalIA(contexto.nombre, texto, id);
    } catch (error) {
      console.error("Error al llamar a la IA:", error);
      alert("❌ Error al conectar con la IA. Intenta de nuevo.");
    } finally {
      btnOrigen.disabled    = false;
      btnOrigen.textContent = "✨";
    }
  }

  // ─── MODAL PARA MOSTRAR ANÁLISIS IA ──────────────────────────────────────
  function mostrarModalIA(titulo, texto, id, cargando = false) {
    // Reutilizar el modal de briefing de Reuniones si existe en el DOM
    const modalExistente = document.getElementById("briefing-modal");
    if (modalExistente) {
      const tituloEl = document.getElementById("briefing-modal-titulo");
      const cuerpo   = document.getElementById("briefing-modal-cuerpo");
      const footer   = document.getElementById("briefing-modal-footer");

      if (tituloEl) tituloEl.textContent = `✨ Análisis IA — ${titulo}`;

      if (cargando) {
        if (cuerpo) cuerpo.innerHTML = `<p class="briefing-cargando">✨ Analizando contexto presupuestal...</p>`;
        if (footer) footer.innerHTML = "";
      } else {
        if (cuerpo) {
          cuerpo.innerHTML = texto
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/^## (.+)$/gm, "<h3>$1</h3>")
            .replace(/\n/g, "<br>");
        }
        if (footer) {
          footer.innerHTML = `
            <button id="btn-regenerar-contexto-ia"
              style="margin-top:1rem;background:none;border:1px solid var(--border);
                     color:var(--text2);border-radius:8px;padding:0.5rem 1rem;
                     cursor:pointer;font-size:0.85rem;font-family:inherit;">
              🔄 Regenerar análisis
            </button>
          `;
          document.getElementById("btn-regenerar-contexto-ia").addEventListener("click", () => {
            const btn = document.querySelector(`.btn-briefing-ia[data-id="${id}"]`);
            if (btn) generarAnalisisIA(id, btn, true);
          });
        }
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
    const htmlContenido = cargando
      ? `<p style="color:var(--text2)">✨ Analizando contexto presupuestal...</p>`
      : texto
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/^## (.+)$/gm, "<h3>$1</h3>")
          .replace(/\n/g, "<br>");

    const botonRegenerar = cargando ? "" : `
      <button id="btn-regenerar-fallback"
        style="margin-top:1rem;background:none;border:1px solid var(--border);
               color:var(--text2);border-radius:8px;padding:0.5rem 1rem;
               cursor:pointer;font-size:0.85rem;font-family:inherit;">
        🔄 Regenerar análisis
      </button>`;

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;
                  padding:1.5rem;max-width:600px;width:100%;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <strong style="color:var(--text)">✨ Análisis IA — ${titulo}</strong>
          <button id="cerrar-modal-contexto-ia"
            style="background:none;border:none;color:var(--text2);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div style="color:var(--text);line-height:1.6;font-size:0.9rem">${htmlContenido}</div>
        ${botonRegenerar}
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById("cerrar-modal-contexto-ia")
      .addEventListener("click", () => modal.remove());
    // NO cerrar al hacer clic fuera — eliminado intencionalmente

    if (!cargando) {
      const btnReg = document.getElementById("btn-regenerar-fallback");
      if (btnReg) {
        btnReg.addEventListener("click", () => {
          modal.remove();
          const btn = document.querySelector(`.btn-briefing-ia[data-id="${id}"]`);
          if (btn) generarAnalisisIA(id, btn, true);
        });
      }
    }
  }

  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  function mostrarDetalle(c) {
    let modal = document.getElementById("detalle-contexto-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-contexto-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    const tagsNormas = (c.normasVinculadas || [])
      .map(n => '<span class="participante-tag" style="font-size:0.8rem">📄 ' + n.nombre + '</span>')
      .join("") || "";
    const tagsEntidades = (c.entidadesVinculadas || [])
      .map(e => '<span class="participante-tag" style="font-size:0.8rem">🏛️ ' + e.nombre + '</span>')
      .join("") || "";

    const analisisHtml = c.analisisIA
      ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">✨ Análisis IA</div>'
        + '<div class="detalle-briefing-texto">'
        + c.analisisIA.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n").join("<br>")
        + '</div></div>'
      : "";

    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;'
      + 'width:100%;max-width:560px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;'
      + 'padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);'
      + 'position:sticky;top:0;background:var(--bg2);z-index:1;">'
      + '<div>'
      + '<div style="font-size:1rem;font-weight:700;color:var(--text)">📊 ' + (c.nombre || "Sin nombre") + '</div>'
      + (c.periodo ? '<div style="font-size:0.8rem;color:var(--text2);margin-top:0.2rem">Ejercicio fiscal: ' + c.periodo + '</div>' : '')
      + '</div>'
      + '<button id="detalle-contexto-cerrar" style="background:none;border:none;color:var(--text2);'
      + 'font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>'
      + '</div>'
      // Cuerpo
      + '<div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">'
      + ((c.asignado || c.ejercido) ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">💰 Presupuesto</div>'
        + '<div style="display:flex;gap:1.5rem;margin-top:0.3rem">'
        + (c.asignado ? '<div><div style="font-size:0.75rem;color:var(--text2)">Asignado</div>'
          + '<div style="font-weight:700;color:var(--text)">$' + c.asignado + '</div></div>' : '')
        + (c.ejercido ? '<div><div style="font-size:0.75rem;color:var(--text2)">Ejercido</div>'
          + '<div style="font-weight:700;color:var(--text)">$' + c.ejercido + '</div></div>' : '')
        + '</div></div>' : '')
      + (c.indicadores ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📈 Indicadores clave</div>'
        + '<div class="detalle-seccion-texto">' + c.indicadores + '</div></div>' : '')
      + (c.notas ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📝 Notas</div>'
        + '<div class="detalle-seccion-texto">' + c.notas + '</div></div>' : '')
      + ((tagsNormas || tagsEntidades) ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">🔗 Vínculos</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">'
        + tagsNormas + tagsEntidades + '</div></div>' : '')
      + analisisHtml
      + '</div>'
      // Footer
      + '<div style="padding:1rem 1.4rem;border-top:1px solid var(--border);'
      + 'display:flex;gap:0.75rem;justify-content:flex-end;'
      + 'position:sticky;bottom:0;background:var(--bg2);">'
      + '<button id="detalle-contexto-editar" style="background:var(--accent);color:white;border:none;'
      + 'border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;'
      + 'font-family:inherit;font-weight:600;">✏️ Editar</button>'
      + '<button id="detalle-contexto-ia" style="background:none;border:1px solid var(--border);'
      + 'color:var(--text2);border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;'
      + 'cursor:pointer;font-family:inherit;">'
      + (c.analisisIA ? "✨ Ver análisis" : "✨ Generar análisis") + '</button>'
      + '</div>'
      + '</div>';

    document.getElementById("detalle-contexto-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("detalle-contexto-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(c.id);
    });

    document.getElementById("detalle-contexto-ia").addEventListener("click", () => {
      modal.style.display = "none";
      const btn = document.querySelector('.btn-briefing-ia[data-id="' + c.id + '"]');
      if (btn) generarAnalisisIA(c.id, btn);
    });

    modal.style.display = "flex";
  }

  function fechaHoy_(){const h=new Date();return h.getFullYear()+"-"+String(h.getMonth()+1).padStart(2,"0")+"-"+String(h.getDate()).padStart(2,"0");}
  function fmtF_(f){if(!f)return"";const[y,m,d]=f.split("-");return new Date(Number(y),Number(m)-1,Number(d)).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"});}
  function pdfHdr_(doc,titulo){doc.setFillColor(74,74,138);doc.rect(0,0,210,22,"F");doc.setTextColor(255,255,255);doc.setFontSize(13);doc.setFont("helvetica","bold");doc.text("LUMEN - SEDUVOT Zacatecas",20,10);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text(titulo+" · "+fechaHoy_(),20,17);return 30;}
  function pdfSec_(doc,titulo,texto,y){if(!texto)return y;if(y+15>280){doc.addPage();y=20;}doc.setFillColor(245,245,250);doc.rect(20,y-3,170,6,"F");doc.setTextColor(74,74,138);doc.setFontSize(9);doc.setFont("helvetica","bold");doc.text(titulo,22,y+1);y+=7;doc.setTextColor(50,50,50);doc.setFontSize(9);doc.setFont("helvetica","normal");const ln=doc.splitTextToSize(texto,170);if(y+ln.length*5>280){doc.addPage();y=20;}doc.text(ln,20,y);return y+ln.length*5+4;}
  function pdfFtr_(doc){const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text("Lumen · SEDUVOT Zacatecas · Pag "+i+"/"+n,20,290);}}

  function exportarExcel_contexto() {
    if (!todosLosContextos.length){alert("No hay contextos para exportar.");return;}
    function gen(){
      const filas=todosLosContextos.map(ctx=>({
        "Fondo/Programa":ctx.nombre||"","Periodo":ctx.periodo||"",
        "Monto asignado":ctx.asignado||"","Monto ejercido":ctx.ejercido||"",
        "Indicadores":ctx.indicadores||"","Notas":ctx.notas||"",
        "Normas vinculadas":(ctx.normasVinculadas||[]).map(n=>n.nombre).join(", "),
        "Entidades vinculadas":(ctx.entidadesVinculadas||[]).map(e=>e.nombre).join(", "),
        "Analisis IA":ctx.analisisIA?"Si":"No"
      }));
      const ws=window.XLSX.utils.json_to_sheet(filas);
      ws["!cols"]=[{wch:35},{wch:10},{wch:16},{wch:16},{wch:40},{wch:40},{wch:35},{wch:30},{wch:10}];
      const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,"Contexto");
      window.XLSX.writeFile(wb,"Lumen_Contexto_"+fechaHoy_()+".xlsx");
    }

    if(window.XLSX){gen();}else{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=gen;document.head.appendChild(s);}

  }
  function exportarPDF_contexto() {
    if (!todosLosContextos.length){alert("No hay contextos para exportar.");return;}
    function gen(){
      const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:"mm",format:"a4"});
      let y=pdfHdr_(doc,"Contexto Presupuestal");
      todosLosContextos.forEach((ctx,i)=>{
        if(y+20>280){doc.addPage();y=20;}
        doc.setDrawColor(200,200,200);doc.line(20,y,190,y);y+=5;
        doc.setTextColor(74,74,138);doc.setFontSize(11);doc.setFont("helvetica","bold");
        const tl=doc.splitTextToSize((i+1)+". "+(ctx.nombre||"Sin nombre")+(ctx.periodo?" ("+ctx.periodo+")":""),170);
        doc.text(tl,20,y);y+=tl.length*6;
        doc.setTextColor(100,100,100);doc.setFontSize(8);doc.setFont("helvetica","normal");
        const pres=[(ctx.asignado?"Asignado: "+ctx.asignado:""),(ctx.ejercido?"Ejercido: "+ctx.ejercido:"")].filter(Boolean).join(" | ");
        if(pres){doc.text(pres,20,y);y+=5;}
        y=pdfSec_(doc,"Indicadores clave",ctx.indicadores,y);
        y=pdfSec_(doc,"Notas",ctx.notas,y);
        const norms=(ctx.normasVinculadas||[]).map(n=>n.nombre).join(", ");
        const ents=(ctx.entidadesVinculadas||[]).map(e=>e.nombre).join(", ");
        if(norms){const nl=doc.splitTextToSize("Normas: "+norms,170);if(y+nl.length*4.5>280){doc.addPage();y=20;}doc.setTextColor(50,50,50);doc.setFontSize(8);doc.text(nl,20,y);y+=nl.length*4.5+2;}
        if(ents){const el=doc.splitTextToSize("Entidades: "+ents,170);if(y+el.length*4.5>280){doc.addPage();y=20;}doc.text(el,20,y);y+=el.length*4.5+2;}
        y+=3;
      });
      pdfFtr_(doc);doc.save("Lumen_Contexto_"+fechaHoy_()+".pdf");
    }

    if(window.jspdf){gen();}else{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";s.onload=gen;document.head.appendChild(s);}

  }

});