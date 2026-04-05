// js/entidades.js
// Módulo Entidades — crear, leer, editar y eliminar entidades en Firestore

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const WORKER_URL = "https://lumen-briefing.garogmx89.workers.dev";

const iconoTipo = {
  "Dependencia": "🏛️",
  "Programa":    "📋"
};

const iconoAmbito = {
  "Federal":   "🇲🇽",
  "Estatal":   "🏙️",
  "Municipal": "🏘️"
};

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const entidadesRef = collection(db, "usuarios", user.uid, "entidades");

  let modoEdicion = null;
  let todasLasEntidades = [];
  let todasLasNormas    = []; // para enriquecer el prompt de IA
  let filtroAmbitoActivo = "todos";
  let directorio = []; // [{unidad, responsable, extension}]

  // Cargar normas en paralelo para usarlas en el prompt IA
  const normasRef = collection(db, "usuarios", user.uid, "normatividad");
  onSnapshot(query(normasRef), (snap) => {
    todasLasNormas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

  // --- LIMPIAR FORMULARIO ---
  function limpiarFormulario() {
    document.getElementById("entidad-nombre").value       = "";
    document.getElementById("entidad-siglas").value       = "";
    document.getElementById("entidad-tipo").value         = "";
    document.getElementById("entidad-ambito").value       = "";
    document.getElementById("entidad-telefono").value     = "";
    document.getElementById("entidad-extension").value    = "";
    document.getElementById("entidad-titular").value      = "";
    document.getElementById("entidad-atribuciones").value = "";

    directorio = [];
    renderDirectorio();
    document.querySelector("#panel-entidades .reunion-form-card h2").textContent = "Nueva Entidad";
    document.getElementById("btn-cancelar-entidad").style.display = "none";
    modoEdicion = null;
  }

  // --- ACTIVAR MODO EDICIÓN ---
  function activarEdicion(id, datos) {
    modoEdicion = id;

    document.getElementById("entidad-nombre").value       = datos.nombre       || "";
    document.getElementById("entidad-siglas").value       = datos.siglas       || "";
    document.getElementById("entidad-tipo").value         = datos.tipo         || "";
    document.getElementById("entidad-ambito").value       = datos.ambito       || "";
    document.getElementById("entidad-telefono").value     = datos.telefono     || "";
    document.getElementById("entidad-extension").value    = datos.extension    || "";
    document.getElementById("entidad-titular").value      = datos.titular      || "";
    document.getElementById("entidad-atribuciones").value = datos.atribuciones || "";

    directorio = Array.isArray(datos.directorio) ? datos.directorio.map(d => ({...d})) : [];
    renderDirectorio();
    document.querySelector("#panel-entidades .reunion-form-card h2").textContent = "Editar Entidad";
    document.getElementById("btn-cancelar-entidad").style.display = "inline-block";
    document.getElementById("panel-entidades").scrollIntoView({ behavior: "smooth" });
  }

  // --- BOTÓN GUARDAR ---
  const btnGuardar = document.getElementById("btn-guardar-entidad");
  if (btnGuardar) {
    const btnLimpio = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnLimpio, btnGuardar);

    btnLimpio.addEventListener("click", async () => {
      const nombre       = document.getElementById("entidad-nombre").value.trim();
      const siglas       = document.getElementById("entidad-siglas").value.trim();
      const tipo         = document.getElementById("entidad-tipo").value;
      const ambito       = document.getElementById("entidad-ambito").value;
      const telefono     = document.getElementById("entidad-telefono").value.trim();
      const extension    = document.getElementById("entidad-extension").value.trim();
      const titular      = document.getElementById("entidad-titular").value.trim();
      const atribuciones = document.getElementById("entidad-atribuciones").value.trim();

      if (!nombre) {
        alert("El nombre de la entidad es obligatorio.");
        return;
      }

      try {
        if (modoEdicion) {
          const docRef = doc(db, "usuarios", user.uid, "entidades", modoEdicion);
          await updateDoc(docRef, { nombre, siglas, tipo, ambito, telefono, extension, titular, atribuciones, directorio });
        } else {
          await addDoc(entidadesRef, {
            nombre, siglas, tipo, ambito, telefono, extension, titular, atribuciones, directorio,
            creadoEn: serverTimestamp()
          });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar entidad:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // --- BOTÓN CANCELAR ---
  const btnCancelar = document.getElementById("btn-cancelar-entidad");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // ─── DIRECTORIO DE CONTACTOS ─────────────────────────────────────────────
  function renderDirectorio() {
    const lista = document.getElementById("directorio-lista");
    if (!lista) return;
    if (directorio.length === 0) {
      lista.innerHTML = '<p style="font-size:0.78rem;color:var(--text3);margin:0">Sin contactos agregados.</p>';
      return;
    }
    lista.innerHTML = directorio.map((d, i) => `
      <div class="directorio-fila">
        <input type="text" class="directorio-input" placeholder="Unidad o área" value="${d.unidad||''}"
          data-index="${i}" data-campo="unidad">
        <input type="text" class="directorio-input" placeholder="Responsable" value="${d.responsable||''}"
          data-index="${i}" data-campo="responsable">
        <input type="text" class="directorio-input directorio-input--corto" placeholder="Ext." value="${d.extension||''}"
          data-index="${i}" data-campo="extension">
        <button type="button" class="directorio-btn-quitar" data-index="${i}">✕</button>
      </div>
    `).join("");

    lista.querySelectorAll(".directorio-input").forEach(input => {
      input.addEventListener("input", () => {
        const idx = Number(input.dataset.index);
        const campo = input.dataset.campo;
        if (directorio[idx]) directorio[idx][campo] = input.value;
      });
    });
    lista.querySelectorAll(".directorio-btn-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        directorio.splice(Number(btn.dataset.index), 1);
        renderDirectorio();
      });
    });
  }

  document.getElementById("btn-agregar-contacto")?.addEventListener("click", () => {
    directorio.push({ unidad: "", responsable: "", extension: "" });
    renderDirectorio();
    const lista = document.getElementById("directorio-lista");
    const inputs = lista?.querySelectorAll(".directorio-input");
    if (inputs && inputs.length > 0) inputs[inputs.length - 3]?.focus();
  });

  // --- FILTROS POR ÁMBITO ---
  document.querySelectorAll("#entidades-filtros .filtro-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#entidades-filtros .filtro-btn")
        .forEach(b => b.classList.remove("filtro-activo"));
      btn.classList.add("filtro-activo");
      filtroAmbitoActivo = btn.dataset.filtro;
      renderEntidades();
    });
  });

  // --- LEER, MOSTRAR, EDITAR Y ELIMINAR ---
  const q = query(entidadesRef, orderBy("creadoEn", "desc"));

  onSnapshot(q, (snapshot) => {
    todasLasEntidades = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEntidades();
  });

  function renderEntidades() {
    const contenedor = document.getElementById("entidades-contenido");
    if (!contenedor) return;

    // Botones exportar
    const exportBar_entidades = document.getElementById("entidades-export-bar");
    if (exportBar_entidades && !exportBar_entidades.dataset.init) {
      exportBar_entidades.dataset.init = "1";
      exportBar_entidades.innerHTML = `
        <button id="btn-exportar-excel-entidades" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📊 Exportar Excel</button>
        <button id="btn-exportar-pdf-entidades" style="background:none;border:1px solid var(--border);color:var(--text2);border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">📄 Exportar PDF</button>
      `;
      document.getElementById("btn-exportar-excel-entidades").addEventListener("click", () => exportarExcel_entidades());
      document.getElementById("btn-exportar-pdf-entidades").addEventListener("click", () => exportarPDF_entidades());
    }

    const filtradas = filtroAmbitoActivo === "todos"
      ? todasLasEntidades
      : todasLasEntidades.filter(e => e.ambito === filtroAmbitoActivo);

    if (filtradas.length === 0) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay entidades registradas para este filtro.</p>';
      return;
    }

    contenedor.innerHTML = filtradas.map((d) => {
      const id = d.id;
      const icono = iconoTipo[d.tipo] || "🏢";
      const iconoAmb = iconoAmbito[d.ambito] || "";

      // Badge IA si ya tiene resumen guardado
      const iaBadge = d.resumenIA
        ? `<span style="font-size:0.7rem;color:var(--accent);margin-left:0.3rem" title="Tiene resumen IA">✨</span>`
        : "";

      return `
        <div class="reunion-card entidad-card entidad-card--clickable" data-id="${id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div class="entidad-card-nombre">
              <span class="entidad-tipo-icono">${icono}</span>
              <span class="reunion-card-titulo">${d.nombre}</span>
              ${d.siglas ? `<span class="entidad-siglas-badge">${d.siglas}</span>` : ""}
              ${iaBadge}
            </div>
            <div class="reunion-card-acciones">
              <button class="btn-editar" data-id="${id}" title="Editar entidad">✏️</button>
              <button class="btn-eliminar" data-id="${id}" title="Eliminar entidad">🗑️</button>
            </div>
          </div>
          ${d.tipo || d.ambito || d.titular || d.telefono ? `
            <div class="reunion-card-meta">
              ${d.tipo     ? `${icono} ${d.tipo}` : ""}
              ${d.ambito   ? `· ${iconoAmb} ${d.ambito}` : ""}
              ${d.titular  ? `· 👤 ${d.titular}` : ""}
              ${d.telefono ? `· 📞 ${d.telefono}${d.extension ? " ext. " + d.extension : ""}` : ""}
            </div>` : ""}
          ${d.atribuciones ? (() => {
            const LIMIT   = 200;
            const corto   = d.atribuciones.length > LIMIT;
            const preview = corto ? d.atribuciones.slice(0, LIMIT) + "…" : d.atribuciones;
            return `<div class="reunion-card-acuerdos entidad-atrib-wrap" data-full="${encodeURIComponent(d.atribuciones)}" data-id="${id}">
              <strong>Atribuciones:</strong>
              <span class="entidad-atrib-texto">${preview}</span>
              ${corto ? `<button class="entidad-atrib-toggle" data-id="${id}" data-expanded="false"
                style="background:none;border:none;color:var(--accent);font-size:0.78rem;
                       cursor:pointer;font-family:inherit;padding:0 0.2rem;white-space:nowrap;">Ver más</button>` : ""}
            </div>`;
          })() : ""}
        </div>
      `;
    }).join("");

    contenedor.querySelectorAll(".entidad-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        const id = card.dataset.id;
        const encontrado = todasLasEntidades.find(e => e.id === id);
        if (encontrado) mostrarDetalle(id, encontrado);
      });
    });

    // ── Toggle Ver más / Ver menos en atribuciones ──────────────────────────
    // Listener delegado en el contenedor — un solo handler para todas las tarjetas
    contenedor.addEventListener("click", (e) => {
      const btn = e.target.closest(".entidad-atrib-toggle");
      if (!btn) return;
      e.stopPropagation(); // evitar que abra el modal de detalle
      const wrap      = btn.closest(".entidad-atrib-wrap");
      const textoEl   = wrap?.querySelector(".entidad-atrib-texto");
      if (!wrap || !textoEl) return;
      const expanded  = btn.dataset.expanded === "true";
      const textoFull = decodeURIComponent(wrap.dataset.full || "");
      const LIMIT     = 200;
      if (expanded) {
        textoEl.textContent   = textoFull.slice(0, LIMIT) + "…";
        btn.textContent       = "Ver más";
        btn.dataset.expanded  = "false";
      } else {
        textoEl.textContent   = textoFull;
        btn.textContent       = "Ver menos";
        btn.dataset.expanded  = "true";
      }
    }, { capture: false });

    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const encontrado = todasLasEntidades.find(e => e.id === id);
        if (encontrado) activarEdicion(id, encontrado);
      });
    });

    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const confirmar = confirm("¿Eliminar esta entidad? Esta acción no se puede deshacer.");
        if (!confirmar) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "entidades", id));
          if (modoEdicion === id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar entidad:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  }

  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  function mostrarDetalle(id, datos) {
    const icono = iconoTipo[datos.tipo] || "🏢";

    let modal = document.getElementById("detalle-entidad-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-entidad-modal";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    // Normas vinculadas a esta entidad (aparecen en Análisis con entidadesVinculadas)
    // Las buscamos en el catálogo de normatividad para enriquecer el detalle
    const normasVinculadas = todasLasNormas.filter(n =>
      (n.relacionadas || []).some(r => r.id === id) || n.padreId === id
    );

    // Sección resumen IA
    let iaSeccion = "";
    if (datos.resumenIA) {
      const fecha = datos.resumenIA_fecha
        ? new Date(datos.resumenIA_fecha).toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" })
        : "";
      iaSeccion = `<div class="detalle-seccion" id="ia-seccion-contenido">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
          <div class="detalle-seccion-titulo">✨ Resumen IA</div>
          <span style="font-size:0.72rem;color:var(--text3)">${fecha}</span>
        </div>
        <div class="detalle-seccion-texto" id="ia-texto-render" style="line-height:1.6">
          ${renderMarkdown(datos.resumenIA)}
        </div>
        <button id="btn-regenerar-ia" style="margin-top:0.6rem;background:none;border:1px solid var(--border);
          color:var(--text2);border-radius:8px;padding:0.3rem 0.8rem;font-size:0.78rem;
          cursor:pointer;font-family:inherit;">🔄 Regenerar</button>
      </div>`;
    } else {
      iaSeccion = `<div class="detalle-seccion" id="ia-seccion-contenido">
        <div class="detalle-seccion-titulo">✨ Resumen IA</div>
        <div id="ia-texto-render" style="color:var(--text3);font-size:0.82rem;margin-top:0.3rem">
          Sin resumen generado aún.
        </div>
      </div>`;
    }

    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;'
      + 'width:100%;max-width:560px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">'

      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;'
      + 'padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);'
      + 'position:sticky;top:0;background:var(--bg2);z-index:1;">'
      + '<div>'
      + '<div style="font-size:1rem;font-weight:700;color:var(--text)">'
      + icono + ' ' + (datos.nombre || "Sin nombre")
      + (datos.siglas ? ' <span style="background:var(--accent);color:white;font-size:0.72rem;'
        + 'font-weight:700;padding:0.15rem 0.5rem;border-radius:20px;margin-left:0.4rem">'
        + datos.siglas + '</span>' : '')
      + '</div>'
      + ((datos.tipo || datos.ambito) ? '<div style="font-size:0.8rem;color:var(--text2);margin-top:0.2rem">'
        + [datos.tipo, datos.ambito ? (iconoAmbito[datos.ambito]||"") + " " + datos.ambito : ""].filter(Boolean).join(" · ") + '</div>' : '')
      + '</div>'
      + '<button id="detalle-entidad-cerrar" style="background:none;border:none;color:var(--text2);'
      + 'font-size:1.1rem;cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>'
      + '</div>'

      // Cuerpo
      + '<div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">'
      + (datos.titular ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">👤 Titular</div>'
        + '<div class="detalle-seccion-texto">' + datos.titular + '</div></div>' : '')
      + ((datos.telefono) ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📞 Contacto</div>'
        + '<div class="detalle-seccion-texto">' + datos.telefono
        + (datos.extension ? ' &nbsp;·&nbsp; Ext. ' + datos.extension : '')
        + '</div></div>' : '')
      + (datos.atribuciones ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📋 Atribuciones registradas</div>'
        + '<div class="detalle-seccion-texto">' + datos.atribuciones + '</div></div>' : '')
      + ((datos.directorio||[]).length > 0 ? '<div class="detalle-seccion">'
        + '<div class="detalle-seccion-titulo">📇 Directorio de contactos</div>'
        + '<table style="width:100%;border-collapse:collapse;margin-top:0.4rem;font-size:0.8rem">'
        + '<thead><tr style="color:var(--text3)">'
        + '<th style="text-align:left;padding:3px 6px;border-bottom:1px solid var(--border)">Unidad / Área</th>'
        + '<th style="text-align:left;padding:3px 6px;border-bottom:1px solid var(--border)">Responsable</th>'
        + '<th style="text-align:left;padding:3px 6px;border-bottom:1px solid var(--border)">Ext.</th>'
        + '</tr></thead><tbody>'
        + (datos.directorio||[]).map(d =>
            '<tr><td style="padding:4px 6px;color:var(--text)">' + (d.unidad||'—') + '</td>'
            + '<td style="padding:4px 6px;color:var(--text)">' + (d.responsable||'—') + '</td>'
            + '<td style="padding:4px 6px;color:var(--text2)">' + (d.extension||'—') + '</td></tr>'
          ).join("")
        + '</tbody></table></div>' : '')
      + iaSeccion
      + '</div>'

      // Footer
      + '<div style="padding:1rem 1.4rem;border-top:1px solid var(--border);'
      + 'display:flex;gap:0.75rem;justify-content:flex-end;'
      + 'position:sticky;bottom:0;background:var(--bg2);">'
      + '<button id="btn-generar-ia-entidad" style="background:none;border:1px solid var(--accent);'
      + 'color:var(--accent);border-radius:8px;padding:0.55rem 1.1rem;font-size:0.875rem;'
      + 'cursor:pointer;font-family:inherit;font-weight:600;">✨ ' + (datos.resumenIA ? 'Ver resumen' : 'Generar resumen IA') + '</button>'
      + '<button id="detalle-entidad-editar" style="background:var(--accent);color:white;border:none;'
      + 'border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;'
      + 'font-family:inherit;font-weight:600;">✏️ Editar</button>'
      + '</div>'
      + '</div>';

    document.getElementById("detalle-entidad-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("detalle-entidad-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(id, datos);
    });

    // Botón generar/ver resumen IA
    document.getElementById("btn-generar-ia-entidad").addEventListener("click", () => {
      generarResumenIA(id, datos);
    });

    // Botón regenerar (si ya tenía resumen)
    document.getElementById("btn-regenerar-ia")?.addEventListener("click", () => {
      generarResumenIA(id, datos, true);
    });

    modal.style.display = "flex";
  }

  // ─── GENERAR RESUMEN IA ──────────────────────────────────────────────────
  // Llama al Cloudflare Worker con un prompt específico para la entidad.
  // Guarda el resultado en Firestore (resumenIA + resumenIA_fecha).
  async function generarResumenIA(id, datos, forzar = false) {
    const contenedor = document.getElementById("ia-texto-render");
    const btnGenerar = document.getElementById("btn-generar-ia-entidad");
    const btnRegen   = document.getElementById("btn-regenerar-ia");

    if (!contenedor) return;

    // Si ya tiene resumen y no se fuerza regenerar, solo hacer scroll a la sección
    if (datos.resumenIA && !forzar) {
      document.getElementById("ia-seccion-contenido")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    // Estado de carga
    if (btnGenerar) { btnGenerar.disabled = true; btnGenerar.textContent = "⏳ Generando..."; }
    if (btnRegen)   { btnRegen.disabled = true; }
    contenedor.innerHTML = '<span style="color:var(--text3);font-size:0.82rem">Consultando a la IA...</span>';

    // Normas del catálogo que podrían vincularse (buscamos por ámbito o tipo relacionado)
    const normasContexto = todasLasNormas.slice(0, 8).map(n =>
      `- ${n.tipo ? "[" + n.tipo + "] " : ""}${n.nombre}${n.ambito ? " (" + n.ambito + ")" : ""}`
    ).join("\n");

    const prompt = `Eres un asistente especializado en administración pública mexicana, específicamente para la SEDUVOT (Secretaría de Desarrollo Urbano, Vivienda y Ordenamiento Territorial) del estado de Zacatecas.

Genera un resumen institucional breve y útil sobre la siguiente entidad:

**Nombre:** ${datos.nombre || ""}
**Siglas:** ${datos.siglas || "N/A"}
**Tipo:** ${datos.tipo || "N/A"}
**Ámbito:** ${datos.ambito || "N/A"}
**Titular:** ${datos.titular || "N/A"}
**Atribuciones registradas:** ${datos.atribuciones || "No especificadas"}

**Normatividad relevante en el catálogo de SEDUVOT:**
${normasContexto || "No hay normas registradas aún"}

Redacta el resumen en 3 secciones cortas con estos encabezados exactos (usa **negrita** para los títulos):

**Rol institucional**
Una o dos oraciones sobre qué es esta entidad y su función principal en el contexto de vivienda, desarrollo urbano u ordenamiento territorial en México/Zacatecas.

**Puntos de coordinación con SEDUVOT**
Lista de 2 a 4 puntos concretos sobre cómo esta entidad interactúa o puede interactuar con SEDUVOT Zacatecas (validaciones, recursos, dictámenes, programas, etc.).

**Marco normativo clave**
Menciona 2 o 3 instrumentos normativos relevantes para esta entidad (pueden ser del catálogo o de conocimiento general).

Sé conciso y práctico. No repitas el nombre de la entidad en cada oración.`;

    try {
      const response = await fetch(WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) throw new Error("Error del servidor: " + response.status);

      const data = await response.json();
      const texto = data.content?.[0]?.text || "No se pudo generar el resumen.";

      // Guardar en Firestore
      const docRef = doc(db, "usuarios", user.uid, "entidades", id);
      await updateDoc(docRef, {
        resumenIA: texto,
        resumenIA_fecha: new Date().toISOString()
      });

      // Actualizar en memoria para que la tarjeta muestre el badge ✨
      const idx = todasLasEntidades.findIndex(e => e.id === id);
      if (idx !== -1) {
        todasLasEntidades[idx].resumenIA = texto;
        todasLasEntidades[idx].resumenIA_fecha = new Date().toISOString();
      }

      // Mostrar resultado en el modal
      contenedor.innerHTML = renderMarkdown(texto);

      // Actualizar fecha en el encabezado de la sección
      const seccion = document.getElementById("ia-seccion-contenido");
      if (seccion) {
        const titulo = seccion.querySelector(".detalle-seccion-titulo");
        if (titulo) titulo.textContent = "✨ Resumen IA";
        // Agregar/actualizar botón regenerar
        if (!document.getElementById("btn-regenerar-ia")) {
          const btnR = document.createElement("button");
          btnR.id = "btn-regenerar-ia";
          btnR.style.cssText = "margin-top:0.6rem;background:none;border:1px solid var(--border);"
            + "color:var(--text2);border-radius:8px;padding:0.3rem 0.8rem;"
            + "font-size:0.78rem;cursor:pointer;font-family:inherit;";
          btnR.textContent = "🔄 Regenerar";
          btnR.addEventListener("click", () => generarResumenIA(id, datos, true));
          seccion.appendChild(btnR);
        }
      }

      if (btnGenerar) { btnGenerar.textContent = "✨ Ver resumen"; }

    } catch (error) {
      console.error("Error generando resumen IA:", error);
      contenedor.innerHTML = '<span style="color:var(--coral,#e63946);font-size:0.82rem">'
        + 'Error al generar el resumen. Verifica tu conexión e intenta de nuevo.</span>';
    } finally {
      if (btnGenerar) btnGenerar.disabled = false;
      if (btnRegen)   { btnRegen.disabled = false; }
    }
  }

  // ─── RENDER MARKDOWN BÁSICO ──────────────────────────────────────────────
  // Convierte **negrita** y saltos de línea a HTML.
  // No dependemos de librerías externas.
  function renderMarkdown(texto) {
    if (!texto) return "";
    return texto
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n{2,}/g, "</p><p style='margin:0.5rem 0'>")
      .replace(/\n/g, "<br>")
      .replace(/^/, "<p style='margin:0'>")
      .replace(/$/, "</p>");
  }


  function fechaHoy_() {
    const h = new Date();
    return h.getFullYear()+"-"+String(h.getMonth()+1).padStart(2,"0")+"-"+String(h.getDate()).padStart(2,"0");
  }
  function fmtFecha_(f) {
    if (!f) return "";
    const d = new Date(f);
    if (!isNaN(d)) return d.toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"});
    return f;
  }
  function pdfHeader_(doc, titulo, subtitulo) {
    doc.setFillColor(74,74,138); doc.rect(0,0,210,22,"F");
    doc.setTextColor(255,255,255);
    doc.setFontSize(13); doc.setFont("helvetica","bold");
    doc.text("LUMEN — SEDUVOT Zacatecas", 20, 10);
    doc.setFontSize(8); doc.setFont("helvetica","normal");
    doc.text(titulo + " · " + fechaHoy_(), 20, 17);
    return 30;
  }
  function pdfSeccion_(doc, titulo, texto, y, marginL, contentW) {
    if (!texto) return y;
    if (y + 15 > 280) { doc.addPage(); y = 20; }
    doc.setFillColor(245,245,250); doc.rect(marginL, y-3, contentW, 6, "F");
    doc.setTextColor(74,74,138); doc.setFontSize(9); doc.setFont("helvetica","bold");
    doc.text(titulo, marginL+2, y+1); y += 7;
    doc.setTextColor(50,50,50); doc.setFontSize(9); doc.setFont("helvetica","normal");
    const lines = doc.splitTextToSize(texto, contentW);
    if (y + lines.length*5 > 280) { doc.addPage(); y = 20; }
    doc.text(lines, marginL, y);
    return y + lines.length*5 + 4;
  }
  function pdfFooter_(doc) {
    const n = doc.getNumberOfPages();
    for (let i=1;i<=n;i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150,150,150);
      doc.text("Lumen · SEDUVOT Zacatecas · Pagina "+i+" de "+n, 20, 290);
    }
  }

  function exportarExcel_entidades() {
    if (!todasLasEntidades.length) { alert("No hay entidades para exportar."); return; }
    function gen() {
      const filas = todasLasEntidades.map(e => ({
        "Nombre": e.nombre||"", "Siglas": e.siglas||"", "Tipo": e.tipo||"",
        "Ambito": e.ambito||"", "Telefono": e.telefono||"", "Extension": e.extension||"",
        "Titular": e.titular||"", "Atribuciones": e.atribuciones||""
      }));
      const ws = window.XLSX.utils.json_to_sheet(filas);
      ws["!cols"] = [{wch:35},{wch:12},{wch:15},{wch:25},{wch:60}];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Entidades");
      window.XLSX.writeFile(wb, "Lumen_Entidades_"+fechaHoy_()+".xlsx");
    }
    if (window.XLSX) { gen(); } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = gen; document.head.appendChild(s);
    }
  }

  function exportarPDF_entidades() {
    if (!todasLasEntidades.length) { alert("No hay entidades para exportar."); return; }
    function gen() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({unit:"mm",format:"a4"});
      const mL=20, cW=170; let y = pdfHeader_(doc,"Catalogo de Entidades","",mL,cW);
      todasLasEntidades.forEach((e,i) => {
        if (y+20>280){doc.addPage();y=20;}
        doc.setDrawColor(200,200,200); doc.line(mL,y,190,y); y+=5;
        doc.setTextColor(74,74,138); doc.setFontSize(11); doc.setFont("helvetica","bold");
        const tl = doc.splitTextToSize((i+1)+". "+(e.nombre||"Sin nombre")+(e.siglas?" ("+e.siglas+")":""), cW);
        doc.text(tl,mL,y); y+=tl.length*6;
        if (e.tipo){doc.setTextColor(100,100,100);doc.setFontSize(8);doc.setFont("helvetica","normal");doc.text("Tipo: "+e.tipo,mL,y);y+=5;}
        if (e.titular){doc.setTextColor(60,60,60);doc.setFontSize(8);doc.text("Titular: "+e.titular,mL,y);y+=5;}
        if (e.atribuciones){y=pdfSeccion_(doc,"Atribuciones",e.atribuciones,y,mL,cW);}
        y+=3;
      });
      pdfFooter_(doc);
      doc.save("Lumen_Entidades_"+fechaHoy_()+".pdf");
    }
    if (window.jspdf) { gen(); } else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = gen; document.head.appendChild(s);
    }
  }

});