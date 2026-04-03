// js/reuniones.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, orderBy, query, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Array global para exportar — se actualiza en tiempo real con onSnapshot
let todasLasReuniones = [];

onAuthStateChanged(auth, (user) => {
  if (!user) return;

  const reunionesRef = collection(db, "usuarios", user.uid, "reuniones");
  const entidadesRef = collection(db, "usuarios", user.uid, "entidades");

  let modoEdicion = null;
  let participantesSeleccionados = [];

  // ─── CARGAR CATÁLOGO DE ENTIDADES ────────────────────────────────────────
  const qEntidades = query(entidadesRef, orderBy("creadoEn", "desc"));
  onSnapshot(qEntidades, (snapshot) => {
    const select = document.getElementById("reunion-participantes-select");
    if (!select) return;
    select.innerHTML = '<option value="">— Agregar entidad participante —</option>';
    snapshot.docs.forEach(d => {
      const e = d.data();
      const option = document.createElement("option");
      option.value = d.id;
      option.textContent = e.siglas ? `${e.siglas} — ${e.nombre}` : e.nombre;
      option.dataset.nombre = e.siglas || e.nombre;
      select.appendChild(option);
    });
  });

  // ─── SELECCIONAR PARTICIPANTE ────────────────────────────────────────────
  document.getElementById("reunion-participantes-select")?.addEventListener("change", (e) => {
    const id = e.target.value;
    const nombre = e.target.options[e.target.selectedIndex].dataset.nombre;
    if (!id) return;
    if (participantesSeleccionados.find(p => p.id === id)) {
      e.target.value = "";
      return;
    }
    participantesSeleccionados.push({ id, nombre });
    renderParticipantesSeleccionados();
    e.target.value = "";
  });

  // ─── RENDER TAGS PARTICIPANTES ───────────────────────────────────────────
  function renderParticipantesSeleccionados() {
    const contenedor = document.getElementById("reunion-participantes-seleccionados");
    if (!contenedor) return;
    if (participantesSeleccionados.length === 0) {
      contenedor.innerHTML = "";
      return;
    }
    contenedor.innerHTML = participantesSeleccionados.map((p, i) => `
      <span class="participante-tag">
        ${p.nombre}
        <button type="button" class="participante-tag-quitar" data-index="${i}">✕</button>
      </span>
    `).join("");
    contenedor.querySelectorAll(".participante-tag-quitar").forEach(btn => {
      btn.addEventListener("click", () => {
        participantesSeleccionados.splice(Number(btn.dataset.index), 1);
        renderParticipantesSeleccionados();
      });
    });
  }

  // ─── LIMPIAR FORMULARIO ───────────────────────────────────────────────────
  function limpiarFormulario() {
    document.getElementById("reunion-titulo").value        = "";
    document.getElementById("reunion-fecha").value          = "";
    document.getElementById("reunion-hora").value           = "";
    const cbPendiente = document.getElementById("reunion-hora-pendiente");
    if (cbPendiente) { cbPendiente.checked = false; document.getElementById("reunion-hora").disabled = false; }
    document.getElementById("reunion-participantes").value  = "";
    document.getElementById("reunion-acuerdos").value       = ""; // campo Asunto
    participantesSeleccionados = [];
    renderParticipantesSeleccionados();
    document.querySelector("#panel-reuniones .reunion-form-card h2").textContent = "Nueva Reunión";
    document.getElementById("btn-cancelar-reunion").style.display = "none";
    modoEdicion = null;
  }

  // ─── ACTIVAR MODO EDICIÓN ─────────────────────────────────────────────────
  function activarEdicion(id, datos) {
    modoEdicion = id;
    document.getElementById("reunion-titulo").value        = datos.titulo        || "";
    // Separar fecha y hora del valor guardado
    const fechaGuardada = datos.fecha || "";
    if (fechaGuardada.includes("T")) {
      // Formato antiguo datetime-local: "2025-03-04T10:33"
      const [fd, fh] = fechaGuardada.split("T");
      document.getElementById("reunion-fecha").value = fd;
      document.getElementById("reunion-hora").value  = fh ? fh.slice(0,5) : "";
    } else {
      // Formato nuevo: fecha y hora separados en Firestore
      document.getElementById("reunion-fecha").value = datos.fecha || "";
      const esPendiente = datos.hora === "pendiente";
      const cbPend = document.getElementById("reunion-hora-pendiente");
      if (cbPend) { cbPend.checked = esPendiente; document.getElementById("reunion-hora").disabled = esPendiente; }
      document.getElementById("reunion-hora").value  = esPendiente ? "" : (datos.hora || "");
    }
    document.getElementById("reunion-participantes").value = datos.participantes || "";
    document.getElementById("reunion-acuerdos").value      = datos.asunto        || datos.acuerdos || ""; // compatibilidad
    participantesSeleccionados = Array.isArray(datos.participantesVinculados)
      ? datos.participantesVinculados.map(p => ({ ...p }))
      : [];
    renderParticipantesSeleccionados();
    document.querySelector("#panel-reuniones .reunion-form-card h2").textContent = "Editar Reunión";
    document.getElementById("btn-cancelar-reunion").style.display = "inline-block";
    document.getElementById("panel-reuniones").scrollIntoView({ behavior: "smooth" });
  }

  // ─── BOTÓN GUARDAR ────────────────────────────────────────────────────────
  const btnGuardar = document.getElementById("btn-guardar-reunion");
  if (btnGuardar) {
    const btnLimpio = btnGuardar.cloneNode(true);
    btnGuardar.parentNode.replaceChild(btnLimpio, btnGuardar);

    btnLimpio.addEventListener("click", async () => {
      const titulo        = document.getElementById("reunion-titulo").value.trim();
      const fecha         = document.getElementById("reunion-fecha").value;
      const horaPendiente = document.getElementById("reunion-hora-pendiente")?.checked;
      const hora          = horaPendiente ? "pendiente" : document.getElementById("reunion-hora").value;
      const participantes = document.getElementById("reunion-participantes").value.trim();
      const asunto        = document.getElementById("reunion-acuerdos").value.trim();

      if (!titulo) { alert("El título de la reunión es obligatorio."); return; }

      try {
        const datos = {
          titulo, fecha, hora, participantes,
          asunto,       // lo que se va a tratar / trató en la reunion
          acuerdos: "", // se llena despues desde el modal de detalle
          participantesVinculados: participantesSeleccionados
        };
        // Si estamos editando, conservar los acuerdos existentes
        if (modoEdicion) {
          const reunionExistente = snapshot.docs.find(d => d.id === modoEdicion);
          if (reunionExistente) datos.acuerdos = reunionExistente.data().acuerdos || "";
        }
        if (modoEdicion) {
          await updateDoc(doc(db, "usuarios", user.uid, "reuniones", modoEdicion), datos);
        } else {
          await addDoc(reunionesRef, { ...datos, creadoEn: serverTimestamp() });
        }
        limpiarFormulario();
      } catch (error) {
        console.error("Error al guardar reunión:", error);
        alert("Hubo un error al guardar. Revisa la consola.");
      }
    });
  }

  // ─── BOTÓN CANCELAR ───────────────────────────────────────────────────────
  const btnCancelar = document.getElementById("btn-cancelar-reunion");
  if (btnCancelar) {
    btnCancelar.addEventListener("click", () => limpiarFormulario());
  }

  // Checkbox "Por confirmar" — deshabilita/habilita el campo hora
  const cbHoraPendiente = document.getElementById("reunion-hora-pendiente");
  if (cbHoraPendiente) {
    cbHoraPendiente.addEventListener("change", () => {
      const horaInput = document.getElementById("reunion-hora");
      horaInput.disabled = cbHoraPendiente.checked;
      if (cbHoraPendiente.checked) horaInput.value = "";
    });
  }

  // ─── FUNCIÓN: GENERAR BRIEFING IA ─────────────────────────────────────────
  // Esta función recibe los datos de una reunión, arma un prompt detallado,
  // llama a la API de Claude y muestra el resultado en un modal.
  async function generarBriefing(id, datos, forzarRegeneracion = false) {
    // Si ya hay briefing guardado y no se pidió regenerar, mostrar al instante
    if (datos.briefing && !forzarRegeneracion) {
      mostrarModal(datos.titulo, datos.briefing, id, datos);
      return;
    }

    // Mostrar modal en estado de carga
    mostrarModal(datos.titulo, null, id, datos, true);

    const participantesTexto = [
      ...(datos.participantesVinculados || []).map(p => p.nombre),
      datos.participantes || ""
    ].filter(Boolean).join(", ") || "No especificados";

    const prompt = `Eres un asistente especializado en gestión institucional pública de México.
Genera un briefing ejecutivo estructurado para la siguiente reunión de trabajo de SEDUVOT Zacatecas.

DATOS DE LA REUNIÓN:
- Título: ${datos.titulo}
- Fecha: ${datos.fecha ? formatearFecha(datos.fecha, datos.hora) : "No especificada"}
- Participantes: ${participantesTexto}
- Asunto / Tema: ${datos.asunto || datos.acuerdos || "No especificado"}
- Acuerdos alcanzados: ${datos.acuerdos_post || "Sin acuerdos registrados aun"}

El briefing debe incluir exactamente estas secciones:
1. RESUMEN EJECUTIVO (2-3 oraciones que capturen la esencia de la reunión)
2. PARTICIPANTES CLAVE (lista con su relevancia institucional si se infiere del nombre)
3. ACUERDOS Y COMPROMISOS (lista clara de cada acuerdo, con responsable si se menciona)
4. PRÓXIMOS PASOS SUGERIDOS (acciones concretas para dar seguimiento)
5. OBSERVACIONES (alertas o consideraciones relevantes para el contexto de SEDUVOT)

Responde únicamente con el briefing, sin introducciones ni comentarios adicionales.
Usa un tono institucional profesional, en español.`;

    try {
      const response = await fetch("https://lumen-briefing.garogmx89.workers.dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();
      const texto = data.briefing || "No se pudo generar el briefing.";

      // Guardar en Firestore para no regenerar la próxima vez
      await updateDoc(doc(db, "usuarios", user.uid, "reuniones", id), { briefing: texto });

      mostrarModal(datos.titulo, texto, id, datos);

    } catch (error) {
      console.error("Error al llamar a la API:", error);
      mostrarModal(datos.titulo, "❌ Hubo un error al conectar con la IA. Revisa tu conexión e intenta de nuevo.", id, datos);
    }
  }

  // ─── MODAL: MOSTRAR RESULTADO ─────────────────────────────────────────────
  function mostrarModal(titulo, contenido, id, datos, cargando = false) {
    let modal = document.getElementById("briefing-modal");

    if (!modal) {
      modal = document.createElement("div");
      modal.id = "briefing-modal";
      modal.innerHTML = `
        <div id="briefing-modal-inner">
          <div id="briefing-modal-header">
            <span id="briefing-modal-titulo">📋 Briefing IA</span>
            <button id="briefing-modal-cerrar">✕</button>
          </div>
          <div id="briefing-modal-cuerpo"></div>
          <div id="briefing-modal-footer"></div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById("briefing-modal-cerrar").addEventListener("click", () => {
        modal.style.display = "none";
      });
      // NO cerrar al hacer clic fuera — eliminado intencionalmente
    }

    const tituloEl = document.getElementById("briefing-modal-titulo");
    const cuerpo   = document.getElementById("briefing-modal-cuerpo");
    const footer   = document.getElementById("briefing-modal-footer");

    if (tituloEl) tituloEl.textContent = `📋 ${titulo}`;

    if (cargando) {
      cuerpo.innerHTML = `<p class="briefing-cargando">✨ Analizando datos de la reunión...</p>`;
      footer.innerHTML = "";
    } else {
      cuerpo.innerHTML = contenido
        .split("\n")
        .filter(l => l.trim())
        .map(l => {
          if (l.startsWith("## ")) return `<h3>${l.replace("## ", "")}</h3>`;
          if (l.startsWith("# "))  return `<h2>${l.replace("# ", "")}</h2>`;
          l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
          return `<p>${l}</p>`;
        })
        .join("");

      footer.innerHTML = `
        <button id="btn-regenerar-briefing"
          style="margin-top:1rem;background:none;border:1px solid var(--border);
                 color:var(--text2);border-radius:8px;padding:0.5rem 1rem;
                 cursor:pointer;font-size:0.85rem;font-family:inherit;">
          🔄 Regenerar briefing
        </button>
      `;
      document.getElementById("btn-regenerar-briefing").addEventListener("click", () => {
        generarBriefing(id, datos, true);
      });
    }

    modal.style.display = "flex";
  }

  // ─── LEER EN TIEMPO REAL ──────────────────────────────────────────────────
  const q = query(reunionesRef, orderBy("creadoEn", "desc"));
  onSnapshot(q, (snapshot) => {
    // Actualizar array global para exportar
    todasLasReuniones = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const contenedor = document.getElementById("reuniones-contenido");
    if (!contenedor) return;

    // Botones de exportar — se renderizan una vez sobre la lista
    const exportBar = document.getElementById("reuniones-export-bar");
    if (exportBar && !exportBar.dataset.init) {
      exportBar.dataset.init = "1";
      exportBar.innerHTML = `
        <button id="btn-exportar-excel-reuniones"
          style="background:none;border:1px solid var(--border);color:var(--text2);
                 border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;
                 cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">
          📊 Exportar Excel
        </button>
        <button id="btn-exportar-pdf-reuniones"
          style="background:none;border:1px solid var(--border);color:var(--text2);
                 border-radius:8px;padding:0.4rem 0.9rem;font-size:0.8rem;
                 cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:0.4rem;">
          📄 Exportar PDF
        </button>
      `;
      document.getElementById("btn-exportar-excel-reuniones")
        .addEventListener("click", () => exportarExcelReuniones());
      document.getElementById("btn-exportar-pdf-reuniones")
        .addEventListener("click", () => exportarPDFModuloReuniones());
    }

    if (snapshot.empty) {
      contenedor.innerHTML = '<p class="lista-vacia">No hay reuniones registradas aún.</p>';
      return;
    }

    contenedor.innerHTML = snapshot.docs.map((documento) => {
      const d  = documento.data();
      const id = documento.id;

      const tagsVinculados = Array.isArray(d.participantesVinculados) && d.participantesVinculados.length > 0
        ? `<div class="participantes-tags-display">
            ${d.participantesVinculados.map(p =>
              `<span class="participante-tag-display">🏛️ ${p.nombre}</span>`
            ).join("")}
           </div>`
        : "";

      return `
        <div class="reunion-card reunion-card--clickable" data-id="${id}" style="cursor:pointer">
          <div class="reunion-card-header">
            <div class="reunion-card-titulo">${d.titulo}</div>
            <div class="reunion-card-acciones">
              <button class="btn-briefing-ia"  data-id="${id}" title="Generar Briefing IA">✨</button>
              <button class="btn-acuerdos"     data-id="${id}" title="Agregar acuerdos post-reunion">📋</button>
              <button class="btn-editar"       data-id="${id}" title="Editar reunión">✏️</button>
              <button class="btn-eliminar"     data-id="${id}" title="Eliminar reunión">🗑️</button>
            </div>
          </div>
          <div class="reunion-card-meta">
            ${d.fecha ? `📅 ${formatearFecha(d.fecha, d.hora)}` : ""}
          </div>
          ${tagsVinculados}
          ${d.participantes ? `<div class="reunion-card-meta">👥 ${d.participantes}</div>` : ""}
          ${(d.asunto || d.acuerdos) ? `<div class="reunion-card-acuerdos"><strong>Asunto:</strong> ${d.asunto || d.acuerdos}</div>` : ""}
          ${d.acuerdos_post ? `<div class="reunion-card-acuerdos reunion-acuerdos-post"><strong>📋 Acuerdos:</strong> ${d.acuerdos_post}</div>` : ""}
        </div>
      `;
    }).join("");

    // Clic en tarjeta → abrir modal de detalle
    // Usamos stopPropagation en los botones para que no se propague al card
    contenedor.querySelectorAll(".reunion-card--clickable").forEach((card) => {
      card.addEventListener("click", (e) => {
        // Si el clic fue en un botón, no abrir el detalle
        if (e.target.closest("button")) return;
        const id = card.dataset.id;
        const doc = snapshot.docs.find(d => d.id === id);
        if (doc) mostrarDetalle(id, doc.data());
      });
    });

    // Botones BRIEFING IA
    contenedor.querySelectorAll(".btn-briefing-ia").forEach((btn) => {
      btn.addEventListener("click", () => {
        const documentoEncontrado = snapshot.docs.find(d => d.id === btn.dataset.id);
        if (documentoEncontrado) generarBriefing(btn.dataset.id, documentoEncontrado.data());
      });
    });

    // Botones ACUERDOS POST-REUNION
    contenedor.querySelectorAll(".btn-acuerdos").forEach((btn) => {
      btn.addEventListener("click", () => {
        const documentoEncontrado = snapshot.docs.find(d => d.id === btn.dataset.id);
        if (documentoEncontrado) mostrarModalAcuerdos(btn.dataset.id, documentoEncontrado.data());
      });
    });

    // Botones EDITAR
    contenedor.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => {
        const documentoEncontrado = snapshot.docs.find(d => d.id === btn.dataset.id);
        if (documentoEncontrado) activarEdicion(btn.dataset.id, documentoEncontrado.data());
      });
    });

    // Botones ELIMINAR
    contenedor.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta reunión? Esta acción no se puede deshacer.")) return;
        try {
          await deleteDoc(doc(db, "usuarios", user.uid, "reuniones", btn.dataset.id));
          if (modoEdicion === btn.dataset.id) limpiarFormulario();
        } catch (error) {
          console.error("Error al eliminar reunión:", error);
          alert("No se pudo eliminar. Revisa la consola.");
        }
      });
    });
  });

  // ─── MODAL DE DETALLE ────────────────────────────────────────────────────
  // Muestra todos los campos del registro en un modal limpio y estructurado.
  // También muestra el briefing IA si ya existe, y un botón para editar.
  function mostrarDetalle(id, datos) {
    // Crear o reutilizar el modal
    let modal = document.getElementById("detalle-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "detalle-modal";
      modal.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;
        z-index:800;padding:1rem;
      `;
      document.body.appendChild(modal);
    }

    // Participantes vinculados como tags
    const tagsVinculados = (datos.participantesVinculados || [])
      .map(p => `<span class="participante-tag" style="font-size:0.8rem">🏛️ ${p.nombre}</span>`)
      .join("") || "";

    // Briefing IA si existe
    const briefingHtml = datos.briefing
      ? (() => {
          const lineas = datos.briefing.split("\n").filter(l => l.trim())
            .map(l => {
              if (l.startsWith("## ")) return "<h4>" + l.replace("## ", "") + "</h4>";
              l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
              return "<p>" + l + "</p>";
            }).join("");
          return '<div class="detalle-seccion">'
            + '<div class="detalle-seccion-titulo">✨ Briefing IA</div>'
            + '<div class="detalle-briefing-texto">' + lineas + "</div>"
            + "</div>";
        })()
      : "";

    modal.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;
                  width:100%;max-width:580px;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow);">

        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;
                    padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);
                    position:sticky;top:0;background:var(--bg2);z-index:1;">
          <div>
            <div style="font-size:1rem;font-weight:700;color:var(--text);line-height:1.3">
              📅 ${datos.titulo || "Sin título"}
            </div>
            ${datos.fecha ? `<div style="font-size:0.8rem;color:var(--text2);margin-top:0.2rem">
              ${formatearFecha(datos.fecha, datos.hora)}</div>` : ""}
          </div>
          <button id="detalle-cerrar"
            style="background:none;border:none;color:var(--text2);font-size:1.1rem;
                   cursor:pointer;padding:0.2rem;flex-shrink:0;margin-left:1rem;">✕</button>
        </div>

        <!-- Cuerpo -->
        <div style="padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:1rem;">

          ${tagsVinculados ? `
            <div class="detalle-seccion">
              <div class="detalle-seccion-titulo">🏛️ Entidades participantes</div>
              <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem">${tagsVinculados}</div>
            </div>` : ""}

          ${datos.participantes ? `
            <div class="detalle-seccion">
              <div class="detalle-seccion-titulo">👥 Participantes</div>
              <div class="detalle-seccion-texto">${datos.participantes}</div>
            </div>` : ""}

          ${datos.asunto ? `
            <div class="detalle-seccion">
              <div class="detalle-seccion-titulo">📌 Asunto</div>
              <div class="detalle-seccion-texto">${datos.asunto}</div>
            </div>` : ""}
          <div class="detalle-seccion">
            <div class="detalle-seccion-titulo" style="display:flex;justify-content:space-between;align-items:center">
              <span>📋 Acuerdos y compromisos</span>
              <button id="detalle-btn-editar-acuerdos" style="background:none;border:1px solid var(--border);
                color:var(--text2);border-radius:6px;padding:0.2rem 0.6rem;font-size:0.75rem;cursor:pointer;
                font-family:inherit">${datos.acuerdos ? "✏️ Editar" : "➕ Agregar"}</button>
            </div>
            <div id="detalle-acuerdos-display" style="margin-top:0.4rem">
              ${datos.acuerdos
                ? `<div class="detalle-seccion-texto" style="border-left:3px solid var(--accent);padding-left:0.5rem">${datos.acuerdos}</div>`
                : `<p style="color:var(--text2);font-size:0.82rem;font-style:italic">Sin acuerdos registrados aun.</p>`}
            </div>
            <div id="detalle-acuerdos-editor" style="display:none;margin-top:0.4rem">
              <textarea id="detalle-acuerdos-textarea" rows="4"
                style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;
                       padding:0.5rem;color:var(--text);font-family:inherit;font-size:0.875rem;resize:vertical"
                placeholder="Escribe los acuerdos y compromisos alcanzados...">${datos.acuerdos || ""}</textarea>
              <div style="display:flex;gap:0.5rem;margin-top:0.4rem">
                <button id="detalle-btn-guardar-acuerdos" style="background:var(--accent);color:white;border:none;
                  border-radius:8px;padding:0.45rem 1rem;font-size:0.82rem;cursor:pointer;font-family:inherit;font-weight:600">
                  Guardar acuerdos
                </button>
                <button id="detalle-btn-cancelar-acuerdos" style="background:none;border:1px solid var(--border);
                  color:var(--text2);border-radius:8px;padding:0.45rem 1rem;font-size:0.82rem;cursor:pointer;font-family:inherit">
                  Cancelar
                </button>
              </div>
            </div>
          </div>

          ${briefingHtml}

        </div>

        <!-- Footer con botones -->
        <div style="padding:1rem 1.4rem;border-top:1px solid var(--border);
                    display:flex;gap:0.75rem;justify-content:flex-end;
                    position:sticky;bottom:0;background:var(--bg2);">
          <button id="detalle-btn-editar"
            style="background:var(--accent);color:white;border:none;border-radius:8px;
                   padding:0.55rem 1.2rem;font-size:0.875rem;cursor:pointer;
                   font-family:inherit;font-weight:600;">
            ✏️ Editar
          </button>
          <button id="detalle-btn-acuerdos"
            style="background:none;border:1px solid var(--border);color:var(--text2);
                   border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;
                   cursor:pointer;font-family:inherit;">
            ${datos.acuerdos_post ? "📋 Ver acuerdos" : "📋 Agregar acuerdos"}
          </button>
          <button id="detalle-btn-briefing"
            style="background:none;border:1px solid var(--border);color:var(--text2);
                   border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;
                   cursor:pointer;font-family:inherit;">
            ${datos.briefing ? "✨ Ver briefing" : "✨ Generar briefing"}
          </button>
          <button id="detalle-btn-exportar-pdf"
            style="background:none;border:1px solid var(--border);color:var(--text2);
                   border-radius:8px;padding:0.55rem 1.2rem;font-size:0.875rem;
                   cursor:pointer;font-family:inherit;">
            📄 Exportar PDF
          </button>
        </div>
      </div>
    `;

    // Cerrar modal
    document.getElementById("detalle-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });

    // Botón Editar — cierra detalle y activa modo edición
    document.getElementById("detalle-btn-editar").addEventListener("click", () => {
      modal.style.display = "none";
      activarEdicion(id, datos);
    });

    // Botón editar/agregar acuerdos desde detalle
    document.getElementById("detalle-btn-editar-acuerdos").addEventListener("click", () => {
      const editor  = document.getElementById("detalle-acuerdos-editor");
      const display = document.getElementById("detalle-acuerdos-display");
      editor.style.display  = "block";
      display.style.display = "none";
    });

    document.getElementById("detalle-btn-cancelar-acuerdos").addEventListener("click", () => {
      document.getElementById("detalle-acuerdos-editor").style.display  = "none";
      document.getElementById("detalle-acuerdos-display").style.display = "block";
    });

    document.getElementById("detalle-btn-guardar-acuerdos").addEventListener("click", async () => {
      const texto = document.getElementById("detalle-acuerdos-textarea").value.trim();
      const btnG  = document.getElementById("detalle-btn-guardar-acuerdos");
      btnG.disabled = true; btnG.textContent = "Guardando...";
      try {
        await updateDoc(doc(db, "usuarios", user.uid, "reuniones", id), { acuerdos: texto });
        // Actualizar display sin cerrar el modal
        const display = document.getElementById("detalle-acuerdos-display");
        display.innerHTML = texto
          ? `<div class="detalle-seccion-texto" style="border-left:3px solid var(--accent);padding-left:0.5rem">${texto}</div>`
          : `<p style="color:var(--text2);font-size:0.82rem;font-style:italic">Sin acuerdos registrados aun.</p>`;
        document.getElementById("detalle-btn-editar-acuerdos").textContent = texto ? "✏️ Editar" : "➕ Agregar";
        document.getElementById("detalle-acuerdos-editor").style.display  = "none";
        display.style.display = "block";
        datos.acuerdos = texto; // actualizar datos locales
      } catch(e) {
        alert("Error al guardar. Revisa la consola.");
        console.error(e);
      } finally {
        btnG.disabled = false; btnG.textContent = "Guardar acuerdos";
      }
    });

    // Boton Acuerdos desde detalle
    document.getElementById("detalle-btn-acuerdos").addEventListener("click", () => {
      modal.style.display = "none";
      mostrarModalAcuerdos(id, datos);
    });

    // Botón Briefing — abre el modal de IA
    document.getElementById("detalle-btn-briefing").addEventListener("click", () => {
      modal.style.display = "none";
      generarBriefing(id, datos);
    });

    // Botón Exportar PDF individual
    document.getElementById("detalle-btn-exportar-pdf").addEventListener("click", () => {
      exportarPDFDetalleReunion(datos);
    });

    modal.style.display = "flex";
  }

  // ─── EXPORTAR EXCEL (módulo completo) ─────────────────────────────────────
  // Usa SheetJS (XLSX) disponible globalmente. Genera un archivo .xlsx con
  // una fila por reunión y columnas por campo.
  function exportarExcelReuniones() {
    if (!todasLasReuniones.length) { alert("No hay reuniones para exportar."); return; }

    // Cargar SheetJS dinámicamente si no está disponible
    function generarExcel() {
      const XLSX = window.XLSX;
      if (!XLSX) { alert("Error al cargar la librería de Excel. Intenta de nuevo."); return; }

      const filas = todasLasReuniones.map(r => ({
        "Título":                r.titulo || "",
        "Fecha":                 r.fecha ? formatearFechaExport(r.fecha) : "","Hora": r.hora || "",
        "Participantes":         r.participantes || "",
        "Entidades vinculadas":  (r.participantesVinculados || []).map(p => p.nombre).join(", "),
        "Asunto": r.asunto || r.acuerdos || "","Acuerdos post-reunion": r.acuerdos_post || "",
        "Briefing IA":           r.briefing ? "Sí" : "No",
      }));

      const ws = XLSX.utils.json_to_sheet(filas);
      // Anchos de columna
      ws["!cols"] = [{ wch: 35 }, { wch: 18 }, { wch: 30 }, { wch: 35 }, { wch: 50 }, { wch: 10 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Reuniones");
      XLSX.writeFile(wb, "Lumen_Reuniones_" + fechaHoy() + ".xlsx");
    }

    if (window.XLSX) {
      generarExcel();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      script.onload = generarExcel;
      document.head.appendChild(script);
    }
  }

  // ─── EXPORTAR PDF MÓDULO COMPLETO ─────────────────────────────────────────
  // Usa jsPDF para generar un reporte con todas las reuniones.
  function exportarPDFModuloReuniones() {
    if (!todasLasReuniones.length) { alert("No hay reuniones para exportar."); return; }

    function generarPDF() {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) { alert("Error al cargar la librería de PDF. Intenta de nuevo."); return; }

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const marginL = 20, marginR = 20, pageW = 210, contentW = pageW - marginL - marginR;
      let y = 20;

      function checkPage(needed = 15) {
        if (y + needed > 280) { doc.addPage(); y = 20; }
      }

      // Encabezado
      doc.setFillColor(74, 74, 138);
      doc.rect(0, 0, 210, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text("LUMEN — SEDUVOT Zacatecas", marginL, 10);
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      doc.text("Reporte de Reuniones · " + fechaHoy(), marginL, 17);
      y = 30;

      todasLasReuniones.forEach((r, i) => {
        checkPage(30);

        // Separador
        doc.setDrawColor(200, 200, 200);
        doc.line(marginL, y, pageW - marginR, y);
        y += 5;

        // Título
        doc.setTextColor(74, 74, 138);
        doc.setFontSize(11); doc.setFont("helvetica", "bold");
        const tituloLines = doc.splitTextToSize((i + 1) + ". " + (r.titulo || "Sin título"), contentW);
        doc.text(tituloLines, marginL, y);
        y += tituloLines.length * 6;

        // Fecha
        if (r.fecha) {
          doc.setTextColor(100, 100, 100);
          doc.setFontSize(8); doc.setFont("helvetica", "normal");
          doc.text("Fecha: " + formatearFechaExport(r.fecha), marginL, y);
          y += 5;
        }

        // Entidades vinculadas
        const entidades = (r.participantesVinculados || []).map(p => p.nombre).join(", ");
        if (entidades) {
          checkPage(8);
          doc.setTextColor(60, 60, 60);
          doc.setFontSize(8); doc.setFont("helvetica", "bold");
          doc.text("Entidades: ", marginL, y);
          doc.setFont("helvetica", "normal");
          const entLines = doc.splitTextToSize(entidades, contentW - 22);
          doc.text(entLines, marginL + 22, y);
          y += Math.max(entLines.length * 4.5, 5);
        }

        // Participantes
        if (r.participantes) {
          checkPage(8);
          doc.setFontSize(8); doc.setFont("helvetica", "bold");
          doc.text("Participantes: ", marginL, y);
          doc.setFont("helvetica", "normal");
          const partLines = doc.splitTextToSize(r.participantes, contentW - 28);
          doc.text(partLines, marginL + 28, y);
          y += Math.max(partLines.length * 4.5, 5);
        }

        // Acuerdos
        if (r.acuerdos) {
          checkPage(10);
          doc.setFontSize(8); doc.setFont("helvetica", "bold");
          doc.text("Asunto:", marginL, y); y += 4;
          doc.setFont("helvetica", "normal");
          const acuLines = doc.splitTextToSize(r.acuerdos, contentW);
          checkPage(acuLines.length * 4.5);
          doc.text(acuLines, marginL, y);
          y += acuLines.length * 4.5 + 3;
        }

        y += 4;
      });

      // Pie de página
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7); doc.setTextColor(150, 150, 150);
        doc.text("Lumen · SEDUVOT Zacatecas · Página " + i + " de " + pageCount, marginL, 290);
      }

      doc.save("Lumen_Reuniones_" + fechaHoy() + ".pdf");
    }

    if (window.jspdf) {
      generarPDF();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = generarPDF;
      document.head.appendChild(script);
    }
  }

  // ─── EXPORTAR PDF INDIVIDUAL (desde modal de detalle) ─────────────────────
  // Genera una ficha ejecutiva de una sola reunión, incluyendo briefing IA.
  function exportarPDFDetalleReunion(datos) {
    function generarPDF() {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) { alert("Error al cargar la librería de PDF. Intenta de nuevo."); return; }

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const marginL = 20, marginR = 20, pageW = 210, contentW = pageW - marginL - marginR;
      let y = 20;

      function checkPage(needed = 15) {
        if (y + needed > 280) { doc.addPage(); y = 20; }
      }

      function seccion(titulo, texto) {
        if (!texto) return;
        checkPage(15);
        doc.setFillColor(245, 245, 250);
        doc.rect(marginL, y - 3, contentW, 6, "F");
        doc.setTextColor(74, 74, 138);
        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.text(titulo, marginL + 2, y + 1);
        y += 7;
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(texto, contentW);
        checkPage(lines.length * 5);
        doc.text(lines, marginL, y);
        y += lines.length * 5 + 4;
      }

      // Encabezado institucional
      doc.setFillColor(74, 74, 138);
      doc.rect(0, 0, 210, 25, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text("SEDUVOT Zacatecas · Unidad de Planeación, Evaluación y Seguimiento", marginL, 8);
      doc.setFontSize(13); doc.setFont("helvetica", "bold");
      doc.text("Ficha de Reunión Institucional", marginL, 16);
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      doc.text("Generado por Lumen · " + fechaHoy(), marginL, 22);
      y = 34;

      // Título de la reunión
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(14); doc.setFont("helvetica", "bold");
      const titLines = doc.splitTextToSize(datos.titulo || "Sin título", contentW);
      doc.text(titLines, marginL, y);
      y += titLines.length * 7 + 2;

      // Fecha
      if (datos.fecha) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.text("Fecha: " + formatearFechaExport(datos.fecha), marginL, y);
        y += 7;
      }

      // Línea divisoria
      doc.setDrawColor(74, 74, 138);
      doc.setLineWidth(0.5);
      doc.line(marginL, y, pageW - marginR, y);
      y += 6;

      // Entidades vinculadas
      const entidades = (datos.participantesVinculados || []).map(p => p.nombre).join(", ");
      seccion("Entidades participantes", entidades);

      // Participantes
      seccion("Participantes", datos.participantes);

      // Acuerdos
      seccion("Asunto", datos.acuerdos);

      // Briefing IA
      if (datos.briefing) {
        checkPage(15);
        doc.setFillColor(235, 233, 255);
        doc.rect(marginL, y - 3, contentW, 6, "F");
        doc.setTextColor(74, 74, 138);
        doc.setFontSize(9); doc.setFont("helvetica", "bold");
        doc.text("Briefing IA (generado por Claude)", marginL + 2, y + 1);
        y += 8;
        // Limpiar markdown
        const briefingLimpio = datos.briefing
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/^## /gm, "").replace(/^# /gm, "");
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(8); doc.setFont("helvetica", "normal");
        const bLines = doc.splitTextToSize(briefingLimpio, contentW);
        checkPage(bLines.length * 4.5);
        doc.text(bLines, marginL, y);
        y += bLines.length * 4.5;
      }

      // Pie
      doc.setFontSize(7); doc.setTextColor(150, 150, 150);
      doc.text("Lumen · SEDUVOT Zacatecas · Documento generado automáticamente", marginL, 290);

      doc.save("Reunion_" + (datos.titulo || "ficha").replace(/[^a-zA-Z0-9]/g, "_") + "_" + fechaHoy() + ".pdf");
    }

    if (window.jspdf) {
      generarPDF();
    } else {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = generarPDF;
      document.head.appendChild(script);
    }
  }

  // ─── HELPERS DE FECHA ─────────────────────────────────────────────────────
  function fechaHoy() {
    const hoy = new Date();
    return hoy.getFullYear() + "-"
      + String(hoy.getMonth() + 1).padStart(2, "0") + "-"
      + String(hoy.getDate()).padStart(2, "0");
  }

  function formatearFechaExport(fechaStr) {
    if (!fechaStr) return "";
    // Intentar formato datetime (ISO) o fecha simple YYYY-MM-DD
    const d = new Date(fechaStr);
    if (!isNaN(d)) return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
    return fechaStr;
  }

  // ─── MODAL DE ACUERDOS POST-REUNION ──────────────────────────────────────
  // Permite agregar o editar los acuerdos alcanzados despues de la reunion.
  function mostrarModalAcuerdos(id, datos) {
    let modal = document.getElementById("modal-acuerdos");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modal-acuerdos";
      modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);"
        + "display:flex;align-items:center;justify-content:center;z-index:800;padding:1rem;";
      document.body.appendChild(modal);
    }

    modal.innerHTML = '<div style="background:var(--bg2);border:1px solid var(--border);'
      + 'border-radius:14px;width:100%;max-width:540px;box-shadow:var(--shadow);">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;'
      + 'padding:1.2rem 1.4rem 1rem;border-bottom:1px solid var(--border);">'
      + '<div>'
      + '<div style="font-weight:700;color:var(--text);font-size:0.95rem">📋 Acuerdos y compromisos</div>'
      + '<div style="font-size:0.8rem;color:var(--text2);margin-top:0.2rem">' + (datos.titulo || "") + '</div>'
      + '</div>'
      + '<button id="modal-acuerdos-cerrar" style="background:none;border:none;color:var(--text2);'
      + 'font-size:1.1rem;cursor:pointer;">✕</button>'
      + '</div>'
      + '<div style="padding:1.2rem 1.4rem;">'
      + '<label style="font-size:0.85rem;color:var(--text2);font-weight:500;display:block;margin-bottom:0.4rem">'
      + 'Acuerdos alcanzados en esta reunion</label>'
      + '<textarea id="modal-acuerdos-texto" rows="6" '
      + 'style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;'
      + 'padding:0.6rem 0.8rem;color:var(--text);font-family:inherit;font-size:0.9rem;resize:vertical;box-sizing:border-box"'
      + ' placeholder="Ej. 1. COEPLA entregara validacion el viernes. 2. SEDUVOT preparara oficio de respuesta...">'
      + (datos.acuerdos_post || "") + '</textarea>'
      + '</div>'
      + '<div style="padding:1rem 1.4rem;border-top:1px solid var(--border);'
      + 'display:flex;gap:0.75rem;justify-content:flex-end;">'
      + '<button id="modal-acuerdos-guardar" style="background:var(--accent);color:white;border:none;'
      + 'border-radius:8px;padding:0.55rem 1.4rem;font-size:0.875rem;cursor:pointer;'
      + 'font-family:inherit;font-weight:600;">Guardar acuerdos</button>'
      + '</div>'
      + '</div>';

    modal.style.display = "flex";

    document.getElementById("modal-acuerdos-cerrar").addEventListener("click", () => {
      modal.style.display = "none";
    });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.style.display = "none"; });

    document.getElementById("modal-acuerdos-guardar").addEventListener("click", async () => {
      const texto = document.getElementById("modal-acuerdos-texto").value.trim();
      try {
        await updateDoc(doc(db, "usuarios", user.uid, "reuniones", id), {
          acuerdos_post: texto
        });
        modal.style.display = "none";
      } catch(error) {
        console.error("Error al guardar acuerdos:", error);
        alert("No se pudieron guardar los acuerdos. Revisa la consola.");
      }
    });
  }

});

function formatearFecha(fechaStr, horaStr) {
  if (!fechaStr) return "";
  // Compatibilidad con formato antiguo datetime-local
  if (fechaStr.includes("T")) {
    return new Date(fechaStr).toLocaleString("es-MX", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }
  // Formato nuevo: fecha separada + hora opcional
  const [y,m,d] = fechaStr.split("-");
  const fechaFmt = new Date(Number(y), Number(m)-1, Number(d))
    .toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  if (horaStr === "pendiente") return fechaFmt + " · Por confirmar";
  return horaStr ? fechaFmt + " " + horaStr : fechaFmt;
}